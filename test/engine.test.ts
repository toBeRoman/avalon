import { describe, expect, it } from "vitest";
import { applyAction, startGame, viewFor, type Rng } from "../src/server/engine";
import {
  buildDeck,
  DEFAULT_OPTIONS,
  evilCount,
  failsRequired,
  hasErrors,
  knowledgeFor,
  sideOf,
  teamSize,
  validate,
} from "../src/shared/rules";
import type { Options, RoleId, RoomState } from "../src/shared/types";

/** Deterministic RNG so a failing test is reproducible. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRoom(n: number, options: Partial<Options> = {}): RoomState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    connected: true,
  }));
  return {
    code: "TEST",
    hostId: "p0",
    players,
    tokens: Object.fromEntries(players.map((p) => [p.id, "t"])),
    options: { ...DEFAULT_OPTIONS, ...options },
    phase: "lobby",
    game: null,
    claim: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const idsWithRole = (room: RoomState, role: RoleId) =>
  Object.entries(room.game!.roles)
    .filter(([, r]) => r === role)
    .map(([id]) => id);

const ackAll = (room: RoomState) => {
  for (const p of [...room.players]) applyAction(room, p.id, { t: "ack" });
};

/** Runs one full quest round. `failers` play a fail card if they are evil and on the team. */
function playRound(room: RoomState, failers: string[] = []) {
  const g = room.game!;
  const leader = g.order[g.leaderIdx];
  const size = teamSize(room.players.length, g.round);
  // Put the intended failers on the team, then fill up in seat order.
  const team = [...new Set([...failers, ...g.order])].slice(0, size);
  expect(applyAction(room, leader, { t: "propose", team })).toBeNull();
  for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: true });
  expect(room.phase).toBe("voteReveal");
  ackAll(room);
  expect(room.phase).toBe("quest");
  for (const id of team) {
    applyAction(room, id, { t: "quest", success: !failers.includes(id) });
  }
  expect(room.phase).toBe("questReveal");
  ackAll(room);
}

/** Resolves an open Lady of the Lake phase, inspecting the first legal target. */
function resolveLady(room: RoomState) {
  const lady = room.game!.lady!;
  const target = room.game!.order.find(
    (id) => id !== lady.holderId && !lady.visited.includes(id),
  )!;
  expect(applyAction(room, lady.holderId, { t: "lady", targetId: target })).toBeNull();
  applyAction(room, lady.holderId, { t: "ack" });
  return target;
}

/** Every string that actually appears as a value in the payload (object keys excluded). */
function stringValues(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringValues(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => stringValues(v, out));
  return out;
}

describe("official tables", () => {
  it("matches the printed quest sizes and evil counts", () => {
    expect([5, 6, 7, 8, 9, 10].map((n) => evilCount(n))).toEqual([2, 2, 3, 3, 3, 4]);
    expect([1, 2, 3, 4, 5].map((r) => teamSize(5, r))).toEqual([2, 3, 2, 3, 3]);
    expect([1, 2, 3, 4, 5].map((r) => teamSize(6, r))).toEqual([2, 3, 4, 3, 4]);
    expect([1, 2, 3, 4, 5].map((r) => teamSize(7, r))).toEqual([2, 3, 3, 4, 4]);
    expect([1, 2, 3, 4, 5].map((r) => teamSize(10, r))).toEqual([3, 4, 4, 5, 5]);
  });

  it("requires two fails on the fourth quest at seven or more", () => {
    expect(failsRequired(6, 4)).toBe(1);
    expect(failsRequired(7, 4)).toBe(2);
    expect(failsRequired(7, 3)).toBe(1);
    expect(failsRequired(10, 4)).toBe(2);
  });

  it("builds a deck of the right size and shape for every player count", () => {
    for (let n = 5; n <= 10; n++) {
      const deck = buildDeck(n, { percival: true, morgana: true, mordred: n >= 7, oberon: false, lady: false });
      expect(deck).toHaveLength(n);
      expect(deck.filter((r) => sideOf(r) === "evil")).toHaveLength(evilCount(n));
      expect(deck.filter((r) => r === "merlin")).toHaveLength(1);
      expect(deck.filter((r) => r === "assassin")).toHaveLength(1);
    }
  });
});

describe("lobby validation", () => {
  it("blocks more special evils than there are evil seats", () => {
    const issues = validate(5, { percival: true, morgana: true, mordred: true, oberon: false, lady: false });
    expect(hasErrors(issues)).toBe(true);
  });

  it("allows Morgana plus Mordred once there are three evil seats", () => {
    const issues = validate(7, { percival: true, morgana: true, mordred: true, oberon: false, lady: false });
    expect(hasErrors(issues)).toBe(false);
  });

  it("warns but does not block Percival without Morgana", () => {
    const issues = validate(5, { percival: true, morgana: false, mordred: false, oberon: false, lady: false });
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((i) => i.level === "warning")).toBe(true);
  });

  it("rejects player counts outside five to ten", () => {
    expect(hasErrors(validate(4, DEFAULT_OPTIONS))).toBe(true);
    expect(hasErrors(validate(11, DEFAULT_OPTIONS))).toBe(true);
  });
});

describe("what each role learns", () => {
  it("hides Mordred from Merlin but shows Oberon", () => {
    const room = makeRoom(7, { mordred: true, oberon: true, morgana: false });
    startGame(room, seeded(7));
    const g = room.game!;
    const merlin = idsWithRole(room, "merlin")[0];
    const mordred = idsWithRole(room, "mordred")[0];
    const oberon = idsWithRole(room, "oberon")[0];
    const seen = knowledgeFor("merlin", merlin, g.roles, g.order, room.options)!.ids;
    expect(seen).not.toContain(mordred);
    expect(seen).toContain(oberon);
  });

  it("hides Oberon from the rest of evil, and the rest of evil from Oberon", () => {
    const room = makeRoom(7, { oberon: true, morgana: false, mordred: false });
    startGame(room, seeded(11));
    const g = room.game!;
    const oberon = idsWithRole(room, "oberon")[0];
    const assassin = idsWithRole(room, "assassin")[0];
    expect(knowledgeFor("oberon", oberon, g.roles, g.order, room.options)).toBeNull();
    expect(knowledgeFor("assassin", assassin, g.roles, g.order, room.options)!.ids).not.toContain(oberon);
  });

  it("shows Percival an unordered pair of Merlin and Morgana", () => {
    const room = makeRoom(6, { percival: true, morgana: true });
    startGame(room, seeded(3));
    const g = room.game!;
    const percival = idsWithRole(room, "percival")[0];
    const pair = knowledgeFor("percival", percival, g.roles, g.order, room.options)!.ids;
    expect(pair).toHaveLength(2);
    expect(pair.map((id) => g.roles[id]).sort()).toEqual(["merlin", "morgana"]);
    // Seat order, so position carries no information about which is which.
    expect(pair).toEqual(g.order.filter((id) => pair.includes(id)));
  });
});

describe("running a game", () => {
  it("sends good to the assassin after three successful quests", () => {
    const room = makeRoom(5);
    startGame(room, seeded(1));
    expect(room.phase).toBe("roleReveal");
    ackAll(room);
    expect(room.phase).toBe("proposal");

    playRound(room);
    playRound(room);
    playRound(room);

    expect(room.game!.quests.filter((q) => q.success)).toHaveLength(3);
    expect(room.phase).toBe("assassin");

    const assassin = idsWithRole(room, "assassin")[0];
    const merlin = idsWithRole(room, "merlin")[0];
    expect(applyAction(room, assassin, { t: "assassinate", targetId: merlin })).toBeNull();
    expect(room.phase).toBe("ended");
    expect(room.game!.outcome!.winner).toBe("evil");
  });

  it("lets good survive a wrong assassin guess", () => {
    const room = makeRoom(5);
    startGame(room, seeded(2));
    ackAll(room);
    playRound(room);
    playRound(room);
    playRound(room);
    const assassin = idsWithRole(room, "assassin")[0];
    const innocent = room.players
      .map((p) => p.id)
      .find((id) => sideOf(room.game!.roles[id]) === "good" && room.game!.roles[id] !== "merlin")!;
    applyAction(room, assassin, { t: "assassinate", targetId: innocent });
    expect(room.game!.outcome!.winner).toBe("good");
  });

  it("gives evil the game after three failed quests", () => {
    const room = makeRoom(5);
    startGame(room, seeded(4));
    ackAll(room);
    const evil = room.players.map((p) => p.id).filter((id) => sideOf(room.game!.roles[id]) === "evil");
    playRound(room, [evil[0]]);
    playRound(room, [evil[0]]);
    playRound(room, [evil[0]]);
    expect(room.phase).toBe("ended");
    expect(room.game!.outcome!.winner).toBe("evil");
    expect(room.game!.outcome!.reason).toContain("Three quests failed");
  });

  it("gives evil the game after five rejected proposals", () => {
    const room = makeRoom(5);
    startGame(room, seeded(5));
    ackAll(room);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const g = room.game!;
      expect(g.attempt).toBe(attempt);
      const leader = g.order[g.leaderIdx];
      applyAction(room, leader, { t: "propose", team: g.order.slice(0, teamSize(5, 1)) });
      for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: false });
      ackAll(room);
    }
    expect(room.phase).toBe("ended");
    expect(room.game!.outcome!.winner).toBe("evil");
    expect(room.game!.outcome!.reason).toContain("Five proposals");
  });

  it("treats a tied vote as a rejection", () => {
    const room = makeRoom(6);
    startGame(room, seeded(6));
    ackAll(room);
    const g = room.game!;
    const leader = g.order[g.leaderIdx];
    applyAction(room, leader, { t: "propose", team: g.order.slice(0, 2) });
    room.players.forEach((p, i) => applyAction(room, p.id, { t: "vote", approve: i < 3 }));
    expect(g.proposal!.approved).toBe(false);
  });

  it("needs two fails on the fourth quest with seven players", () => {
    const room = makeRoom(7, { mordred: true });
    startGame(room, seeded(8));
    ackAll(room);
    const evil = room.players.map((p) => p.id).filter((id) => sideOf(room.game!.roles[id]) === "evil");

    playRound(room); // 1 success
    playRound(room, [evil[0]]); // 1 fail
    playRound(room); // 2 successes
    expect(room.game!.round).toBe(4);

    playRound(room, [evil[0]]); // a single fail is not enough on quest 4
    const fourth = room.game!.quests.find((q) => q.round === 4)!;
    expect(fourth.fails).toBe(1);
    expect(fourth.success).toBe(true);
  });

  it("refuses to let a loyal servant fail a quest", () => {
    const room = makeRoom(5);
    startGame(room, seeded(9));
    ackAll(room);
    const g = room.game!;
    const leader = g.order[g.leaderIdx];
    const good = g.order.filter((id) => sideOf(g.roles[id]) === "good");
    const team = good.slice(0, 2);
    applyAction(room, leader, { t: "propose", team });
    for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: true });
    ackAll(room);
    const error = applyAction(room, team[0], { t: "quest", success: false });
    expect(error).toContain("cannot fail");
  });

  it("only lets the leader propose, and only a team of the right size", () => {
    const room = makeRoom(5);
    startGame(room, seeded(10));
    ackAll(room);
    const g = room.game!;
    const leader = g.order[g.leaderIdx];
    const other = g.order.find((id) => id !== leader)!;
    expect(applyAction(room, other, { t: "propose", team: g.order.slice(0, 2) })).toContain("leader");
    expect(applyAction(room, leader, { t: "propose", team: g.order.slice(0, 3) })).toContain("exactly 2");
  });

  it("passes the leader token after every vote", () => {
    const room = makeRoom(5);
    startGame(room, seeded(12));
    ackAll(room);
    const first = room.game!.order[room.game!.leaderIdx];
    applyAction(room, first, { t: "propose", team: room.game!.order.slice(0, 2) });
    for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: false });
    ackAll(room);
    expect(room.game!.order[room.game!.leaderIdx]).not.toBe(first);
  });
});

describe("the Lady of the Lake", () => {
  it("runs after the second quest and passes to the inspected player", () => {
    const room = makeRoom(7, { lady: true, mordred: true });
    startGame(room, seeded(13));
    ackAll(room);
    const holder = room.game!.lady!.holderId;

    playRound(room);
    expect(room.phase).toBe("proposal");
    playRound(room);
    expect(room.phase).toBe("lady");
    expect(room.game!.lady!.holderId).toBe(holder);

    const target = room.game!.order.find((id) => id !== holder)!;
    expect(applyAction(room, holder, { t: "lady", targetId: target })).toBeNull();
    expect(room.phase).toBe("ladyReveal");
    expect(room.game!.lady!.result).toBe(sideOf(room.game!.roles[target]));

    applyAction(room, holder, { t: "ack" });
    expect(room.phase).toBe("proposal");
    expect(room.game!.lady!.holderId).toBe(target);
    expect(room.game!.lady!.visited).toContain(holder);
  });

  it("refuses to inspect a previous holder", () => {
    const room = makeRoom(7, { lady: true });
    startGame(room, seeded(14));
    ackAll(room);
    const evil = room.players.map((p) => p.id).filter((id) => sideOf(room.game!.roles[id]) === "evil");
    const first = room.game!.lady!.holderId;

    expect(applyAction(room, first, { t: "lady", targetId: first })).toContain("not in play");

    playRound(room, [evil[0]]);
    playRound(room);
    expect(room.phase).toBe("lady");
    expect(applyAction(room, first, { t: "lady", targetId: first })).toContain("yourself");

    const second = resolveLady(room);
    expect(room.game!.lady!.holderId).toBe(second);

    // Keep the game alive so the token comes round again after quest three.
    playRound(room, [evil[0]]);
    expect(room.phase).toBe("lady");
    expect(applyAction(room, second, { t: "lady", targetId: first })).toContain("already held");
  });

  it("is skipped once the game is already decided", () => {
    const room = makeRoom(7, { lady: true });
    startGame(room, seeded(15));
    ackAll(room);
    const evil = room.players.map((p) => p.id).filter((id) => sideOf(room.game!.roles[id]) === "evil");

    playRound(room, [evil[0]]); // quest 1 fails
    playRound(room, [evil[0]]); // quest 2 fails
    resolveLady(room);
    playRound(room); // quest 3 succeeds
    resolveLady(room);
    // Quest 4 needs two fails at seven players; that is evil's third failure.
    playRound(room, [evil[0], evil[1]]);

    expect(room.game!.quests.filter((q) => !q.success)).toHaveLength(3);
    expect(room.phase).toBe("ended");
    expect(room.game!.outcome!.winner).toBe("evil");
  });
});

describe("what goes over the wire", () => {
  it("never sends another player's role", () => {
    const room = makeRoom(7, { mordred: true, oberon: true });
    startGame(room, seeded(16));
    const g = room.game!;
    for (const player of room.players) {
      const view = viewFor(room, player.id);
      expect(view.game!.reveal).toBeNull();
      expect(view.you.role).toBe(g.roles[player.id]);

      // Your own role legitimately appears; nobody else's may.
      const values = stringValues(view);
      const others = room.players
        .filter((p) => p.id !== player.id)
        .filter((p) => g.roles[p.id] !== g.roles[player.id]);
      for (const other of others) {
        expect(values).not.toContain(g.roles[other.id]);
      }
    }
  });

  it("keeps votes sealed until the last one is cast", () => {
    const room = makeRoom(5);
    startGame(room, seeded(17));
    ackAll(room);
    const g = room.game!;
    const leader = g.order[g.leaderIdx];
    applyAction(room, leader, { t: "propose", team: g.order.slice(0, 2) });
    applyAction(room, g.order[0], { t: "vote", approve: true });

    const watcher = g.order[4];
    let view = viewFor(room, watcher);
    expect(view.game!.voteResult).toBeNull();
    expect(view.game!.proposal!.voted).toEqual([g.order[0]]);

    for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: true });
    view = viewFor(room, watcher);
    expect(view.game!.voteResult!.approved).toBe(true);
    expect(Object.keys(view.game!.voteResult!.votes)).toHaveLength(5);
  });

  it("shows a fail count but never who played which card", () => {
    const room = makeRoom(5);
    startGame(room, seeded(18));
    ackAll(room);
    const g = room.game!;
    const evil = g.order.filter((id) => sideOf(g.roles[id]) === "evil");
    const leader = g.order[g.leaderIdx];
    const team = [evil[0], g.order.find((id) => id !== evil[0])!];
    applyAction(room, leader, { t: "propose", team });
    for (const p of room.players) applyAction(room, p.id, { t: "vote", approve: true });
    ackAll(room);
    applyAction(room, team[0], { t: "quest", success: false });
    applyAction(room, team[1], { t: "quest", success: true });

    const view = viewFor(room, g.order.find((id) => !team.includes(id))!);
    expect(view.game!.questResult!.fails).toBe(1);
    expect(JSON.stringify(view)).not.toContain("questCards");
  });

  it("tells only the holder what the Lady of the Lake revealed", () => {
    const room = makeRoom(7, { lady: true });
    startGame(room, seeded(19));
    ackAll(room);
    const holder = room.game!.lady!.holderId;
    playRound(room);
    playRound(room);
    const target = room.game!.order.find((id) => id !== holder)!;
    applyAction(room, holder, { t: "lady", targetId: target });

    expect(viewFor(room, holder).game!.lady!.result).toBeDefined();
    const bystander = room.game!.order.find((id) => id !== holder && id !== target)!;
    expect(viewFor(room, bystander).game!.lady!.result).toBeUndefined();
    expect(viewFor(room, bystander).game!.ladyFindings).toEqual([]);
  });

  it("reveals every role once the game is over", () => {
    const room = makeRoom(5);
    startGame(room, seeded(20));
    ackAll(room);
    playRound(room);
    playRound(room);
    playRound(room);
    const assassin = idsWithRole(room, "assassin")[0];
    applyAction(room, assassin, { t: "assassinate", targetId: idsWithRole(room, "merlin")[0] });
    const view = viewFor(room, room.game!.order[0]);
    expect(Object.keys(view.game!.reveal!)).toHaveLength(5);
  });
});
