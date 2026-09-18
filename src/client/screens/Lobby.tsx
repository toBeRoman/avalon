import { useState } from "react";
import { buildDeck, evilCount, MIN_PLAYERS, ROLE_NAMES, validate, hasErrors } from "../../shared/rules";
import type { ClientMessage, OptionId, View } from "../../shared/types";
import { Button, Note, Panel, PlayerButton, Screen, Sticky, Tag } from "../ui";

const TOGGLES: { id: OptionId; name: string; blurb: string }[] = [
  { id: "percival", name: "Percival", blurb: "Good. Sees Merlin and Morgana, but not which is which." },
  { id: "morgana", name: "Morgana", blurb: "Evil. Appears to Percival exactly as Merlin does." },
  { id: "mordred", name: "Mordred", blurb: "Evil. Invisible to Merlin." },
  { id: "oberon", name: "Oberon", blurb: "Evil, but works alone — neither side sees him." },
  { id: "lady", name: "Lady of the Lake", blurb: "Privately check one player's loyalty after quests 2, 3 and 4." },
];

export default function Lobby({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  const count = view.players.length;
  const isHost = view.you.isHost;
  const issues = validate(count, view.options);
  const blocked = hasErrors(issues) || count < MIN_PLAYERS;

  // A deck built from an illegal configuration would be nonsense, so only preview a valid one.
  const deck = !blocked ? buildDeck(count, view.options) : null;

  const share = async () => {
    const link = `${location.origin}/?code=${view.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Avalon", text: `Room ${view.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed. Nothing to do.
    }
  };

  return (
    <Screen>
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-dim">Room code</p>
        <p className="font-display text-6xl tracking-[0.3em] text-ember">{view.code}</p>
        <button
          type="button"
          onClick={share}
          className="mt-2 text-sm text-dim underline underline-offset-4"
        >
          {copied ? "Link copied" : "Share a join link"}
        </button>
      </div>

      <Panel>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-lg">
            {count} {count === 1 ? "player" : "players"}
          </h3>
          {count >= MIN_PLAYERS ? (
            <span className="text-xs text-dim">
              {count - evilCount(count)} good · {evilCount(count)} evil
            </span>
          ) : (
            <span className="text-xs text-dim">need {MIN_PLAYERS - count} more</span>
          )}
        </div>
        <div className="space-y-2">
          {view.players.map((player) => (
            <PlayerButton
              key={player.id}
              player={player}
              disabled={!isHost || player.id === view.you.id}
              onClick={() => isHost && setManaging(managing === player.id ? null : player.id)}
              note={
                managing === player.id ? (
                  <span className="flex gap-3 pt-1">
                    <span
                      className="text-ember"
                      onClick={(e) => {
                        e.stopPropagation();
                        send({ t: "transferHost", playerId: player.id });
                        setManaging(null);
                      }}
                    >
                      Make host
                    </span>
                    <span
                      className="text-evil"
                      onClick={(e) => {
                        e.stopPropagation();
                        send({ t: "kick", playerId: player.id });
                        setManaging(null);
                      }}
                    >
                      Remove
                    </span>
                  </span>
                ) : undefined
              }
              badge={
                <span className="flex gap-1">
                  {player.id === view.hostId ? <Tag tone="ember">Host</Tag> : null}
                  {player.id === view.you.id ? <Tag>You</Tag> : null}
                </span>
              }
            />
          ))}
        </div>
        {isHost && count > 1 ? (
          <Note>Tap a player to make them host or remove them.</Note>
        ) : null}
      </Panel>

      <Panel>
        <h3 className="mb-1 font-display text-lg">Roles</h3>
        <p className="mb-3 text-xs text-dim">
          Merlin and the Assassin are always in. {isHost ? "" : "Only the host can change these."}
        </p>
        <div className="space-y-2">
          {TOGGLES.map((toggle) => {
            const on = view.options[toggle.id];
            return (
              <button
                key={toggle.id}
                type="button"
                disabled={!isHost}
                onClick={() => send({ t: "setOptions", options: { [toggle.id]: !on } })}
                className={[
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                  on ? "border-ember bg-ember/10" : "border-edge bg-raised",
                  isHost ? "" : "opacity-70",
                ].join(" ")}
              >
                <span
                  className={`mt-1 h-4 w-4 shrink-0 rounded border ${
                    on ? "border-ember bg-ember" : "border-edge-bright"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{toggle.name}</span>
                  <span className="block text-xs leading-snug text-dim">{toggle.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {deck ? (
        <Panel>
          <h3 className="mb-2 font-display text-lg">Tonight's deck</h3>
          <p className="text-sm leading-relaxed text-dim">
            <span className="text-good">
              {summarise(deck.filter((r) => !isEvil(r)))}
            </span>
            {" vs "}
            <span className="text-evil">{summarise(deck.filter(isEvil))}</span>
          </p>
        </Panel>
      ) : null}

      {issues
        .filter((issue) => issue.level === "warning")
        .map((issue) => (
          <p
            key={issue.text}
            className="rounded-xl border border-edge-bright bg-raised px-4 py-3 text-sm leading-relaxed text-dim"
          >
            {issue.text}
          </p>
        ))}

      <Sticky>
        {issues
          .filter((issue) => issue.level === "error")
          .map((issue) => (
            <p
              key={issue.text}
              className="rounded-xl border border-evil/60 bg-evil/10 px-4 py-3 text-sm leading-relaxed text-parchment"
            >
              {issue.text}
            </p>
          ))}
        {isHost ? (
          <Button disabled={blocked} onClick={() => send({ t: "start" })}>
            {count < MIN_PLAYERS
              ? `Need ${MIN_PLAYERS - count} more player${MIN_PLAYERS - count === 1 ? "" : "s"}`
              : "Deal the roles"}
          </Button>
        ) : (
          <Note>Waiting for {view.players.find((p) => p.id === view.hostId)?.name} to start.</Note>
        )}
      </Sticky>
    </Screen>
  );
}

const isEvil = (role: string) =>
  ["assassin", "morgana", "mordred", "oberon", "minion"].includes(role);

function summarise(roles: string[]): string {
  const counts = new Map<string, number>();
  for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  return [...counts]
    .map(([role, n]) =>
      n > 1 ? `${n} ${ROLE_NAMES[role as keyof typeof ROLE_NAMES]}s` : ROLE_NAMES[role as keyof typeof ROLE_NAMES],
    )
    .join(", ");
}
