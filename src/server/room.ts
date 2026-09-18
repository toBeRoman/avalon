import { DurableObject } from "cloudflare:workers";
import { DEFAULT_OPTIONS, MAX_PLAYERS } from "../shared/rules";
import type { ClientMessage, RoomState, ServerMessage } from "../shared/types";
import { applyAction, canJoin, settle, viewFor } from "./engine";

/** Rooms are thrown away after this long with no activity. */
const IDLE_MS = 12 * 60 * 60 * 1000;

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  ASSETS: Fetcher;
}

export interface Credentials {
  playerId: string;
  token: string;
}

interface Attachment {
  playerId: string;
}

export class RoomDO extends DurableObject<Env> {
  private room: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>("room")) ?? null;
      if (this.room) this.syncConnected();
    });
  }

  /* -------------------------------------------------------------- */
  /* Persistence                                                     */
  /* -------------------------------------------------------------- */

  private async save(): Promise<void> {
    if (!this.room) return;
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put("room", this.room);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  async alarm(): Promise<void> {
    // Nobody has touched this room in half a day. Let it go.
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room expired");
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  /* -------------------------------------------------------------- */
  /* Lifecycle (called over RPC from the Worker)                     */
  /* -------------------------------------------------------------- */

  async create(code: string, name: string): Promise<Credentials | { error: string }> {
    if (this.room) return { error: "taken" };
    const playerId = crypto.randomUUID();
    const token = crypto.randomUUID();
    this.room = {
      code,
      hostId: playerId,
      players: [{ id: playerId, name: name.trim().slice(0, 16), connected: false }],
      tokens: { [playerId]: token },
      options: { ...DEFAULT_OPTIONS },
      phase: "lobby",
      game: null,
      claim: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.save();
    return { playerId, token };
  }

  async join(name: string): Promise<Credentials | { error: string }> {
    if (!this.room) return { error: "No room with that code." };
    const problem = canJoin(this.room, name);
    if (problem) return { error: problem };
    const playerId = crypto.randomUUID();
    const token = crypto.randomUUID();
    this.room.players.push({ id: playerId, name: name.trim().slice(0, 16), connected: false });
    this.room.tokens[playerId] = token;
    await this.save();
    this.broadcast();
    return { playerId, token };
  }

  /** Takes over a seat the host has released, for when someone's phone dies. */
  async claim(claimCode: string): Promise<Credentials | { error: string }> {
    if (!this.room) return { error: "No room with that code." };
    const claim = this.room.claim;
    if (!claim) return { error: "The host has not released a seat." };
    if (claim.code !== claimCode.trim()) return { error: "That seat code is not right." };

    const token = crypto.randomUUID();
    this.room.tokens[claim.playerId] = token;
    this.room.claim = null;
    // Any phone still holding the old token is now stale; drop its socket.
    for (const ws of this.socketsFor(claim.playerId)) ws.close(4001, "Seat handed over");
    await this.save();
    this.broadcast();
    return { playerId: claim.playerId, token };
  }

  async exists(): Promise<boolean> {
    return this.room !== null;
  }

  /** Lets the join screen fail fast with a useful message. */
  async describe(): Promise<{ exists: boolean; phase: string; players: number; full: boolean }> {
    if (!this.room) return { exists: false, phase: "lobby", players: 0, full: false };
    return {
      exists: true,
      phase: this.room.phase,
      players: this.room.players.length,
      full: this.room.players.length >= MAX_PLAYERS,
    };
  }

  /* -------------------------------------------------------------- */
  /* WebSockets                                                      */
  /* -------------------------------------------------------------- */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";

    if (!this.room) return new Response("No such room", { status: 404 });
    if (this.room.tokens[playerId] !== token) return new Response("Bad credentials", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected websocket", { status: 426 });

    const pair = new WebSocketPair();
    // Hibernation keeps the room cheap while everyone is arguing round the fire.
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ playerId } satisfies Attachment);

    this.setConnected(playerId, true);
    await this.save();
    this.broadcast();

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    const { playerId } = ws.deserializeAttachment() as Attachment;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw as string);
    } catch {
      return;
    }
    if (msg.t === undefined) return;

    const error = applyAction(this.room, playerId, msg);
    if (error) {
      this.send(ws, { t: "error", message: error });
      return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleGone(ws);
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    this.syncConnected(ws);
    // A player dropping out must never leave everyone else stuck on a reveal.
    settle(this.room);
    await this.save();
    this.broadcast();
  }

  /* -------------------------------------------------------------- */
  /* Helpers                                                         */
  /* -------------------------------------------------------------- */

  private socketsFor(playerId: string): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.deserializeAttachment() as Attachment | null)?.playerId === playerId);
  }

  private setConnected(playerId: string, connected: boolean): void {
    const player = this.room?.players.find((p) => p.id === playerId);
    if (player) player.connected = connected;
  }

  /** Recomputes every player's connected flag from the live sockets. */
  private syncConnected(ignore?: WebSocket): void {
    if (!this.room) return;
    const live = new Set(
      this.ctx
        .getWebSockets()
        .filter((ws) => ws !== ignore)
        .map((ws) => (ws.deserializeAttachment() as Attachment | null)?.playerId)
        .filter(Boolean) as string[],
    );
    for (const player of this.room.players) player.connected = live.has(player.id);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already gone; the close handler will tidy up.
    }
  }

  /** Every socket gets its own redacted view. Roles never go out over the wire. */
  private broadcast(): void {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (!attachment) continue;
      if (!this.room.players.some((p) => p.id === attachment.playerId)) {
        ws.close(4002, "Removed from room");
        continue;
      }
      this.send(ws, { t: "view", view: viewFor(this.room, attachment.playerId) });
    }
  }
}
