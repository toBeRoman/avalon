import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "../../shared/rules";
import type { View } from "../../shared/types";
import type { Actor } from "../localGame";
import { lastName, rememberName } from "../session";
import { Button, Note, Panel, Screen, Sticky, Tag, Title } from "../ui";

/** Names for the circle, before the first deal. */
export function LocalSetup({
  onStart,
  onBack,
}: {
  onStart: (names: string[]) => void;
  onBack: () => void;
}) {
  const [names, setNames] = useState<string[]>([lastName() || "", "", "", "", ""]);

  const set = (index: number, value: string) =>
    setNames((current) => current.map((n, i) => (i === index ? value.slice(0, 16) : n)));

  const filled = names.map((n) => n.trim()).filter(Boolean);
  const duplicate = new Set(filled.map((n) => n.toLowerCase())).size !== filled.length;
  const ready = filled.length >= MIN_PLAYERS && !duplicate;

  return (
    <Screen>
      <Title sub="One phone for the whole table. It gets handed round for anything secret, and sits in the middle for everything else. No signal needed.">
        Pass and play
      </Title>

      <Panel>
        <p className="mb-3 text-xs uppercase tracking-widest text-dim">
          Who is playing? {MIN_PLAYERS}–{MAX_PLAYERS}
        </p>
        <div className="space-y-2">
          {names.map((name, index) => (
            <input
              key={index}
              value={name}
              onChange={(e) => set(index, e.target.value)}
              placeholder={`Player ${index + 1}`}
              autoCapitalize="words"
              autoCorrect="off"
              className="w-full rounded-xl border border-edge bg-surface px-4 py-3 text-parchment outline-none focus:border-ember"
            />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {names.length < MAX_PLAYERS ? (
            <Button small variant="ghost" full={false} onClick={() => setNames([...names, ""])}>
              Add a player
            </Button>
          ) : null}
          {names.length > MIN_PLAYERS ? (
            <Button
              small
              variant="quiet"
              full={false}
              onClick={() => setNames(names.slice(0, -1))}
            >
              Remove one
            </Button>
          ) : null}
        </div>
      </Panel>

      {duplicate ? <Note>Two people have the same name. Make them different.</Note> : null}

      <Sticky>
        <Button
          disabled={!ready}
          onClick={() => {
            if (filled[0]) rememberName(filled[0]);
            onStart(filled);
          }}
        >
          {filled.length < MIN_PLAYERS
            ? `Need ${MIN_PLAYERS - filled.length} more`
            : `Sit ${filled.length} down`}
        </Button>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
      </Sticky>
    </Screen>
  );
}

/** The handover screen. Nothing secret is on screen until the right person says so. */
export function PassThePhone({ actor, onTake }: { actor: Actor; onTake: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs uppercase tracking-widest text-dim">Pass the phone to</p>
        <p className="font-display text-5xl text-ember">{actor.name}</p>
        <p className="max-w-xs text-sm text-dim">
          Hand it over before tapping. What comes next is for {actor.name} alone.
        </p>
      </div>
      <Sticky>
        <Button onClick={onTake}>I am {actor.name}</Button>
      </Sticky>
    </Screen>
  );
}

/**
 * Votes on one device. Everyone calls out at once, exactly as they would with
 * the physical cards, and whoever is holding the phone taps it in.
 */
export function LocalVote({
  view,
  onSubmit,
}: {
  view: View;
  onSubmit: (votes: Record<string, boolean>) => void;
}) {
  const game = view.game!;
  const proposal = game.proposal!;
  const [votes, setVotes] = useState<Record<string, boolean>>(() =>
    // The proposer is locked into approving, so start them there.
    ({ [proposal.leaderId]: true }),
  );

  const decided = view.players.filter((p) => p.id in votes).length;

  return (
    <Screen>
      <Title sub={`Proposed by ${view.players.find((p) => p.id === proposal.leaderId)?.name}. Everyone calls it at the same time, then tap it in.`}>
        Approve this team?
      </Title>

      <Panel>
        <div className="flex flex-wrap gap-2">
          {proposal.team.map((id) => (
            <span
              key={id}
              className="rounded-full border border-ember/60 bg-ember/10 px-3 py-1.5 font-display text-lg text-ember"
            >
              {view.players.find((p) => p.id === id)?.name}
            </span>
          ))}
        </div>
      </Panel>

      <div className="space-y-2">
        {game.order.map((id) => {
          const player = view.players.find((p) => p.id === id)!;
          const vote = votes[id];
          const isProposer = id === proposal.leaderId;
          return (
            <div
              key={id}
              className="flex items-center gap-2 rounded-xl border border-edge bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {player.name}
                {isProposer ? <Tag tone="ember">Proposed</Tag> : null}
              </span>
              <button
                type="button"
                onClick={() => setVotes((v) => ({ ...v, [id]: true }))}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${
                  vote === true ? "border-good bg-good text-ink" : "border-edge-bright text-dim"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                disabled={isProposer}
                onClick={() => setVotes((v) => ({ ...v, [id]: false }))}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${
                  vote === false ? "border-evil bg-evil text-parchment" : "border-edge-bright text-dim"
                } ${isProposer ? "opacity-30" : ""}`}
              >
                No
              </button>
            </div>
          );
        })}
      </div>

      <Sticky>
        <Button
          disabled={decided !== view.players.length}
          onClick={() => onSubmit(votes)}
        >
          {decided === view.players.length
            ? "Lock in the votes"
            : `${view.players.length - decided} still to call`}
        </Button>
      </Sticky>
    </Screen>
  );
}
