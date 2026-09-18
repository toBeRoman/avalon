import { useEffect, useState } from "react";
import type { ClientMessage, View } from "../../shared/types";
import { nameOf, VoteTrack } from "../game";
import { Button, Note, PlayerButton, Screen, Sticky, Tag, Title } from "../ui";

export default function Proposal({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const youLead = game.leaderId === view.you.id;
  const [team, setTeam] = useState<string[]>([]);

  // A fresh proposal means a fresh selection.
  useEffect(() => setTeam([]), [game.round, game.attempt]);

  const toggle = (id: string) =>
    setTeam((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < game.teamSize
          ? [...current, id]
          : current,
    );

  return (
    <Screen>
      <Title
        sub={
          youLead
            ? `Choose ${game.teamSize} people for quest ${game.round}. Everyone then votes on your team.`
            : `${nameOf(view.players, game.leaderId)} is choosing ${game.teamSize} for quest ${game.round}.`
        }
      >
        {youLead ? "You are the leader" : "Team being chosen"}
      </Title>

      <VoteTrack attempt={game.attempt} />

      {game.attempt >= 4 ? (
        <Note>
          {game.attempt === 5
            ? "This is the last proposal. Reject it and evil wins outright."
            : "One more rejection after this and evil is one step from winning."}
        </Note>
      ) : null}

      <div className="space-y-2">
        {game.order.map((id) => {
          const player = view.players.find((p) => p.id === id)!;
          return (
            <PlayerButton
              key={id}
              player={player}
              selected={team.includes(id)}
              disabled={!youLead}
              onClick={() => youLead && toggle(id)}
              badge={
                <span className="flex gap-1">
                  {id === game.leaderId ? <Tag tone="ember">Leader</Tag> : null}
                  {id === view.you.id ? <Tag>You</Tag> : null}
                  {game.lady?.holderId === id ? <Tag>Lady</Tag> : null}
                </span>
              }
            />
          );
        })}
      </div>

      <Sticky>
        {youLead ? (
          <Button
            disabled={team.length !== game.teamSize}
            onClick={() => send({ t: "propose", team })}
          >
            {team.length === game.teamSize
              ? "Propose this team"
              : `Pick ${game.teamSize - team.length} more`}
          </Button>
        ) : (
          <Note>Argue about it out loud. You will get to vote in a moment.</Note>
        )}
      </Sticky>
    </Screen>
  );
}
