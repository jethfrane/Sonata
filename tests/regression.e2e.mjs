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

// 9. Drive sync against a fake Google Drive (first upload, no-op sync, write race, duplicate files)
async function driveCase(name, setup, check) {
  const fake = { files: new Map(), order: [], calls: [], versions: 0, onVersion: null, dupe: null };
  const put = (id, body) => { fake.files.set(id, body); if (!fake.order.includes(id)) fake.order.push(id); fake.versions++; };
  setup(fake, put);
  const dp = await page();
  await dp.route("https://www.googleapis.com/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const id = (url.pathname.match(/files\/([^/?]+)/) || [])[1];
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*" } });
    fake.calls.push(m + " " + url.pathname.split("/").slice(-2).join("/") + (url.searchParams.get("alt") ? "?alt" : ""));
    if (url.pathname.startsWith("/upload")) {
      if (fake.fail > 0) { fake.fail--; return route.fulfill({ status: 503, body: "busy", headers: { "access-control-allow-origin": "*" } }); }
      const text = req.postData() || ""; const body = text.split("\r\n\r\n")[2].split("\r\n--")[0];
      if (m === "POST") { const nid = "new-" + fake.order.length; put(nid, body); if (fake.dupe) fake.dupe(nid); return json({ id: nid }); }
      put(id, body); return json({ id });
    }
    if (m === "DELETE") { fake.files.delete(id); fake.order = fake.order.filter((x) => x !== id); return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); }
    if (url.searchParams.get("alt") === "media") return json(JSON.parse(fake.files.get(id)));
    if (url.searchParams.get("fields") === "md5Checksum,modifiedTime") { fake.onVersion?.(id); return json({ md5Checksum: "v" + fake.versions, modifiedTime: "t" }); }
    if (id) return json(fake.files.has(id) ? { id, trashed: false } : {});
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ files: fake.order.map((x) => ({ id: x })) }) });
  });
  await dp.goto(BASE + "/");
  await dp.evaluate((id) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("sonata:v12:songs", JSON.stringify([{ id, title: "Alpha", body: "G C", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }]));
    localStorage.setItem("sonata_user_profile", JSON.stringify({ email: "t@example.com" }));
    sessionStorage.setItem("sonata_google_token", "tok"); sessionStorage.setItem("sonata_google_token_expiry", String(Date.now() + 3600000));
  }, ID);
  await dp.reload(); await dp.waitForTimeout(1500);
  await check(fake, dp);
  await dp.close();
}
await driveCase("first sync", () => {}, async (f) => {
  ok(f.calls.filter((c) => c.startsWith("POST")).length === 1, "first sync creates the file once");
  ok([...f.files.values()].some((v) => v.includes("Alpha")), "uploaded library holds the song");
});
await driveCase("no-op sync", (f, put) => { put("file1", JSON.stringify({ songs: [{ id: ID, title: "Alpha", artist: "", creator: "", description: "", links: [], body: "G C", manualKey: "auto", isFavorite: false, transpose: 0, capo: 0, bpm: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastOpenedAt: "2026-09-01T00:00:00.000Z" }], setlists: [], deletedIds: [] })); }, async (f) => {
  ok(!f.calls.some((c) => c.startsWith("PATCH") || c.startsWith("POST")), "identical library is not uploaded again " + (process.env.DEBUG ? f.calls.join(",") + " :: " + [...f.files.values()][0].slice(0, 400) : ""));
});
await driveCase("write race", (f, put) => { put("file1", JSON.stringify({ songs: [], setlists: [], deletedIds: [] })); let n = 0; f.onVersion = (id) => { if (++n === 2) put(id, JSON.stringify({ songs: [{ id: "song-other-zzzzzz", title: "FromPhone", body: "D", updatedAt: "2026-10-01T00:00:00.000Z" }], setlists: [], deletedIds: [] })); }; }, async (f) => {
  const final = f.files.get("file1") || "";
  ok(final.includes("FromPhone") && final.includes("Alpha"), "a write by another device during sync is merged, not overwritten");
});
await driveCase("duplicate files", (f, put) => { f.dupe = () => { f.order = ["older-file", ...f.order]; f.files.set("older-file", JSON.stringify({ songs: [{ id: "song-old-aaaaaa", title: "InOlder", body: "A", updatedAt: "2026-10-01T00:00:00.000Z" }], setlists: [], deletedIds: [] })); }; }, async (f) => {
  ok(f.files.has("older-file") && f.files.size === 1, "extra file is removed, the oldest kept");
  const v = f.files.get("older-file") || "";
  ok(v.includes("InOlder") && v.includes("Alpha"), "both libraries end up in the oldest file");
});
// v3.2: a failed sync (Drive busy) retries by itself, and coming back online retries too.
await driveCase("busy drive", (f) => { f.fail = 1; }, async (f, dp) => {
  const st = await dp.evaluate(() => { const d = window.__sonata.app.drive; return { status: d.status, failures: d.failures, timer: Boolean(d.retryTimer) }; });
  ok(st.status === "error" && st.failures === 1 && st.timer, "a failed sync schedules a retry");
  await dp.evaluate(() => window.dispatchEvent(new Event("online"))); await dp.waitForTimeout(1200);
  const after = await dp.evaluate(() => { const d = window.__sonata.app.drive; return { status: d.status, failures: d.failures }; });
  ok(after.status === "synced" && after.failures === 0 && [...f.files.values()].some((v) => v.includes("Alpha")), "the retry uploads and clears the error");
});

// ---- v3.2 audit fixes ----
async function phone(vp = { width: 360, height: 740 }, init) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: vp.width < 1000 });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  return p;
}
p = await phone();
await p.goto(BASE + "/"); await seed(p); await p.goto(BASE + "/songs"); await p.waitForTimeout(500);
await p.click("#newSongBtn"); await p.waitForTimeout(400);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "new song on a 360px phone: no sideways scroll");
await p.click('[data-view="editor"].bn').catch(() => {}); await p.goto(BASE + "/editor"); await p.waitForTimeout(400);
ok(await p.getByRole("button", { name: "Share" }).isVisible() && await p.getByRole("button", { name: "Present" }).isVisible(), "icon-only Share and Present keep their names on phones");
await p.click('button[data-pane="preview"]'); await p.waitForTimeout(200);
ok(await p.evaluate(() => !document.getElementById("view-editor").hasAttribute("aria-pressed") && !document.getElementById("editorPanes").hasAttribute("aria-pressed")), "Edit/View switch only marks its own buttons");
// Stage: page behind is inert; setlist buttons in the dock; hiding the bars gives the space back
await p.goto(BASE + "/songs"); await p.waitForTimeout(400);
await p.evaluate(() => { const s = window.__sonata.store; s.saveSetlist({ title: "Two", items: [{ songId: s.songs[0].id }, { songId: s.songs[0].id }] }); });
await p.click('[data-filter="setlists"]'); await p.waitForTimeout(200);
await p.click('[data-act="set-play"]'); await p.waitForTimeout(500);
const st = await p.evaluate(() => ({ inert: document.getElementById("app").inert, next: !document.getElementById("stageNext").hidden && document.getElementById("stageNext").closest(".stage-dock") !== null, count: document.getElementById("stageCount").textContent }));
ok(st.inert && st.next && st.count === "1/2", "stage: background inert, next song in the bottom dock, count shown");
const stageBefore = await p.evaluate(() => document.getElementById("stageScroll").clientHeight);
await p.mouse.click(180, 400); await p.waitForTimeout(400);
const stageAfter = await p.evaluate(() => ({ h: document.getElementById("stageScroll").clientHeight, hidden: document.getElementById("stage").classList.contains("chrome-hidden"), top: document.getElementById("stageTop").getBoundingClientRect().bottom }));
ok(stageAfter.hidden && stageAfter.h === stageBefore && stageAfter.h >= 700, "stage chart uses the full height; bars float over it");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
ok(await p.evaluate(() => !document.getElementById("app").inert), "leaving the stage makes the page usable again");
// Songs: sort hidden for setlists; empty favorites offers a way back
ok(await p.evaluate(() => document.getElementById("librarySort").hidden), "sort menu hidden on the Setlists filter");
await p.evaluate(() => { const s = window.__sonata.store; s.songs.forEach((x) => { x.isFavorite = false; }); s.changed("library"); });
await p.click('[data-filter="favorites"]'); await p.waitForTimeout(200);
await p.click('[data-act="all"]'); await p.waitForTimeout(200);
ok(await p.evaluate(() => document.querySelector('[data-filter="all"]').classList.contains("active") && document.querySelectorAll(".row[data-id]").length > 0), "empty Favorites → Show all songs");
await p.close();

// Large library: first 200 rows, Show more adds the rest
p = await phone({ width: 390, height: 844 });
await p.goto(BASE + "/");
await p.evaluate(() => { localStorage.clear(); localStorage.setItem("sonata:v12:songs", JSON.stringify(Array.from({ length: 450 }, (_, i) => ({ id: "song-big-" + i, title: "Song " + i, body: "G C", updatedAt: new Date(Date.now() - i * 1e6).toISOString() })))); });
await p.goto(BASE + "/songs"); await p.waitForTimeout(500);
ok(await p.locator(".row[data-id]").count() === 200, "450 songs: 200 rows drawn at first");
await p.click('[data-act="more-rows"]'); await p.waitForTimeout(200);
ok(await p.locator(".row[data-id]").count() === 450 && await p.locator('[data-act="more-rows"]').count() === 0, "Show more draws the rest");
await p.fill("#librarySearch", "Song 44"); await p.waitForTimeout(400);
ok(await p.locator(".row[data-id]").count() === 11, "search in a big library still finds matches (after a short pause)");
await p.close();

// Phone landscape: the top bar scrolls away and the tab bar is slim
p = await phone({ width: 844, height: 390 });
await p.goto(BASE + "/"); await seed(p); await p.goto(BASE + "/editor"); await p.waitForTimeout(400);
const land = await p.evaluate(() => ({ pos: getComputedStyle(document.querySelector(".sidebar")).position, nav: document.querySelector(".bottom-nav").getBoundingClientRect().height }));
ok(land.pos === "relative" && land.nav <= 50, "landscape phone: top bar not sticky, tab bar 48px");
await p.close();

// Tuner: a busy microphone gets a clear message
p = await phone({ width: 390, height: 844 }, () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("busy"), { name: "NotReadableError" })); });
await p.goto(BASE + "/play/tuner"); await p.waitForTimeout(400);
await p.click("#tunerBtn"); await p.waitForTimeout(300);
ok((await p.locator(".toast").innerText()).includes("busy in another app"), "busy microphone: says another app is using it");
await p.close();

// Typing near the bottom of a long chart must not throw the page back up, and the typed line stays on screen.
const LONG_BODY = Array.from({ length: 90 }, (_, i) => (i % 2 ? `Line ${i} of the lyrics goes here` : "G     C     D     Em")).join("\n");
for (const vp of [{ width: 390, height: 760, touch: true }, { width: 900, height: 700 }, { width: 1366, height: 700 }]) {
  const c = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: Boolean(vp.touch), isMobile: Boolean(vp.touch) });
  const q = await c.newPage();
  await q.goto(BASE + "/songs");
  await q.evaluate((body) => { localStorage.clear(); localStorage.setItem("sonata:v12:songs", JSON.stringify([{ id: "song-long-aaaaaa", title: "Long", body }])); localStorage.setItem("sonata:v12:active", "song-long-aaaaaa"); }, LONG_BODY);
  await q.goto(BASE + "/editor"); await q.waitForTimeout(600);
  await q.evaluate(() => { const ta = document.getElementById("songBody"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight; window.scrollTo(0, document.documentElement.scrollHeight); });
  await q.waitForTimeout(150);
  const y0 = await q.evaluate(() => scrollY + document.getElementById("songBody").scrollTop);
  await q.keyboard.type("\nAm  F  C  G\nnew words typed at the end"); await q.waitForTimeout(300);
  const end = await q.evaluate(() => {
    const ta = document.getElementById("songBody");
    const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight);
    const caretY = ta.getBoundingClientRect().top + parseFloat(cs.paddingTop) + (ta.value.split("\n").length - 1) * lh - ta.scrollTop;
    const nav = document.querySelector(".bottom-nav").getBoundingClientRect();
    return { y: scrollY + ta.scrollTop, visible: caretY > 0 && caretY + lh <= (nav.height ? nav.top : innerHeight) + 1 };
  });
  ok(end.y >= y0 && end.visible, `${vp.width}px: typing at the end of a long chart keeps the page where it is and the new line on screen (${y0} → ${end.y})`);
  // Typing in the middle while reading the middle: nothing moves.
  await q.evaluate(() => { const ta = document.getElementById("songBody"); const at = ta.value.indexOf("Line 41"); ta.setSelectionRange(at, at); });
  await q.evaluate(() => { const ta = document.getElementById("songBody"); const lh = parseFloat(getComputedStyle(ta).lineHeight); if (ta.scrollHeight > ta.clientHeight + 4) ta.scrollTop = 41 * lh - 120; else window.scrollTo(0, ta.getBoundingClientRect().top + scrollY + 41 * lh - 300); });
  await q.waitForTimeout(150);
  const m0 = await q.evaluate(() => scrollY + document.getElementById("songBody").scrollTop);
  await q.keyboard.type("x"); await q.waitForTimeout(250);
  const m1 = await q.evaluate(() => scrollY + document.getElementById("songBody").scrollTop);
  ok(Math.abs(m1 - m0) <= 2, `${vp.width}px: typing in the middle of a long chart does not move the page (${m0} → ${m1})`);
  await c.close();
}

// Stage: full screen is offered, never forced.
{
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await c.newPage();
  await q.goto(BASE + "/songs");
  await q.evaluate(() => { localStorage.clear(); localStorage.setItem("sonata:v12:songs", JSON.stringify([{ id: "song-st-aaaaaaa", title: "Stage", body: "G  C  D\nWords for the stage view here" }])); localStorage.setItem("sonata:v12:active", "song-st-aaaaaaa"); });
  await q.goto(BASE + "/editor"); await q.waitForTimeout(500);
  await q.evaluate(() => { window.__fs = 0; const o = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function () { window.__fs++; return o.call(this); }; });
  await q.click("#presentBtn"); await q.waitForTimeout(700);
  ok(await q.evaluate(() => window.__fs === 0 && !document.fullscreenElement) && await q.locator("#stage:not([hidden])").count() === 1, "Present opens the stage without forcing full screen");
  ok(await q.locator("#stageFsBtn:not([hidden])").count() === 1 && (await q.getAttribute("#stageFsBtn", "aria-label")) === "Full screen", "the stage has a Full screen button");
  await q.click("#stageFsBtn"); await q.waitForTimeout(400);
  ok(await q.evaluate(() => window.__fs === 1), "the button asks for full screen");
  await q.keyboard.press("Escape"); await q.waitForTimeout(400);
  await c.close();
}

// v6.1: public-readiness.
{
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await c.newPage();
  const errs = []; q.on("pageerror", (e) => errs.push(e.message));
  const asked = []; q.on("request", (r) => asked.push(r.url()));
  await q.goto(BASE + "/songs"); await q.waitForTimeout(700);
  ok(!asked.some((u) => /i18n-fil/.test(u)), "English: the Filipino words are not downloaded");
  ok(await q.evaluate(() => document.documentElement.dataset.ready === "1") && await q.locator(".boot-error").count() === 0, "the app marks itself ready and shows no start-up error");
  // Filipino loads when chosen, and again at start for someone who chose it.
  await q.click("#settingsBtn"); await q.waitForTimeout(500);
  await q.selectOption('#sheet [data-set="language"]', "fil"); await q.waitForTimeout(700);
  ok(asked.some((u) => /i18n-fil/.test(u)) && (await q.locator('.tab[data-view="songs"]').innerText()).trim() !== "Songs", "choosing Filipino downloads the words and repaints the menu");
  await q.reload(); await q.waitForTimeout(800);
  ok((await q.locator('.tab[data-view="songs"]').innerText()).trim() !== "Songs" && await q.evaluate(() => document.documentElement.lang === "fil"), "Filipino is applied at start after a reload");
  await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("sonata:v12:settings")); s.language = "en"; localStorage.setItem("sonata:v12:settings", JSON.stringify(s)); });
  await q.reload(); await q.waitForTimeout(700);
  // An unplanned error: one calm message with Reload, not a flood.
  await q.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error("boom " + i); }, 0); Promise.reject(new Error("later")); });
  await q.waitForTimeout(500);
  ok(await q.locator(".toast").count() === 1 && /went wrong/i.test(await q.locator(".toast").first().innerText()), "an unexpected error shows one message, not one per error");
  ok(await q.locator(".toast button").count() >= 1, "the message offers Reload");
  await q.evaluate(() => { Promise.reject(new DOMException("stopped", "AbortError")); });
  await q.waitForTimeout(300);
  ok(await q.locator(".toast").count() === 1, "a cancelled request is not reported");
  // About links to the privacy page; the page stands on its own.
  await q.reload(); await q.waitForTimeout(600);
  await q.click("#helpBtn"); await q.waitForTimeout(500); await q.click("#helpAbout"); await q.waitForTimeout(600);
  ok(await q.locator('#sheet a[href="/privacy"]').count() === 1, "About links to Privacy & terms");
  errs.length = 0;
  await q.goto(BASE + "/privacy"); await q.waitForTimeout(300);
  ok((await q.locator("h1").innerText()) === "Privacy & terms" && await q.locator("#app").count() === 0 && await q.locator('a[href="/"]').count() >= 1, "/privacy is its own page with a way back to the app");
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "/privacy does not scroll sideways");
  const robots = await (await q.request.get(BASE + "/robots.txt")).text();
  const map = await (await q.request.get(BASE + "/sitemap.xml")).text();
  ok(/Sitemap: https:\/\/sonata\.jethrofrane\.xyz\/sitemap\.xml/.test(robots) && /<loc>https:\/\/sonata\.jethrofrane\.xyz\/privacy<\/loc>/.test(map), "robots.txt points at a sitemap that lists the public pages");
  ok(errs.length === 0, "no page errors on the privacy page");
  await c.close();
}
// A first visit that cannot fetch the app says so instead of a blank page.
{
  const c = await b.newContext({ viewport: { width: 390, height: 800 } });
  const q = await c.newPage();
  await q.route(/\/assets\/index-.*\.js$/, (r) => r.abort());
  await q.goto(BASE + "/songs"); await q.waitForTimeout(600);
  ok(await q.locator(".boot-error").count() === 1 && /couldn't load/i.test(await q.locator(".boot-error").innerText()), "if the app's script cannot be fetched, the page says so");
  await c.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
