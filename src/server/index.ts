import { DEBUG_CODE } from "../shared/rules";
import type { Env } from "./room";
export { RoomDO } from "./room";

/** No I, O, 0 or 1 — room codes get shouted across a campsite in the dark. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

    // POST /api/rooms — make a room and become its host
    if (path === "/api/rooms" && request.method === "POST") {
      const { name } = (await request.json().catch(() => ({}))) as { name?: string };
      if (!name?.trim()) return fail("Pick a name first.");

      // Collisions are rare (24^4 codes) but a retry costs nothing.
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const result = await env.ROOM.getByName(code).create(code, name);
        if ("error" in result) continue;
        return json({ code, ...result });
      }
      return fail("Could not find a free room code. Try again.", 503);
    }

    const match = path.match(/^\/api\/rooms\/([A-Za-z]+)(\/[a-z]+)?$/);
    if (!match) return fail("Not found", 404);

    const code = normaliseCode(match[1]);
    const action = match[2] ?? "";
    const room = env.ROOM.getByName(code);

    // GET /api/rooms/:code — does this room exist, and can it be joined?
    if (action === "" && request.method === "GET") {
      return json(await room.describe());
    }

    // POST /api/rooms/:code/join
    if (action === "/join" && request.method === "POST") {
      const { name } = (await request.json().catch(() => ({}))) as { name?: string };
      if (!name?.trim()) return fail("Pick a name first.");
      // The debug room springs into existence for whoever asks for it first.
      if (code === DEBUG_CODE && !(await room.exists())) {
        const created = await room.create(code, name);
        if (!("error" in created)) return json({ code, ...created });
      }
      const result = await room.join(name);
      if ("error" in result) return fail(result.error);
      return json({ code, ...result });
    }

    // POST /api/rooms/:code/claim — take over a seat the host released
    if (action === "/claim" && request.method === "POST") {
      const { claimCode } = (await request.json().catch(() => ({}))) as { claimCode?: string };
      if (!claimCode?.trim()) return fail("Enter the seat code shown on the host's phone.");
      const result = await room.claim(claimCode);
      if ("error" in result) return fail(result.error);
      return json({ code, ...result });
    }

    // GET /api/rooms/:code/ws — the live game connection
    if (action === "/ws") {
      return room.fetch(request);
    }

    return fail("Not found", 404);
  },
} satisfies ExportedHandler<Env>;
