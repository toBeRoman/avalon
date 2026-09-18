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
} from "../shared/rules";
import type {
  ClientMessage,
  GameState,
  GameView,
  Player,
  RoomState,
  Side,
  View,
} from "../shared/types";

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
  room.game!.outcome = { winner, reason };
  room.phase = "ended";
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
  const record = { round: g.round, team: [...p.team], fails, success };
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
      if (playerId in g.proposal!.votes) return "You have already voted.";
      // House rule: you put the team forward, so you have to stand behind it.
      if (!msg.approve && g.proposal!.leaderId === playerId)
        return "You proposed this team, so you must approve it.";
      g.proposal!.votes[playerId] = msg.approve;
      if (Object.keys(g.proposal!.votes).length === room.players.length) resolveVote(room);
      return null;
    }

    case "quest": {
      if (!g || room.phase !== "quest") return "There is no quest underway.";
      const p = g.proposal!;
      if (!p.team.includes(playerId)) return "You are not on this quest.";
      if (playerId in g.questCards) return "You have already played your card.";
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

export function viewFor(room: RoomState, playerId: string): View {
  const g = room.game;
  const you = byId(room, playerId)!;
  const role = g?.roles[playerId] ?? null;
  const n = room.players.length;

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
      quests: g.quests,
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
      log: g.log,
      outcome: g.outcome,
      reveal: room.phase === "ended" ? g.roles : null,
      acks: g.acks,
    };
  }

  const w = waiting(room);
  const onTeam = room.phase === "quest" && !!g?.proposal?.team.includes(playerId);

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
      mayFail: onTeam && role !== null && sideOf(role) === "evil" && !(playerId in g!.questCards),
      hasPlayedCard: !!g && playerId in g.questCards,
    },
    game: gameView,
    waitingOn: w.ids,
    waitingLabel: w.label,
    claim: room.hostId === playerId ? room.claim : null,
  };
}
