import type { Credentials } from "./session";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body;
}

export const createRoom = (name: string) =>
  request<Credentials>("/api/rooms", { method: "POST", body: JSON.stringify({ name }) });

export const joinRoom = (code: string, name: string) =>
  request<Credentials>(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const claimSeat = (code: string, claimCode: string) =>
  request<Credentials>(`/api/rooms/${code}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimCode }),
  });
