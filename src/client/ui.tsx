import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Player, Side } from "../shared/types";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "ghost" | "good" | "evil" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ember text-ink border-ember active:bg-ember-dim",
  good: "bg-good text-ink border-good active:brightness-90",
  evil: "bg-evil text-parchment border-evil active:brightness-90",
  ghost: "bg-transparent text-parchment border-edge-bright active:bg-raised",
  quiet: "bg-transparent text-dim border-transparent active:bg-raised",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  full = true,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-xl border font-semibold tracking-wide transition",
        // Comfortably thumb-sized in the dark.
        small ? "px-4 py-2 text-sm" : "px-5 py-4 text-base min-h-14",
        full ? "w-full" : "",
        disabled ? "opacity-35" : "",
        VARIANTS[variant],
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ children }: { children: ReactNode }) {
  return <div className="rise flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="font-display text-2xl leading-tight text-parchment">{children}</h2>
      {sub ? <p className="text-sm leading-snug text-dim">{sub}</p> : null}
    </div>
  );
}

export function Panel({ children, tone }: { children: ReactNode; tone?: Side | "neutral" }) {
  const ring =
    tone === "good" ? "border-good/50" : tone === "evil" ? "border-evil/50" : "border-edge";
  return <div className={`rounded-2xl border ${ring} bg-surface p-4`}>{children}</div>;
}

/**
 * Pins the primary action to the bottom of the viewport so the thing you have to
 * tap is never scrolled off a small screen.
 */
export function Sticky({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto px-4">
      {/* A short fade so content scrolling underneath does not just stop dead. */}
      <div className="h-6 bg-linear-to-t from-ink to-transparent" />
      <div className="space-y-3 bg-ink pb-1">{children}</div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-dim">{children}</p>;
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

export function PlayerButton({
  player,
  selected,
  disabled,
  dim,
  onClick,
  badge,
  note,
}: {
  player: Player;
  selected?: boolean;
  disabled?: boolean;
  /** Dim only when the player is genuinely not a valid choice — not merely untappable. */
  dim?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition min-h-14",
        selected
          ? "border-ember bg-ember/15 text-parchment"
          : "border-edge bg-surface text-parchment",
        dim && !selected ? "opacity-40" : "",
      ].join(" ")}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          player.connected ? "bg-ember" : "bg-edge-bright"
        }`}
        aria-label={player.connected ? "connected" : "disconnected"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{player.name}</span>
        {note ? <span className="block text-xs text-dim">{note}</span> : null}
      </span>
      {badge}
    </button>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: Side | "ember" }) {
  const styles =
    tone === "good"
      ? "border-good/60 text-good"
      : tone === "evil"
        ? "border-evil/60 text-evil"
        : tone === "ember"
          ? "border-ember/60 text-ember"
          : "border-edge-bright text-dim";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hold to reveal                                                      */
/* ------------------------------------------------------------------ */

/**
 * Secret content only appears while a finger is held on it, so a role card
 * cannot be read over your shoulder or left open on a rock.
 */
export function HoldToReveal({
  children,
  label = "Hold to reveal",
  onFirstReveal,
}: {
  children: ReactNode;
  label?: string;
  onFirstReveal?: () => void;
}) {
  const [held, setHeld] = useState(false);
  const fired = useRef(false);

  const start = () => {
    setHeld(true);
    if (!fired.current) {
      fired.current = true;
      onFirstReveal?.();
    }
  };
  const end = () => setHeld(false);

  return (
    <div
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      className={[
        "relative select-none rounded-2xl border transition",
        held ? "border-ember bg-surface" : "border-edge-bright bg-raised",
      ].join(" ")}
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <div className={held ? "p-5" : "pointer-events-none select-none p-5 opacity-0"}>
        {children}
      </div>
      {!held ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="font-display text-lg text-ember">{label}</span>
          <span className="text-xs text-dim">Nobody else can see this. Keep it that way.</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom sheet                                                        */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/80" onClick={onClose}>
      <div
        className="rise flex max-h-[85%] flex-col rounded-t-3xl border-t border-edge-bright bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h3 className="font-display text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-dim active:bg-raised"
          >
            Close
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex justify-center">
      <div className="rise rounded-xl border border-evil/60 bg-surface px-4 py-2 text-center text-sm text-parchment shadow-lg">
        {message}
      </div>
    </div>
  );
}
