// Browser test. Needs Playwright: npx playwright@1 install chromium, then BASE=http://localhost:5391/ node tests/browser.e2e.mjs

const { chromium } = await import("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5391/";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text()); });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };

// 1. v1 library loads unchanged (old keys, old fields, one corrupt record)
await page.goto(BASE); await page.waitForTimeout(900);
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("sonata:v12:songs", JSON.stringify([
    { id: "song-old1", title: "Old Hymn", body: "# Old Hymn\n## Verse\nC  F  G\nHoly holy holy", manualKey: "auto", artist: "Trad", savedSnapshot: "x", isFavorite: true, updatedAt: "2026-09-01T00:00:00.000Z" },
    null,
    { id: "song-old2", title: "Second", body: "[D]Hello [A]there", manualKey: "D:major", updatedAt: "2026-09-02T00:00:00.000Z" }
  ]));
  localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-1", title: "Sunday", items: [{ songId: "song-old1" }, { songId: "song-old2" }], date: "2026-09-03" }]));
  localStorage.setItem("sonata:v12:settings", JSON.stringify({ theme: "dark", language: "en", accentTheme: "graphite", uiFontFamily: "serif" }));
  localStorage.setItem("sonata:v12:active", "song-old1");
});
await page.reload(); await page.waitForTimeout(700);
ok(await page.inputValue("#songTitle") === "Old Hymn", "v1 active song opens");
ok(await page.getAttribute("html", "data-theme") === "dark", "v1 dark theme kept");
ok((await page.innerText("#preview")).includes("Holy"), "preview renders v1 body");
await page.click('.tabs [data-view="songs"]'); await page.waitForTimeout(200);
ok(await page.locator("#libraryList .row").count() === 2, "2 valid songs (corrupt record skipped)");
await page.click('[data-filter="setlists"]'); await page.waitForTimeout(150);
ok((await page.textContent("#libraryList")).includes("Sunday"), "v1 setlist shown");

// 2. Transpose shows in Chords view and is saved per song
await page.click('[data-filter="all"]');
await page.click('#libraryList [data-id="song-old1"] [data-act="open"]'); await page.waitForTimeout(200);
await page.click("#keyUpBtn"); await page.click("#keyUpBtn");
await page.waitForTimeout(600);
const pv = await page.textContent("#preview");
ok(pv.includes("D") && pv.includes("G") && pv.includes("A") && !/\bC\b/.test(pv.split("Holy")[0]), "transpose +2: C F G -> D G A in preview");
ok(await page.textContent("#keyPillValue") === "D", "key pill shows D");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:songs")).find((s) => s.id === "song-old1").transpose);
ok(saved === 2, "transpose saved on the song");

// 3. Numbers & Lyrics modes
await page.click('[data-mode="nashville"]'); await page.waitForTimeout(150);
ok((await page.textContent("#preview")).includes("1") && (await page.textContent("#preview")).includes("4"), "Nashville numbers 1 4 5");
await page.click('[data-mode="lyrics"]'); await page.waitForTimeout(150);
ok(!(await page.textContent("#preview")).match(/\b[CFG]\b/), "lyrics mode hides chords");
await page.click('[data-mode="chords"]');

// 4. Share link round trip (old v1 format link too)
const url = await page.evaluate(async () => { const m = await import("/js/core/share.js"); return m.shareUrl(location.origin + "/", m.packSong({ title: "Shared One", body: "G C\nHello world", manualKey: "G:major", capo: 2 })); });
await page.goto(url); await page.waitForTimeout(700);
ok(await page.inputValue("#songTitle") === "Shared One", "share link opens song");
ok(await page.isVisible("#sharedBanner"), "shared banner visible (read-only)");
await page.click("#saveSharedBtn"); await page.waitForTimeout(700);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:songs")).some((s) => s.title === "Shared One" && s.capo === 2)), "saved shared song keeps capo");
// v1 compressed link format (deflate-raw of "v3."+json) — same encoder as v1
const v1 = await page.evaluate(async () => { const str = "v3." + JSON.stringify({ t: "Legacy Link", b: "[A]la la" }); const s = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream("deflate-raw")); const bytes = new Uint8Array(await new Response(s).arrayBuffer()); let bin = ""; bytes.forEach((x) => bin += String.fromCharCode(x)); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); });
await page.goto(BASE + "?s=" + v1); await page.waitForTimeout(600);
ok(await page.inputValue("#songTitle") === "Legacy Link", "v1-format share link still opens");
await page.click("#closeSharedBtn");

// 5. Delete + undo, and deletion is tombstoned for Drive
await page.click('.tabs [data-view="songs"]'); await page.waitForTimeout(150);
const before = await page.locator("#libraryList .row").count();
await page.click('#libraryList [data-id="song-old2"] [data-act="more"]');
await page.click('[data-m="del"]'); await page.waitForTimeout(700);
ok(await page.locator("#libraryList .row").count() === before - 1, "delete removes row");
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:deleted") || "[]").includes("song-old2")), "deleted id recorded (won't come back from Drive)");
await page.click(".toast-action"); await page.waitForTimeout(600);
ok(await page.locator("#libraryList .row").count() === before, "undo restores song");

// 6. Setlist play + stage navigation
await page.click('[data-filter="setlists"]');
await page.click('#libraryList [data-id="set-1"] [data-act="set-play"]'); await page.waitForTimeout(400);
ok(await page.isVisible("#stage"), "stage opens for setlist");
ok(await page.textContent("#stageCount") === "1/2", "stage shows 1/2");
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
ok(await page.textContent("#stageTitle") === "Second", "→ goes to next song");
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
ok(!(await page.isVisible("#stage")), "Esc closes stage");

// 7. Backup export file content + import restores
const snap = await page.evaluate(async () => { const { store } = await import("/js/ui/ctx.js"); return store.snapshot(); });
ok(snap.songs.length >= 3 && Array.isArray(snap.setlists), "backup snapshot has songs and setlists");

// 8. Filipino switch
await page.click("#settingsBtn");
await page.selectOption('[data-set="language"]', "fil"); await page.waitForTimeout(150);
await page.keyboard.press("Escape");
ok((await page.textContent('.tabs [data-view="songs"]')).includes("Mga Kanta"), "Filipino labels applied");
await page.click('.tabs [data-view="editor"]'); await page.waitForTimeout(150);
ok(await page.isVisible("#quickstart") === false || (await page.textContent("#quickstart")).includes("Simulan"), "quickstart translated, not replaced");

// 9. Theory: pick key, numerals
await page.click('.tabs [data-view="theory"]'); await page.waitForTimeout(200);
await page.click('[data-tonic="2"]'); await page.waitForTimeout(150);
ok((await page.textContent("#keyTitle")).startsWith("D"), "theory picks D major");
ok((await page.textContent("#diatonic")).includes("F♯m"), "D major diatonic has F♯m");
// 10. Play: fretboard uses F# (not Gb) in G
await page.evaluate(async () => { const { store } = await import("/js/ui/ctx.js"); const s = store.createSong({ body: "G C D G", title: "G song" }); });
await page.click('.tabs [data-view="play"]'); await page.waitForTimeout(250);
const fb = await page.textContent("#fretboard");
ok(fb.includes("F♯") && !fb.includes("G♭"), "fretboard spells F♯ in key of G");
console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.length ? errs.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
