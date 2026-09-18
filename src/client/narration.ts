import { useEffect, useRef, useState } from "react";
import type { View } from "../shared/types";

/**
 * Narration is pre-rendered, not synthesised on the fly: the clips ship as static
 * audio, so a campsite with no signal still gets a narrator, and no API key goes
 * anywhere near production. See tools/tts.py.
 *
 * Because the lines are fixed they never name anybody, which is just as well —
 * a narrator reading out who is on a quest would be saying things some players
 * are not entitled to hear.
 */

export type Cue =
  | "deal"
  | "proposal"
  | "vote"
  | "vote-approved"
  | "vote-rejected"
  | "vote-last"
  | "quest"
  | "quest-success"
  | "quest-fail"
  | "lady"
  | "assassin"
  | "win-good"
  | "win-evil-quests"
  | "win-evil-assassin"
  | "win-evil-hammer";

const CLIP = (cue: Cue) => `/art/narration/${cue}.mp3`;

/** The short effects that punctuate a cue, rather than narrate it. */
const STING: Partial<Record<Cue, string>> = {
  deal: "/art/audio/card_turn.wav",
  "vote-approved": "/art/audio/vote_reveal.wav",
  "vote-rejected": "/art/audio/vote_reveal.wav",
  "quest-success": "/art/audio/success_tone.wav",
  "quest-fail": "/art/audio/fail_sting.wav",
  "win-good": "/art/audio/crown_chime.wav",
  "win-evil-quests": "/art/audio/fail_sting.wav",
  "win-evil-assassin": "/art/audio/fail_sting.wav",
  "win-evil-hammer": "/art/audio/fail_sting.wav",
};

const KEY = "avalon.narration";

/** The stored choice, or null if this device has never been told either way. */
function storedChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === null ? null : stored === "on";
  } catch {
    return null;
  }
}

export function setNarrationEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Nothing to do.
  }
}

/** Works out which line belongs to the state the game has just moved into. */
export function cueFor(view: View): Cue | null {
  const game = view.game;
  if (!game) return null;

  switch (view.phase) {
    case "roleReveal":
      return "deal";
    case "proposal":
      return "proposal";
    case "vote":
      // The last proposal is worth warning people about.
      return game.attempt >= 5 ? "vote-last" : "vote";
    case "voteReveal":
      return game.voteResult?.approved ? "vote-approved" : "vote-rejected";
    case "quest":
      return "quest";
    case "questReveal":
      return game.questResult?.success ? "quest-success" : "quest-fail";
    case "lady":
      return "lady";
    case "assassin":
      return "assassin";
    case "ended": {
      if (!game.outcome) return null;
      if (game.outcome.winner === "good") return "win-good";
      if (game.log.some((entry) => entry.k === "hammer")) return "win-evil-hammer";
      const shot = game.log.find((entry) => entry.k === "assassin");
      return shot && "correct" in shot && shot.correct ? "win-evil-assassin" : "win-evil-quests";
    }
    default:
      return null;
  }
}

/**
 * Plays the cue for whatever the game has just moved into.
 *
 * Browsers will not play audio before the person has touched the page, so the
 * first cue is armed and fired on the first tap rather than dropped.
 */
export function useNarration(view: View | null, enabled: boolean): void {
  const speaking = useRef<HTMLAudioElement | null>(null);
  const lastCue = useRef<string | null>(null);
  const pending = useRef<Cue | null>(null);
  const unlocked = useRef(false);
  // Narration marks things happening, not things already true. Whatever the game
  // was doing when you joined or reconnected is not news, so it is not announced.
  const arrived = useRef(false);

  useEffect(() => {
    if (unlocked.current) return;
    const unlock = () => {
      unlocked.current = true;
      if (pending.current) {
        const cue = pending.current;
        pending.current = null;
        void play(cue);
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  });

  const play = async (cue: Cue) => {
    // Never let two lines talk over each other.
    speaking.current?.pause();

    const sting = STING[cue];
    if (sting) {
      const effect = new Audio(sting);
      effect.volume = 0.5;
      void effect.play().catch(() => {});
    }

    const audio = new Audio(CLIP(cue));
    audio.volume = 0.95;
    speaking.current = audio;
    try {
      await audio.play();
    } catch {
      // Blocked, muted or missing. Silence is an acceptable outcome for narration.
    }
  };

  useEffect(() => {
    if (!view) return;

    if (!enabled) {
      speaking.current?.pause();
      speaking.current = null;
      // Keep the marker current so switching narration back on does not replay
      // whatever the game happened to be sitting on.
      lastCue.current = `${view.phase}:${view.game?.round ?? 0}:${view.game?.attempt ?? 0}`;
      return;
    }

    const cue = cueFor(view);
    if (!cue) return;

    // A cue fires once per distinct moment, not on every re-render.
    const moment = `${view.phase}:${view.game?.round ?? 0}:${view.game?.attempt ?? 0}`;
    if (lastCue.current === moment) return;
    lastCue.current = moment;

    if (!arrived.current) {
      arrived.current = true;
      return;
    }

    if (!unlocked.current) {
      pending.current = cue;
      return;
    }
    void play(cue);
  }, [view, enabled]);

  useEffect(() => () => speaking.current?.pause(), []);
}

/** Warms the cache so a cue does not arrive late over a slow connection. */
export function usePreloadNarration(enabled: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;
    for (const cue of ["deal", "proposal", "vote", "vote-approved", "vote-rejected"] as Cue[]) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = CLIP(cue);
    }
  }, [enabled]);
}

/**
 * A device-level toggle, remembered between sessions.
 *
 * Until somebody chooses, narration follows whether this phone is the host —
 * one narrator, like a real table. `isHost` is not known on the first render,
 * so the default has to keep tracking it rather than be captured once.
 */
export function useNarrationToggle(isHost: boolean): [boolean, () => void] {
  const [choice, setChoice] = useState<boolean | null>(storedChoice);
  const on = choice ?? isHost;
  return [
    on,
    () => {
      const next = !on;
      setChoice(next);
      setNarrationEnabled(next);
    },
  ];
}
