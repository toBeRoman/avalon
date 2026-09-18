import { useState } from "react";
import { claimSeat, createRoom, joinRoom } from "../api";
import { Rules } from "../Rules";
import { lastName, rememberName, type Credentials } from "../session";
import { Button, Note, Sheet } from "../ui";

type Mode = "menu" | "create" | "join" | "claim";

export default function Home({ onReady }: { onReady: (credentials: Credentials) => void }) {
  const shared = new URLSearchParams(location.search).get("code") ?? "";
  const [mode, setMode] = useState<Mode>(shared ? "join" : "menu");
  const [name, setName] = useState(lastName());
  const [code, setCode] = useState(shared.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4));
  const [seatCode, setSeatCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

  const run = async (action: () => Promise<Credentials>) => {
    setBusy(true);
    setError(null);
    try {
      const credentials = await action();
      if (name.trim()) rememberName(name.trim());
      onReady(credentials);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  };

  const codeInput = (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-widest text-dim">Room code</span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
        placeholder="KXRT"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        className="w-full rounded-xl border border-edge bg-surface px-4 py-4 text-center font-display text-3xl tracking-[0.4em] text-parchment outline-none focus:border-ember"
      />
    </label>
  );

  const nameInput = (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-widest text-dim">Your name</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 16))}
        placeholder="Toby"
        autoCapitalize="words"
        autoCorrect="off"
        className="w-full rounded-xl border border-edge bg-surface px-4 py-4 text-parchment outline-none focus:border-ember"
      />
    </label>
  );

  return (
    <div className="flex min-h-full flex-col justify-between px-5 pb-8 pt-16">
      <div className="space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-display text-5xl tracking-wide text-ember">Avalon</h1>
          <p className="text-sm text-dim">
            Five to ten players. No cards, no narrator, no closing your eyes.
          </p>
        </header>

        {error ? (
          <p className="rounded-xl border border-evil/60 bg-evil/10 px-4 py-3 text-sm text-parchment">
            {error}
          </p>
        ) : null}

        {mode === "menu" ? (
          <div className="space-y-3">
            <Button onClick={() => setMode("create")}>Start a new game</Button>
            <Button variant="ghost" onClick={() => setMode("join")}>
              Join with a code
            </Button>
          </div>
        ) : null}

        {mode === "create" ? (
          <div className="space-y-3">
            {nameInput}
            <Button
              disabled={busy || !name.trim()}
              onClick={() => run(() => createRoom(name.trim()))}
            >
              {busy ? "Lighting the fire…" : "Create room"}
            </Button>
            <Button variant="quiet" onClick={() => setMode("menu")}>
              Back
            </Button>
          </div>
        ) : null}

        {mode === "join" ? (
          <div className="space-y-3">
            {codeInput}
            {nameInput}
            <Button
              disabled={busy || code.length !== 4 || !name.trim()}
              onClick={() => run(() => joinRoom(code, name.trim()))}
            >
              {busy ? "Joining…" : "Join room"}
            </Button>
            <Button variant="quiet" onClick={() => setMode("menu")}>
              Back
            </Button>
          </div>
        ) : null}

        {mode === "claim" ? (
          <div className="space-y-3">
            <Note>
              If your phone died mid-game, ask the host to hand your seat over. They will read you a
              four-digit code.
            </Note>
            {codeInput}
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-widest text-dim">Seat code</span>
              <input
                value={seatCode}
                onChange={(e) => setSeatCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                inputMode="numeric"
                className="w-full rounded-xl border border-edge bg-surface px-4 py-4 text-center font-display text-3xl tracking-[0.4em] text-parchment outline-none focus:border-ember"
              />
            </label>
            <Button
              disabled={busy || code.length !== 4 || seatCode.length !== 4}
              onClick={() => run(() => claimSeat(code, seatCode))}
            >
              {busy ? "Taking your seat…" : "Take back my seat"}
            </Button>
            <Button variant="quiet" onClick={() => setMode("menu")}>
              Back
            </Button>
          </div>
        ) : null}
      </div>

      <footer className="flex justify-center gap-6 pt-10 text-sm text-dim">
        <button type="button" onClick={() => setRules(true)} className="underline underline-offset-4">
          How to play
        </button>
        {mode !== "claim" ? (
          <button
            type="button"
            onClick={() => setMode("claim")}
            className="underline underline-offset-4"
          >
            Lost your seat?
          </button>
        ) : null}
      </footer>

      <Sheet open={rules} onClose={() => setRules(false)} title="How to play">
        <Rules />
      </Sheet>
    </div>
  );
}
