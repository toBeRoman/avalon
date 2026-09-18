import { useState } from "react";
import type { ClientMessage, View } from "../shared/types";
import { History, nameOf, QuestBoard, RoleCard } from "./game";
import { Rules } from "./Rules";
import {
  clearSession,
  loadSession,
  saveSession,
  type Credentials,
} from "./session";
import { useBuzz, useRoom, useWakeLock, type Status } from "./useRoom";
import {
  Button,
  HoldToReveal,
  Note,
  Panel,
  PlayerButton,
  Screen,
  Sheet as SheetShell,
  Tag,
  Toast,
} from "./ui";
import Home from "./screens/Home";
import Lobby from "./screens/Lobby";
import Reveal from "./screens/Reveal";
import Proposal from "./screens/Proposal";
import { VoteRevealScreen, VoteScreen } from "./screens/Vote";
import { QuestRevealScreen, QuestScreen } from "./screens/Quest";
import { LadyRevealScreen, LadyScreen } from "./screens/Lady";
import { AssassinScreen, EndedScreen } from "./screens/Endgame";

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(loadSession);

  const enter = (next: Credentials) => {
    saveSession(next);
    setCredentials(next);
  };
  const leave = () => {
    clearSession();
    setCredentials(null);
  };

  if (!credentials) return <Home onReady={enter} />;
  return <RoomShell key={credentials.playerId} credentials={credentials} onLeave={leave} />;
}

/* ------------------------------------------------------------------ */
/* The room, with its persistent chrome                                */
/* ------------------------------------------------------------------ */

type SheetName = "role" | "history" | "rules" | "manage" | null;

function RoomShell({
  credentials,
  onLeave,
}: {
  credentials: Credentials;
  onLeave: () => void;
}) {
  const { view, status, error, evictionReason, send, clearError } = useRoom(credentials);
  const [sheet, setSheet] = useState<SheetName>(null);

  const inGame = !!view && view.phase !== "lobby";
  useWakeLock(inGame);
  useBuzz(!!view && view.waitingOn.includes(view.you.id));

  if (status === "evicted") {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h2 className="font-display text-2xl">{evictionReason}</h2>
          <Button onClick={onLeave}>Back to the start</Button>
        </div>
      </Screen>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="pulse font-display text-3xl text-ember">Avalon</p>
        <p className="text-sm text-dim">
          {status === "retrying" ? "Reconnecting…" : "Finding your seat…"}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="mt-6 text-xs text-dim underline underline-offset-4"
        >
          Leave this room
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toast message={error} onDone={clearError} />

      <Header view={view} status={status} onMenu={() => setSheet("manage")} />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Phase view={view} send={send} />
      </main>

      <WaitingStrip view={view} />

      {inGame ? (
        <nav
          className="flex shrink-0 gap-2 border-t border-edge bg-surface px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button small variant="ghost" onClick={() => setSheet("role")}>
            My role
          </Button>
          <Button small variant="ghost" onClick={() => setSheet("history")}>
            History
          </Button>
          <Button small variant="quiet" onClick={() => setSheet("rules")}>
            Rules
          </Button>
        </nav>
      ) : null}

      <Sheets
        name={sheet}
        view={view}
        send={send}
        onClose={() => setSheet(null)}
        onLeave={onLeave}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function Header({
  view,
  status,
  onMenu,
}: {
  view: View;
  status: Status;
  onMenu: () => void;
}) {
  const game = view.game;
  return (
    <header className="shrink-0 border-b border-edge bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-lg tracking-widest text-ember">{view.code}</span>
        {game ? (
          <span className="text-xs uppercase tracking-widest text-dim">
            Quest {Math.min(game.round, 5)} · {view.players.length} players
          </span>
        ) : (
          <span className="text-xs uppercase tracking-widest text-dim">Lobby</span>
        )}
        <div className="flex items-center gap-2">
          {status !== "open" ? <Tag tone="evil">offline</Tag> : null}
          <button
            type="button"
            onClick={onMenu}
            aria-label="Room menu"
            className="rounded-lg px-2 py-1 text-lg leading-none text-dim active:bg-raised"
          >
            ⋯
          </button>
        </div>
      </div>
      {game ? <QuestBoard view={view} /> : null}
    </header>
  );
}

function WaitingStrip({ view }: { view: View }) {
  if (view.phase === "lobby" || view.phase === "ended") return null;

  const yours = view.waitingOn.includes(view.you.id);
  const others = view.waitingOn
    .filter((id) => id !== view.you.id)
    .map((id) => nameOf(view.players, id));

  const text = yours
    ? "It's on you"
    : view.waitingLabel
      ? `Waiting for ${view.waitingLabel}`
      : others.length
        ? `Waiting on ${others.join(", ")}`
        : "Everyone is ready";

  return (
    <div
      className={`shrink-0 border-t px-4 py-2 text-center text-xs ${
        yours ? "border-ember/50 bg-ember/10 text-ember" : "border-edge bg-ink text-dim"
      }`}
    >
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase routing                                                       */
/* ------------------------------------------------------------------ */

function Phase({ view, send }: { view: View; send: (message: ClientMessage) => void }) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} send={send} />;
    case "roleReveal":
      return <Reveal view={view} send={send} />;
    case "proposal":
      return <Proposal view={view} send={send} />;
    case "vote":
      return <VoteScreen view={view} send={send} />;
    case "voteReveal":
      return <VoteRevealScreen view={view} send={send} />;
    case "quest":
      return <QuestScreen view={view} send={send} />;
    case "questReveal":
      return <QuestRevealScreen view={view} send={send} />;
    case "lady":
      return <LadyScreen view={view} send={send} />;
    case "ladyReveal":
      return <LadyRevealScreen view={view} send={send} />;
    case "assassin":
      return <AssassinScreen view={view} send={send} />;
    case "ended":
      return <EndedScreen view={view} send={send} />;
  }
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

function Sheets({
  name,
  view,
  send,
  onClose,
  onLeave,
}: {
  name: SheetName;
  view: View;
  send: (message: ClientMessage) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <SheetShell open={name === "role"} onClose={onClose} title="Your card">
        <HoldToReveal>
          <RoleCard view={view} />
        </HoldToReveal>
      </SheetShell>

      <SheetShell open={name === "history"} onClose={onClose} title="Everything so far">
        <History view={view} />
      </SheetShell>

      <SheetShell open={name === "rules"} onClose={onClose} title="How to play">
        <Rules options={view.options} />
      </SheetShell>

      <SheetShell open={name === "manage"} onClose={onClose} title="Room">
        <Manage view={view} send={send} onLeave={onLeave} />
      </SheetShell>
    </>
  );
}


function Manage({
  view,
  send,
  onLeave,
}: {
  view: View;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}) {
  const [releasing, setReleasing] = useState(false);

  if (view.claim) {
    return (
      <div className="space-y-4">
        <Panel>
          <p className="text-xs uppercase tracking-widest text-dim">Seat code for</p>
          <p className="font-display text-2xl">{nameOf(view.players, view.claim.playerId)}</p>
          <p className="mt-3 text-center font-display text-5xl tracking-[0.3em] text-ember">
            {view.claim.code}
          </p>
        </Panel>
        <Note>
          On the replacement phone: open Avalon, tap "Lost your seat?", then enter room code{" "}
          <span className="text-ember">{view.code}</span> and this four-digit code. The old phone
          loses the seat.
        </Note>
        <Button variant="ghost" onClick={() => send({ t: "cancelClaim" })}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Players</h4>
        {view.players.map((player) => (
          <PlayerButton
            key={player.id}
            player={player}
            disabled
            badge={
              <span className="flex gap-1">
                {player.id === view.hostId ? <Tag tone="ember">Host</Tag> : null}
                {!player.connected ? <Tag tone="evil">offline</Tag> : null}
              </span>
            }
          />
        ))}
      </section>

      {view.you.isHost ? (
        <section className="space-y-2">
          <h4 className="font-display text-base text-ember">Someone's phone died?</h4>
          <Note>
            Hand their seat to a different phone. They keep their role and everything they know.
          </Note>
          {releasing ? (
            <div className="space-y-2">
              {view.players
                .filter((p) => p.id !== view.you.id)
                .map((player) => (
                  <PlayerButton
                    key={player.id}
                    player={player}
                    onClick={() => {
                      send({ t: "releaseSeat", playerId: player.id });
                      setReleasing(false);
                    }}
                  />
                ))}
              <Button variant="quiet" onClick={() => setReleasing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setReleasing(true)}>
              Hand a seat to another phone
            </Button>
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">Leave</h4>
        <Note>
          Leaving forgets this seat on this phone. If a game is running, the host will have to hand
          the seat back to you.
        </Note>
        <Button variant="ghost" onClick={onLeave}>
          Leave this room
        </Button>
      </section>
    </div>
  );
}
