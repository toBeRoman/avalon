import { ROLE_NAMES, MAX_PLAYERS, MIN_PLAYERS, sideOf } from "../../shared/rules";
import type { ClientMessage, OptionId, RoleId, View } from "../../shared/types";
import { nameOf } from "../game";
import { Button, Note, Panel, Tag } from "../ui";

const COUNTS = [5, 6, 7, 8, 9, 10];

const FORCEABLE: RoleId[] = [
  "merlin",
  "percival",
  "servant",
  "assassin",
  "morgana",
  "mordred",
  "oberon",
  "minion",
];

const TOGGLES: { id: OptionId; label: string }[] = [
  { id: "percival", label: "Percival" },
  { id: "morgana", label: "Morgana" },
  { id: "mordred", label: "Mordred" },
  { id: "oberon", label: "Oberon" },
  { id: "lady", label: "Lady of the Lake" },
];

/** Every control, in one sheet. Only reachable from the reserved debug room. */
export function DebugPanel({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const { debug, game } = view;
  const humans = view.players.filter((p) => !debug.bots.includes(p.id));
  const inLobby = view.phase === "lobby";

  return (
    <div className="space-y-6">
      <Panel tone="neutral">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-ember">Debug room</span>
          <Tag tone="ember">{view.code}</Tag>
        </div>
        <Note>
          {humans.length} real · {debug.bots.length} bots · phase{" "}
          <span className="text-parchment">{view.phase}</span>
          {game ? ` · quest ${game.round} · proposal ${game.attempt}` : ""}
        </Note>
      </Panel>

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Control</h4>
        <div className="flex gap-2">
          <Button
            small
            full={false}
            variant={view.you.isHost ? "quiet" : "ghost"}
            onClick={() => send({ t: "debugBecomeHost" })}
          >
            {view.you.isHost ? "You are host" : "Take host"}
          </Button>
          <Button small full={false} variant="ghost" onClick={() => send({ t: "debugStep" })}>
            Nudge bots
          </Button>
        </div>
        <Note>
          Bots play by themselves after every move. "Nudge" only matters if something has
          stalled.
        </Note>
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Table size</h4>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              disabled={!inLobby}
              onClick={() => send({ t: "debugFill", count })}
              className={`min-h-11 min-w-11 rounded-lg border px-3 font-display text-lg ${
                view.players.length === count
                  ? "border-ember bg-ember/15 text-ember"
                  : "border-edge-bright text-dim"
              } ${inLobby ? "" : "opacity-40"}`}
            >
              {count}
            </button>
          ))}
        </div>
        <Note>
          {inLobby
            ? `Bots fill the empty seats. Real players are never removed — there ${
                humans.length === 1 ? "is" : "are"
              } ${humans.length} here.`
            : "Finish or abandon the game to change the table size."}
        </Note>
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Roles in play</h4>
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map((toggle) => (
            <button
              key={toggle.id}
              type="button"
              disabled={!inLobby}
              onClick={() => send({ t: "setOptions", options: { [toggle.id]: !view.options[toggle.id] } })}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                view.options[toggle.id]
                  ? "border-ember bg-ember/15 text-ember"
                  : "border-edge-bright text-dim"
              } ${inLobby ? "" : "opacity-40"}`}
            >
              {toggle.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Deal yourself</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!inLobby}
            onClick={() => send({ t: "debugForceRole", role: null })}
            className={`min-h-11 rounded-lg border px-3 text-sm ${
              debug.forcedRole === null
                ? "border-ember bg-ember/15 text-ember"
                : "border-edge-bright text-dim"
            } ${inLobby ? "" : "opacity-40"}`}
          >
            Random role
          </button>
          {FORCEABLE.map((role) => (
            <button
              key={role}
              type="button"
              disabled={!inLobby}
              onClick={() => send({ t: "debugForceRole", role })}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                debug.forcedRole === role
                  ? sideOf(role) === "evil"
                    ? "border-evil bg-evil/15 text-evil"
                    : "border-good bg-good/15 text-good"
                  : "border-edge-bright text-dim"
              } ${inLobby ? "" : "opacity-40"}`}
            >
              Be {ROLE_NAMES[role]}
            </button>
          ))}
        </div>
        <Note>
          Applied at the next deal, if that role is in the deck for this table size and options.
        </Note>
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">X-ray</h4>
        <Button
          variant={debug.xray ? "evil" : "ghost"}
          onClick={() => send({ t: "debugXray", on: !debug.xray })}
        >
          {debug.xray ? "Hide everyone's roles" : "Show everyone's roles"}
        </Button>
        {debug.xray && debug.allRoles ? (
          <Panel tone="neutral">
            <div className="space-y-1">
              {view.players.map((player) => {
                const role = debug.allRoles?.[player.id];
                if (!role) return null;
                const evil = sideOf(role) === "evil";
                return (
                  <div key={player.id} className="flex items-center justify-between text-sm">
                    <span>
                      {player.name}
                      {debug.bots.includes(player.id) ? (
                        <span className="text-dim"> (bot)</span>
                      ) : null}
                    </span>
                    <span className={evil ? "text-evil" : "text-good"}>{ROLE_NAMES[role]}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}
        <Note>
          Only works in this room, and only for whoever turns it on. It never reaches an
          ordinary game.
        </Note>
      </section>

      {game ? (
        <section className="space-y-2">
          <h4 className="font-display text-base text-ember">Now</h4>
          <Note>
            Leader {nameOf(view.players, game.leaderId)} · team of {game.teamSize} ·{" "}
            {game.failsRequired === 2 ? "two fails needed" : "one fail sinks it"} ·{" "}
            {view.waitingOn.length
              ? `waiting on ${view.waitingOn.map((id) => nameOf(view.players, id)).join(", ")}`
              : "waiting on nobody"}
          </Note>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Reset</h4>
        <Button variant="ghost" onClick={() => send({ t: "abandon" })}>
          Abandon and return to the lobby
        </Button>
        <Button variant="ghost" onClick={() => send({ t: "debugPurge" })}>
          Clear disconnected players
        </Button>
        <Note>
          This room is long-lived, so seats from old sessions collect in it. Clearing drops
          anyone not currently connected and returns to the lobby.
        </Note>
      </section>

      <Note>
        This panel only exists in the room code {view.code}. Everywhere else these actions are
        refused by the server, not just hidden.
      </Note>
    </div>
  );
}

export { MIN_PLAYERS, MAX_PLAYERS };
