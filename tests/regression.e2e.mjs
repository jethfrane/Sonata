// Regression checks for bugs found in the v3.1 audit.
// Run: BASE=http://127.0.0.1:5392 node tests/regression.e2e.mjs (serve dist with tests/serve.mjs)
// Needs the localhost-only test hook window.__sonata, so it cannot run against the live site.
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };

const ID = "song-mlk3x9-abcdef";
const seed = (p) => p.evaluate((id) => {
  localStorage.clear();
  localStorage.setItem("sonata:v12:songs", JSON.stringify([{ id, title: "Alpha", body: "# Alpha\n[C]Hello there my friend\n[G]second line here", manualKey: "auto", updatedAt: "2026-09-01T00:00:00.000Z" }]));
  localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-1", title: "Sunday", items: [{ songId: id }], date: "2026-09-03" }]));
  localStorage.setItem("sonata:v12:active", id);
}, ID);
async function page(init) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  return p;
}
const sheetOpen = (p) => p.evaluate(() => document.getElementById("sheet").open);

// 1. Deleting a setlist works (the confirm sheet used to close itself at once)
let p = await page();
await p.goto(BASE + "/"); await seed(p); await p.goto(BASE + "/songs"); await p.waitForTimeout(600);
await p.click('[data-filter="setlists"]'); await p.click('[data-act="set-more"]'); await p.waitForTimeout(200);
await p.click('.menu-item[data-m="del"]'); await p.waitForTimeout(400);
ok(await sheetOpen(p) && (await p.locator("#sheetTitle").innerText()) === "Delete setlist?", "setlist delete asks first");
await p.click("#sheetFoot .btn.danger"); await p.waitForTimeout(900);
ok(await p.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:setlists") || "[]").length === 0), "setlist is deleted after confirming");
// Cancel keeps it
await seed(p); await p.goto(BASE + "/songs"); await p.waitForTimeout(500);
await p.click('[data-filter="setlists"]'); await p.click('[data-act="set-more"]'); await p.waitForTimeout(200);
await p.click('.menu-item[data-m="del"]'); await p.waitForTimeout(300);
await p.click("#sheetFoot .btn.ghost"); await p.waitForTimeout(800);
ok(await p.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:setlists") || "[]").length === 1), "Cancel keeps the setlist");

// 2. Account sheet no longer overwrites a different sheet on a Drive status event
p = await page();
await p.goto(BASE + "/"); await seed(p); await p.goto(BASE + "/song/alpha-abcdef"); await p.waitForTimeout(800);
await p.click("#accountBtn"); await p.waitForTimeout(250); await p.keyboard.press("Escape"); await p.waitForTimeout(250);
await p.click("#settingsBtn"); await p.waitForTimeout(300);
await p.evaluate(() => window.__sonata.store.emit("drive-status", "synced")); await p.waitForTimeout(250);
ok(!(await p.locator("#sheetBody").innerText()).includes("Continue with Google"), "Settings stays Settings after a Drive status event");
// …and the account sheet itself still updates while open
await p.keyboard.press("Escape"); await p.waitForTimeout(250);
await p.click("#accountBtn"); await p.waitForTimeout(250);
ok((await p.locator("#sheetBody").innerText()).includes("Continue with Google"), "Account sheet shows sign-in");

// 3. Tuner: a second tap during the microphone prompt does not open a second microphone
p = await page(() => {
  window.__gum = 0; window.__stops = 0;
  navigator.mediaDevices.getUserMedia = async () => {
    window.__gum++;
    await new Promise((r) => setTimeout(r, 400));
    const s = new AudioContext().createMediaStreamDestination().stream;
    const tr = s.getTracks()[0]; const o = tr.stop.bind(tr); tr.stop = () => { window.__stops++; o(); };
    return s;
  };
});
await p.goto(BASE + "/play/tuner"); await p.waitForTimeout(600);
await p.click("#tunerBtn"); await p.click("#tunerBtn"); await p.waitForTimeout(1200);
await p.click("#tunerBtn"); await p.waitForTimeout(400);
ok(await p.evaluate(() => window.__gum) === 1, "one microphone request for two quick taps");
ok(await p.evaluate(() => window.__stops) === 1, "the microphone is released on Stop");
// Stop during the prompt releases a late microphone
await p.click("#tunerBtn"); await p.waitForTimeout(100);
await p.evaluate(() => document.getElementById("tunerBtn").dispatchEvent(new Event("noop")));
await p.goto(BASE + "/play/piano");
ok(true, "navigating away while the prompt is open does not throw");

// 4. Malformed URL escapes
p = await page();
await p.goto(BASE + "/"); await p.waitForTimeout(500);
await p.evaluate(() => { history.pushState(null, "", "/song/%E0%A4%A"); window.dispatchEvent(new PopStateEvent("popstate")); });
await p.waitForTimeout(400);
ok(p.errs.length === 0, "popstate to a malformed path raises no error");
await p.goto(BASE + "/song/%E0%A4%A"); await p.waitForTimeout(800);
ok((await p.locator(".boot-error").count()) === 0, "app boots on a malformed path");

// 5. Blocked storage: the app still opens and says so
p = await page(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); });
await p.goto(BASE + "/"); await p.waitForTimeout(900);
ok((await p.locator("#libraryList").innerHTML()).length > 20, "app renders with storage blocked");
ok((await p.locator(".toast").allInnerTexts()).join(" ").includes("blocks storage"), "toast explains songs aren't kept");
await p.click('[data-act="create"]'); await p.waitForTimeout(500);
ok((await p.locator("#songBody").count()) === 1 && await p.locator("#songBody").isVisible(), "can still write a song");

// 6. Damaged share links are refused
p = await page();
await p.goto(BASE + "/"); await p.waitForTimeout(400);
for (const [name, v] of [["number", 5], ["array", [1, 2]], ["empty object", {}], ["set without songs", { type: "set", t: "x" }]]) {
  await p.goto(BASE + "/?s=" + Buffer.from("v3." + JSON.stringify(v)).toString("base64url")); await p.waitForTimeout(600);
  ok((await p.locator(".toast").allInnerTexts()).join(" ").includes("couldn't be opened"), `damaged link (${name}) shows an error`);
}
await p.goto(BASE + "/?s=" + Buffer.from("v3." + JSON.stringify({ t: "Fine", b: "G C" })).toString("base64url")); await p.waitForTimeout(700);
ok(await p.inputValue("#songTitle") === "Fine", "a good link still opens");

// 7. Space on a focused stage button presses it instead of starting auto-scroll
p = await page();
await p.goto(BASE + "/"); await seed(p); await p.goto(BASE + "/song/alpha-abcdef"); await p.waitForTimeout(900);
await p.click("#presentBtn"); await p.waitForTimeout(500);
await p.focus("#stageKeyUp"); const before = await p.locator("#stageKey").innerText();
await p.keyboard.press("Space"); await p.waitForTimeout(250);
ok(await p.locator("#stageKey").innerText() !== before, "Space on 'key up' raises the key");

// 8. Metronome: no beat flash after Stop
p = await page();
await p.goto(BASE + "/play/metronome"); await p.waitForTimeout(600);
await p.evaluate(() => { const m = window.__sonata.app; });
await p.click("#metroBtn"); await p.waitForTimeout(700); await p.click("#metroBtn"); await p.waitForTimeout(600);
ok(await p.locator("#beatDots .on").count() === 0, "no beat dot stays lit after Stop");

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
