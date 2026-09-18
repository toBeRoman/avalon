import { useEffect, useRef, useState } from "react";
import type { ClientMessage, View } from "../shared/types";
import { roleArt } from "./art";
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
  ActionSlot,
  Button,
  PassAndPlay,
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
import { DebugPanel } from "./screens/Debug";
import { LocalSetup, LocalVote, PassThePhone } from "./screens/Local";
import { useLocalGame } from "./localGame";
import Lobby from "./screens/Lobby";
import Reveal from "./screens/Reveal";
import Proposal from "./screens/Proposal";
import { VoteRevealScreen, VoteScreen } from "./screens/Vote";
import { QuestRevealScreen, QuestScreen } from "./screens/Quest";
import { LadyRevealScreen, LadyScreen } from "./screens/Lady";
import { AssassinScreen, EndedScreen } from "./screens/Endgame";

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(loadSession);
  const local = useLocalGame();
  const [settingUp, setSettingUp] = useState(false);

  const enter = (next: Credentials) => {
    saveSession(next);
    setCredentials(next);
  };
  const leave = () => {
    clearSession();
    setCredentials(null);
  };

  if (local.room) return <LocalShell local={local} />;
  if (settingUp)
    return <LocalSetup onStart={local.start} onBack={() => setSettingUp(false)} />;
  if (!credentials)
    return <Home onReady={enter} onPassAndPlay={() => setSettingUp(true)} />;
  return <RoomShell key={credentials.playerId} credentials={credentials} onLeave={leave} />;
}

/* ------------------------------------------------------------------ */
/* Pass and play                                                       */
/* ------------------------------------------------------------------ */

function LocalShell({ local }: { local: ReturnType<typeof useLocalGame> }) {
  const { view, actor, handedOver } = local;
  const [sheet, setSheet] = useState<SheetName>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const scroller = useScrollReset(`${view?.phase}-${actor?.id}-${handedOver}`);
  if (!view) return null;

  const body = !handedOver && actor ? (
    <PassThePhone actor={actor} onTake={local.takePhone} />
  ) : view.phase === "vote" ? (
    <LocalVote view={view} onSubmit={local.castVotes} />
  ) : (
    <Phase view={view} send={local.send} />
  );

  // The role card is only reachable while the phone is in one person's hands.
  const secretHolder = handedOver && actor?.secret;

  return (
    <PassAndPlay.Provider value>
    <div className="flex h-full flex-col">
      <Toast message={local.error} onDone={local.clearError} />

      <header className="shrink-0 border-b border-edge bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-lg tracking-widest text-ember">One phone</span>
          <span className="text-xs uppercase tracking-widest text-dim">
            {view.game ? `Quest ${Math.min(view.game.round, 5)}` : "Table"} ·{" "}
            {view.players.length} players
          </span>
          <button
            type="button"
            onClick={() => setSheet("manage")}
            aria-label="Table menu"
            className="rounded-lg px-2 py-1 text-lg leading-none text-dim active:bg-raised"
          >
            ⋯
          </button>
        </div>
        {view.game ? <QuestBoard view={view} /> : null}
      </header>

      <ActionSlot.Provider value={actionSlot}>
        <main ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            key={`${view.phase}-${actor?.id ?? "table"}-${handedOver}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {body}
          </div>
        </main>
        <div
          ref={setActionSlot}
          className="shrink-0 border-t border-edge bg-ink px-4 py-3 empty:hidden"
        />
      </ActionSlot.Provider>

      {view.game ? (
        <nav
          className="flex shrink-0 gap-2 border-t border-edge bg-surface px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {secretHolder ? (
            <Button small variant="ghost" onClick={() => setSheet("role")}>
              My card
            </Button>
          ) : null}
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
        send={local.send}
        onClose={() => setSheet(null)}
        onLeave={local.quit}
        local
      />
    </div>
    </PassAndPlay.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* The room, with its persistent chrome                                */
/* ------------------------------------------------------------------ */

type SheetName = "role" | "history" | "rules" | "manage" | "debug" | null;

function RoomShell({
  credentials,
  onLeave,
}: {
  credentials: Credentials;
  onLeave: () => void;
}) {
  const { view, status, error, evictionReason, send, clearError } = useRoom(credentials);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const scroller = useScrollReset(view?.phase);

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

      <ActionSlot.Provider value={actionSlot}>
        <main ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Keyed so every phase gets its own entrance instead of swapping in place. */}
          <div key={view.phase} className="flex min-h-0 flex-1 flex-col">
            <Phase view={view} send={send} />
          </div>
        </main>

        {/* Screens portal their primary action in here. Hidden when a screen has none. */}
        <div
          ref={setActionSlot}
          className="shrink-0 border-t border-edge bg-ink px-4 py-3 empty:hidden"
        />
      </ActionSlot.Provider>

      <WaitingStrip view={view} />

      {inGame || view.debug.enabled ? (
        <nav
          className="flex shrink-0 gap-2 border-t border-edge bg-surface px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {inGame ? (
            <>
              <Button small variant="ghost" onClick={() => setSheet("role")}>
                My role
              </Button>
              <Button small variant="ghost" onClick={() => setSheet("history")}>
                History
              </Button>
            </>
          ) : null}
          <Button small variant="quiet" onClick={() => setSheet("rules")}>
            Rules
          </Button>
          {view.debug.enabled ? (
            <Button small variant={inGame ? "quiet" : "ghost"} onClick={() => setSheet("debug")}>
              Debug
            </Button>
          ) : null}
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

/**
 * A new screen should start at the top. Without this you keep whatever scroll
 * offset the last screen had, which lands you halfway down the next one.
 */
function useScrollReset(key: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [key]);
  return ref;
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

  // Reveal screens move on by themselves, so they carry no urgency.
  const reveal = view.phase === "voteReveal" || view.phase === "questReveal";

  const text = reveal
    ? "Everyone is looking"
    : yours
      ? "It's on you"
      : view.waitingLabel
        ? `Waiting for ${view.waitingLabel}`
        : others.length
          ? `Waiting on ${others.join(", ")}`
          : "Everyone is ready";

  return (
    <div
      className={`shrink-0 border-t px-4 py-2 text-center text-xs transition-colors duration-300 ${
        yours && !reveal ? "border-ember/50 bg-ember/10 text-ember" : "border-edge bg-ink text-dim"
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
  local,
}: {
  name: SheetName;
  view: View;
  send: (message: ClientMessage) => void;
  onClose: () => void;
  onLeave: () => void;
  local?: boolean;
}) {
  return (
    <>
      <SheetShell open={name === "role"} onClose={onClose} title="Your card">
        <HoldToReveal art={view.you.role ? roleArt(view.you.role) : undefined}>
          <RoleCard view={view} />
        </HoldToReveal>
      </SheetShell>

      <SheetShell open={name === "history"} onClose={onClose} title="Everything so far">
        <History view={view} />
      </SheetShell>

      <SheetShell open={name === "rules"} onClose={onClose} title="How to play">
        <Rules options={view.options} />
      </SheetShell>

      <SheetShell open={name === "debug"} onClose={onClose} title="Debug">
        <DebugPanel view={view} send={send} />
      </SheetShell>

      <SheetShell open={name === "manage"} onClose={onClose} title={local ? "Table" : "Room"}>
        <Manage view={view} send={send} onLeave={onLeave} local={local} />
      </SheetShell>
    </>
  );
}


function Manage({
  view,
  send,
  onLeave,
  local,
}: {
  view: View;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  local?: boolean;
}) {
  const [releasing, setReleasing] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

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

      {view.you.isHost && !local ? (
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

      {(local || view.you.isHost) && view.phase !== "lobby" ? (
        <section className="space-y-2">
          <h4 className="font-display text-base text-ember">Start over</h4>
          <Note>
            Throws this game away and puts everyone back in the lobby with the same seats. Nothing
            is scored. Use it if a game has gone wrong or somebody has to drop out for good.
          </Note>
          {abandoning ? (
            <div className="space-y-2">
              <Button
                variant="evil"
                onClick={() => {
                  send({ t: "abandon" });
                  setAbandoning(false);
                }}
              >
                Yes, abandon this game
              </Button>
              <Button variant="quiet" onClick={() => setAbandoning(false)}>
                Keep playing
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setAbandoning(true)}>
              Abandon this game
            </Button>
          )}
        </section>
      ) : null}

      {view.scores.games > 0 ? (
        <section className="space-y-2">
          <h4 className="font-display text-base text-ember">Tonight</h4>
          <p className="font-display text-xl">
            <span className="text-good">Good {view.scores.good}</span>
            <span className="text-dim"> — </span>
            <span className="text-evil">Evil {view.scores.evil}</span>
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">{local ? "End the table" : "Leave"}</h4>
        <Note>
          {local
            ? "Throws the whole table away, including tonight's score, and goes back to the start."
            : "Leaving forgets this seat on this phone. If a game is running, the host will have to hand the seat back to you."}
        </Note>
        <Button variant="ghost" onClick={onLeave}>
          {local ? "End this table" : "Leave this room"}
        </Button>
      </section>
    </div>
  );
}
