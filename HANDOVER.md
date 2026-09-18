# Avalon — handover

*The Resistance: Avalon* played on everyone's phone, built for playing round a campfire.
This document is for a team picking the project up cold.

| | |
|---|---|
| **Live** | https://avalon.tobyrodinroman.workers.dev |
| **Repo** | https://github.com/toBeRoman/avalon (public) |
| **Platform** | Cloudflare Workers + Durable Objects, free plan |
| **Stack** | React 19, Vite 8, TypeScript, Tailwind 4 |
| **Size** | ~4,400 lines including tests |
| **Status** | Complete and deployed. Verified end to end against production. |

---

## 1. What the product is

Five to ten people each open the site on their own phone. One creates a room and reads out a
four-letter code; the rest join with it. The app then runs a complete game of Avalon: it deals
the roles, tells each player privately what their role knows, and drives team proposals,
votes, quests, the Lady of the Lake and the Assassin's final guess.

It deliberately replaces the tabletop "everyone close your eyes" ritual with private screens.
There are no images anywhere in the product — the whole UI is type and colour.

### Design decisions that were made deliberately

These were chosen with the original owner and should not be "fixed" without asking:

- **Two modes, one engine.** Online play is authoritative server-side. Pass-and-play runs the
  identical engine in the browser (`src/client/localGame.ts`), which is why the engine lives in
  `src/shared` rather than `src/server`. Anything added to the state machine works in both.
- **Full public history.** Every past proposal and every individual vote stays permanently
  readable. This makes deduction sharper and less memory-based than tabletop Avalon. It is a
  feature, chosen on purpose.
- **Votes require every player, not just connected ones.** A permanently dead phone blocks a
  vote. The escape hatch is the host handing that seat to a replacement phone (§5). This is
  preferred over auto-passing, which would corrupt a game.
- **Reveal screens only wait on *connected* players**, so someone dropping out never leaves
  everyone else stuck on a "Continue" screen.
- **5–10 players only**, using the official tables. No house-ruled 11+ support.
- **Votes and quest cards can be changed** until the last one lands. Nothing is visible until
  they all are, so it leaks nothing and it rescues a mis-tap in the dark.
- **Quest card attribution is revealed only at game end.** Mid-game the view carries the fail
  *count* and an empty `cards` map; `viewFor` strips it from both the records and the log.
- **House rule: the proposer is locked into approving their own team.** Official Avalon lets the
  leader reject their own proposal; this build forbids it, on the server as well as in the UI.
  Everyone else votes freely. Enforced in `applyAction`'s `vote` case and covered by two unit
  tests and one end-to-end check.

---

## 2. Architecture

One Cloudflare Worker serves both the static React app and the game server.

```
Browser ──HTTP──▶ Worker (src/server/index.ts)
   │                 │  creates rooms, routes by code
   │                 ▼
   └──WebSocket──▶ RoomDO (src/server/room.ts)      one Durable Object per room code
                      │
                      ▼
                   engine.ts    pure state machine + per-player redaction
```

- **Routing.** `wrangler.jsonc` sets `run_worker_first: ["/api/*"]`, so `/api/*` hits the Worker
  and everything else is served as a static asset with SPA fallback.
- **Room identity.** `env.ROOM.getByName(code)` — the four-letter code *is* the Durable Object
  name, so routing is deterministic with no lookup table.
- **Transport.** WebSockets using the hibernation API (`ctx.acceptWebSocket`), so an idle room
  costs nothing while seven people argue round a fire for ten minutes.
- **Storage.** The entire room is one JSON blob under the key `room`. This is well within
  limits at this size; if the state ever grows, move to `ctx.storage.sql`.
- **Expiry.** Every mutation re-arms an alarm 12 hours out. The alarm calls `deleteAll()`.

### Where the logic lives

| File | Lines | What it is |
|---|---|---|
| `src/shared/rules.ts` | 232 | Official quest tables, evil counts, deck building, lobby validation, what each role knows, coaching copy. Pure, no I/O. |
| `src/shared/types.ts` | 206 | Every type crossing the wire, including the redacted `View`. |
| `src/server/engine.ts` | 545 | **The heart.** State machine and `viewFor()` redaction. Pure functions over `RoomState`. |
| `src/server/room.ts` | 236 | Durable Object: persistence, sockets, connection tracking, seat handover, expiry. |
| `src/server/index.ts` | 85 | HTTP router: create / join / claim / describe / ws. |
| `src/client/useRoom.ts` | 152 | WebSocket hook with reconnect, plus wake lock and vibration. |
| `src/client/localGame.ts` | ~210 | Pass-and-play: drives the shared engine in the browser and decides whose hands the phone belongs in. |
| `src/client/App.tsx` | 374 | Shell: chrome, phase routing, sheets, room management. |
| `src/client/screens/` | ~990 | One file per phase group. |
| `test/engine.test.ts` | 468 | 27 unit tests over the engine. |
| `test/e2e.mjs` | 335 | Seven real clients, two full games, against a running server. |

---

## 3. The security model — read this before changing anything

**The client is never trusted, and never receives anything it must not show.**

`viewFor(room, playerId)` in `src/server/engine.ts` builds a *separate* payload per socket.
`broadcast()` in `room.ts` calls it once per connection. Specifically:

- `roles` is never sent. Each player gets only `you.role` plus the player ids their role is
  entitled to see (`you.knowledge.ids`), and those carry ids only — never role names.
- Individual votes are withheld while `phase === "vote"`; clients see only *who* has voted.
  The full tally appears at `voteReveal`.
- Quest cards are never attributed. Only a fail *count* is published.
- A Lady of the Lake result goes to the holder alone. Everyone else sees only that an
  inspection happened.
- All roles are revealed only when `phase === "ended"`.

Five unit tests assert this, including one that walks every string value in the payload and
fails if another player's role appears. **If you add a field to `GameView`, add a test.**

Rule enforcement is also entirely server-side (`applyAction`). The client hides the "Fail"
button from good players, but the server independently refuses it. `test/e2e.mjs` fires five
illegal actions over a live socket and asserts each is rejected.

This is why the repository can be public without spoiling games.

---

## 4. Game flow

```
lobby → roleReveal → ┌─ proposal → vote → voteReveal ─┐
                     │                                 │  rejected → next leader
                     │                                 │  5 rejections → evil wins
                     │       approved ↓                │
                     │   quest → questReveal           │
                     │       ↓                         │
                     │   3 fails → evil wins           │
                     │   3 successes → assassin        │
                     │   after quests 2,3,4 → lady → ladyReveal
                     └─────────────────────────────────┘
                                                assassin → ended
```

Phases ending in `Reveal` are gated on acknowledgements (`acks`). `settle()` advances once every
*connected* player has tapped through; the host can also force past it.

Rules worth knowing when reading the code:

- The leader token passes after **every** vote, approved or not.
- A tied vote is a **rejection**.
- The fourth quest needs **two** fails at seven or more players (`failsRequired`).
- The Lady of the Lake starts with the player to the *right* of the first leader, and a player
  who has ever held it can never be inspected.
- The Assassin is always one of the evil seats. Morgana, Mordred and Oberon each consume an
  additional evil seat, which is why `validate()` blocks Morgana + Mordred at five players.

---

## 5. Operational behaviour built for a campsite

- **Reconnect.** Each device holds a `{code, playerId, token}` in `localStorage`. The socket
  reconnects with exponential backoff to 8s, and immediately on `visibilitychange` or `online`
  — which is what happens when a phone comes out of a pocket.
- **Seat handover.** If a phone dies for good, the host opens the room menu and releases that
  seat. A four-digit claim code appears. The replacement phone enters the room code and the
  claim code, gets a **fresh token**, and the old phone's socket is closed with code `4001`.
  The seat keeps its role and all its knowledge.
- **The primary action lives outside the scrolling area.** `Sticky` portals into an
  `ActionSlot` rendered by the shell below `<main>`. An earlier `position: sticky` footer was
  pinned *over* the content on short viewports and swallowed the tap meant for the role card.
  Do not move it back into the scroll container.
- **Wake lock** keeps screens alive during a game; **vibration** fires when it becomes your
  turn. Both are best-effort — iOS Safari has no vibration API, which is why the persistent
  "waiting on Dave, Priya" strip is the real mechanism.

Close codes the client treats as final (no reconnect): `4001` seat handed over, `4002` removed.

---

## 6. Running it

```sh
pnpm install
pnpm dev          # http://localhost:5173, Worker and DO run in workerd via the Vite plugin
pnpm check        # typecheck + 27 unit tests
pnpm build && pnpm preview &
pnpm test:e2e     # 7 clients, 2 full games, reconnect, handover, rule enforcement
pnpm test:e2e https://avalon.tobyrodinroman.workers.dev   # or against production
```

`pnpm test:e2e` is the highest-value check in the repo. Run it before and after any change to
`engine.ts` or `room.ts`.

### Deploying

`pnpm deploy` builds and pushes. It needs a Cloudflare account id, which is kept in a
gitignored `.env` rather than in `wrangler.jsonc` so the repo can stay public:

```sh
echo 'CLOUDFLARE_ACCOUNT_ID=your-account-id' > .env
```

Currently deployed to the account `Tobyrodinroman@gmail.com's Account`. Ownership must be
transferred, or the new team redeploys to their own account — nothing in the code is tied to
the account beyond that id.

---

## 7. Known gaps and what I would do next

Nothing here is broken; these are the honest edges.

**Worth doing before real load**
1. **No rate limiting on room creation.** `POST /api/rooms` is unauthenticated and creates a
   Durable Object each time. Fine for friends; trivially abusable if the URL spreads. Add a
   Worker-level rate limit or Turnstile if it ever goes public.
2. **Auto-deploy is not wired up.** Deploys are manual via `pnpm deploy`. Connecting the repo
   in *Workers & Pages → avalon → Settings → Build* (build `pnpm build`, deploy
   `npx wrangler deploy`) needs a dashboard GitHub App install that cannot be scripted.
3. **No client-side tests.** The React layer has no unit tests. The e2e harness drives the
   protocol, not the DOM. Screenshot testing at iPhone size caught three real layout bugs
   during the build and would be worth automating.

**On the insights feature**

`insightsFor()` returns two lists. `table` is public deduction any player could make from the
board and is identical for everyone. `private` is grounded in the viewer's own role and is
rendered *inside* the hold-to-reveal overlay, never on an open screen. A test asserts the
invariant directly: a player's private notes may only name someone their own card entitles
them to know about. Everything in there is a fact about the game so far — deliberately no
speculation about intent, because a confidently wrong nudge is worse than no nudge.

**Smaller things**
4. `settle()` has a guard against advancing a room where nobody has acked, so a room whose
   players all vanish mid-reveal stays put until someone reconnects and taps through. Correct,
   but worth knowing if a room ever looks "stuck".
5. Room codes are 4 letters from a 24-letter alphabet (no I/O to avoid confusion when shouted
   in the dark) — 331,776 combinations, with 8 retries on collision. Fine at this scale;
   revisit if concurrent rooms ever reach the thousands.
6. Names are capped at 16 characters and must be unique within a room. No profanity filtering.
7. There is no spectator mode and no scoreboard across games — both were deliberately cut.
8. The Durable Object stores state as one JSON blob. If state grows, move to SQLite tables.

**Deliberately absent**
9. No accounts, no analytics, no tracking, no cookies. Nothing is stored about anyone beyond
   the game in progress, and rooms self-delete after 12 hours.

---

## 8. If you change one thing, change it here

- **New role** → add to `RoleId` and `ROLE_NAMES` in `shared/types.ts` / `shared/rules.ts`,
  extend `buildDeck`, `knowledgeFor`, `hintFor` and `validate`, add a toggle to `TOGGLES` in
  `screens/Lobby.tsx`, and add a knowledge test.
- **New phase** → add to `Phase`, handle it in `applyAction`, in `waiting()`, in `viewFor`, and
  in the `Phase` switch in `App.tsx`. If it is a reveal, add it to `ACK_PHASES`.
- **New field visible to players** → add it to `GameView`, populate it in `viewFor`, and write
  a redaction test proving it does not leak.
