# Avalon

*The Resistance: Avalon*, played on everyone's phone. Built for a campfire: no cards, no
tokens, no narrator, and nobody has to close their eyes.

One person creates a room and reads out the four-letter code. Everybody else joins on their
own phone. The app deals the roles, tells each player privately what they know, runs the
proposals, votes and quests, and handles the Assassin at the end.

## Playing

- **5 to 10 players.** Official quest sizes and evil counts; the fourth quest needs two fails
  at seven or more.
- **Host toggles the special roles** — Percival, Morgana, Mordred, Oberon and the Lady of the
  Lake. Illegal combinations are blocked with an explanation (Morgana + Mordred needs three
  evil seats, so it will not deal at five players).
- **Hold to reveal.** Your role card only shows while your finger is on it, so it cannot be
  read over your shoulder or left face up on a rock.
- **Full history.** Every proposal, every vote and every quest result stays scrollable, which
  settles "who rejected round two?" without anyone having to remember.
- **Built-in coaching** for people who have never played, on every screen.
- **Nothing waits on the slowest person.** Result screens show, run a short bar, and move on;
  tapping just skips ahead.
- **Insights** that update as the game goes: public deductions anyone could make sit openly in
  the history, and notes grounded in your own card stay behind the hold-to-reveal.
- **No signal? Play on one phone.** Pass-and-play runs the same engine entirely in the browser.
  The device is handed round for anything secret and sits in the middle for everything else.

## When things go wrong at a campsite

- **No connection at all.** Tap "No signal? Play on one phone" on the first screen. Nothing is
  sent anywhere; the game lives in the browser and survives a refresh.

- Phones lock and sockets drop constantly. All state lives in the Durable Object, never on a
  phone, and each device holds a token so a refresh, a lock or a lost signal puts you straight
  back in your own seat.
- If a phone dies for good, the host opens the room menu, hands that seat over, and reads out a
  four-digit code. The replacement phone enters it and picks up the same role and the same
  knowledge.
- Everyone's screen shows exactly who the game is waiting on, so you know whose name to shout.
- The screen is kept awake during a game, and it is all dark and warm so it does not blow out
  anybody's night vision.

## Narration

A narrator reads the game aloud, in the voice **Marin**. The clips are pre-rendered and ship as
static audio, so it works with no signal and there is no API key in production. On by default
for the phone that made the room, off for everyone else; the speaker button in the header
changes that. See [NARRATION.md](NARRATION.md).

## Testing it on your own

Join with the room code `TOBY` for a debug room: fill the seats with bots, set the table to
any size from five to ten, choose the roles, deal yourself whichever card you want to test,
and switch on x-ray to see everyone's hand. See [DEBUG.md](DEBUG.md).

## How it is built

One Cloudflare Worker serves both the React app and the game server. Each room is a Durable
Object holding the authoritative state and the players' WebSockets, using hibernation so an
idle room costs nothing while everyone argues.

The important part is `viewFor()` in `src/server/engine.ts`: every socket gets its own
redacted view of the game. Roles, sealed votes and Lady of the Lake results are filtered out
per player on the server, so the client never receives anything it should not show. That is
why this repository can be public without spoiling a game.

```
src/shared/   rules and types used by both sides
src/server/   the Worker router, the room Durable Object, and the game engine
src/client/   the React app
test/         the engine, including what may and may not go over the wire
```

## Running it

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm check    # typecheck and tests
pnpm test:e2e # seven clients through two full games against a running server
pnpm deploy   # build and push to Cloudflare
```

Deploying needs a Cloudflare account id. It lives in a gitignored `.env` rather than in
`wrangler.jsonc`, so this repository can stay public:

```sh
echo 'CLOUDFLARE_ACCOUNT_ID=your-account-id' > .env
```

Pushing to `main` redeploys automatically through Cloudflare Workers Builds.

Rooms are deleted after twelve hours of inactivity. Nothing is stored about anyone: no
accounts, no analytics, no names beyond the game you are in.
