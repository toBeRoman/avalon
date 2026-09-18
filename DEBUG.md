# Debug mode

A single reserved room where one person can drive a whole table: fill the empty seats with
bots, set the player count, pick the roles, deal yourself whichever card you want to test, and
see everybody's hand.

## Getting in

Open the app, tap **Join with a code**, and enter:

```
TOBY
```

Then a name. The room is created the first time anyone asks for it, so there is no host to
wait for. Once inside, a **Debug** button appears in the bottom bar — in the lobby *and*
during a game.

`TOBY` is safe as a reserved code because `O` is not in the room-code alphabet
(`ABCDEFGHJKLMNPQRSTUVWXYZ` — `I` and `O` are left out so codes can be shouted across a
campsite without being confused for `1` and `0`). A random code can therefore never collide
with it, and no ordinary room is ever a debug room.

## What the panel does

| Control | What it does |
|---|---|
| **Take host** | Makes you host, whoever held it before. Debug rooms get rejoined constantly and the host can end up being someone who left. |
| **Nudge bots** | Runs any bot turns that are outstanding. Bots normally play automatically after every move; this only matters if something has stalled. |
| **Table size 5–10** | Adds or removes bots until the table is that size. Real players are never removed to hit the number. Lobby only. |
| **Roles in play** | The same Percival / Morgana / Mordred / Oberon / Lady toggles as the lobby, in one row. Lobby only. |
| **Be \<role\>** | Pins your card at the next deal, if that role exists in the deck for the current size and options. "Random role" clears it. Lobby only. |
| **X-ray** | Shows you every player's role, live. Only in this room, only for whoever switches it on. |
| **Abandon** | Throws the game away and returns to the lobby. |
| **Clear disconnected players** | Drops every seat that is not currently connected. The room is long-lived, so seats from old sessions collect in it. |

## Playing solo

1. Join `TOBY`.
2. Open **Debug**, tap **Take host**, pick a table size — say **8**. Seven bots sit down.
3. Turn on whatever roles you want to exercise, and tap **Be Merlin** (or Percival, Morgana,
   Mordred, Oberon, the Assassin…).
4. Close the panel and **Deal the roles**.
5. Play your own turns. The bots take theirs the moment it is their turn, so the game moves
   on by itself between your decisions.
6. Turn on **X-ray** whenever you want to check what the app decided behind the scenes.

## How the bots play

Deliberately simple, and never cheating — each bot only acts through the same `applyAction`
a phone does, so anything a bot cannot legally do, it cannot do.

- **Reveals**: acknowledge immediately.
- **Proposing**: put themselves on the team, then fill at random.
- **Voting**: approve most of the time, reject about one time in six, and always approve on
  the fifth proposal so a game does not end on the vote track by accident. The proposer is
  locked into approving, same as a human.
- **Quests**: good always succeeds. Evil fails most of the time, and eases off once the quest
  already has enough fails to sink it.
- **Lady of the Lake**: inspects a random legal target.
- **The Assassin**: names whichever good player has been on the most successful quests, which
  is roughly how a human would reason about who was steering.

Bots run in a loop after every action until the game is waiting on a human again, which is
why a solo game never sits still.

## Where it lives in the code

| Thing | Where |
|---|---|
| Reserved code | `DEBUG_CODE` in `src/shared/rules.ts` |
| Room gets `debug: true` | `RoomDO.create` in `src/server/room.ts` |
| Room created on demand | the `/join` branch in `src/server/index.ts` |
| Seat takeover by name | `RoomDO.join` in `src/server/room.ts` |
| Bots | `fillWithBots` / `runBots` in `src/shared/engine.ts` |
| Debug actions | the `debug*` cases in `applyAction` |
| Forced role | the `room.debug && room.forcedRole` block in `startGame` |
| Panel | `src/client/screens/Debug.tsx` |

## What stops this leaking into a real game

Every debug action checks `room.debug` **on the server** and is refused otherwise — the panel
being hidden is not the protection. `room.debug` is only ever set when the room's code is
exactly `TOBY`, which no random code can be.

X-ray is the one that matters most: `viewFor` only puts `debug.allRoles` in a payload when
the room is a debug room *and* that viewer has x-ray on. In any other room the field is
`null`, and the existing redaction tests cover ordinary rooms.

Two honest caveats:

1. **The debug room is shared.** Anyone who knows the code is in the same room as you, and
   x-ray shows them every role. It is a test fixture, not a private sandbox. Do not play a
   real game in `TOBY`.
2. **It is long-lived.** Like every room it is deleted after twelve hours idle, but within a
   session it keeps its players, options and score. Use **Clear disconnected players** if it
   gets cluttered.

## Testing it

`test/debug.browser.mjs` drives the whole thing: joins solo, takes host, clears stale seats,
fills to eight, forces Merlin, deals, checks the forced role was honoured, lets the bots play
a round, and switches on x-ray. It needs a browser, so Playwright is installed on demand
rather than kept as a dependency:

```sh
pnpm add -D playwright
pnpm build && pnpm preview &
node test/debug.browser.mjs /tmp/shots
pnpm remove playwright
```
