// Routes, scroll, chord players, circle rotate. Run: BASE=http://127.0.0.1:5391/ node tests/routes.e2e.mjs (use tests/serve.mjs)
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391/").replace(/\/$/, "");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
const path = () => new URL(page.url()).pathname;

await page.goto(BASE + "/"); await page.waitForTimeout(700);
await page.evaluate(async () => {
  localStorage.clear();
  const { store } = await import("/js/ui/ctx.js");
  store.createSong({ title: "Route Test", body: "G   C   D   G\nHello world" });
});
await page.reload(); await page.waitForTimeout(600);
ok(/^\/song\/route-test-[a-z0-9]{6}$/.test(path()), "editor URL is /song/<slug>: " + path());
const slugPath = path();

// Nav pushes real URLs
await page.click('.bn[data-view="theory"]'); await page.waitForTimeout(150);
ok(path() === "/theory", "theory has /theory");
await page.click('.bn[data-view="play"]'); await page.waitForTimeout(150);
ok(path() === "/play/piano", "play has /play/piano");
await page.click('[data-inst="guitar"]'); await page.waitForTimeout(150);
ok(path() === "/play/guitar" && await page.isVisible('[data-inst-panel="guitar"]') && !(await page.isVisible('[data-inst-panel="piano"]')), "guitar tab has its own link and shows only guitar");
await page.click('[data-inst="tuner"]'); await page.waitForTimeout(150);
ok(path() === "/play/tuner", "tuner has /play/tuner");
await page.goBack(); await page.waitForTimeout(200);
ok(path() === "/play/guitar", "back button goes to the previous instrument");

// Direct links
await page.goto(BASE + "/play/piano"); await page.waitForTimeout(500);
ok(await page.isVisible('[data-inst-panel="piano"]') && await page.getAttribute("#app", "data-view") === "play", "direct /play/piano opens piano");
await page.goto(BASE + slugPath + "/stage"); await page.waitForTimeout(600);
ok(await page.isVisible("#stage"), "direct stage link opens stage");
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
ok(!(await page.isVisible("#stage")) && path() === slugPath, "closing stage returns to the song link");
await page.click("#presentBtn"); await page.waitForTimeout(300);
ok(path() === slugPath + "/stage", "Present gives /stage link");
await page.click("#stageExit"); await page.waitForTimeout(300);
ok(path() === slugPath && !(await page.isVisible("#stage")), "exit button returns to song link");
await page.goto(BASE + "/song/nope-zzzzzz"); await page.waitForTimeout(500);
ok(await page.getAttribute("#app", "data-view") === "songs", "unknown song link falls back to Songs");

// Taps never scroll to top
await page.setViewportSize({ width: 390, height: 420 });
await page.goto(BASE + "/play/piano"); await page.waitForTimeout(500);
await page.evaluate(() => scrollTo(0, 200));
const y0 = await page.evaluate(() => scrollY);
await page.locator("#piano .pk.white").nth(5).click(); await page.waitForTimeout(250);
ok(y0 > 0 && await page.evaluate(() => scrollY) === y0, `piano tap keeps scroll (${y0})`);
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(BASE + "/theory"); await page.waitForTimeout(500);
await page.evaluate(() => scrollTo(0, 300));
const y1 = await page.evaluate(() => scrollY);
await page.locator('#diatonic .dia').nth(2).click(); await page.waitForTimeout(250);
await page.locator('#keyPicker [data-tonic="7"]').click({ force: true }); await page.waitForTimeout(250);
ok(y1 > 0 && await page.evaluate(() => scrollY) >= y1 - 2, `theory taps keep scroll (${y1})`);

// Per-instrument chord players
await page.goto(BASE + "/play/piano"); await page.waitForTimeout(500);
await page.locator("#pianoPlayer [data-chord]").first().click(); await page.waitForTimeout(150);
const on = await page.locator("#piano .pk.on").count();
ok(on >= 3 && on <= 9, `piano chord lights notes (${on})`);
await page.selectOption("#pianoPlayer .cp-type", "7th"); await page.waitForTimeout(150);
const names = await page.locator("#pianoPlayer .cp-chips .chip").allTextContents();
ok(names.some((n) => n.includes("maj7")) && names.some((n) => n.includes("7")), "7ths per key: " + names.slice(0, 5).join(" "));
await page.click('[data-inst="guitar"]'); await page.waitForTimeout(150);
ok(await page.locator("#fretboard .fc.on").count() > 12, "guitar player is separate (still showing the scale)");
await page.locator("#guitarPlayer [data-chord]").first().click(); await page.waitForTimeout(150);
ok(await page.locator("#fretboard .fc.on").count() < 60 && await page.locator("#fretboard .fc.on").count() > 3, "guitar chord shows shape notes");

// Editor chord bar follows the key
await page.goto(BASE + slugPath); await page.waitForTimeout(500);
const before = await page.locator("#chordBar .chord-chip").allTextContents();
await page.click("#keyUpBtn"); await page.click("#keyUpBtn"); await page.waitForTimeout(300);
const after = await page.locator("#chordBar .chord-chip").allTextContents();
ok(before.join() !== after.join() && after.includes("A"), `chord bar follows key (${before.slice(0, 4)} → ${after.slice(0, 4)})`);
await page.selectOption("#barType", "sus4"); await page.waitForTimeout(150);
ok((await page.locator("#chordBar .chord-chip").allTextContents()).some((c) => c.includes("sus4")), "chord bar has more chord types");

// Circle auto-rotate
await page.goto(BASE + "/theory"); await page.waitForTimeout(500);
await page.click("#circleRotate"); await page.waitForTimeout(100);
await page.locator('#keyPicker [data-tonic="2"]').click({ force: true }); await page.waitForTimeout(1100);
const rot = await page.evaluate(() => getComputedStyle(document.getElementById("circle")).getPropertyValue("--rot").trim());
ok(/^-?\d/.test(rot) && parseFloat(rot) !== 0, "circle rotates to put the key on top (" + rot + ")");

// No overflow in any route at small widths
for (const w of [320, 390, 768]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const p of ["/songs", slugPath, "/tools", "/theory", "/play/piano", "/play/guitar", "/play/tuner"]) {
    await page.goto(BASE + p); await page.waitForTimeout(350);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `no overflow ${w}px ${p}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.length ? errs.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
