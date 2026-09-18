import type { Options, OptionId, RoleId, Side } from "./types";

/**
 * The reserved debug room. "O" is not in the room-code alphabet, so this can
 * never be handed out by accident — only somebody who types it gets a debug room.
 */
export const DEBUG_CODE = "TOBY";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

/** Official quest team sizes, indexed by player count then round (1-based). */
const TEAM_SIZES: Record<number, [number, number, number, number, number]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

/** Official number of evil players. */
const EVIL_COUNT: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };

export function teamSize(players: number, round: number): number {
  return TEAM_SIZES[players][round - 1];
}

export function evilCount(players: number): number {
  return EVIL_COUNT[players];
}

/** The fourth quest needs two fails in games of seven or more. */
export function failsRequired(players: number, round: number): number {
  return round === 4 && players >= 7 ? 2 : 1;
}

export function board(players: number) {
  return [1, 2, 3, 4, 5].map((round) => ({
    size: teamSize(players, round),
    failsRequired: failsRequired(players, round),
  }));
}

export const EVIL_ROLES: RoleId[] = ["assassin", "morgana", "mordred", "oberon", "minion"];

export function sideOf(role: RoleId): Side {
  return EVIL_ROLES.includes(role) ? "evil" : "good";
}

export const ROLE_NAMES: Record<RoleId, string> = {
  merlin: "Merlin",
  percival: "Percival",
  servant: "Loyal Servant of Arthur",
  assassin: "Assassin",
  morgana: "Morgana",
  mordred: "Mordred",
  oberon: "Oberon",
  minion: "Minion of Mordred",
};

export const DEFAULT_OPTIONS: Options = {
  percival: true,
  morgana: true,
  mordred: false,
  oberon: false,
  lady: false,
};

/** Evil roles other than the Assassin that each consume one evil seat. */
const OPTIONAL_EVIL: OptionId[] = ["morgana", "mordred", "oberon"];

export interface Issue {
  level: "error" | "warning";
  text: string;
}

/**
 * Checks a lobby configuration. Errors block the deal; warnings are just advice.
 * Called on both sides: the client to grey out the start button, the server to enforce.
 */
export function validate(players: number, options: Options): Issue[] {
  const issues: Issue[] = [];

  if (players < MIN_PLAYERS) {
    issues.push({ level: "error", text: `Avalon needs at least ${MIN_PLAYERS} players.` });
    return issues;
  }
  if (players > MAX_PLAYERS) {
    issues.push({ level: "error", text: `Avalon supports at most ${MAX_PLAYERS} players.` });
    return issues;
  }

  const evil = evilCount(players);
  const specials = OPTIONAL_EVIL.filter((o) => options[o]).length;
  // The Assassin always takes one evil seat.
  if (specials + 1 > evil) {
    const names = OPTIONAL_EVIL.filter((o) => options[o]).map((o) => ROLE_NAMES[o as RoleId]);
    issues.push({
      level: "error",
      text: `${players} players means ${evil} evil, and the Assassin takes one seat. ${names.join(
        " + ",
      )} needs ${specials + 1}. Turn one off or add players.`,
    });
  }

  if (options.percival && !options.morgana) {
    issues.push({
      level: "warning",
      text: "Percival without Morgana sees Merlin exactly. Good becomes much stronger.",
    });
  }
  if (options.morgana && !options.percival) {
    issues.push({
      level: "warning",
      text: "Morgana without Percival has nobody to deceive — she plays as an ordinary Minion.",
    });
  }
  if (options.mordred) {
    issues.push({
      level: "warning",
      text: "Mordred is hidden from Merlin. Evil gets a real edge — expect it to be close.",
    });
  }
  if (options.oberon && evil - specials - 1 === 0 && specials > 1) {
    issues.push({
      level: "warning",
      text: "With Oberon in play, the rest of evil is a man down on information.",
    });
  }
  if (options.lady && players < 7) {
    issues.push({
      level: "warning",
      text: "The Lady of the Lake is designed for 7 or more. It works below that, but it is strong.",
    });
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}

/** Builds the exact role deck for a player count and option set. */
export function buildDeck(players: number, options: Options): RoleId[] {
  const evil = evilCount(players);
  const good = players - evil;

  const evilDeck: RoleId[] = ["assassin"];
  if (options.morgana) evilDeck.push("morgana");
  if (options.mordred) evilDeck.push("mordred");
  if (options.oberon) evilDeck.push("oberon");
  while (evilDeck.length < evil) evilDeck.push("minion");

  const goodDeck: RoleId[] = ["merlin"];
  if (options.percival) goodDeck.push("percival");
  while (goodDeck.length < good) goodDeck.push("servant");

  return [...goodDeck, ...evilDeck];
}

/**
 * What a role learns at the start of the game.
 * `ids` are returned in the caller's seat order so the ordering never leaks anything —
 * in particular Percival must not be able to tell Merlin from Morgana by position.
 */
export function knowledgeFor(
  role: RoleId,
  self: string,
  roles: Record<string, RoleId>,
  order: string[],
  options: Options,
): { ids: string[]; label: string } | null {
  const inSeatOrder = (pred: (r: RoleId, id: string) => boolean) =>
    order.filter((id) => id !== self && pred(roles[id], id));

  switch (role) {
    case "merlin": {
      // Merlin sees every evil player except Mordred. He does see Oberon.
      const ids = inSeatOrder((r) => sideOf(r) === "evil" && r !== "mordred");
      return {
        ids,
        label: options.mordred
          ? "Minions of Mordred — but Mordred himself is hidden from you"
          : "Minions of Mordred",
      };
    }
    case "percival": {
      const ids = inSeatOrder((r) => r === "merlin" || r === "morgana");
      return {
        ids,
        label: options.morgana
          ? "One of these two is Merlin. The other is Morgana."
          : "Merlin",
      };
    }
    case "oberon":
      // Oberon knows nobody and nobody knows him.
      return null;
    case "assassin":
    case "morgana":
    case "mordred":
    case "minion": {
      // Evil recognise each other, except that Oberon is invisible to them.
      const ids = inSeatOrder((r) => sideOf(r) === "evil" && r !== "oberon");
      return ids.length
        ? { ids, label: "Your fellow servants of Mordred" }
        : { ids: [], label: "You appear to be working alone" };
    }
    default:
      return null;
  }
}

/** One line of coaching shown under the role name on the reveal card. */
export function hintFor(role: RoleId, options: Options): string {
  switch (role) {
    case "merlin":
      return "You know who is evil. Steer the votes without ever sounding certain — if good wins three quests, the Assassin gets one guess at you.";
    case "percival":
      return options.morgana
        ? "One of the two below is Merlin. Work out which, then protect them — and never say their name out loud."
        : "You know Merlin. Protect them quietly; the Assassin is listening.";
    case "servant":
      return "You know nothing. Listen hard, watch who rejects what, and trust the pattern rather than the person.";
    case "assassin":
      return "You are evil. Fail quests without being caught — and if good wins three, you get one shot at naming Merlin.";
    case "morgana":
      return "You are evil, and you appear to Percival as Merlin. Act the part: be helpful, be certain, be wrong at the right moment.";
    case "mordred":
      return "You are evil, and Merlin cannot see you. You are the safest liar at this fire — use it.";
    case "oberon":
      return "You are evil, but you work alone. Your team cannot see you and you cannot see them. Fail quests carefully — they may not know you are on their side.";
    case "minion":
      return "You are evil. Blend in, sow doubt, and get onto quests.";
  }
}
