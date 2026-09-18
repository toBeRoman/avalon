/**
 * Drives seven real phones through two complete games against a running server,
 * then checks reconnection, seat handover and server-side rule enforcement.
 *
 *   pnpm build && pnpm preview &      # or point at production
 *   node test/e2e.mjs                 # defaults to http://localhost:4173
 *   node test/e2e.mjs https://avalon.example.workers.dev
 *
 * This is the fastest way to know a change has not broken the game. The unit
 * tests in engine.test.ts cover the rules; this covers the Durable Object, the
 * WebSocket protocol and the redaction actually reaching separate clients.
 */

const BASE = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const WS = BASE.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const response = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path}: ${json.error}`);
  return json;
}

const NAMES = ["Toby", "Dave", "Priya", "Sam", "Max", "Ines", "Rob"];
const players = [];

/** The last section deliberately provokes errors, so they must not fail the run. */
let expectingErrors = false;

async function connect(player) {
  const ws = new WebSocket(
    `${WS}/api/rooms/${player.creds.code}/ws` +
      `?playerId=${player.creds.playerId}&token=${player.creds.token}`,
  );
  player.ws = ws;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.t === "view") player.view = message.view;
    else if (message.t === "error" && !expectingErrors) {
      console.error(`  !! ${player.name}: ${message.message}`);
      process.exitCode = 1;
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

const send = (player, message) => player.ws.send(JSON.stringify(message));

async function until(predicate, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await sleep(15);
  }
  throw new Error(`timed out waiting for ${label} (phase=${players[0].view?.phase})`);
}

const phase = () => players[0].view.phase;
const nameOf = (id) => players.find((p) => p.creds.playerId === id)?.name ?? "?";
const seat = (id) => players.find((p) => p.creds.playerId === id);

/* ---------------------------------------------------------------- */

const host = { name: NAMES[0] };
host.creds = await post("/api/rooms", { name: host.name });
players.push(host);
console.log(`server ${BASE}\nroom ${host.creds.code}`);

for (const name of NAMES.slice(1)) {
  const player = { name };
  player.creds = await post(`/api/rooms/${host.creds.code}/join`, { name });
  players.push(player);
}
for (const player of players) await connect(player);
await until(() => players.every((p) => p.view), "every phone to have a view");
console.log(`${players.length} players connected`);

send(host, {
  t: "setOptions",
  options: { percival: true, morgana: true, mordred: true, lady: true },
});
await until(() => players[0].view.options.lady && players[0].view.options.mordred, "options");
console.log("options: Percival, Morgana, Mordred, Lady of the Lake");

/** Plays one complete game. `evilFails` decides whether evil sinks the quests. */
async function playGame(evilFails, label) {
  console.log(`\n=== ${label} ===`);
  send(host, { t: "start" });
  await until(() => phase() === "roleReveal", "the deal");

  console.log(`roles: ${players.map((p) => `${p.name}=${p.view.you.role}`).join(" ")}`);

  const evil = players.filter((p) => p.view.you.side === "evil");
  if (evil.length !== 3) throw new Error(`expected 3 evil at 7 players, got ${evil.length}`);
  if (players.filter((p) => p.view.you.role === "merlin").length !== 1)
    throw new Error("expected exactly one Merlin");

  const merlin = players.find((p) => p.view.you.role === "merlin");
  const mordred = players.find((p) => p.view.you.role === "mordred");
  const merlinSees = merlin.view.you.knowledge.ids.map(nameOf);
  if (merlinSees.includes(mordred.name)) throw new Error("Merlin can see Mordred");
  console.log(`Merlin (${merlin.name}) sees ${merlinSees.join(", ")}; Mordred is ${mordred.name}`);

  const percival = players.find((p) => p.view.you.role === "percival");
  if (percival)
    console.log(
      `Percival (${percival.name}) sees ${percival.view.you.knowledge.ids.map(nameOf).join(" or ")}`,
    );

  players.forEach((p) => send(p, { t: "ack" }));
  await until(() => phase() !== "roleReveal", "past the reveal");

  for (let guard = 0; guard < 300 && phase() !== "ended"; guard++) {
    const game = players[0].view.game;

    switch (phase()) {
      case "proposal": {
        const leader = seat(game.leaderId);
        const team = [game.leaderId, ...game.order.filter((id) => id !== game.leaderId)].slice(
          0,
          game.teamSize,
        );
        send(leader, { t: "propose", team });
        await until(() => phase() !== "proposal", "the proposal");
        break;
      }
      case "vote": {
        // The proposer is locked into approving, so everyone approving is always legal.
        players.forEach((p) => send(p, { t: "vote", approve: true }));
        await until(() => phase() !== "vote", "the votes");
        break;
      }
      case "voteReveal": {
        const result = game.voteResult;
        console.log(
          `  quest ${game.round} team ${result.team.map(nameOf).join(", ")} — ${
            result.approved ? "approved" : "rejected"
          }`,
        );
        players.forEach((p) => send(p, { t: "ack" }));
        await until(() => phase() !== "voteReveal", "past the vote reveal");
        break;
      }
      case "quest": {
        for (const id of game.proposal.team) {
          const player = seat(id);
          send(player, { t: "quest", success: !(evilFails && player.view.you.side === "evil") });
        }
        await until(() => phase() !== "quest", "the cards");
        break;
      }
      case "questReveal": {
        const quest = game.questResult;
        console.log(
          `  → quest ${quest.round} ${quest.success ? "SUCCEEDED" : "FAILED"} (${quest.fails} fail, needed ${
            game.board[quest.round - 1].failsRequired
          })`,
        );
        players.forEach((p) => send(p, { t: "ack" }));
        await until(() => phase() !== "questReveal", "past the quest reveal");
        break;
      }
      case "lady": {
        const holder = seat(game.lady.holderId);
        const target = game.order.find(
          (id) => id !== game.lady.holderId && !game.lady.visited.includes(id),
        );
        send(holder, { t: "lady", targetId: target });
        await until(() => phase() !== "lady", "the inspection");
        break;
      }
      case "ladyReveal": {
        const holder = seat(game.lady.holderId);
        const bystander = players.find((p) => p !== holder);
        if (bystander.view.game.lady.result !== undefined)
          throw new Error("a Lady of the Lake result leaked to a bystander");
        const seen = holder.view.game.lady;
        console.log(`  Lady: ${holder.name} saw ${nameOf(seen.targetId)} is ${seen.result}`);
        send(holder, { t: "ack" });
        await until(() => phase() !== "ladyReveal", "past the lady reveal");
        break;
      }
      case "assassin": {
        const assassin = players.find((p) => p.view.you.role === "assassin");
        const innocent = game.order.find(
          (id) => id !== assassin.creds.playerId && id !== merlin.creds.playerId,
        );
        const target = evilFails ? merlin.creds.playerId : innocent;
        console.log(`  Assassin (${assassin.name}) names ${nameOf(target)}`);
        send(assassin, { t: "assassinate", targetId: target });
        await until(() => phase() === "ended", "the assassination");
        break;
      }
      default:
        await sleep(20);
    }
  }

  // Over a real network the final broadcast reaches phones at different moments.
  await until(() => players.every((p) => p.view.phase === "ended"), "every phone at the end");

  const outcome = players[0].view.game.outcome;
  console.log(`RESULT: ${outcome.winner} — ${outcome.reason}`);

  const reveals = players.map((p) => JSON.stringify(p.view.game.reveal));
  if (new Set(reveals).size !== 1) {
    players.forEach((p) => console.log(`   ${p.name}: ${p.view.game.reveal}`));
    throw new Error("phones disagree about the final reveal");
  }
  console.log(
    `reveal: ${Object.entries(players[0].view.game.reveal)
      .map(([id, role]) => `${nameOf(id)}=${role}`)
      .join(" ")}`,
  );
  return outcome;
}

const first = await playGame(false, "Game 1 — good plays it straight");
if (first.winner !== "good") throw new Error("expected good to win game 1");

send(host, { t: "playAgain" });
await until(() => phase() === "lobby", "the lobby");
console.log("\nback in the lobby, same code, same seats");

const second = await playGame(true, "Game 2 — evil sinks everything");
if (second.winner !== "evil") throw new Error("expected evil to win game 2");

/* ---------------------------------------------------------------- */
/* A phone locks, drops off the network, and comes back              */
/* ---------------------------------------------------------------- */

console.log("\n=== reconnect ===");
send(host, { t: "playAgain" });
await until(() => phase() === "lobby", "the lobby");
send(host, { t: "start" });
await until(() => phase() === "roleReveal", "the deal");

const victim = players[3];
const roleBefore = victim.view.you.role;
victim.ws.close();
await sleep(300);
await until(
  () => players[0].view.players.find((p) => p.id === victim.creds.playerId).connected === false,
  "the others to see them drop",
);
console.log(`${victim.name} dropped; the others see them offline`);
await connect(victim);
await until(() => victim.view?.you.role === roleBefore, "their seat to come back");
console.log(`${victim.name} reconnected and still holds ${roleBefore}`);

/* ---------------------------------------------------------------- */
/* A phone dies for good and the host hands the seat over            */
/* ---------------------------------------------------------------- */

console.log("\n=== seat handover ===");
send(host, { t: "releaseSeat", playerId: victim.creds.playerId });
await until(() => host.view.claim, "a seat code");
console.log(`host reads out seat code ${host.view.claim.code}`);

const replacement = { name: victim.name };
replacement.creds = await post(`/api/rooms/${host.creds.code}/claim`, {
  claimCode: host.view.claim.code,
});
await connect(replacement);
await until(() => replacement.view, "the new phone");
if (replacement.view.you.role !== roleBefore)
  throw new Error("the replacement phone got the wrong role");
console.log(`the new phone took the seat and holds ${replacement.view.you.role}`);
players[players.indexOf(victim)] = replacement;

/* ---------------------------------------------------------------- */
/* The server refuses what the client should never send              */
/* ---------------------------------------------------------------- */

console.log("\n=== the server says no ===");
expectingErrors = true;

function expectRejection(player, message, label) {
  return new Promise((resolve) => {
    const listener = (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.t !== "error") return;
      player.ws.removeEventListener("message", listener);
      console.log(`  ✓ ${label}: "${parsed.message}"`);
      resolve(true);
    };
    player.ws.addEventListener("message", listener);
    player.ws.send(JSON.stringify(message));
    setTimeout(() => {
      player.ws.removeEventListener("message", listener);
      resolve(false);
    }, 1200);
  });
}

players.forEach((p) => send(p, { t: "ack" }));
await until(() => phase() === "proposal", "the proposal phase");

const game = players[0].view.game;
const bystander = players.find((p) => p.creds.playerId !== game.leaderId);
const notHost = players.find((p) => p.creds.playerId !== host.creds.playerId);

const checks = [
  await expectRejection(
    bystander,
    { t: "propose", team: game.order.slice(0, game.teamSize) },
    "a non-leader cannot propose",
  ),
  await expectRejection(bystander, { t: "vote", approve: true }, "nobody can vote before a proposal"),
  await expectRejection(notHost, { t: "start" }, "a non-host cannot start the game"),
  await expectRejection(
    bystander,
    { t: "lady", targetId: game.order[0] },
    "nobody can use the Lady out of turn",
  ),
  await expectRejection(
    bystander,
    { t: "assassinate", targetId: game.order[0] },
    "nobody can assassinate out of turn",
  ),
];

// The proposer is locked into approving their own team.
const leader = seat(game.leaderId);
send(leader, { t: "propose", team: game.order.slice(0, game.teamSize) });
await until(() => phase() === "vote", "the vote to open");
checks.push(
  await expectRejection(leader, { t: "vote", approve: false }, "the proposer cannot reject"),
);
expectingErrors = false;

// ...and everyone else still can.
const dissenter = players.find((p) => p.creds.playerId !== game.leaderId);
send(dissenter, { t: "vote", approve: false });
await until(
  () => players[0].view.game.proposal.voted.includes(dissenter.creds.playerId),
  "a dissenting vote",
);
console.log("  ✓ everyone else can still reject");

if (!checks.every(Boolean)) throw new Error("a rule was not enforced");

console.log("\nALL CHECKS PASSED");
players.forEach((p) => p.ws.close());
victim.ws.close();
process.exit(process.exitCode ?? 0);
