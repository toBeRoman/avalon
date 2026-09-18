import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, View } from "../shared/types";
import type { Credentials } from "./session";

export type Status = "connecting" | "open" | "retrying" | "evicted";

/** Codes the server uses when a socket must not come back. */
const FINAL_CODES = new Set([4001, 4002]);

export interface Room {
  view: View | null;
  status: Status;
  error: string | null;
  evictionReason: string | null;
  send: (message: ClientMessage) => void;
  clearError: () => void;
}

export function useRoom(credentials: Credentials): Room {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [evictionReason, setEvictionReason] = useState<string | null>(null);

  const socket = useRef<WebSocket | null>(null);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;

    const connect = () => {
      if (closed.current) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const url =
        `${protocol}//${location.host}/api/rooms/${credentials.code}/ws` +
        `?playerId=${encodeURIComponent(credentials.playerId)}` +
        `&token=${encodeURIComponent(credentials.token)}`;

      const ws = new WebSocket(url);
      socket.current = ws;

      ws.onopen = () => {
        retries.current = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.t === "view") setView(message.view);
        else if (message.t === "error") setError(message.message);
      };

      ws.onclose = (event) => {
        socket.current = null;
        if (closed.current) return;
        if (FINAL_CODES.has(event.code)) {
          setStatus("evicted");
          setEvictionReason(
            event.code === 4001
              ? "Your seat was handed to another phone."
              : "The host removed you from the room.",
          );
          return;
        }
        setStatus("retrying");
        // Back off, but never so far that a phone waking up in a pocket feels dead.
        const delay = Math.min(1000 * 2 ** retries.current++, 8000);
        timer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    // A locked phone drops the socket; reconnect the instant it comes back.
    const wake = () => {
      if (document.visibilityState === "visible" && !socket.current && !closed.current) {
        retries.current = 0;
        if (timer.current) clearTimeout(timer.current);
        connect();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      closed.current = true;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      if (timer.current) clearTimeout(timer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [credentials.code, credentials.playerId, credentials.token]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    else setError("Still reconnecting — try that again in a second.");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { view, status, error, evictionReason, send, clearError };
}

/** Keeps the screen awake during a game so phones do not lock mid-discussion. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied or unsupported; not worth telling anyone about.
      }
    };

    void acquire();
    const reacquire = () => {
      if (!cancelled && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", reacquire);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", reacquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

/** A short buzz the moment the game starts waiting on you. */
export function useBuzz(yourTurn: boolean): void {
  const previous = useRef(false);
  useEffect(() => {
    if (yourTurn && !previous.current) {
      try {
        navigator.vibrate?.([18, 60, 18]);
      } catch {
        // iOS Safari has no vibration API; the waiting list carries the load there.
      }
    }
    previous.current = yourTurn;
  }, [yourTurn]);
}
