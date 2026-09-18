import { useState } from "react";
import { ROLE_NAMES, sideOf } from "../../shared/rules";
import type { ClientMessage, View } from "../../shared/types";
import { roleArt } from "../art";
import { nameOf } from "../game";
import { Button, Note, Panel, PlayerButton, Screen, Sticky, Tag, Title } from "../ui";

export function AssassinScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const youAreTheAssassin = view.you.role === "assassin";
  const [target, setTarget] = useState<string | null>(null);

  if (!youAreTheAssassin) {
    return (
      <Screen>
        <Title sub="Good completed three quests. Evil has one shot left: name Merlin and steal the win.">
          The Assassin rises
        </Title>
        <Panel>
          <Note>
            Evil may confer out loud. Everyone else: this is the moment you find out whether Merlin
            was too obvious.
          </Note>
        </Panel>
        <Panel>
          <p className="text-center font-display text-xl text-evil">
            The Assassin is choosing…
          </p>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title sub="Good completed three quests. Name Merlin and evil wins anyway. Get it wrong and good takes it.">
        Your one shot
      </Title>

      <div className="space-y-2">
        {game.order
          .filter((id) => id !== view.you.id)
          .map((id) => (
            <PlayerButton
              key={id}
              player={view.players.find((p) => p.id === id)!}
              selected={target === id}
              onClick={() => setTarget(id)}
            />
          ))}
      </div>

      <Sticky>
        <Button
          variant="evil"
          disabled={!target}
          onClick={() => target && send({ t: "assassinate", targetId: target })}
        >
          {target ? `Name ${nameOf(view.players, target)} as Merlin` : "Choose your target"}
        </Button>
        <Note>There is no undo. Talk to your side first.</Note>
      </Sticky>
    </Screen>
  );
}

export function EndedScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const outcome = game.outcome!;
  const reveal = game.reveal!;
  const good = outcome.winner === "good";

  return (
    <Screen>
      <div className="py-2 text-center">
        <p className="text-xs uppercase tracking-widest text-dim">
          {view.players.length} players · quest{" "}
          {game.quests.filter((q) => q.success).length}–{game.quests.filter((q) => !q.success).length}
        </p>
        <h2 className={`font-display text-4xl ${good ? "text-good" : "text-evil"}`}>
          {good ? "Good prevails" : "Evil prevails"}
        </h2>
        <p className="mt-2 text-sm text-dim">{outcome.reason}</p>
      </div>

      {game.quests.length ? (
        <Panel>
          <p className="mb-3 text-xs uppercase tracking-widest text-dim">Who played what</p>
          <div className="space-y-3">
            {game.quests.map((quest) => (
              <div key={quest.round}>
                <p className="mb-1 text-sm">
                  <span className={quest.success ? "text-good" : "text-evil"}>
                    Quest {quest.round} {quest.success ? "succeeded" : "failed"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quest.team.map((id) => {
                    const failed = quest.cards[id] === false;
                    return (
                      <span
                        key={id}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          failed ? "border-evil bg-evil/20 text-evil" : "border-edge text-dim"
                        }`}
                      >
                        {nameOf(view.players, id)}
                        {failed ? " — Fail" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {view.scores.games > 0 ? (
        <Panel>
          <p className="mb-2 text-xs uppercase tracking-widest text-dim">
            Tonight · {view.scores.games} {view.scores.games === 1 ? "game" : "games"}
          </p>
          <p className="font-display text-2xl">
            <span className="text-good">Good {view.scores.good}</span>
            <span className="text-dim"> — </span>
            <span className="text-evil">Evil {view.scores.evil}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...view.players]
              .sort(
                (a, b) =>
                  (view.scores.players[b.id]?.won ?? 0) - (view.scores.players[a.id]?.won ?? 0),
              )
              .map((player) => (
                <Tag key={player.id}>
                  {player.name} {view.scores.players[player.id]?.won ?? 0}
                </Tag>
              ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <p className="mb-3 text-xs uppercase tracking-widest text-dim">Everyone's cards</p>
        <div className="space-y-2">
          {game.order.map((id) => {
            const role = reveal[id];
            const evil = sideOf(role) === "evil";
            return (
              <div
                key={id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  evil ? "border-evil/40 bg-evil/10" : "border-good/40 bg-good/10"
                }`}
              >
                <img
                  src={roleArt(role)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover object-top"
                  draggable={false}
                />
                <span className="min-w-0 flex-1 font-medium">
                  {nameOf(view.players, id)}
                  {id === view.you.id ? <span className="text-dim"> (you)</span> : null}
                </span>
                <span className={`font-display text-lg ${evil ? "text-evil" : "text-good"}`}>
                  {ROLE_NAMES[role]}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {game.log.some((e) => e.k === "assassin") ? (
        <div className="flex justify-center">
          <Tag tone={good ? "good" : "evil"}>
            {(() => {
              const shot = game.log.find((e) => e.k === "assassin")!;
              return `${nameOf(view.players, shot.targetId)} was named as Merlin`;
            })()}
          </Tag>
        </div>
      ) : null}

      <Sticky>
        {view.you.isHost ? (
          <Button onClick={() => send({ t: "playAgain" })}>Play again, same room</Button>
        ) : (
          <Note>
            Waiting for {nameOf(view.players, view.hostId)} to deal another game. The room code
            stays the same.
          </Note>
        )}
      </Sticky>
    </Screen>
  );
}
