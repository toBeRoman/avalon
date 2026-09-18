import {
  board,
  buildDeck,
  failsRequired,
  hasErrors,
  hintFor,
  knowledgeFor,
  MAX_PLAYERS,
  sideOf,
  teamSize,
  validate,
} from "./rules";
import type {
  ClientMessage,
  GameState,
  GameView,
  Insight,
  Player,
  QuestRecord,
  RoomState,
  Scoreboard,
  Side,
  View,
} from "./types";

const ACK_PHASES = new Set(["roleReveal", "voteReveal", "questReveal", "ladyReveal"]);

export type Rng = () => number;

export const defaultRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
};

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byId = (room: RoomState, id: string): Player | undefined =>
  room.players.find((p) => p.id === id);

export function emptyScoreboard(): Scoreboard {
  return { games: 0, good: 0, evil: 0, players: {} };
}

/* ------------------------------------------------------------------ */
/* Starting and ending a game                                          */
/* ------------------------------------------------------------------ */

export function startGame(room: RoomState, rng: Rng = defaultRng): void {
  const n = room.players.length;
  const deck = shuffle(buildDeck(n, room.options), rng);
  const order = shuffle(
    room.players.map((p) => p.id),
    rng,
  );

  const roles: Record<string, string> = {};
  order.forEach((id, i) => (roles[id] = deck[i]));

  const leaderIdx = Math.floor(rng() * n);

  room.game = {
    roles: roles as GameState["roles"],
    order,
    leaderIdx,
    round: 1,
    attempt: 1,
    quests: [],
    proposal: null,
    questCards: {},
    // The token starts with the player to the right of the first leader.
    lady: room.options.lady
      ? {
          holderId: order[(leaderIdx - 1 + n) % n],
          visited: [order[(leaderIdx - 1 + n) % n]],
        }
      : null,
    ladyFindings: {},
    assassinTargetId: null,
    log: [],
    outcome: null,
    acks: [],
  };
  room.phase = "roleReveal";
}

function endGame(room: RoomState, winner: Side, reason: string): void {
  const g = room.game!;
  g.outcome = { winner, reason };
  room.phase = "ended";

  room.scores.games += 1;
  room.scores[winner] += 1;
  for (const id of g.order) {
    const entry = (room.scores.players[id] ??= { played: 0, won: 0 });
    entry.played += 1;
    if (sideOf(g.roles[id]) === winner) entry.won += 1;
  }
}

/* ------------------------------------------------------------------ */
/* Phase transitions                                                   */
/* ------------------------------------------------------------------ */

function resolveVote(room: RoomState): void {
  const g = room.game!;
  const p = g.proposal!;
  const approvals = Object.values(p.votes).filter(Boolean).length;
  // A tie is a rejection.
  const approved = approvals * 2 > room.players.length;
  p.approved = approved;
  g.log.push({
    k: "proposal",
    round: g.round,
    attempt: g.attempt,
    leaderId: p.leaderId,
    team: [...p.team],
    votes: { ...p.votes },
    approved,
  });
  room.phase = "voteReveal";
  g.acks = [];
}

function afterVoteReveal(room: RoomState): void {
  const g = room.game!;
  const p = g.proposal!;
  const n = room.players.length;

  // The leader token passes after every vote, approved or not.
  g.leaderIdx = (g.leaderIdx + 1) % n;

  if (p.approved) {
    g.questCards = {};
    room.phase = "quest";
    return;
  }

  if (g.attempt >= 5) {
    g.log.push({ k: "hammer", round: g.round });
    endGame(room, "evil", "Five proposals in a row were rejected.");
    return;
  }

  g.attempt += 1;
  g.proposal = null;
  room.phase = "proposal";
}

function resolveQuest(room: RoomState): void {
  const g = room.game!;
  const p = g.proposal!;
  const fails = p.team.filter((id) => g.questCards[id] === false).length;
  const success = fails < failsRequired(room.players.length, g.round);
  const record: QuestRecord = {
    round: g.round,
    team: [...p.team],
    fails,
    success,
    cards: { ...g.questCards },
  };
  g.quests.push(record);
  g.log.push({ k: "quest", ...record });
  room.phase = "questReveal";
  g.acks = [];
}

function afterQuestReveal(room: RoomState): void {
  const g = room.game!;
  const succeeded = g.quests.filter((q) => q.success).length;
  const failed = g.quests.length - succeeded;

  if (failed >= 3) {
    endGame(room, "evil", "Three quests failed.");
    return;
  }
  if (succeeded >= 3) {
    room.phase = "assassin";
    return;
  }

  const justCompleted = g.round;
  g.round += 1;
  g.attempt = 1;
  g.proposal = null;
  g.questCards = {};

  // The Lady of the Lake is used after the second, third and fourth quests.
  if (g.lady && justCompleted >= 2 && justCompleted <= 4) {
    g.lady.targetId = undefined;
    g.lady.result = undefined;
    room.phase = "lady";
    return;
  }
  room.phase = "proposal";
}

function afterLadyReveal(room: RoomState): void {
  const g = room.game!;
  const lady = g.lady!;
  const target = lady.targetId!;
  lady.visited.push(target);
  lady.holderId = target;
  lady.targetId = undefined;
  lady.result = undefined;
  room.phase = "proposal";
}

/** Advances past whichever reveal screen is currently showing. */
function advanceAck(room: RoomState): void {
  switch (room.phase) {
    case "roleReveal":
      room.game!.acks = [];
      room.phase = "proposal";
      break;
    case "voteReveal":
      afterVoteReveal(room);
      break;
    case "questReveal":
      afterQuestReveal(room);
      break;
    case "ladyReveal":
      afterLadyReveal(room);
      break;
  }
}

/** Who still has to tap through the current reveal. Disconnected players never block. */
function pendingAcks(room: RoomState): string[] {
  const g = room.game;
  if (!g || !ACK_PHASES.has(room.phase)) return [];
  if (room.phase === "ladyReveal") {
    const holder = byId(room, g.lady!.holderId);
    return holder?.connected && !g.acks.includes(holder.id) ? [holder.id] : [];
  }
  return room.players.filter((p) => p.connected && !g.acks.includes(p.id)).map((p) => p.id);
}

/**
 * Called after an ack and after any disconnect, so that a player dropping out
 * cannot leave everyone else stuck on a reveal screen.
 */
export function settle(room: RoomState): void {
  let guard = 0;
  while (ACK_PHASES.has(room.phase) && pendingAcks(room).length === 0 && guard++ < 10) {
    // Nobody left to wait for. Only advance if at least one person actually acked,
    // otherwise an empty room would race through the whole game.
    if (room.game!.acks.length === 0) break;
    advanceAck(room);
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/** Applies a player action. Returns an error message, or null on success. */
export function applyAction(
  room: RoomState,
  playerId: string,
  msg: ClientMessage,
  rng: Rng = defaultRng,
): string | null {
  const player = byId(room, playerId);
  if (!player) return "You are not in this room.";
  const isHost = room.hostId === playerId;
  const g = room.game;

  switch (msg.t) {
    case "rename": {
      const name = msg.name.trim().slice(0, 16);
      if (!name) return "Name cannot be empty.";
      if (room.players.some((p) => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase()))
        return "Someone here already has that name.";
      player.name = name;
      return null;
    }

    case "setOptions": {
      if (!isHost) return "Only the host can change the setup.";
      if (room.phase !== "lobby") return "The game has already started.";
      room.options = { ...room.options, ...msg.options };
      return null;
    }

    case "start": {
      if (!isHost) return "Only the host can start the game.";
      if (room.phase !== "lobby") return "The game has already started.";
      const issues = validate(room.players.length, room.options);
      if (hasErrors(issues)) return issues.find((i) => i.level === "error")!.text;
      startGame(room, rng);
      return null;
    }

    case "ack": {
      if (!g || !ACK_PHASES.has(room.phase)) return "Nothing to acknowledge.";
      if (room.phase === "ladyReveal" && playerId !== g.lady!.holderId)
        return "Only the holder of the Lady of the Lake can continue.";
      if (!g.acks.includes(playerId)) g.acks.push(playerId);
      settle(room);
      return null;
    }

    case "force": {
      if (!isHost) return "Only the host can skip ahead.";
      if (!g || !ACK_PHASES.has(room.phase)) return "Nothing to skip.";
      advanceAck(room);
      return null;
    }

    case "propose": {
      if (!g || room.phase !== "proposal") return "It is not time to propose a team.";
      if (g.order[g.leaderIdx] !== playerId) return "Only the leader can propose a team.";
      const size = teamSize(room.players.length, g.round);
      const team = [...new Set(msg.team)];
      if (team.length !== size) return `Quest ${g.round} needs exactly ${size} players.`;
      if (team.some((id) => !byId(room, id))) return "That team includes someone who is not here.";
      g.proposal = {
        round: g.round,
        attempt: g.attempt,
        leaderId: playerId,
        team,
        votes: {},
      };
      room.phase = "vote";
      return null;
    }

    case "vote": {
      if (!g || room.phase !== "vote") return "There is no vote open.";
      // House rule: you put the team forward, so you have to stand behind it.
      if (!msg.approve && g.proposal!.leaderId === playerId)
        return "You proposed this team, so you must approve it.";
      // Changing your mind is allowed right up until the last vote lands, which
      // leaks nothing because no vote is visible until they all are.
      g.proposal!.votes[playerId] = msg.approve;
      if (Object.keys(g.proposal!.votes).length === room.players.length) resolveVote(room);
      return null;
    }

    case "quest": {
      if (!g || room.phase !== "quest") return "There is no quest underway.";
      const p = g.proposal!;
      if (!p.team.includes(playerId)) return "You are not on this quest.";
      // As with votes, a card can be swapped until the last one is in.
      if (!msg.success && sideOf(g.roles[playerId]) === "good")
        return "Loyal servants of Arthur cannot fail a quest.";
      g.questCards[playerId] = msg.success;
      if (p.team.every((id) => id in g.questCards)) resolveQuest(room);
      return null;
    }

    case "lady": {
      if (!g || room.phase !== "lady") return "The Lady of the Lake is not in play right now.";
      const lady = g.lady!;
      if (lady.holderId !== playerId) return "You do not hold the Lady of the Lake.";
      if (msg.targetId === playerId) return "You cannot inspect yourself.";
      if (!byId(room, msg.targetId)) return "That player is not here.";
      if (lady.visited.includes(msg.targetId))
        return "That player has already held the Lady of the Lake.";
      lady.targetId = msg.targetId;
      lady.result = sideOf(g.roles[msg.targetId]);
      (g.ladyFindings[playerId] ??= []).push({
        targetId: msg.targetId,
        result: lady.result,
        round: g.round - 1,
      });
      g.log.push({ k: "lady", round: g.round - 1, holderId: playerId, targetId: msg.targetId });
      room.phase = "ladyReveal";
      g.acks = [];
      return null;
    }

    case "assassinate": {
      if (!g || room.phase !== "assassin") return "It is not time for the Assassin.";
      if (g.roles[playerId] !== "assassin") return "Only the Assassin can do that.";
      if (msg.targetId === playerId) return "Pick someone else.";
      if (!byId(room, msg.targetId)) return "That player is not here.";
      const correct = g.roles[msg.targetId] === "merlin";
      g.assassinTargetId = msg.targetId;
      g.log.push({ k: "assassin", assassinId: playerId, targetId: msg.targetId, correct });
      endGame(
        room,
        correct ? "evil" : "good",
        correct
          ? "Good completed three quests, but the Assassin found Merlin."
          : "Good completed three quests and the Assassin guessed wrong.",
      );
      return null;
    }

    case "playAgain": {
      if (!isHost) return "Only the host can start another game.";
      if (room.phase !== "ended") return "Finish this game first.";
      room.game = null;
      room.phase = "lobby";
      room.claim = null;
      return null;
    }

    case "abandon": {
      // The escape hatch: a game can always be thrown away and redealt.
      if (!isHost) return "Only the host can abandon a game.";
      if (room.phase === "lobby") return "There is no game to abandon.";
      room.game = null;
      room.phase = "lobby";
      room.claim = null;
      return null;
    }

    case "kick": {
      if (!isHost) return "Only the host can remove players.";
      if (room.phase !== "lobby") return "You can only remove players in the lobby.";
      if (msg.playerId === playerId) return "You cannot remove yourself.";
      room.players = room.players.filter((p) => p.id !== msg.playerId);
      delete room.tokens[msg.playerId];
      return null;
    }

    case "transferHost": {
      if (!isHost) return "Only the host can hand over hosting.";
      if (!byId(room, msg.playerId)) return "That player is not here.";
      room.hostId = msg.playerId;
      return null;
    }

    case "releaseSeat": {
      if (!isHost) return "Only the host can hand a seat to another phone.";
      const seat = byId(room, msg.playerId);
      if (!seat) return "That player is not here.";
      room.claim = { playerId: msg.playerId, code: claimCode(rng) };
      return null;
    }

    case "cancelClaim": {
      if (!isHost) return "Only the host can do that.";
      room.claim = null;
      return null;
    }
  }
}

function claimCode(rng: Rng): string {
  return Array.from({ length: 4 }, () => Math.floor(rng() * 10)).join("");
}

/* ------------------------------------------------------------------ */
/* Joining                                                             */
/* ------------------------------------------------------------------ */

export function canJoin(room: RoomState, name: string): string | null {
  if (room.players.length >= MAX_PLAYERS) return "This room is full.";
  if (room.phase !== "lobby")
    return "That game is already underway. Ask the host to hand you a seat.";
  if (!name.trim()) return "Pick a name first.";
  if (room.players.some((p) => p.name.toLowerCase() === name.trim().toLowerCase()))
    return "Someone here already has that name.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Redaction: what each player is allowed to see                       */
/* ------------------------------------------------------------------ */

function waiting(room: RoomState): { ids: string[]; label: string | null } {
  const g = room.game;
  if (!g) return { ids: [], label: null };

  switch (room.phase) {
    case "roleReveal":
    case "voteReveal":
    case "questReveal":
      return { ids: pendingAcks(room), label: null };
    case "ladyReveal":
    case "lady":
      return { ids: [g.lady!.holderId], label: null };
    case "proposal":
      return { ids: [g.order[g.leaderIdx]], label: null };
    case "vote":
      return {
        ids: room.players.filter((p) => !(p.id in g.proposal!.votes)).map((p) => p.id),
        label: null,
      };
    case "quest":
      return {
        ids: g.proposal!.team.filter((id) => !(id in g.questCards)),
        label: null,
      };
    case "assassin":
      // Naming the Assassin here would leak who holds the card, so we stay vague.
      return { ids: [], label: "the Assassin" };
    default:
      return { ids: [], label: null };
  }
}


/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

/**
 * Two sets of notes. `table` holds deductions any player could make from what is
 * public, so it is safe to show openly. `private` is derived from the player's own
 * role and must stay behind the hold-to-reveal card.
 *
 * Everything here is a *fact* about the game so far. Nothing guesses at what
 * anyone's intentions are — a wrong nudge is worse than none.
 */
function insightsFor(
  room: RoomState,
  playerId: string,
): { table: Insight[]; private: Insight[] } {
  const g = room.game;
  const table: Insight[] = [];
  const priv: Insight[] = [];
  if (!g || room.phase === "roleReveal") return { table, private: priv };

  const name = (id: string) => byId(room, id)?.name ?? "someone";
  const list = (ids: string[]) => ids.map(name).join(", ");
  const finished = g.quests.filter((q) => q.round !== g.round || room.phase === "ended");
  const succeeded = g.quests.filter((q) => q.success).length;
  const failed = g.quests.length - succeeded;
  const over = room.phase === "ended";

  /* ---- where the game stands ---- */

  if (!over) {
    if (succeeded === 2)
      table.push({ tone: "good", text: "Good is one successful quest from forcing the Assassin." });
    if (failed === 2)
      table.push({ tone: "evil", text: "Evil is one failed quest from winning outright." });
    if (g.attempt === 5)
      table.push({
        tone: "warn",
        text: "Fifth proposal. If this is rejected, evil wins on the spot.",
      });
    else if (g.attempt === 4)
      table.push({ tone: "warn", text: "Reject this and only one proposal is left." });
    if (g.round === 4 && failsRequired(room.players.length, 4) === 2)
      table.push({
        tone: "neutral",
        text: "This quest needs two fails. A lone spy on it cannot sink it.",
      });
  }

  /* ---- what the failed quests narrow down ---- */

  for (const quest of g.quests.filter((q) => !q.success)) {
    if (quest.fails === quest.team.length) {
      table.push({
        tone: "evil",
        text: `Every card on quest ${quest.round} was a Fail, so ${list(quest.team)} are all evil.`,
      });
    } else {
      table.push({
        tone: "evil",
        text: `Quest ${quest.round} failed with ${quest.fails} fail${
          quest.fails === 1 ? "" : "s"
        } — at least ${quest.fails} of ${list(quest.team)} ${quest.fails === 1 ? "is" : "are"} evil.`,
      });
    }
  }

  // Anyone who has been on more than one failed quest is worth a hard look.
  const failCounts = new Map<string, number>();
  for (const quest of g.quests.filter((q) => !q.success))
    for (const id of quest.team) failCounts.set(id, (failCounts.get(id) ?? 0) + 1);
  const repeat = [...failCounts].filter(([, n]) => n > 1).map(([id]) => id);
  if (repeat.length)
    table.push({
      tone: "evil",
      text: `${list(repeat)} ${repeat.length === 1 ? "has" : "have"} been on more than one failed quest.`,
    });

  // Being trusted repeatedly is information too.
  const cleanRuns = g.order.filter(
    (id) =>
      finished.length >= 2 &&
      finished.every((q) => !q.team.includes(id) || q.success) &&
      finished.some((q) => q.team.includes(id)),
  );
  if (cleanRuns.length && failed > 0)
    table.push({
      tone: "good",
      text: `${list(cleanRuns)} ${cleanRuns.length === 1 ? "has" : "have"} only ever been on quests that succeeded.`,
    });

  const untested = g.order.filter((id) => !g.quests.some((q) => q.team.includes(id)));
  if (untested.length && g.quests.length >= 2 && !over)
    table.push({
      tone: "neutral",
      text: `${list(untested)} ${untested.length === 1 ? "has" : "have"} not been on a quest yet.`,
    });

  /* ---- what your own card tells you ---- */

  const role = g.roles[playerId];
  if (!role || over) return { table, private: priv };

  const side = sideOf(role);
  const known = knowledgeFor(role, playerId, g.roles, g.order, room.options)?.ids ?? [];
  const proposed = room.phase === "vote" || room.phase === "proposal" ? g.proposal?.team ?? [] : [];

  if (known.length && proposed.length) {
    const flagged = proposed.filter((id) => known.includes(id));
    if (role === "merlin" || side === "evil") {
      priv.push(
        flagged.length
          ? {
              tone: side === "evil" ? "good" : "evil",
              text:
                side === "evil"
                  ? `${list(flagged)} on this team ${flagged.length === 1 ? "is" : "are"} yours.`
                  : `${list(flagged)} on this team ${flagged.length === 1 ? "is" : "are"} evil.`,
            }
          : {
              tone: side === "evil" ? "evil" : "good",
              text:
                side === "evil"
                  ? "None of your side is on this team. It will succeed unless Oberon is on it."
                  : "Nobody you know to be evil is on this team.",
            },
      );
    }
  }

  // A standing note so the roles with knowledge always have something live to read.
  if (known.length) {
    const leaderId = g.order[g.leaderIdx];
    if (known.includes(leaderId))
      priv.push({
        tone: side === "evil" ? "good" : "evil",
        text:
          side === "evil"
            ? `${name(leaderId)} is leading this round, and they are one of yours.`
            : `${name(leaderId)} is leading this round, and you know they are evil.`,
      });

    const tested = known.filter((id) => g.quests.some((q) => q.team.includes(id)));
    const untestedKnown = known.filter((id) => !tested.includes(id));
    if (untestedKnown.length && g.quests.length >= 1)
      priv.push({
        tone: "neutral",
        text:
          side === "evil"
            ? `${list(untestedKnown)} ${untestedKnown.length === 1 ? "has" : "have"} not been on a quest yet — still clean, still useful.`
            : `${list(untestedKnown)} ${untestedKnown.length === 1 ? "is" : "are"} evil and has not been on a quest yet.`,
      });
  }

  if (role === "merlin") {
    const exposed = known.filter((id) => (failCounts.get(id) ?? 0) > 0);
    if (exposed.length)
      priv.push({
        tone: "good",
        text: `The table can already suspect ${list(exposed)}. You can afford to agree out loud.`,
      });
    if (g.quests.length >= 2)
      priv.push({
        tone: "warn",
        text: "Every round you are right out loud is a round the Assassin learns from.",
      });
    if (succeeded === 2)
      priv.push({
        tone: "warn",
        text: "One more success and the Assassin guesses. Start being less right out loud.",
      });
  }

  if (role === "percival" && known.length === 2) {
    const [a, b] = known;
    const suspicious = known.filter((id) => (failCounts.get(id) ?? 0) > 0);
    if (suspicious.length === 1)
      priv.push({
        tone: "good",
        text: `${name(suspicious[0])} has been on a failed quest. Merlin never plays a Fail, so that points at ${name(
          suspicious[0] === a ? a : b,
        )} being Morgana.`,
      });
    else
      priv.push({
        tone: "neutral",
        text: `Still nothing separating ${name(a)} from ${name(b)}. Watch which one is more eager to be believed.`,
      });
  }

  if (side === "evil") {
    if (role === "oberon")
      priv.push({
        tone: "warn",
        text: "Your side cannot see you and you cannot see them. Assume any Fail you did not play was theirs.",
      });
    if (failed === 2)
      priv.push({ tone: "evil", text: "One more failed quest and you win. Do not overreach." });
    if (succeeded === 2 && role === "assassin")
      priv.push({
        tone: "warn",
        text: "If good takes the next quest, you name Merlin. Start deciding now.",
      });
    const mine = g.quests.filter((q) => q.team.includes(playerId) && q.success).length;
    if (mine >= 2)
      priv.push({
        tone: "good",
        text: `You have been on ${mine} successful quests. That is cover — spend it.`,
      });
  }

  if (side === "good" && role !== "merlin" && role !== "percival" && g.quests.length >= 1)
    priv.push({
      tone: "neutral",
      text: "You know nothing nobody else knows. Trust the voting record over the argument.",
    });

  if (g.ladyFindings[playerId]?.length) {
    for (const finding of g.ladyFindings[playerId])
      priv.push({
        tone: finding.result === "evil" ? "evil" : "good",
        text: `The Lady showed you ${name(finding.targetId)} is ${finding.result}. Nobody can check that but you.`,
      });
  }

  return { table, private: priv };
}

export function viewFor(room: RoomState, playerId: string): View {
  const g = room.game;
  const you = byId(room, playerId)!;
  const role = g?.roles[playerId] ?? null;
  const n = room.players.length;

  const over = room.phase === "ended";
  let gameView: GameView | null = null;
  if (g) {
    const votingClosed = room.phase !== "vote";
    const p = g.proposal;
    const lastQuest = g.quests.length ? g.quests[g.quests.length - 1] : null;

    gameView = {
      round: g.round,
      attempt: g.attempt,
      leaderId: g.order[g.leaderIdx],
      order: g.order,
      teamSize: g.round <= 5 ? teamSize(n, g.round) : 0,
      failsRequired: g.round <= 5 ? failsRequired(n, g.round) : 1,
      // Who played which card stays sealed until the game is over.
      quests: over ? g.quests : g.quests.map(({ cards, ...rest }) => ({ ...rest, cards: {} })),
      board: board(n),
      proposal: p ? { leaderId: p.leaderId, team: p.team, voted: Object.keys(p.votes) } : null,
      // Individual votes stay sealed until the last one is in.
      voteResult:
        p && votingClosed && p.approved !== undefined
          ? { team: p.team, votes: p.votes, approved: p.approved }
          : null,
      questResult: room.phase === "questReveal" ? lastQuest : null,
      played: room.phase === "quest" ? Object.keys(g.questCards) : [],
      lady: g.lady
        ? {
            holderId: g.lady.holderId,
            visited: g.lady.visited,
            targetId: g.lady.targetId,
            // Only the holder learns the loyalty.
            result: playerId === g.lady.holderId ? g.lady.result : undefined,
          }
        : null,
      ladyFindings: g.ladyFindings[playerId] ?? [],
      log: over ? g.log : g.log.map((e) => (e.k === "quest" ? { ...e, cards: {} } : e)),
      outcome: g.outcome,
      reveal: over ? g.roles : null,
      acks: g.acks,
      // Your own choices come back so you can see and change them.
      yourVote: p && !votingClosed && playerId in p.votes ? p.votes[playerId] : null,
      yourCard: playerId in g.questCards ? g.questCards[playerId] : null,
    };
  }

  const w = waiting(room);
  const onTeam = room.phase === "quest" && !!g?.proposal?.team.includes(playerId);
  const notes = insightsFor(room, playerId);

  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
    hostId: room.hostId,
    options: room.options,
    you: {
      id: playerId,
      name: you.name,
      isHost: room.hostId === playerId,
      role,
      side: role ? sideOf(role) : null,
      hint: role ? hintFor(role, room.options) : null,
      knowledge:
        role && g
          ? (() => {
              const k = knowledgeFor(role, playerId, g.roles, g.order, room.options);
              return k ? { ids: k.ids, label: k.label } : null;
            })()
          : null,
      mayFail: onTeam && role !== null && sideOf(role) === "evil",
      hasPlayedCard: !!g && playerId in g.questCards,
    },
    game: gameView,
    waitingOn: w.ids,
    waitingLabel: w.label,
    claim: room.hostId === playerId ? room.claim : null,
    scores: room.scores,
    insights: notes.private,
    tableInsights: notes.table,
  };
}
