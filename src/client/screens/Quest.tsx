import { useContext } from "react";
import type { ClientMessage, View } from "../../shared/types";
import { questArt } from "../art";
import { nameOf } from "../game";
import {
  Button,
  ContinueButton,
  Note,
  Panel,
  PassAndPlay,
  Screen,
  Sticky,
  Tag,
  Title,
  useAutoAdvance,
} from "../ui";

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
  const card = game.yourCard;
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
      ) : (
        <Sticky>
          <Button
            variant={card === true ? "good" : "ghost"}
            onClick={() => send({ t: "quest", success: true })}
          >
            {card === true ? "Playing Success ✓" : "Play Success"}
          </Button>
          {view.you.mayFail ? (
            <Button
              variant={card === false ? "evil" : "ghost"}
              onClick={() => send({ t: "quest", success: false })}
            >
              {card === false ? "Playing Fail ✓" : "Play Fail"}
            </Button>
          ) : null}
          <Note>
            {!view.you.mayFail
              ? "You are loyal to Arthur, so Success is your only option. That is why a failed quest always means a spy was on it."
              : played
                ? "You can still swap your card until the last one is in. Nobody ever learns who played what."
                : "The cards are shuffled before they are counted, so only the number of fails is ever shown."}
          </Note>
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
  const passAndPlay = useContext(PassAndPlay);
  const progress = useAutoAdvance(!acked && !passAndPlay, () => send({ t: "ack" }), 6500);

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
              className={`board-pop flex h-16 w-13 items-center justify-center rounded-lg border-2 text-center font-display text-xs leading-tight ${
                i < result.fails
                  ? "border-evil bg-evil/25 text-evil"
                  : "border-good bg-good/20 text-good"
              }`}
              style={{ animationDelay: `${i * 180}ms` }}
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
          <ContinueButton progress={progress} onClick={() => send({ t: "ack" })} />
        )}
      </Sticky>
    </Screen>
  );
}
