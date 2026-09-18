import type { ClientMessage, View } from "../../shared/types";
import { nameOf, VoteTrack } from "../game";
import { Button, Note, Panel, Screen, Sticky, Tag, Title } from "../ui";

export function VoteScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const proposal = game.proposal!;
  const youVoted = proposal.voted.includes(view.you.id);
  const remaining = view.players.length - proposal.voted.length;
  const youProposed = proposal.leaderId === view.you.id;
  const yourVote = game.yourVote;

  return (
    <Screen>
      <Title sub={`Proposed by ${nameOf(view.players, proposal.leaderId)} for quest ${game.round}.`}>
        Approve this team?
      </Title>

      <Panel>
        <div className="flex flex-wrap gap-2">
          {proposal.team.map((id) => (
            <span
              key={id}
              className="rounded-full border border-ember/60 bg-ember/10 px-3 py-1.5 font-display text-lg text-ember"
            >
              {nameOf(view.players, id)}
            </span>
          ))}
        </div>
      </Panel>

      <VoteTrack attempt={game.attempt} />

      {youVoted ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {view.players.map((player) => (
            <Tag key={player.id} tone={proposal.voted.includes(player.id) ? "ember" : undefined}>
              {player.name}
            </Tag>
          ))}
        </div>
      ) : null}

      <Sticky>
        <Button
          variant={yourVote === true ? "good" : "ghost"}
          onClick={() => send({ t: "vote", approve: true })}
        >
          {yourVote === true ? "Approving ✓" : "Approve"}
        </Button>
        <Button
          variant={yourVote === false ? "evil" : "ghost"}
          disabled={youProposed}
          onClick={() => send({ t: "vote", approve: false })}
        >
          {yourVote === false ? "Rejecting ✓" : "Reject"}
        </Button>
        <Note>
          {youProposed && yourVote === null
            ? "You put this team forward, so you have to stand behind it. Everyone else is free to reject."
            : youVoted
              ? remaining
                ? `Waiting on ${remaining} more ${remaining === 1 ? "vote" : "votes"}. You can still change your mind — nothing is visible until the last vote lands.`
                : "Counting the votes…"
              : "Nobody sees your vote until the last person has voted, and then everybody sees all of them."}
        </Note>
      </Sticky>
    </Screen>
  );
}

export function VoteRevealScreen({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const game = view.game!;
  const result = game.voteResult!;
  const approvals = Object.values(result.votes).filter(Boolean).length;
  const rejections = Object.keys(result.votes).length - approvals;
  const acked = game.acks.includes(view.you.id);
  const lastChance = !result.approved && game.attempt >= 5;

  return (
    <Screen>
      <Title
        sub={
          result.approved
            ? "The quest goes ahead. The team plays their cards next."
            : lastChance
              ? "That was the fifth rejection."
              : "The leader passes to the next player."
        }
      >
        <span className={result.approved ? "text-good" : "text-evil"}>
          {result.approved ? "Approved" : "Rejected"} {approvals}–{rejections}
        </span>
      </Title>

      <Panel>
        <p className="mb-2 text-xs uppercase tracking-widest text-dim">The team</p>
        <p className="text-sm">{result.team.map((id) => nameOf(view.players, id)).join(", ")}</p>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <p className="text-center text-xs uppercase tracking-widest text-good">Approved</p>
          {Object.entries(result.votes)
            .filter(([, approved]) => approved)
            .map(([id]) => (
              <p
                key={id}
                className="rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-center text-sm"
              >
                {nameOf(view.players, id)}
              </p>
            ))}
        </div>
        <div className="space-y-2">
          <p className="text-center text-xs uppercase tracking-widest text-evil">Rejected</p>
          {Object.entries(result.votes)
            .filter(([, approved]) => !approved)
            .map(([id]) => (
              <p
                key={id}
                className="rounded-lg border border-evil/40 bg-evil/10 px-3 py-2 text-center text-sm"
              >
                {nameOf(view.players, id)}
              </p>
            ))}
        </div>
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
