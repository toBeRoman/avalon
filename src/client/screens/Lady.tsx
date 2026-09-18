import { useState } from "react";
import type { ClientMessage, View } from "../../shared/types";
import { nameOf } from "../game";
import { Button, HoldToReveal, Note, Panel, PlayerButton, Screen, Sticky, Tag, Title } from "../ui";

export function LadyScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const lady = game.lady!;
  const yours = lady.holderId === view.you.id;
  const [target, setTarget] = useState<string | null>(null);

  if (!yours) {
    return (
      <Screen>
        <Title sub={`${nameOf(view.players, lady.holderId)} is checking someone's loyalty. Only they will see the answer.`}>
          The Lady of the Lake
        </Title>
        <Panel>
          <Note>
            Whoever they pick takes the token next, so watch who they choose as carefully as what
            they say afterwards.
          </Note>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title sub="Pick someone to inspect. You will privately see whether they are good or evil, and then the token passes to them.">
        You hold the Lady of the Lake
      </Title>

      <div className="space-y-2">
        {game.order.map((id) => {
          const player = view.players.find((p) => p.id === id)!;
          const held = lady.visited.includes(id);
          return (
            <PlayerButton
              key={id}
              player={player}
              selected={target === id}
              disabled={held}
              dim={held}
              onClick={() => !held && setTarget(id)}
              badge={held ? <Tag>Has held it</Tag> : undefined}
            />
          );
        })}
      </div>

      <Sticky>
        <Button disabled={!target} onClick={() => target && send({ t: "lady", targetId: target })}>
          {target ? `Inspect ${nameOf(view.players, target)}` : "Choose a player"}
        </Button>
        <Note>Anyone who has already held the token cannot be inspected.</Note>
      </Sticky>
    </Screen>
  );
}

export function LadyRevealScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const lady = game.lady!;
  const yours = lady.holderId === view.you.id;

  if (!yours || !lady.result || !lady.targetId) {
    return (
      <Screen>
        <Title sub={`${nameOf(view.players, lady.holderId)} is looking at the answer.`}>
          The Lady of the Lake
        </Title>
        <Panel>
          <Note>What they say about it next is entirely up to them. They can lie.</Note>
        </Panel>
      </Screen>
    );
  }

  const evil = lady.result === "evil";

  return (
    <Screen>
      <Title sub="Hold to look. Nobody else will ever see this — say whatever you like about it afterwards.">
        {nameOf(view.players, lady.targetId)} is…
      </Title>

      <HoldToReveal label="Hold to see their loyalty">
        <div className="py-6 text-center">
          <p className={`font-display text-5xl ${evil ? "text-evil" : "text-good"}`}>
            {evil ? "Evil" : "Good"}
          </p>
          <p className="mt-2 text-sm text-dim">
            {evil
              ? "A servant of Mordred. You do not learn which one."
              : "Loyal to Arthur. You do not learn their role."}
          </p>
        </div>
      </HoldToReveal>

      <Sticky>
        <Button onClick={() => send({ t: "ack" })}>
          Pass the token to {nameOf(view.players, lady.targetId)}
        </Button>
        <Note>You can look at this again later on your own card.</Note>
      </Sticky>
    </Screen>
  );
}
