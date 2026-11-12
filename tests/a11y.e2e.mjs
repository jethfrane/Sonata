// v3.1 checks: axe-core on every route (light + dark), arrow-key instrument tabs, setlist print.
// Run: BASE=http://127.0.0.1:5392/ node tests/a11y.e2e.mjs (serve dist with tests/serve.mjs)
import { readFileSync } from "node:fs";
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391/").replace(/\/$/, "");
const axeSrc = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };

const seed = async (theme) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(500);
  await page.evaluate((th) => {
    localStorage.clear();
    localStorage.setItem("sonata:v12:songs", JSON.stringify([
      { id: "song-a", title: "Alpha", body: "# Alpha\n## Verse\n[C]Hello [F]there", manualKey: "auto", updatedAt: "2026-09-01T00:00:00.000Z" },
      { id: "song-b", title: "Beta", body: "# Beta\n## Verse\n[G]Second [D]song", manualKey: "auto", updatedAt: "2026-09-02T00:00:00.000Z" }
    ]));
    localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-1", title: "Sunday", items: [{ songId: "song-a" }, { songId: "song-b" }], date: "2026-09-03" }]));
    localStorage.setItem("sonata:v12:settings", JSON.stringify({ theme: th, language: "en" }));
    localStorage.setItem("sonata:v12:active", "song-a");
  }, theme);
  await page.reload(); await page.waitForTimeout(600);
};

const routes = ["/songs", "/song/alpha-a", "/theory", "/play/piano", "/play/guitar", "/play/tuner", "/play/metronome", "/play/drums"];
for (const theme of ["light", "dark"]) {
  await seed(theme);
  for (const r of routes) {
    await page.goto(BASE + r); await page.waitForTimeout(500);
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () => /** @type {any} */ (window).axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    ok(bad.length === 0, `axe ${theme} ${r}${bad.length ? " → " + bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target}`).join("; ") : ""}`);
  }
}

// Arrow keys on instrument tabs
await seed("light");
await page.goto(BASE + "/play/piano"); await page.waitForTimeout(500);
await page.focus('button[data-inst="piano"]');
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(250);
ok(page.url().endsWith("/play/guitar"), "ArrowRight → guitar");
ok(await page.evaluate(() => document.activeElement?.getAttribute("data-inst")) === "guitar", "focus follows to guitar tab");
await page.keyboard.press("End"); await page.waitForTimeout(250);
ok(page.url().endsWith("/play/drums"), "End → drums");
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(250);
ok(page.url().endsWith("/play/piano"), "ArrowRight wraps to piano");
await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(250);
ok(page.url().endsWith("/play/drums"), "ArrowLeft wraps to drums");
ok(await page.locator('button[data-inst][tabindex="0"]').count() === 1, "one tab in the tab order");

// Setlist print shortcut
await page.goto(BASE + "/songs"); await page.waitForTimeout(400);
await page.evaluate(() => { /** @type {any} */ (window).__printed = 0; window.print = () => { /** @type {any} */ (window).__printed++; }; });
await page.click('[data-filter="setlists"]'); await page.waitForTimeout(150);
await page.click('#libraryList [data-act="set-more"]'); await page.waitForTimeout(250);
await page.click('.menu-item[data-m="print"]'); await page.waitForTimeout(400);
ok(await page.locator("#printArea .print-song").count() === 2, "print area holds both setlist songs");
ok(await page.evaluate(() => /** @type {any} */ (window).__printed) === 1, "window.print called once");

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.length ? errs.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
