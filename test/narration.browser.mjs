/**
 * Checks narration fires on the right cues and stops when muted, by wrapping
 * window.Audio and recording what the app asked to play.
 *
 *   pnpm add -D playwright
 *   pnpm build && pnpm preview &
 *   node test/narration.browser.mjs /tmp/shots
 *   pnpm remove playwright
 */
import { chromium, devices } from "playwright";
const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], isMobile: true, hasTouch: true });
const page = await ctx.newPage();

// Record every audio element the app creates, and whether it was allowed to play.
await page.addInitScript(() => {
  window.__audio = [];
  const RealAudio = window.Audio;
  window.Audio = function (src) {
    const a = new RealAudio(src);
    const realPlay = a.play.bind(a);
    a.play = () => { window.__audio.push(a.src); return realPlay().catch(() => {}); };
    return a;
  };
});

await page.goto("http://localhost:4173");
await page.getByRole("button", { name: "Join with a code" }).click();
await page.getByPlaceholder("KXRT").fill("TOBY");
await page.getByPlaceholder("Toby").fill("Narr");
await page.getByRole("button", { name: "Join room" }).click();
await page.waitForSelector("text=Room code");
await page.getByRole("button", { name: "Debug", exact: true }).click();
if (await page.getByRole("button", { name: "Take host" }).count()) await page.getByRole("button", { name: "Take host" }).click();
await page.getByRole("button", { name: "Clear disconnected players" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "7", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Close" }).click();

const speaker = page.getByRole("button", { name: /Turn narration/ });
console.log("speaker present:", await speaker.count() === 1);
console.log("default state:", await speaker.getAttribute("aria-pressed"));
await page.screenshot({ path: `${OUT}/01-header-toggle.png` });

await page.getByRole("button", { name: "Deal the roles" }).click();
await page.waitForSelector("text=Your role");
await page.waitForTimeout(1200);
let played = await page.evaluate(() => window.__audio.map((s) => s.split("/").slice(-2).join("/")));
console.log("after deal:", JSON.stringify(played));

// Drive on so a quest resolves, and check the right lines fire.
const hold = async () => {
  const c = page.locator("text=Hold to reveal").first();
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
};
await hold();
await page.getByRole("button", { name: "Got it" }).click();
await page.waitForTimeout(2500);
played = await page.evaluate(() => window.__audio.map((s) => s.split("/").slice(-2).join("/")));
console.log("after a round of bots:", JSON.stringify(played));

// Muting must stop it.
await speaker.click();
console.log("after toggle:", await speaker.getAttribute("aria-pressed"));
const before = await page.evaluate(() => window.__audio.length);
await page.waitForTimeout(2500);
const after = await page.evaluate(() => window.__audio.length);
console.log(`muted: ${before} clips before, ${after} after — ${before === after ? "silent" : "STILL PLAYING"}`);
await browser.close();
