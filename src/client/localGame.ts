import { useCallback, useEffect, useMemo, useState } from "react";
import { applyAction, emptyScoreboard, viewFor } from "../shared/engine";
import { DEFAULT_OPTIONS } from "../shared/rules";
import type { ClientMessage, Phase, RoomState, View } from "../shared/types";

const KEY = "avalon.local";

/**
 * Pass-and-play. The same engine, driven entirely in the browser, for when the
 * campsite has no signal. One device goes round the circle; the phone is handed
 * over for anything secret and stays on the table for anything public.
 */

/** Reveal screens everyone sees at once — one tap acknowledges for the whole table. */
const PUBLIC_ACKS: Phase[] = ["voteReveal", "questReveal"];

export interface Actor {
  id: string;
  name: string;
  /** True when this player is about to see something nobody else may. */
  secret: boolean;
}

/** Whose hands the phone needs to be in right now. */
export function actorFor(room: RoomState): Actor | null {
  const game = room.game;
  if (!game) return null;
  const named = (id: string | undefined, secret: boolean): Actor | null => {
    const player = room.players.find((p) => p.id === id);
    return player ? { id: player.id, name: player.name, secret } : null;
  };

  switch (room.phase) {
    case "roleReveal":
      return named(
        room.players.find((p) => !game.acks.includes(p.id))?.id,
        true,
      );
    case "proposal":
      return named(game.order[game.leaderIdx], false);
    case "quest":
      return named(
        game.proposal!.team.find((id) => !(id in game.questCards)),
        true,
      );
    case "lady":
    case "ladyReveal":
      return named(game.lady!.holderId, true);
    case "assassin":
      return named(
        game.order.find((id) => game.roles[id] === "assassin"),
        true,
      );
    default:
      // Lobby, votes and the shared reveal screens belong to the whole table.
      return null;
  }
}

function newTable(names: string[]): RoomState {
  const players = names.map((name, index) => ({
    id: `seat-${index}`,
    name,
    connected: true,
  }));
  return {
    code: "TABLE",
    hostId: players[0].id,
    players,
    tokens: {},
    options: { ...DEFAULT_OPTIONS },
    phase: "lobby",
    game: null,
    claim: null,
    scores: emptyScoreboard(),
    debug: false,
    forcedRole: null,
    xray: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function load(): RoomState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RoomState) : null;
  } catch {
    return null;
  }
}

function save(room: RoomState | null): void {
  try {
    if (room) localStorage.setItem(KEY, JSON.stringify(room));
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing. The game works, it just will not survive a refresh.
  }
}

export interface LocalGame {
  room: RoomState | null;
  view: View | null;
  actor: Actor | null;
  /** True once the named player has confirmed they are holding the phone. */
  handedOver: boolean;
  takePhone: () => void;
  start: (names: string[]) => void;
  send: (message: ClientMessage) => void;
  castVotes: (votes: Record<string, boolean>) => void;
  quit: () => void;
  error: string | null;
  clearError: () => void;
}

export function useLocalGame(): LocalGame {
  const [room, setRoom] = useState<RoomState | null>(load);
  const [holder, setHolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => save(room), [room]);

  const actor = useMemo(() => (room ? actorFor(room) : null), [room]);

  // A new person is needed, so the phone has to change hands again.
  useEffect(() => {
    if (actor && holder !== actor.id) setHolder(null);
  }, [actor, holder]);

  const mutate = useCallback((change: (draft: RoomState) => string | null) => {
    setRoom((current) => {
      if (!current) return current;
      const draft: RoomState = structuredClone(current);
      const problem = change(draft);
      if (problem) {
        setError(problem);
        return current;
      }
      return draft;
    });
  }, []);

  const send = useCallback(
    (message: ClientMessage) => {
      mutate((draft) => {
        // On a shared reveal, one tap speaks for everyone at the table.
        if (message.t === "ack" && PUBLIC_ACKS.includes(draft.phase)) {
          for (const player of draft.players) applyAction(draft, player.id, { t: "ack" });
          return null;
        }
        const who = actorFor(draft)?.id ?? draft.hostId;
        return applyAction(draft, who, message);
      });
    },
    [mutate],
  );

  const castVotes = useCallback(
    (votes: Record<string, boolean>) => {
      mutate((draft) => {
        for (const player of draft.players) {
          const problem = applyAction(draft, player.id, {
            t: "vote",
            approve: votes[player.id] ?? true,
          });
          if (problem) return problem;
        }
        return null;
      });
    },
    [mutate],
  );

  const start = useCallback((names: string[]) => {
    setRoom(newTable(names));
    setHolder(null);
  }, []);

  const quit = useCallback(() => {
    setRoom(null);
    setHolder(null);
    save(null);
  }, []);

  const view = useMemo(() => {
    if (!room) return null;
    // Public screens are rendered through the host's eyes; nothing private is shown
    // on them, and the chrome hides the role card unless the phone has been handed over.
    const through = actor?.id ?? room.hostId;
    return viewFor(room, through);
  }, [room, actor]);

  return {
    room,
    view,
    actor,
    handedOver: !actor || holder === actor.id,
    takePhone: () => setHolder(actor?.id ?? null),
    start,
    send,
    castVotes,
    quit,
    error,
    clearError: () => setError(null),
  };
}
