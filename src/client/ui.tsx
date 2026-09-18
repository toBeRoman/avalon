import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Insight, Player, Side } from "../shared/types";
import { ART } from "./art";

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

type FrameTone = "gold" | "ember" | "good" | "evil" | "quiet" | "engraved" | "engravedLight";

const CORNER_TONE: Record<FrameTone, string> = {
  gold: "border-gold/70",
  ember: "border-ember/70",
  good: "border-good/70",
  evil: "border-evil/70",
  quiet: "border-edge-bright",
  // Cut into a filled button rather than drawn on top of it.
  engraved: "border-ink/45",
  engravedLight: "border-parchment/45",
};

/**
 * Four bracket corners drawn with borders rather than an image, so they stay
 * crisp at any size and cost nothing to load on a bad connection.
 */
export function Corners({
  tone = "gold",
  size = "sm",
  animate = true,
}: {
  tone?: FrameTone;
  size?: "sm" | "lg";
  animate?: boolean;
}) {
  const edge = CORNER_TONE[tone];
  const box = size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const corners = [
    "left-0 top-0 border-l border-t rounded-tl-[3px]",
    "right-0 top-0 border-r border-t rounded-tr-[3px]",
    "left-0 bottom-0 border-l border-b rounded-bl-[3px]",
    "right-0 bottom-0 border-r border-b rounded-br-[3px]",
  ];
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {corners.map((position, index) => (
        <span
          key={position}
          style={animate ? { animationDelay: `${index * 55}ms` } : undefined}
          className={`absolute ${box} ${position} ${edge} ${animate ? "corner" : ""}`}
        />
      ))}
    </span>
  );
}

/** A framed container: corner brackets over a panel. */
export function Frame({
  children,
  tone = "quiet",
  className = "",
}: {
  children: ReactNode;
  tone?: FrameTone;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <Corners tone={tone} />
    </div>
  );
}

/** The crown emblem with a rule running out either side of it. */
export function Divider({ crown = true }: { crown?: boolean }) {
  const rule = (delay: number) => (
    <span
      className="rule-in h-px flex-1 bg-linear-to-r from-transparent via-gold/50 to-transparent"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
  return (
    <div aria-hidden className="flex items-center gap-3 py-1">
      {rule(120)}
      {crown ? (
        <img
          src={ART.crown}
          alt=""
          className="crown-in h-4 w-4 shrink-0 opacity-80"
          draggable={false}
        />
      ) : (
        <span className="crown-in h-1.5 w-1.5 rotate-45 bg-gold/70" />
      )}
      {rule(120)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "ghost" | "good" | "evil" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ember text-ink border-ember/80 shadow-[inset_0_1px_0_rgba(255,244,214,0.45),inset_0_-2px_0_rgba(90,52,10,0.35)] active:bg-ember-dim",
  good:
    "bg-good text-ink border-good/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(20,50,80,0.3)] active:brightness-90",
  evil:
    "bg-evil text-parchment border-evil/80 shadow-[inset_0_1px_0_rgba(255,220,214,0.3),inset_0_-2px_0_rgba(70,15,10,0.4)] active:brightness-90",
  ghost: "bg-raised/60 text-parchment border-edge-bright active:bg-raised",
  quiet: "bg-transparent text-dim border-transparent active:bg-raised",
};

const BUTTON_CORNER: Record<Variant, FrameTone> = {
  primary: "engraved",
  good: "engraved",
  evil: "engravedLight",
  ghost: "gold",
  quiet: "quiet",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  full = true,
  small,
  plain,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
  /** Drops the frame, for dense rows where brackets would be noise. */
  plain?: boolean;
}) {
  // A framed, lit button for the real actions; a plain one for nav and asides.
  const framed = !small && !plain && variant !== "quiet" && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative rounded-xl border font-semibold tracking-wide transition active:scale-[0.985]",
        // Comfortably thumb-sized in the dark.
        small ? "px-4 py-2 text-sm" : "px-5 py-4 text-base min-h-14",
        full ? "w-full" : "",
        disabled ? "opacity-35" : "",
        framed ? "sheen" : "",
        VARIANTS[variant],
      ].join(" ")}
    >
      {framed && variant === "primary" ? (
        <span
          aria-hidden
          className="glow-layer pointer-events-none absolute -inset-px rounded-xl shadow-[0_0_22px_-3px_rgba(232,150,60,0.6)]"
        />
      ) : null}
      <span className="relative z-[2]">{children}</span>
      {framed ? <Corners tone={BUTTON_CORNER[variant]} /> : null}
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
      <span
        aria-hidden
        className="rule-in block h-px w-16 origin-left bg-linear-to-r from-gold/70 to-transparent"
      />
      {sub ? <p className="pt-1 text-sm leading-snug text-dim">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  children,
  tone,
  bare,
}: {
  children: ReactNode;
  tone?: Side | "neutral";
  /** Skips the corner brackets where a panel is purely a container. */
  bare?: boolean;
}) {
  const ring =
    tone === "good" ? "border-good/50" : tone === "evil" ? "border-evil/50" : "border-edge";
  const corner: FrameTone = tone === "good" ? "good" : tone === "evil" ? "evil" : "gold";
  return (
    <div className={`relative rounded-2xl border ${ring} bg-surface p-4`}>
      {children}
      {bare ? null : <Corners tone={corner} />}
    </div>
  );
}

/**
 * The shell hands Sticky a slot below the scrolling area. A `position: sticky`
 * footer would be pinned *over* the content when a screen is taller than the
 * viewport, which on the role reveal covered the card and ate the tap that was
 * supposed to reveal it. Rendering into a slot of its own cannot overlap anything.
 */
export const ActionSlot = createContext<HTMLElement | null>(null);

/** True when one device is being passed round, where nothing should auto-advance. */
export const PassAndPlay = createContext(false);

/**
 * Reveal screens used to wait for every single player to tap Continue, which at
 * seven people is the slowest moment in a game. Now the result shows, a bar runs
 * down, and it moves on by itself — tapping just skips the wait.
 */
export function useAutoAdvance(active: boolean, onDone: () => void, ms = 5500): number {
  const [progress, setProgress] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - started) / ms);
      setProgress(ratio);
      if (ratio < 1) frame = requestAnimationFrame(tick);
      else done.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, ms]);

  return progress;
}

/** The Continue button, with the time remaining drawn underneath it. */
export function ContinueButton({
  progress,
  onClick,
  label = "Continue",
}: {
  progress: number;
  onClick: () => void;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <Button onClick={onClick}>{label}</Button>
      <div className="h-0.5 overflow-hidden rounded-full bg-edge">
        <div
          className="h-full origin-left bg-ember/70"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}

export function Sticky({ children }: { children: ReactNode }) {
  const slot = useContext(ActionSlot);
  const content = <div className="space-y-3">{children}</div>;
  // Outside a room (or before the slot mounts) fall back to rendering in place.
  return slot ? createPortal(content, slot) : content;
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
  delay,
}: {
  player: Player;
  selected?: boolean;
  disabled?: boolean;
  /** Dim only when the player is genuinely not a valid choice — not merely untappable. */
  dim?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  note?: ReactNode;
  /** Position in a list, so rows arrive one after another. */
  delay?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={delay === undefined ? undefined : { animationDelay: `${delay * 45}ms` }}
      className={[
        "relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition min-h-14 active:scale-[0.99]",
        delay === undefined ? "" : "stagger",
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
      {selected ? <Corners tone="ember" /> : null}
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
  art,
  label = "Hold to reveal",
  onFirstReveal,
}: {
  children: ReactNode;
  /** Shown full-bleed behind the secret while it is held. */
  art?: string;
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

  // Fetch the art up front so the reveal does not flash blank on first hold.
  useEffect(() => {
    if (!art) return;
    const preload = new Image();
    preload.src = art;
  }, [art]);

  // Let go anywhere — off the element, or because the phone stole focus — and it hides.
  useEffect(() => {
    if (!held) return;
    const hide = () => setHeld(false);
    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("blur", hide);
    };
  }, [held]);

  return (
    <>
      <div
        onPointerDown={start}
        onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-64 select-none overflow-hidden rounded-2xl border border-gold/40"
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <img
          src={ART.roleBack}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          draggable={false}
          decoding="async"
        />
        <div className="absolute inset-0 bg-ink/55" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="font-display text-lg text-ember">{label}</span>
          <span className="text-xs text-parchment/80">
            Nobody else can see this. Keep it that way.
          </span>
        </div>
        <Corners tone="gold" size="lg" />
      </div>

      {/*
        Held, the secret takes the whole screen: the art full-bleed, the words over a
        scrim on top of it. Boxed into the page it was clipped by whatever room the
        layout happened to have, which on a short phone cut the bottom off the card.
      */}
      {held
        ? createPortal(
            <div className="art-reveal fixed inset-0 z-[90] overflow-hidden bg-ink">
              {art ? (
                <img
                  src={art}
                  alt=""
                  className="drift absolute inset-0 h-full w-full object-cover object-top"
                  draggable={false}
                />
              ) : null}
              {/* Dark enough to read against, sheer enough to keep the picture. */}
              <div className="absolute inset-0 bg-linear-to-b from-ink/50 via-ink/78 to-ink/96" />
              <div
                className="absolute inset-0 flex flex-col overflow-y-auto overscroll-contain"
                style={{
                  paddingTop: "max(1.5rem, env(safe-area-inset-top))",
                  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                }}
              >
                <div
                  className="m-auto w-full max-w-md px-5"
                  style={{ textShadow: "0 1px 14px rgba(0,0,0,0.95)" }}
                >
                  {children}
                </div>
                <p className="shrink-0 pt-4 text-center text-xs text-parchment/60">
                  Lift your finger to hide this
                </p>
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-3 rounded-2xl border border-gold/30"
              />
              <div className="pointer-events-none absolute inset-3">
                <Corners tone="gold" size="lg" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

const INSIGHT_TONE = {
  neutral: "border-edge-bright text-parchment/85",
  good: "border-good/50 text-good",
  evil: "border-evil/50 text-evil",
  warn: "border-ember/50 text-ember",
};

export function Insights({ items, title }: { items: Insight[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-dim">{title}</p>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={index}
            className={`rounded-xl border bg-ink/50 px-3 py-2 text-sm leading-relaxed ${INSIGHT_TONE[item.tone]}`}
          >
            {item.text}
          </li>
        ))}
      </ul>
    </section>
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
