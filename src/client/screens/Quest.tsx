import type { ClientMessage, View } from "../../shared/types";
import { questArt } from "../art";
import { nameOf } from "../game";
import { Button, Note, Panel, Screen, Sticky, Tag, Title } from "../ui";

export function QuestScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const team = game.proposal!.team;
  const onTeam = team.includes(view.you.id);
  const played = view.you.hasPlayedCard;
  const outstanding = team.filter((id) => !game.played.includes(id));

  return (
    <Screen>
      <Title
        sub={
          game.failsRequired > 1
            ? `Quest ${game.round} needs two fails to sink. One fail is not enough.`
            : `A single fail sinks quest ${game.round}.`
        }
      >
        Quest {game.round}
      </Title>

      <Panel>
        <p className="mb-2 text-xs uppercase tracking-widest text-dim">On the quest</p>
        <div className="flex flex-wrap gap-2">
          {team.map((id) => (
            <span
              key={id}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                game.played.includes(id)
                  ? "border-ember/60 bg-ember/10 text-ember"
                  : "border-edge text-dim"
              }`}
            >
              {nameOf(view.players, id)}
              {game.played.includes(id) ? " ✓" : ""}
            </span>
          ))}
        </div>
      </Panel>

      {!onTeam ? (
        <Panel>
          <p className="font-display text-lg">You are not on this quest.</p>
          <Note>
            Watch how quickly they play. Waiting on{" "}
            {outstanding.map((id) => nameOf(view.players, id)).join(", ") || "nobody"}.
          </Note>
        </Panel>
      ) : played ? (
        <Panel>
          <p className="text-center font-display text-xl text-ember">Card played</p>
          <Note>
            The cards are shuffled before they are shown, so nobody learns who played what — only
            how many fails there were.
          </Note>
        </Panel>
      ) : (
        <Sticky>
          <Button variant="good" onClick={() => send({ t: "quest", success: true })}>
            Play Success
          </Button>
          {view.you.mayFail ? (
            <Button variant="evil" onClick={() => send({ t: "quest", success: false })}>
              Play Fail
            </Button>
          ) : (
            <Note>
              You are loyal to Arthur, so Success is your only option. That is why a failed quest
              always means a spy was on it.
            </Note>
          )}
        </Sticky>
      )}
    </Screen>
  );
}

export function QuestRevealScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const result = game.questResult!;
  const acked = game.acks.includes(view.you.id);
  const successes = game.quests.filter((q) => q.success).length;
  const failures = game.quests.length - successes;

  return (
    <Screen>
      <Title
        sub={
          result.fails === 0
            ? "Every card was a Success."
            : `${result.fails} fail card${result.fails === 1 ? "" : "s"} out of ${result.team.length}.`
        }
      >
        <span className={result.success ? "text-good" : "text-evil"}>
          Quest {result.round} {result.success ? "succeeded" : "failed"}
        </span>
      </Title>

      <div className="overflow-hidden rounded-2xl border border-edge-bright shadow-lg">
        <img
          src={questArt(result.success)}
          alt=""
          className="art-reveal block h-40 w-full object-cover object-center"
          draggable={false}
        />
      </div>

      <Panel tone={result.success ? "good" : "evil"}>
        <div className="flex items-center justify-center gap-3 py-2">
          {Array.from({ length: result.team.length }, (_, i) => (
            <span
              key={i}
              className={`flex h-16 w-13 items-center justify-center rounded-lg border-2 text-center font-display text-xs leading-tight ${
                i < result.fails
                  ? "border-evil bg-evil/25 text-evil"
                  : "border-good bg-good/20 text-good"
              }`}
            >
              {i < result.fails ? "Fail" : "Success"}
            </span>
          ))}
        </div>
        <Note>{result.team.map((id) => nameOf(view.players, id)).join(", ")}</Note>
      </Panel>

      <div className="flex justify-center gap-3">
        <Tag tone="good">{successes} succeeded</Tag>
        <Tag tone="evil">{failures} failed</Tag>
      </div>

      <Sticky>
        {acked ? (
          <Note>Waiting for everyone else to look.</Note>
        ) : (
          <Button onClick={() => send({ t: "ack" })}>Continue</Button>
        )}
      </Sticky>
    </Screen>
  );
}
