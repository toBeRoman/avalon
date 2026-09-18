import { ROLE_NAMES, sideOf } from "../shared/rules";
import type { LogEntry, Player, RoleId, View } from "../shared/types";
import { Insights, Note, Panel, Tag } from "./ui";

export const nameOf = (players: Player[], id: string) =>
  players.find((p) => p.id === id)?.name ?? "someone";

/* ------------------------------------------------------------------ */
/* The quest board                                                     */
/* ------------------------------------------------------------------ */

export function QuestBoard({ view }: { view: View }) {
  const game = view.game;
  if (!game) return null;

  return (
    <div className="relative flex items-center justify-center gap-2">
      {/* One track through the circles, so the quests read as a journey. */}
      <span
        aria-hidden
        className="rule-in pointer-events-none absolute left-6 right-6 top-5 h-px bg-linear-to-r from-transparent via-gold/30 to-transparent"
      />
      {game.board.map((slot, index) => {
        const round = index + 1;
        const result = game.quests.find((q) => q.round === round);
        const current = !result && game.round === round && view.phase !== "ended";

        const tone = result
          ? result.success
            ? "border-good bg-good/25 text-good"
            : "border-evil bg-evil/25 text-evil"
          : current
            ? "border-ember text-ember"
            : "border-edge text-dim";

        return (
          <div key={round} className="flex flex-col items-center gap-1">
            <div
              className={`relative z-[1] flex h-10 w-10 items-center justify-center rounded-full border-2 bg-surface font-display text-lg transition-colors duration-500 ${tone} ${
                current ? "pulse" : ""
              } ${result ? "board-pop" : ""}`}
            >
              {slot.size}
            </div>
            {slot.failsRequired > 1 ? (
              <span className="text-[9px] uppercase tracking-wide text-evil">2 fails</span>
            ) : (
              <span className="text-[9px] text-transparent">.</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The rejection track. Five in a row and evil takes the game. */
export function VoteTrack({ attempt }: { attempt: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="mr-1 text-[10px] uppercase tracking-widest text-dim">Rejections</span>
      {[1, 2, 3, 4, 5].map((slot) => (
        <span
          key={slot}
          className={`h-2.5 w-2.5 rounded-full border ${
            slot < attempt
              ? slot === 4
                ? "border-evil bg-evil"
                : "border-ember bg-ember"
              : slot === 5
                ? "border-evil/60"
                : "border-edge-bright"
          }`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Your secret card                                                    */
/* ------------------------------------------------------------------ */

export function RoleCard({ view }: { view: View }) {
  const { you, players, game } = view;
  if (!you.role) return null;
  const evil = you.side === "evil";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-dim">You are</p>
        <p className={`font-display text-3xl ${evil ? "text-evil" : "text-good"}`}>
          {ROLE_NAMES[you.role]}
        </p>
        <p className={`text-sm ${evil ? "text-evil" : "text-good"}`}>
          {evil ? "Servant of Mordred" : "Loyal to Arthur"}
        </p>
      </div>

      {you.hint ? <p className="text-sm leading-relaxed text-parchment/85">{you.hint}</p> : null}

      {you.knowledge ? (
        <div className="space-y-2 rounded-xl border border-edge bg-ink/50 p-3">
          <p className="text-xs uppercase tracking-widest text-dim">{you.knowledge.label}</p>
          {you.knowledge.ids.length ? (
            <ul className="space-y-1">
              {you.knowledge.ids.map((id) => (
                <li key={id} className={`font-display text-xl ${evil ? "text-evil" : "text-ember"}`}>
                  {nameOf(players, id)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">Nobody.</p>
          )}
        </div>
      ) : null}

      <Insights items={view.insights} title="What your card tells you" />

      {game?.ladyFindings.length ? (
        <div className="space-y-2 rounded-xl border border-edge bg-ink/50 p-3">
          <p className="text-xs uppercase tracking-widest text-dim">
            What the Lady of the Lake showed you
          </p>
          <ul className="space-y-1">
            {game.ladyFindings.map((finding) => (
              <li key={finding.targetId} className="flex items-center justify-between text-sm">
                <span>{nameOf(players, finding.targetId)}</span>
                <Tag tone={finding.result}>{finding.result === "good" ? "Good" : "Evil"}</Tag>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function History({ view }: { view: View }) {
  const game = view.game;
  if (!game?.log.length && !view.tableInsights.length)
    return <Note>Nothing has happened yet.</Note>;

  return (
    <div className="space-y-4">
      <Insights items={view.tableInsights} title="What the table can work out" />
      {!game?.log.length ? <Note>No rounds played yet.</Note> : null}
      {(game?.log ?? []).map((entry, index) => (
        <LogRow key={index} entry={entry} players={view.players} />
      ))}
    </div>
  );
}

function LogRow({ entry, players }: { entry: LogEntry; players: Player[] }) {
  const name = (id: string) => nameOf(players, id);

  if (entry.k === "proposal") {
    const approvals = Object.values(entry.votes).filter(Boolean).length;
    return (
      <Panel>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-dim">
            Quest {entry.round} · proposal {entry.attempt}
          </span>
          <Tag tone={entry.approved ? "good" : "evil"}>
            {entry.approved ? "Approved" : "Rejected"} {approvals}–
            {Object.keys(entry.votes).length - approvals}
          </Tag>
        </div>
        <p className="text-sm">
          <span className="text-ember">{name(entry.leaderId)}</span> proposed{" "}
          {entry.team.map(name).join(", ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(entry.votes).map(([id, approved]) => (
            <span
              key={id}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                approved ? "border-good/60 text-good" : "border-evil/60 text-evil"
              }`}
            >
              {name(id)}
            </span>
          ))}
        </div>
      </Panel>
    );
  }

  if (entry.k === "quest") {
    return (
      <Panel tone={entry.success ? "good" : "evil"}>
        <div className="flex items-center justify-between">
          <span className="font-display text-lg">
            Quest {entry.round} {entry.success ? "succeeded" : "failed"}
          </span>
          <Tag tone={entry.success ? "good" : "evil"}>
            {entry.fails} fail{entry.fails === 1 ? "" : "s"}
          </Tag>
        </div>
        <p className="mt-1 text-sm text-dim">{entry.team.map(name).join(", ")}</p>
      </Panel>
    );
  }

  if (entry.k === "lady") {
    return (
      <Panel>
        <p className="text-sm">
          <span className="text-ember">{name(entry.holderId)}</span> used the Lady of the Lake on{" "}
          <span className="text-ember">{name(entry.targetId)}</span>.
        </p>
        <p className="mt-1 text-xs text-dim">Only they saw the result.</p>
      </Panel>
    );
  }

  if (entry.k === "hammer") {
    return (
      <Panel tone="evil">
        <p className="text-sm">Five proposals rejected in a row. Evil wins.</p>
      </Panel>
    );
  }

  return (
    <Panel tone={entry.correct ? "evil" : "good"}>
      <p className="text-sm">
        <span className="text-evil">{name(entry.assassinId)}</span> named{" "}
        <span className="text-ember">{name(entry.targetId)}</span> as Merlin —{" "}
        {entry.correct ? "and was right." : "and was wrong."}
      </p>
    </Panel>
  );
}

export function roleLabel(role: RoleId) {
  return { name: ROLE_NAMES[role], side: sideOf(role) };
}
