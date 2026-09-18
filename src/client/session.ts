export interface Credentials {
  code: string;
  playerId: string;
  token: string;
}

const KEY = "avalon.session";

export function loadSession(): Credentials | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Credentials;
    return parsed.code && parsed.playerId && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(credentials: Credentials): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(credentials));
  } catch {
    // Private browsing. The game still works, it just will not survive a refresh.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/** Remembers the name you last used so rejoining is one tap. */
export function lastName(): string {
  try {
    return localStorage.getItem("avalon.name") ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem("avalon.name", name);
  } catch {
    // Ignore.
  }
}
