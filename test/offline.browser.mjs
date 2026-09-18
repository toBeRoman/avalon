/**
 * Proves pass-and-play survives with no network at all: loads the app, cuts the
 * connection, then plays a full round on one device.
 *
 * Needs a browser, so Playwright is not a permanent dependency of this project:
 *
 *   pnpm add -D playwright
 *   pnpm build && pnpm preview &
 *   node test/offline.browser.mjs /tmp/shots
 *   pnpm remove playwright
 */
import { chromium, devices } from "playwright";
const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// Prove it runs with the network cut off after first load.
await page.goto("http://localhost:4173");
const shot = async (f) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${f}.png` }); console.log("shot " + f); };

/**
 * Takes the phone if it is being offered. The app only asks when the phone needs
 * to change hands — if the same person is up again (the leader who proposed is
 * often first to play a card) it goes straight to their screen.
 */
const takePhoneIfAsked = async (label, expected) => {
  try {
    await page
      .locator("text=Pass the phone to")
      .or(page.locator(expected))
      .first()
      .waitFor({ timeout: 15000 });
  } catch (problem) {
    console.error(`stuck before ${label}. On screen:\n${await page.locator("main").innerText()}`);
    await page.screenshot({ path: `${OUT}/FAILED-${label}.png` });
    throw problem;
  }
  const offer = page.getByRole("button", { name: /^I am / });
  if (await offer.count()) await offer.click();
};

await page.getByRole("button", { name: /No signal/ }).click();
const NAMES = ["Toby", "Dave", "Priya", "Sam", "Max"];
for (let i = 0; i < NAMES.length; i++) await page.getByPlaceholder(`Player ${i + 1}`).fill(NAMES[i]);
await shot("01-setup");
await page.getByRole("button", { name: /Sit 5 down/ }).click();
await page.waitForSelector("text=Roles");

// Now go offline entirely. Everything from here must still work.
await ctx.setOffline(true);
console.log("network cut");

await page.getByRole("button", { name: "Deal the roles" }).click();
await page.waitForSelector("text=Pass the phone to");
await shot("02-pass");

const hold = async () => {
  const c = page.locator("text=Hold to reveal").first();
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
};
for (let i = 0; i < NAMES.length; i++) {
  await takePhoneIfAsked(`reveal-${i}`, "text=Your role");
  await hold();
  await page.waitForTimeout(200);
  if (i === 0) await shot("03-reveal-offline");
  await page.mouse.up();
  await page.getByRole("button", { name: "Got it" }).click();
  await page.waitForTimeout(200);
}

// Proposal
await takePhoneIfAsked("proposal", "text=You are the leader");
await page.waitForSelector("text=You are the leader");
const rows = page.locator("main button.min-h-14");
await rows.nth(0).click(); await rows.nth(1).click();
await page.getByRole("button", { name: "Propose this team" }).click();
await page.waitForSelector("text=Approve this team?");
await shot("04-local-vote");
const yes = page.getByRole("button", { name: "Yes", exact: true });
for (let i = 0; i < await yes.count(); i++) await yes.nth(i).click();
await page.getByRole("button", { name: /Lock in the votes/ }).click();
await page.waitForSelector("text=/Approved|Rejected/");
await shot("05-vote-reveal");
await page.getByRole("button", { name: "Continue" }).click();

// Quest: pass to each team member
for (let i = 0; i < 2; i++) {
  await takePhoneIfAsked(`quest-card-${i}`, "button:has-text('Play Success')");
  await page.getByRole("button", { name: /Play Success/ }).click();
}
await page.waitForSelector("text=/succeeded|failed/");
await shot("06-quest-reveal");
await page.getByRole("button", { name: "Continue" }).click();
await page
  .locator("text=Pass the phone to")
  .or(page.locator("text=You are the leader"))
  .first()
  .waitFor();
const next = (await page.locator("main").innerText()).slice(0, 120).replace(/\n/g, " | ");
console.log("next phase:", next);
const offline = await page.evaluate(() => navigator.onLine);
console.log("navigator.onLine:", offline);
console.log("STILL OFFLINE, STILL PLAYING");
await browser.close();
