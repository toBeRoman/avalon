# Narration

A narrator reads the game aloud: the deal, the vote, a quest holding or breaking, the Assassin
stirring, and the four ways a game can end. Voice **Marin**, OpenAI `gpt-4o-mini-tts`.

## It is pre-rendered, not live

The clips are generated on a laptop and shipped as ordinary static audio. Nothing calls OpenAI
at runtime.

That is deliberate, for three reasons:

1. **It works with no signal.** The whole app is built for a campsite, and pass-and-play runs
   with the network cut. A narrator that needed an API round trip would be silent exactly when
   you are most likely to want it.
2. **No key in production.** There is no key in the Worker, no proxy endpoint, nothing to leak
   from a public repository.
3. **No latency and no per-play cost.** A cue plays the instant the phase changes.

The cost is that the lines are fixed, so they never name anybody. That turns out to be the
right constraint anyway — a narrator reading out who is on a quest would be saying things
aloud that some players are not entitled to know.

## Regenerating the clips

```sh
python3 tools/tts.py                    # tools/narration.json -> public/art/narration
```

The key is read from `~/Desktop/RavenSanz/env.local` and is never printed, logged or written
anywhere. Point `OPENAI_ENV_FILE` at a different file to override:

```sh
OPENAI_ENV_FILE=~/somewhere/.env python3 tools/tts.py
```

Clips are cached by a hash of model, voice, instructions and text, so rerunning only bills for
lines that actually changed. Each clip is re-encoded to mono 48 kbps — speech does not need
stereo, and it takes the set from 1.2 MB to 540 KB.

To change what the narrator says, edit `tools/narration.json` and rerun. The `instructions`
field steers the delivery; the current one asks for a storyteller at a campfire, late at night.

## The cues

| Cue | When |
|---|---|
| `deal` | Roles have been dealt |
| `proposal` | A leader is choosing a team |
| `vote` | Voting opens |
| `vote-last` | Voting opens on the fifth proposal |
| `vote-approved` / `vote-rejected` | The votes are revealed |
| `quest` | The team is playing their cards |
| `quest-success` / `quest-fail` | A quest resolves |
| `lady` | The Lady of the Lake is used |
| `assassin` | Good has taken three quests |
| `win-good` | Good wins |
| `win-evil-quests` | Evil wins on three failed quests |
| `win-evil-assassin` | Evil wins by finding Merlin |
| `win-evil-hammer` | Evil wins on five rejections |

Some cues also fire one of the short effects in `public/art/audio` — a card turning on the
deal, a chime on a good win, a sting on a failure.

## Behaviour worth knowing

- **One narrator.** Until somebody chooses, narration is on for the phone that created the
  room and off for everyone else, which is how a real table works. The speaker button in the
  header toggles it per device and the choice is remembered.
- **It marks transitions, not arrivals.** Joining or reconnecting never announces whatever the
  game happened to be sitting on — only things that then happen.
- **Browsers block audio until you touch the page.** The first cue is held and fired on the
  first tap rather than dropped.
- **Lines never overlap.** A new cue stops the one before it.
- **Pass-and-play narrates by default**, since there is only one device.

## Where it lives

| Thing | Where |
|---|---|
| The script | `tools/narration.json` |
| The renderer | `tools/tts.py` |
| The clips | `public/art/narration/*.mp3` (+ a `.json` per clip and a manifest) |
| Playback, cue mapping, the toggle | `src/client/narration.ts` |
| Wiring and the speaker button | `src/client/App.tsx` |
| Test | `test/narration.browser.mjs` |

The per-clip `.json` files record the text, model, voice and instructions each clip was made
from. They are what makes the cache work, and they double as a record of what the narrator
actually says.
