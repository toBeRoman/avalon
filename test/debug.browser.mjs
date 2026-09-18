/**
 * Exercises the reserved debug room end to end: join solo, take host, clear stale
 * seats, fill to eight with bots, force a role, deal, let the bots play, x-ray.
 *
 * See DEBUG.md. Needs a browser:
 *
 *   pnpm add -D playwright
 *   pnpm build && pnpm preview &
 *   node test/debug.browser.mjs /tmp/shots
 *   pnpm remove playwright
 */
import { chromium, devices } from "playwright";
const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4173");
const shot = async (f) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${f}.png` }); console.log("shot " + f); };

await page.getByRole("button", { name: "Join with a code" }).click();
await page.getByPlaceholder("KXRT").fill("TOBY");
await page.getByPlaceholder("Toby").fill("Toby");
await page.getByRole("button", { name: "Join room" }).click();
await page.waitForSelector("text=Room code");
console.log("joined the debug room solo");

await page.getByRole("button", { name: "Debug", exact: true }).click();
await page.waitForSelector("text=Debug room");
if (await page.getByRole("button", { name: "Take host" }).count())
  await page.getByRole("button", { name: "Take host" }).click();
await page.getByRole("button", { name: "Clear disconnected players" }).click();
await page.waitForTimeout(400);
await shot("01-debug-panel");

// Fill to 8 with bots.
await page.getByRole("button", { name: "8", exact: true }).click();
await page.waitForTimeout(400);
console.log("players after fill:", await page.locator("text=/\\d+ real · \\d+ bots/").innerText());

// Force Merlin, turn on Mordred + Lady.
await page.getByRole("button", { name: "Be Merlin", exact: true }).click();
await page.getByRole("button", { name: "Mordred", exact: true }).click();
await page.getByRole("button", { name: "Lady of the Lake", exact: true }).click();
await page.waitForTimeout(300);
await shot("02-configured");
await page.getByRole("button", { name: "Close" }).click();

await page.getByRole("button", { name: /Deal the roles|Need / }).click();
await page.waitForSelector("text=Your role");
const c = page.locator("text=Hold to reveal").first();
await c.scrollIntoViewIfNeeded();
const b = await c.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down(); await page.waitForTimeout(700);
const card = await page.locator("body").innerText();
console.log("forced role honoured:", card.includes("Merlin") ? "YES — dealt Merlin" : "NO");
await shot("03-forced-merlin");
await page.mouse.up();
await page.getByRole("button", { name: "Got it" }).click();

// Bots should carry the game forward on their own.
await page.waitForTimeout(1500);
console.log("phase after bots ran:", (await page.locator("main h2").first().innerText()).replace(/\n/g, " "));
await shot("04-bots-playing");

// X-ray
await page.getByRole("button", { name: "Debug", exact: true }).click();
// The room keeps its state between sessions, so make sure x-ray ends up on.
if (await page.getByRole("button", { name: /Show everyone/ }).count())
  await page.getByRole("button", { name: /Show everyone/ }).click();
await page.waitForSelector("text=Hide everyone's roles");
await page.waitForTimeout(300);
await shot("05-xray");
const xray = await page.locator("body").innerText();
console.log("xray lists roles:", /Assassin|Morgana|Mordred/.test(xray) ? "YES" : "NO");
await browser.close();
console.log("done");
