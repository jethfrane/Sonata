// v4 features in a real browser: Chords, chord pop-ups, Theory chord families, share/QR,
// setlist links import, QR links, YouTube, song bank (musician and listener), exports.
// Run: BASE=http://127.0.0.1:5391 node tests/features.e2e.mjs (serve dist with tests/serve.mjs)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const jsQR = require("jsqr");
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
const errors = [];

const SONGS = [
  { id: "song-feat-aaaaaa", title: "Here I Am to Worship", artist: "Tim Hughes", genre: "Worship", body: "## Verse\nG        D/F#      Em\nLight of the world\nC         Am/G\nYou stepped down", links: [{ name: "Reference", url: "https://youtu.be/dQw4w9WgXcQ" }] },
  { id: "song-feat-bbbbbb", title: "Buwan", artist: "Juan Karlos", genre: "OPM", body: "Am  F  C  G\nIkaw ang buwan" }
];
async function open(path, o = {}) {
  const ctx = await b.newContext({ viewport: o.viewport || { width: 1280, height: 860 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], hasTouch: Boolean(o.touch), isMobile: Boolean(o.touch) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  if (o.route) await o.route(p);
  await p.goto(BASE + "/songs");
  await p.evaluate((songs) => { localStorage.clear(); localStorage.setItem("sonata:v12:songs", JSON.stringify(songs)); localStorage.setItem("sonata:v12:active", songs[0]?.id || ""); localStorage.setItem("sonata:v12:settings", JSON.stringify({ buddy: false })); }, o.songs || SONGS);
  await p.goto(BASE + path); await p.waitForTimeout(600);
  return p;
}

console.log("Chords");
let p = await open("/chords/Am7");
ok((await p.textContent(".cr-name")) === "Am7", "/chords/Am7 opens Am7");
ok((await p.locator(".cr-notes").innerText()).replace(/\s+/g, " ").includes("A 1 C ♭3 E 5 G ♭7"), "notes and formula shown");
ok(await p.locator('.dg-card[data-inst="guitar"] svg[aria-label*="x 0 2 0 1 0"]').count() === 1, "guitar diagram is the standard Am7 shape (x02010)");
ok(await p.locator('.dg-card[data-inst="ukulele"] svg.chord-box').count() === 1 && await p.locator('.dg-card[data-inst="piano"] svg.piano-keys').count() === 1 && await p.locator('.dg-card[data-inst="bass"] svg.neck-map').count() === 1, "ukulele, piano and bass diagrams");
await p.selectOption("#chordBass", "G"); await p.waitForTimeout(200);
ok((await p.textContent(".cr-name")) === "Am7/G" && new URL(p.url()).pathname === "/chords/Am7-over-G", "bass note makes a slash chord, URL follows");
await p.click('[data-qual="sus4"]'); await p.waitForTimeout(150);
ok((await p.textContent(".cr-name")) === "Asus4/G", "chord type buttons change the chord");
await p.fill("#chordSearch", "d/f#"); await p.waitForTimeout(150);
ok((await p.textContent(".cr-name")) === "D/F♯" && await p.locator('.dg-card[data-inst="guitar"] svg[aria-label*="2 0 0 2 3 2"]').count() === 1, "typing d/f# finds D/F# (200232)");
await p.fill("#chordSearch", "Hzz"); await p.waitForTimeout(150);
ok((await p.textContent("#chordSearchHint")).includes("Not a chord"), "unknown chord explains itself");
const before = await p.locator('.dg-card[data-inst="guitar"] svg.chord-box').getAttribute("aria-label");
await p.click('[data-shape="guitar:1"]'); await p.waitForTimeout(150);
ok((await p.locator('.dg-card[data-inst="guitar"] svg.chord-box').getAttribute("aria-label")) !== before, "next shape shows another voicing");
ok(await p.locator("#songChordsList .chip").count() >= 4, "chords of the open song are one tap away");
for (const inst of ["piano", "guitar", "ukulele", "bass"]) {
  await p.click(`.dg-card[data-inst="${inst}"] [data-hear="${inst}"]`);
}
const samplesOk = await p.evaluate(async () => {
  const urls = ["/samples/piano/C4.mp3", "/samples/guitar/D3.mp3", "/samples/uke/C4.wav", "/samples/bass/E2.mp3"];
  const oac = new OfflineAudioContext(2, 1, 44100);
  for (const u of urls) {
    const r = await fetch(u);
    if (!r.ok) return false;
    const ab = await r.arrayBuffer();
    if (ab.byteLength < 15000) return false;
    const decoded = await oac.decodeAudioData(ab);
    if (decoded.duration < 1) return false;
  }
  return true;
});
ok(samplesOk, "hearing chords plays studio instrument samples without error");
await p.close();

console.log("Chord pop-ups and Theory");
p = await open("/editor");
await p.click("#preview .ch >> nth=1"); await p.waitForTimeout(400);
ok(await p.evaluate(() => document.getElementById("sheet").open) && (await p.textContent("#sheetTitle")) === "D/F♯", "tapping D/F# in the chart opens its shapes");
await p.keyboard.press("Escape");
await p.goto(BASE + "/theory"); await p.waitForTimeout(400);
await p.selectOption("#theoryType", "slash"); await p.waitForTimeout(150);
const slash = await p.locator("#diatonic .dia-name").allInnerTexts();
ok(slash.includes("D/F♯") && slash.includes("G/B") && slash.includes("Am/C"), "Theory lists slash chords of the key");
await p.selectOption("#theoryType", "walk"); await p.waitForTimeout(150);
ok((await p.locator("#diatonic .dia-name").allInnerTexts()).join(" ") === "G D/F♯ Em Em/D C G/B Am D", "walking bass line in G");
await p.click("#diatonic .dia >> nth=1"); await p.click("#theoryShapes"); await p.waitForTimeout(400);
ok((await p.textContent("#sheetTitle")) === "D/F♯", "See shapes opens the tapped chord");
await p.close();
p = await open("/theory");
{
  const w = p.locator('#circle [data-wedge][data-ring="major"][data-pc="9"]');
  const box = await w.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(600);
  const holding = await p.evaluate(() => document.getElementById("circle").classList.contains("holding"));
  await p.mouse.up(); await p.waitForTimeout(100);
  ok(holding && !(await p.evaluate(() => document.getElementById("circle").classList.contains("holding"))) && (await p.textContent(".hub-key")) === "A", "press and hold on a wedge keeps the chord sounding until release, and still picks the key");
  await p.click('#circle [data-wedge][data-ring="major"][data-pc="2"]'); await p.waitForTimeout(150);
  ok((await p.textContent(".hub-key")) === "D" && !(await p.evaluate(() => document.getElementById("circle").classList.contains("holding"))), "a quick tap plays a short chord and picks the key");
}
await p.close();

console.log("Play: every song chord, keyboard shortcuts, sustain, vocal warm-up and chord builder");
const many = ["C", "Cm", "C7", "D", "Dm", "D7", "E", "Em", "E7", "F", "Fm", "F7", "G", "Gm", "G7", "A", "Am", "A7", "B", "Bm", "B7", "Cmaj7", "Dmaj7", "Emaj7", "Fmaj7"];
p = await open("/play/piano", { songs: [{ id: "song-many-cccccc", title: "Many", body: many.join(" ") }] });
ok(await p.locator("#pianoPlayer .cp-chips .chip").count() === 25, "all 25 song chords listed (was capped at 18)");
ok(await p.isChecked("#pianoSustain"), "auto-sustain is enabled by default on piano");
// Computer keyboard plays virtual piano keys and names chords live
await p.keyboard.down("a"); await p.keyboard.down("d"); await p.keyboard.down("g"); await p.waitForTimeout(100);
ok((await p.textContent("#pianoReadout .ro-name")) === "C" && (await p.textContent("#pianoReadout .ro-notes")).includes("1–3–5"), "holding A+D+G on computer keyboard plays C4-E4-G4 and names C (1–3–5)");
await p.keyboard.up("a"); await p.keyboard.up("d"); await p.keyboard.up("g"); await p.waitForTimeout(80);
// Typing a custom chord in Play adds and selects it immediately
await p.fill('#pianoPlayer [data-role="add-chord"]', "Bbmaj9");
await p.press('#pianoPlayer [data-role="add-chord"]', "Enter"); await p.waitForTimeout(120);
ok((await p.textContent("#pianoReadout .ro-name")) === "B♭maj9", "typing Bbmaj9 in Play adds and plays it immediately");
ok(await p.locator('#pianoPlayer [data-role="beat"], #pianoPlayer [data-role="step-up"]').count() === 0, "the piano toolbar has no drum or half-step chips");
// Chord types: six everyday ones first, the rest behind More
await p.dispatchEvent('#pianoPlayer select[data-role="type"]', "mousedown"); await p.waitForTimeout(150);
ok(await p.locator(".ui-select-menu .ui-select-opt").count() === 8 && await p.locator(".ui-select-more").count() === 1, "the chord type menu shows song, all and six common types, with More");
await p.click(".ui-select-more"); await p.waitForTimeout(100);
ok(await p.locator(".ui-select-menu .ui-select-opt").count() === 17 && await p.locator(".ui-select-more").count() === 0, "More reveals every chord type");
await p.keyboard.press("Escape"); await p.waitForTimeout(100);
// Build chord mode on piano: tap D4, F4, A4, C5 -> auto-names Dm7
await p.click('#pianoPlayer [data-role="build"]'); await p.waitForTimeout(80);
await p.click('#pianoPlayer [data-role="clear-build"]').catch(() => {});
for (const m of [62, 65, 69, 72]) await p.click(`#piano .pk[data-midi="${m}"]`);
await p.waitForTimeout(120);
ok((await p.textContent("#pianoReadout .ro-name")) === "Dm7" && (await p.textContent("#pianoReadout .ro-notes")).includes("1–♭3–5–♭7"), "Build chord on piano stacks tapped notes and names Dm7 (1–♭3–5–♭7)");
await p.click('#pianoPlayer [data-role="save-built"]'); await p.waitForTimeout(120);
ok(await p.locator('#pianoPlayer .cp-chips [data-chord="Dm7"].on').count() === 1, "keeping a built chord adds and selects it in the player chips");
// Build chord mode on guitar: tap open/fretted C major shape and auto-name C
await p.click('button[data-inst="guitar"]'); await p.waitForTimeout(150);
await p.click('#guitarPlayer [data-role="build"]'); await p.waitForTimeout(80);
await p.click('#fretboard .fc[data-string="4"][data-fret="3"]');
await p.click('#fretboard .fc[data-string="3"][data-fret="2"]');
await p.click('#fretboard .fc[data-string="2"][data-fret="0"]');
await p.click('#fretboard .fc[data-string="1"][data-fret="1"]');
await p.waitForTimeout(120);
ok((await p.textContent("#guitarReadout .ro-name")) === "C", "Build chord on guitar pins one note per string and names C");
// Floating popover dropdown opens anchored over the card
await p.dispatchEvent("#tuningSelect", "mousedown"); await p.waitForTimeout(100);
ok(await p.locator(".ui-select-menu").isVisible(), "clicking a select opens an anchored floating option menu");
await p.click('.ui-select-menu .ui-select-opt[data-val="uke"]'); await p.waitForTimeout(120);
ok((await p.inputValue("#tuningSelect")) === "uke", "choosing an option in the floating menu updates the select and fretboard");
// Drum beat loops (3/4, 4/4, 6/8) & pads in Play -> Drums
await p.click('button[data-inst="drums"]'); await p.waitForTimeout(150);
ok(p.url().endsWith("/play/drums") && await p.isVisible("#drumPads") && !(await p.isVisible("#metroBtn")), "drums have their own tab and link");
await p.click("#drumBpmUp"); await p.waitForTimeout(60);
ok((await p.inputValue("#drumBpm")) === (await p.inputValue("#bpmInput")), "tempo on the drums tab stays in step with the metronome");
ok(await p.locator("#drumPads .drum-pad").count() === 8 && await p.locator("#loopRecBtn, #drumSteps").count() === 0, "8 drum pads rendered without complicated step grid or recorder");
await p.selectOption("#drumPreset", "3/4-waltz"); await p.waitForTimeout(100);
ok((await p.inputValue("#sigSelect")) === "3/4", "selecting a 3/4 drum groove syncs the time signature to 3/4");
await p.selectOption("#drumPreset", "6/8-ballad"); await p.waitForTimeout(100);
ok((await p.inputValue("#sigSelect")) === "6/8", "selecting a 6/8 drum groove syncs the time signature to 6/8");
await p.keyboard.press("q"); await p.waitForTimeout(60);
await p.click("#loopPlayBtn"); await p.waitForTimeout(120);
ok((await p.getAttribute("#loopPlayBtn", "aria-pressed")) === "true", "Drum beat loop starts and stops cleanly");
await p.click("#loopPlayBtn"); await p.waitForTimeout(80);
// Key finder & 1-7 keyboard chord shortcuts in Theory
await p.click('button.tab[data-view="tools"]'); await p.waitForTimeout(150);
await p.click('[data-open-tool="theory"]'); await p.waitForTimeout(150);
await p.fill("#keyFinderInput", "G D/F# Em C"); await p.waitForTimeout(120);
ok((await p.textContent("#keyFinderResult")).includes("G major") && (await p.textContent("#keyFinderResult")).includes("E minor"), "Key finder detects G major and relative E minor from typed chords");
await p.click("#keyFinderResult [data-use-key]"); await p.waitForTimeout(120);
ok((await p.textContent("#keyTitle")) === "G major", "tapping Select on Key finder sets the Circle of Fifths key");
await p.keyboard.press("6"); await p.waitForTimeout(100);
ok((await p.locator("#diatonic .dia.on .dia-name").textContent()) === "Em", "pressing 6 on the keyboard in Circle of Fifths plays and highlights the vi chord (Em)");
await p.keyboard.press("7"); await p.waitForTimeout(100);
ok((await p.locator("#diatonic .dia.on .dia-name").textContent()) === "F♯°", "pressing 7 on the keyboard in Circle of Fifths plays and highlights the vii° diminished chord (F♯°)");
// Import from a web link: Sonata reads the page through /api/import and fills the editor.
await p.route("**/api/import*", (route) => {
  const u = new URL(route.request().url()).searchParams.get("url") || "";
  if (u.includes("blocked")) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "blocked" }) });
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: "Goodness of God", artist: "Bethel Music", source: u, text: "Capo 1\n[Verse 1]\nG                 C\nI love You Lord\nG           D\nOh Your mercy never fails me" }) });
});
await p.click('button.tab[data-view="songs"]'); await p.waitForTimeout(150);
await p.click("#addLinksBtn"); await p.waitForTimeout(200);
ok((await p.textContent("#sheetTitle")).includes("Import"), "the Songs button opens Import");
await p.fill("#lkText", "https://chords.example-site.com/blocked-song"); await p.waitForTimeout(700);
ok((await p.textContent("#lkFound")).includes("copy the chords and paste them here"), "a site that blocks reading says so and offers paste");
await p.fill("#lkText", "https://chords.example-site.com/goodness-of-god"); await p.waitForTimeout(700);
ok((await p.textContent("#lkFound")).includes("Goodness of God") && (await p.textContent("#lkFound")).includes("Capo 1") && (await p.textContent(".import-preview")).includes("I love You Lord"), "a web link is read and previewed with title, capo and chart");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(400);
ok((await p.inputValue("#songTitle")) === "Goodness of God" && (await p.inputValue("#songBody")).includes("## Verse 1") && (await p.inputValue("#songBody")).includes("Oh Your mercy"), "Add opens the editor filled with the imported chart");
await p.goto(BASE + "/songs?text=" + encodeURIComponent("https://chords.example-site.com/goodness-of-god")); await p.waitForTimeout(1200);
ok(!p.url().includes("text=") && (await p.textContent("#lkFound")).includes("Goodness of God"), "sharing a link into Sonata opens Import with the chart read");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.click("#addLinksBtn"); await p.waitForTimeout(200);
await p.setInputFiles("#lkFile", { name: "song.cho", mimeType: "text/plain", buffer: Buffer.from("{title: Cornerstone}\n{artist: Hillsong}\n{key: C}\n{soc}\n[C]Christ alone, [F]cornerstone\n{eoc}") }); await p.waitForTimeout(500);
ok((await p.textContent("#lkFound")).includes("Cornerstone") && (await p.textContent("#lkFound")).includes("Hillsong"), "a ChordPro file is read into Import");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
// Smart raw chart + reference link analyzer in Add from links
await p.click('button.tab[data-view="songs"]'); await p.waitForTimeout(150);
await p.click("#addLinksBtn"); await p.waitForTimeout(200);
await p.fill("#lkText", "https://tabs.ultimate-guitar.com/tab/example\nTitle: Way Maker\nArtist: Sinach\n[Chorus]\nF  C  G  Am\nWay maker miracle worker");
await p.waitForTimeout(300);
ok((await p.textContent("#lkFound")).includes("Chart ready") && !(await p.textContent("#lkFound")).includes("undefined") && (await p.textContent("#lkFound")).includes("Way Maker"), "Add from links analyzes a reference URL + raw chord progression");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(200);
ok((await p.inputValue("#songTitle")) === "Way Maker", "clicking Add creates and opens the analyzed chart");
await p.close();

console.log("Share, QR and links");
p = await open("/editor");
await p.click("#shareSongBtn"); await p.waitForTimeout(700);
const qrText = await p.evaluate(async () => {
  const svg = document.querySelector(".qr-box svg"); const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(svg.outerHTML); await img.decode();
  const c = document.createElement("canvas"); c.width = c.height = 600; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 600, 600);
  return Array.from(g.getImageData(0, 0, 600, 600).data);
});
const read = jsQR(Uint8ClampedArray.from(qrText), 600, 600)?.data || "";
ok(/^HTTPS?:\/\/[A-Z0-9.]+:\d+\/Q\/[A-Z2-7]+$/.test(read), "on-screen QR scans and holds the compact upper-case link");
{
  // Tap the code: it fills the screen on white, and a tap puts it away.
  await p.click("#qrZoom"); await p.waitForTimeout(250);
  const z = await p.evaluate(() => { const el = document.getElementById("qrZoomed"); if (!el) return null; const r = el.getBoundingClientRect(), s = el.querySelector("svg").getBoundingClientRect(); return { full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, side: Math.round(s.width), fits: s.bottom <= innerHeight && s.right <= innerWidth, top: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest("#qrZoomed") !== null }; });
  ok(z && z.full && z.fits && z.top && z.side >= 500, `tapping the QR shows it large over everything (${z?.side}px)`);
  await p.click("#qrZoomed"); await p.waitForTimeout(200);
  ok(await p.locator("#qrZoomed").count() === 0 && await p.evaluate(() => document.getElementById("sheet").open), "tapping again closes the big code and leaves the share sheet open");
}
const p2 = await (await b.newContext()).newPage();
await p2.goto(read.replace(/^HTTPS?:\/\//, "http://")); await p2.waitForTimeout(700);
ok((await p2.inputValue("#songTitle")) === "Here I Am to Worship" && await p2.locator("#sharedBanner").isVisible(), "scanning the QR opens the song for a new person");
await p2.close();
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.click(".yt-chip"); await p.waitForTimeout(300);
ok((await p.getAttribute("#mediaPlayer iframe", "src") || "").startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "YouTube link plays inside Sonata (privacy-enhanced player)");
{
  const frameSrc = () => p.getAttribute("#mediaPlayer iframe", "src");
  const src0 = await frameSrc();
  ok(await p.locator(".yt-chip.on").count() === 1 && await p.evaluate(() => document.documentElement.classList.contains("mp-open")), "the link chip shows which video is loaded");
  // It keeps playing (same frame, not reloaded) while moving around the app.
  await p.evaluate(() => { document.querySelector("#mediaPlayer iframe").dataset.same = "1"; });
  await p.click('.tab[data-view="tools"]'); await p.waitForTimeout(150);
  await p.click('[data-open-tool="chords"]'); await p.waitForTimeout(500);
  await p.click('.tab[data-view="songs"]'); await p.waitForTimeout(400);
  ok(await p.locator('#mediaPlayer iframe[data-same="1"]').isVisible() && await frameSrc() === src0, "the video stays loaded while moving to Chords and Songs");
  await p.click("#mpSize"); await p.waitForTimeout(250);
  const mini = await p.evaluate(() => { const b = document.getElementById("mediaPlayer"), v = b.querySelector(".mp-video").getBoundingClientRect(), r = b.getBoundingClientRect(); return { mode: b.dataset.mode, vw: v.width, h: r.height, in: r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0 }; });
  ok(mini.mode === "mini" && mini.vw >= 150 && mini.h < 140 && mini.in && await p.locator('#mediaPlayer iframe[data-same="1"]').count() === 1, `mini player: small, on screen, same video (${Math.round(mini.vw)}px wide, ${Math.round(mini.h)}px tall)`);
  ok(await p.locator("#mpPlay").isVisible() && await p.locator("#mpClose").isVisible() && await p.locator("#mpSeek").isHidden(), "mini player keeps play, expand and close");
  ok(await p.locator("#mpBack").isVisible() && await p.locator("#mpFwd").isVisible() && /5 seconds/.test(await p.getAttribute("#mpBack", "aria-label") || ""), "mini player has back and forward 5 seconds");
  ok(await p.evaluate(() => { const box = document.getElementById("mediaPlayer").getBoundingClientRect(); return [...document.querySelectorAll("#mediaPlayer .mp-ctrl > *")].filter((b) => b.getBoundingClientRect().width).every((b) => { const r = b.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right + 0.5; }); }), "every mini player button sits inside the player");
  await p.click('.tab[data-view="editor"]'); await p.waitForTimeout(400);
  await p.locator("#songBody").click(); await p.keyboard.type(" "); await p.waitForTimeout(200);
  ok(await p.locator('#mediaPlayer iframe[data-same="1"]').count() === 1, "typing in the chart leaves the video alone");
  await p.reload(); await p.waitForTimeout(600); await p.click(".yt-chip"); await p.waitForTimeout(400);
  ok(await p.getAttribute("#mediaPlayer", "data-mode") === "mini", "the chosen size is remembered");
  await p.click("#mpSize"); await p.waitForTimeout(200);
  ok(await p.locator("#mpSeek").isVisible() && await p.locator("#mpRate").isVisible() && await p.locator("#mpBack").isVisible(), "full player has position, speed and skip controls");
  await p.click("#mpRate"); ok((await p.locator("#mpRate").innerText()).trim() === "0.75×", "speed steps to 0.75×");
  await p.click("#mpClose"); await p.waitForTimeout(200);
  ok(await p.locator("#mediaPlayer").count() === 0 && await p.locator(".yt-chip.on").count() === 0 && await p.evaluate(() => !document.documentElement.classList.contains("mp-open")), "player closes and the chip resets");
}
// Setlist → "Song links" message → paste into another browser → setlist rebuilt
await p.goto(BASE + "/songs"); await p.waitForTimeout(300);
await p.evaluate(() => { const s = window.__sonata.store; s.saveSetlist({ title: "Sunday Nov 9", items: s.songs.map((x) => ({ songId: x.id })) }); });
await p.click('[data-filter="setlists"]'); await p.click('[data-act="set-more"]'); await p.click('.menu-item[data-m="share"]'); await p.waitForTimeout(700);
await p.click("#shareSongLinks"); await p.waitForTimeout(400);
const msg = await p.evaluate(() => navigator.clipboard.readText());
ok(msg.startsWith("Setlist: Sunday Nov 9") && (msg.match(/\/share\/[^\s]+\?s=/g) || []).length === 2, "Song links copies one link per song");
await p.close();
p = await open("/songs", { songs: [] });
await p.click("#addLinksBtn"); await p.fill("#lkText", msg); await p.waitForTimeout(500);
ok((await p.textContent("#lkFound")).includes("Found 2 songs"), "pasted message is read");
ok((await p.inputValue("#lkSetTitle")) === "Sunday Nov 9", "setlist title comes from the message");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(500);
const lib = await p.evaluate(() => ({ songs: window.__sonata.store.songs.map((s) => s.title), sets: window.__sonata.store.setlists.map((s) => [s.title, s.items.length]) }));
ok(lib.songs.length === 2 && lib.sets[0]?.[0] === "Sunday Nov 9" && lib.sets[0][1] === 2, "songs and setlist rebuilt in the other Sonata");
await p.click("#addLinksBtn"); await p.fill("#lkText", msg); await p.waitForTimeout(400); await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(400);
ok(await p.evaluate(() => window.__sonata.store.songs.length) === 2, "importing the same message again doesn't duplicate songs");
await p.close();

console.log("Toasts");
p = await open("/songs");
await p.evaluate(() => { const { toast } = window.__sonata; toast("Long message", "info", { ms: 20000, action: "Do it", onAction() {} }); toast("Short", "success"); });
ok(await p.locator("#toasts .toast-close").count() === 1, "only a long message gets a close button");
await p.click("#toasts .toast-close"); await p.waitForTimeout(100);
ok(await p.locator('#toasts .toast:has-text("Long message")').count() === 0, "the close button removes the message");
await p.close();

console.log("Exports");
p = await open("/editor");
await p.click("#shareSongBtn"); await p.waitForTimeout(600);
let [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-export="pdf"]')]);
const pdf = require("node:fs").readFileSync(await dl.path(), "latin1");
ok(pdf.startsWith("%PDF") && pdf.includes("/FlateDecode"), "PDF downloads, compressed");
ok((await p.textContent("#pngShape")) === "9:16", "the PNG button shows the image shape (9:16)");
await p.selectOption("#exportOrientation", "landscape");
ok((await p.textContent("#pngShape")) === "16:9", "landscape switches the PNG shape to 16:9");
await p.selectOption("#exportOrientation", "portrait");
await p.click('[data-export="png"]'); await p.waitForTimeout(1500);
ok(await p.locator(".png-page img").count() === 1 && (await p.textContent("#sheetTitle")) === "Image preview" && await p.locator('#sheetFoot .btn.primary:has-text("Copy image")').count() === 1, "PNG export opens a preview with Copy image, Download and Back");
[dl] = await Promise.all([p.waitForEvent("download"), p.click('#sheetFoot .btn:has-text("Download")')]);
const png = require("node:fs").readFileSync(await dl.path());
ok(png.subarray(1, 4).toString() === "PNG" && png.length > 20000, "PNG downloads");
ok(png.readUInt32BE(16) === 2160 && png.readUInt32BE(20) === 3840, "a short chart makes one 9:16 phone-sized image (2160x3840)");
await p.close();
p = await open("/editor", { songs: [{ id: "song-feat-long00", title: "Long Song", body: "Verse:\nG        D/F#      Em        C\nHere I am to worship, here I am to bow down\n\n".repeat(30) }] });
await p.click("#shareSongBtn"); await p.waitForTimeout(600);
const pngPages = [];
p.on("download", (d) => pngPages.push(d));
await p.click('[data-export="png"]'); await p.waitForTimeout(3000);
ok(pngPages.length === 0 && await p.locator(".png-page img").count() >= 2 && await p.locator(".png-page [data-copy]").count() >= 2, "PNG export shows a preview of every page first, each with Copy image, and downloads nothing on its own");
await p.click(".png-page [data-copy]"); await p.waitForTimeout(600);
ok(await p.evaluate(async () => { const items = await navigator.clipboard.read(); return items.some((i) => i.types.includes("image/png")); }), "Copy image puts the PNG on the clipboard");
await p.click('#sheetFoot .btn:has-text("Download all")'); await p.waitForTimeout(2500);
const pngSizes = await Promise.all(pngPages.map(async (d) => { const f = require("node:fs").readFileSync(await d.path()); return `${f.readUInt32BE(16)}x${f.readUInt32BE(20)}`; }));
ok(pngPages.length >= 2 && pngPages[0].suggestedFilename() === "long-song-page-1.png" && pngSizes.every((x) => x === "2160x3840"), `a long chart exports one 9:16 image per page, all the same size (${pngPages.length} pages)`);
await p.close();

console.log("Song bank: musician");
const drive = { files: new Map(), perms: [], uploads: 0 };
const fakeDrive = async (page) => page.route("https://www.googleapis.com/**", async (route) => {
  const req = route.request(); const url = new URL(req.url()); const m = req.method();
  const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*" } });
  const id = (url.pathname.match(/files\/([^/?]+)/) || [])[1];
  if (url.pathname.includes("/permissions")) { drive.perms.push([m, id, req.postData()]); return json({ id: "anyoneWithLink" }); }
  if (url.pathname.startsWith("/upload")) { drive.uploads++; const body = (req.postData() || "").split("\r\n\r\n")[2]?.split("\r\n--")[0] || ""; const nid = id || ((req.postData() || "").includes("sonata_songbank.json") ? "bankfile-" + "x".repeat(24) : (req.postData() || "").includes("sonata_setlist_") ? "setfile-" + "z".repeat(24) : "libraryfile-" + "y".repeat(20)); drive.files.set(nid, body); return json({ id: nid }); }
  if (url.searchParams.get("alt") === "media") return json(JSON.parse(drive.files.get(id) || "{}"));
  if (id) return json(drive.files.has(id) ? { id, trashed: false, md5Checksum: "1", modifiedTime: "t" } : {});
  return json({ files: [...drive.files.keys()].filter((k) => !k.startsWith("setfile") && (!k.startsWith("bankfile") || url.searchParams.get("q")?.includes("songbank"))).map((x) => ({ id: x })) });
});
p = await open("/songs", { route: fakeDrive });
await p.evaluate(() => { sessionStorage.setItem("sonata_google_token", "tok"); sessionStorage.setItem("sonata_google_token_expiry", String(Date.now() + 3600000)); localStorage.setItem("sonata_user_profile", JSON.stringify({ email: "t@example.com" })); });
await p.reload(); await p.waitForTimeout(1500);
await p.click('[data-act="more"] >> nth=0'); await p.click('.menu-item[data-m="bank"]'); await p.waitForTimeout(300);
await p.click('[data-filter="bank"]'); await p.waitForTimeout(200);
ok(await p.locator(".row[data-id]").count() === 1 && await p.locator(".bank-card").isVisible(), "song menu adds a song to the bank; Song bank filter shows it");
await p.click('[data-act="bank"]'); await p.waitForTimeout(400);
await p.fill('[data-p="name"]', "Jethro"); await p.waitForTimeout(400);
ok((await p.textContent("#beCard .sc-name")) === "Jethro" && await p.locator('[data-s], #bePay, #bePhoto, #bankCardPng').count() === 0, "the header updates while you type; no social, payment, photo or card-image controls");
// Look and gigs: preset, accent, font, one upcoming gig (half-typed gigs are kept while editing)
await p.click('[data-preset="stage"]'); await p.waitForTimeout(200);
await p.evaluate(() => { const i = document.getElementById("beAccent"); i.value = "#e11d48"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.selectOption("#beFont", "classic");
const coverFile = await (async () => { const { PNG } = await import("./png.mjs"); return PNG(300, 100, (x, y) => (x + y) % 40 < 20); })();
await p.setInputFiles("#beCover", { name: "cover.png", mimeType: "image/png", buffer: coverFile }); await p.waitForTimeout(800);
ok(await p.locator("#beCard .sc-cover img").count() === 1 && (await p.getAttribute("#beCard .sc-cover img", "src")).startsWith("data:image/jpeg"), "a cover picture is resized and shown on the card");
await p.click("#beGigAdd"); await p.waitForTimeout(150);
await p.fill('[data-gk="date"]', "2099-01-05"); await p.fill('[data-gk="place"]', "Plaza Miranda"); await p.fill('[data-gk="url"]', "http://example.com/gig"); await p.waitForTimeout(200);
ok((await p.getAttribute("#beCard", "style")).includes("--bg:#0b0a07") && (await p.getAttribute("#beCard", "style")).includes("Iowan"), "the card preview shows the chosen look");
ok(await p.locator('[data-preset="stage"]').getAttribute("aria-pressed") === "true", "the chosen preset is marked");
await p.click("#bankPublish"); await p.waitForTimeout(1500);
const published = [...drive.files.entries()].find(([k]) => k.startsWith("bankfile"));
const bankJson = published ? JSON.parse(published[1]) : null;
ok(bankJson?.type === "sonata-bank" && bankJson.v === 4 && bankJson.songs.length === 1 && bankJson.name === "Jethro" && !("socials" in bankJson) && !("payments" in bankJson) && !("photo" in bankJson), "publishing writes the song list file without social, payment or photo fields");
ok(drive.perms.some(([m, , body]) => m === "POST" && body.includes('"type":"anyone"')), "the bank file (only) is shared as anyone-with-link");
ok((await p.inputValue("#bankLink")).endsWith("/bank/" + published?.[0] + "/jethro"), "public link shown, ending with the owner's name");
ok(bankJson?.theme?.preset === "stage" && bankJson.theme.accent === "#e11d48" && bankJson.theme.font === "classic" && bankJson.theme.cover?.startsWith("data:image/jpeg") && bankJson.gigs?.length === 1 && bankJson.gigs[0].place === "Plaza Miranda" && bankJson.gigs[0].url === "https://example.com/gig", "the look and the gig are published in the file (https link only)");
const libFile = [...drive.files.entries()].find(([k]) => !k.startsWith("bankfile"));
ok(!drive.perms.some(([, id]) => id === libFile?.[0]), "the private library file is never shared");
await p.close();

console.log("Song bank: listener");
const BANK = { type: "sonata-bank", v: 1, title: "Jethro's Song Bank", name: "Jethro", bio: "OPM and pop", socials: { facebook: "jethro.frane", instagram: "jethrofrane", tiktok: "jethrofrane", email: "j@example.com" }, payments: [{ label: "GCash", name: "J. F.", qr: "000201010211" }], updatedAt: "2026-11-09",
  theme: { preset: "stage", accent: "#e11d48", font: "classic", cover: "" }, gigs: [{ date: "2099-01-05", time: "19:30", place: "Plaza Miranda", note: "Acoustic set", url: "https://example.com/gig" }, { date: "2020-01-05", place: "Long ago" }],
  songs: [{ id: "a", t: "Buwan", a: "Juan Karlos", g: "OPM", k: "Am", b: "Am  F  C  G\nIkaw ang buwan" }, { id: "b", t: "Perfect", a: "Ed Sheeran", g: "Pop", k: "G" }, { id: "c", t: "Mundo", a: "IV of Spades", g: "OPM", k: "C" }] };
const BID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
p = await open(`/bank/${BID}`, { touch: true, viewport: { width: 390, height: 844 }, songs: [], route: (page) => page.route(`**/api/bank?id=${BID}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BANK) })) });
ok((await p.textContent("#bankHeading")) === "Jethro's Song Bank" && await p.locator(".bank-list .row").count() === 3, "listener sees the list");
await p.click('.bank-genres [data-genre="OPM"]'); await p.waitForTimeout(150);
ok(await p.locator(".bank-list .row").count() === 2, "genre filter");
await p.fill("#bankSearch", "mundo"); await p.waitForTimeout(150);
ok(await p.locator(".bank-list .row").count() === 1, "search");
await p.fill("#bankSearch", ""); await p.click('.bank-genres [data-genre=""]'); await p.waitForTimeout(150);
await p.click('.row[data-sid="a"] .row-main'); await p.waitForTimeout(300);
await p.click('[data-step="1"]'); await p.waitForTimeout(150);
ok((await p.locator(".bank-chart").innerText()).includes("A♯m") || (await p.locator(".bank-chart").innerText()).includes("Bbm"), "chart transposes for the listener");
ok(await p.locator("#sheetFoot .btn", { hasText: "Save to my songs" }).count() === 1 && await p.locator("#sheetFoot .btn", { hasText: "Done" }).count() === 1 && !(await p.locator("#sheetFoot").innerText()).includes("Request"), "the chart sheet offers Save and Done, not a request");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(300);
const txt = await p.locator("#bankBody").innerText();
ok(!/request/i.test(txt) && await p.locator("[data-bk=pick], .bank-bar").count() === 0, "the public page is view-only: no request buttons or wording");
ok(await p.locator(".bank-gigs .gig").count() === 1 && txt.includes("Plaza Miranda") && !txt.includes("Long ago"), "upcoming gigs show; past gigs are hidden");
ok(await p.locator('.bank-list .row[data-sid="b"] button').count() === 0 && await p.locator('.bank-list .row[data-sid="a"] button[data-bk="view"]').count() === 1, "only songs with a chart open; the others are plain rows");
const look = await p.evaluate(() => { const r = document.getElementById("view-bank"); const cs = getComputedStyle(r); return { themed: r.classList.contains("bank-themed"), bg: cs.getPropertyValue("--bg").trim(), font: cs.getPropertyValue("--ui").trim(), accent: cs.getPropertyValue("--accent").trim() }; });
ok(look.themed && look.bg === "#0b0a07" && look.font.includes("Iowan") && /^#[0-9a-f]{6}$/.test(look.accent), "the owner's look is applied to the public page");
ok(await p.locator('[data-bk="pay"], .bank-support, .sc-links, .sc-photo').count() === 0, "an older bank file opens without payment codes, social links or photo");
await p.close();
p = await open(`/bank/${BID}`, { songs: [], route: (page) => page.route("**/api/bank?**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"x"}' })) });
ok((await p.textContent("#bankBody")).includes("isn't available"), "a stopped or wrong list says so");
await p.close();
// A long name, title and bio must stay inside the header on a small phone.
const LONGBANK = { ...BANK, title: "Sunday Worship Team — Grace Fellowship Church Quezon City Music Ministry", name: "Grace Fellowship Church Music Ministry & Friends", bio: "We serve with worship every Sunday and weddings, debuts, birthdays and corporate events in Metro Manila and nearby provinces.", socials: { instagram: "gracefellowshipqcmusic", tiktok: "gracefellowshipqc", facebook: "gracefellowshipqc", youtube: "@gracefellowshipqc", website: "https://gracefellowshipqc.example.com/music-ministry", email: "musicministry@gracefellowshipqc.example.com" } };
for (const w of [360, 390]) {
  p = await open(`/bank/${BID}`, { touch: true, viewport: { width: w, height: 800 }, songs: [], route: (page) => page.route("**/api/bank?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LONGBANK) })) });
  const cut = await p.evaluate(() => { const c = document.querySelector(".sonata-card").getBoundingClientRect(); return [...document.querySelectorAll(".sonata-card .sc-name, .sonata-card .sc-title, .sonata-card .sc-bio, .sonata-card .sc-link")].filter((e) => e.getBoundingClientRect().right > c.right + 1).map((e) => e.className); });
  ok(cut.length === 0, `long card content stays inside the card at ${w}px${cut.length ? " (cut: " + cut.join(", ") + ")" : ""}`);
  await p.close();
}

console.log("Band sharing");
const { encodeShare } = await import("../js/core/share.js");
const SID = "1SeTlIsTfIlEiD0123456789abcdefghi";
let liveFile = { type: "sonata-set", v: 1, t: "Sunday Set", d: "", l: [], s: [{ t: "Song One", b: "G  C\nwords one", k: "G:major", i: "aaaaaaaaaa" }, { t: "Song Two", b: "D  A\nwords two", i: "bbbbbbbbbb" }] };
const libOf = (pg) => pg.evaluate(() => { window.__sonata.store.flush?.(); return { songs: window.__sonata.store.songs.map((x) => ({ t: x.title, b: x.body, tr: x.transpose, c: x.capo, o: x.origin })), sets: window.__sonata.store.setlists.map((x) => ({ t: x.title, n: x.items.length, source: x.source, liveId: x.liveId })) }; });
p = await open("/songs", { songs: [], route: (page) => page.route("**/api/set?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveFile) })) });
await p.goto(BASE + "/set/" + SID + "/sunday-set"); await p.waitForTimeout(1500);
ok((await p.textContent("#sheetBody, .sheet-body")).includes("Sunday Set") && (await p.textContent("#sheetBody, .sheet-body")).includes("live setlist") && !p.url().includes("/set/"), "a live setlist link opens the setlist with a note that it stays up to date");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(600);
let libNow = await libOf(p);
ok(libNow.songs.length === 2 && libNow.sets.length === 1 && libNow.sets[0].source === SID && libNow.songs.every((x) => x.o), "saving it adds the songs and a setlist that follows the link");
// The player picks their own key and capo; then the leader edits a chart, rewrites it in A, and adds a song.
await p.evaluate(() => { const st = window.__sonata.store; const mine = st.songs.find((x) => x.title === "Song One"); st.update(mine, { transpose: 2, capo: 3 }); });
liveFile = { ...liveFile, s: [{ t: "Song One", b: "A  D\nnew words one", k: "A:major", i: "aaaaaaaaaa" }, liveFile.s[1], { t: "Song Three", b: "E  B\nwords three", i: "cccccccccc" }] };
await p.goto(BASE + "/set/" + SID); await p.waitForTimeout(1500);
libNow = await libOf(p);
const songOne = libNow.songs.find((x) => x.t === "Song One");
ok(libNow.songs.length === 3 && libNow.sets.length === 1 && libNow.sets[0].n === 3, "opening the link again updates the same setlist and songs, with no duplicates");
ok(songOne?.b.includes("new words one") && songOne.c === 3 && songOne.tr === 0, `the updated chart keeps the player's sounding key (A) and capo (transpose ${songOne?.tr}, capo ${songOne?.c})`);
// A single song link to a newer version offers "Update my copy".
await p.goto(BASE + "/?s=" + await encodeShare({ t: "Song Two", b: "D  A\nnewer words two", i: "bbbbbbbbbb" })); await p.waitForTimeout(1200);
ok((await p.textContent("#saveSharedBtn")).includes("Update my copy"), "a link to a newer version of a saved song offers Update my copy");
await p.click("#saveSharedBtn"); await p.waitForTimeout(500);
libNow = await libOf(p);
ok(libNow.songs.length === 3 && libNow.songs.find((x) => x.t === "Song Two")?.b.includes("newer words two"), "Update my copy replaces the chart instead of adding a second song");
await p.close();
// A link that is no longer shared says so.
p = await open("/set/" + SID, { songs: [], route: (page) => page.route("**/api/set?**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"x"}' })) });
await p.waitForTimeout(800);
ok((await p.textContent("body")).includes("isn't shared any more"), "a live link that was stopped says so");
await p.close();
// Leader: publish a live link from the share sheet (fake Drive).
drive.files.clear(); drive.perms.length = 0;
p = await open("/songs", { route: fakeDrive });
await p.evaluate(() => { sessionStorage.setItem("sonata_google_token", "tok"); sessionStorage.setItem("sonata_google_token_expiry", String(Date.now() + 3600000)); localStorage.setItem("sonata_user_profile", JSON.stringify({ email: "t@example.com" })); const songs = JSON.parse(localStorage.getItem("sonata:v12:songs")); localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-live-1", title: "Friday Night", items: songs.map((x) => ({ songId: x.id })), date: "2026-11-13T00:00:00.000Z" }])); });
await p.reload(); await p.waitForTimeout(1500);
await p.click('[data-filter="setlists"]'); await p.waitForTimeout(200);
await p.click('[data-act="set-more"]'); await p.click('.menu-item[data-m="share"]'); await p.waitForTimeout(900);
await p.click("#liveStart"); await p.waitForTimeout(1500);
const liveSetFile = [...drive.files.entries()].find(([k]) => k.startsWith("setfile"));
const setJson = liveSetFile ? JSON.parse(liveSetFile[1]) : null;
ok(setJson?.type === "sonata-set" && setJson.t === "Friday Night" && setJson.s.length === 2 && setJson.s.every((x) => x.i), "Make a live link writes the setlist file to the leader's Drive, each song with its id");
ok(drive.perms.some(([m, id, body]) => m === "POST" && id === liveSetFile?.[0] && body.includes('"type":"anyone"')) && (await p.inputValue("#liveUrl")).includes("/set/" + liveSetFile?.[0] + "/friday-night"), "the file is shared by link and the live link is shown");
ok(!drive.perms.some(([, id]) => id?.startsWith("libraryfile")), "the private library file is still never shared");
await p.click("#liveStop"); await p.waitForTimeout(800);
ok(drive.perms.some(([m, id]) => m === "DELETE" && id === liveSetFile?.[0]) && await p.locator("#liveStart").count() === 1, "Stop sharing makes the file private again");
await p.close();

console.log("First run");
p = await open("/songs", { songs: [], touch: true, viewport: { width: 390, height: 844 } });
ok(await p.locator(".welcome-choice").count() === 3 && await p.locator(".welcome-steps").count() === 0 && (await p.locator(".welcome-choice").first().innerText()).includes("Import"), "an empty library offers three ways in, Import first, and no feature list");
const fits = await p.evaluate(() => [...document.querySelectorAll(".welcome-choice")].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44; }));
ok(fits, "the three choices fit a phone and are easy to tap");
await p.click('.welcome-choice[data-act="import"]'); await p.waitForTimeout(400);
ok((await p.textContent("#sheetTitle")).includes("Import") && await p.isVisible("#lkText"), "Import a song opens Import");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.close();
p = await open("/editor", { touch: true, viewport: { width: 390, height: 844 }, songs: [{ id: "song-feat-wide00", title: "Wide", body: "G            D/F#          Em7            C              G/B           Am7          Dsus4     D\nA very long line of words that runs well past the right edge of a phone screen for sure" }] });
// Phones open a song with a chart on View; editing starts with Edit.
await p.click('button[data-pane="edit"]'); await p.waitForTimeout(200);
ok(await p.locator(".pane-edit.more-right").count() === 1, "a long chord line shows the fade that says the editor scrolls sideways");
await p.evaluate(() => { const ta = document.getElementById("songBody"); ta.scrollLeft = ta.scrollWidth; ta.dispatchEvent(new Event("scroll")); }); await p.waitForTimeout(150);
ok(await p.locator(".pane-edit.more-right").count() === 0, "the fade goes away at the end of the line");
await p.click('.bottom-nav [data-view="songs"]'); await p.waitForTimeout(300);
ok(await p.evaluate(() => localStorage.getItem("sonata_persist_asked")) === "1", "with a real song saved, Sonata asks the browser to keep its storage");
await p.click('#settingsBtn, [aria-label="Settings"]'); await p.waitForTimeout(400);
ok(/saved on this device/.test(await p.textContent("#storageNote")), "Settings says where the songs are kept and whether they are safe");
await p.close();

console.log("Sounds");
p = await open("/songs");
const sampleReqs = [];
p.on("request", (r) => { if (r.url().includes("/samples/")) sampleReqs.push(new URL(r.url()).pathname); });
await p.goto(BASE + "/play/piano"); await p.waitForTimeout(1500);
const beforeSound = sampleReqs.filter((u) => u.includes("/piano/")).length;
ok(beforeSound > 0 && beforeSound <= 3 && sampleReqs.length <= 3, `opening the piano fetches a small starter set, not the whole bank (${beforeSound} piano files, ${sampleReqs.length} in all)`);
await p.locator('#piano .pk[data-midi="60"]').dispatchEvent("pointerdown"); await p.waitForTimeout(2500);
ok(sampleReqs.filter((u) => u.includes("/piano/")).length >= 12, "playing a note loads the rest of the piano in the background");
await p.click('[aria-label="Settings"]'); await p.waitForTimeout(400);
await p.click("#soundsBtn"); await p.waitForTimeout(6000);
const kept = await p.evaluate(async () => (await (await caches.open("sonata-samples")).keys()).length);
ok(kept === 50 && (await p.textContent("#soundsRow")).includes("work offline"), `Keep instrument sounds saves every sample for offline use (${kept} files)`);
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.click('[aria-label="Settings"]'); await p.waitForTimeout(600);
ok(await p.locator("#soundsBtn").count() === 0 && (await p.textContent("#soundsRow")).includes("work offline"), "Settings remembers that the sounds are already saved");
await p.close();

console.log("Help, tour and backup");
p = await open("/songs");
await p.click("#helpBtn"); await p.waitForTimeout(500);
ok((await p.textContent("#sheetTitle")) === "Help" && /On this screen: Songs/.test(await p.textContent(".help-here")), "the ? button opens Help with tips for the screen that is open");
ok(await p.locator(".help-topic").count() >= 8, "Help answers the common questions");
await p.click("#helpTour"); await p.waitForTimeout(500);
ok(await p.locator(".tour-card[role=dialog]").count() === 1 && /1 of 8/.test(await p.textContent("#tourCount")), "Help starts the guided tour");
ok(await p.evaluate(() => document.getElementById("app").inert === true && document.activeElement?.getAttribute("data-tour") === "next"), "during the tour the keyboard stays on the tour card");
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
ok(/2 of 8/.test(await p.textContent("#tourCount")) && await p.evaluate(() => { const h = document.querySelector(".tour-hole").getBoundingClientRect(); const t = document.querySelector(".page-actions").getBoundingClientRect(); return h.left <= t.left && h.right >= t.right && h.top <= t.top; }), "step 2 puts the spotlight on Import and New song");
for (let i = 0; i < 6; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(350); }
ok(/8 of 8/.test(await p.textContent("#tourCount")) && (await p.textContent('[data-tour="next"]')) === "Done", "the tour walks through all eight steps");
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
ok(await p.locator(".tour").count() === 0 && await p.evaluate(() => !document.getElementById("app").inert && localStorage.getItem("sonata_tour_seen") === "1"), "finishing the tour gives the app back and remembers it was seen");
await p.keyboard.press("?"); await p.waitForTimeout(500);
ok((await p.textContent("#sheetTitle")) === "Help", "the ? key opens Help");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.close();

// A first visit with an empty library: the tour opens the demo song so there is something to point at.
p = await open("/songs");
await p.evaluate(() => { localStorage.clear(); }); await p.goto(BASE + "/songs?tour=1"); await p.waitForTimeout(3200);
ok(await p.locator(".tour-card").count() === 1 && (await p.textContent('[data-tour="next"]')) === "Start tour", "a first visit is offered the tour (here forced with ?tour)");
await p.click('[data-tour="next"]'); await p.waitForTimeout(350); await p.click('[data-tour="next"]'); await p.waitForTimeout(500);
ok(await p.evaluate(() => window.__sonata.store.songs.length === 1 && window.__sonata.store.songs[0].title === "Auld Lang Syne"), "with no songs yet, the tour opens the demo song");
await p.click('[data-tour="skip"]'); await p.waitForTimeout(300);
ok(await p.locator(".tour").count() === 0, "Skip ends the tour at any step");
await p.close();

p = await open("/songs");
await p.evaluate(async () => { await new Promise((r) => { const q = indexedDB.deleteDatabase("sonata-backups"); q.onsuccess = q.onerror = q.onblocked = () => r(null); }); });
await p.click("#accountBtn"); await p.waitForTimeout(700);
ok((await p.textContent("#sheetTitle")) === "Backup & restore" && /on this device only/.test(await p.textContent(".bk-status")), "Back up opens one sheet that says plainly the songs are on this device only");
ok(await p.locator("#gSignIn").count() === 1 && await p.locator("#exportBackup").count() === 1 && await p.locator("#importBackup").count() === 1, "Google Drive, a backup file and restore are all in that one sheet");
const [bkDl] = await Promise.all([p.waitForEvent("download"), p.click("#exportBackup")]);
const backupText = require("node:fs").readFileSync(await bkDl.path(), "utf8");
const backup = JSON.parse(backupText);
ok(/^sonata-backup-\d{4}-\d\d-\d\d\.json$/.test(bkDl.suggestedFilename()) && backup.app === "sonata" && backup.songs.length === 2 && /^[0-9a-f]{64}$/.test(backup.checksum), "Save backup file downloads every song with a checksum");
await p.waitForTimeout(400);
ok(/up to date/.test(await p.textContent(".bk-status")), "after saving, the sheet says the backup file is up to date");
// Lose a song, then bring it back from the file.
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.evaluate(() => { const s = window.__sonata.store; s.deleteSongs([s.songs[0].id]); });
await p.click("#accountBtn"); await p.waitForTimeout(500);
ok(/Changes since/.test(await p.textContent(".bk-status")), "a change after the last backup file is called out");
await p.setInputFiles("#importBackup", { name: "sonata-backup.json", mimeType: "application/json", buffer: Buffer.from(backupText) }); await p.waitForTimeout(900);
ok(await p.evaluate(() => window.__sonata.store.songs.length) === 2, "restoring from the file brings the deleted song back");
ok(await p.locator(".bk-list li").count() >= 1 && /Before a restore/.test(await p.textContent(".bk-list")), "a restore point is kept before every restore");
// Go back to that restore point (the library with one song); songs are never removed by a restore.
await p.evaluate(() => { const s = window.__sonata.store; s.update(s.songs.find((x) => x.title === "Buwan"), { body: "wrecked by mistake" }); });
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.click("#accountBtn"); await p.waitForTimeout(500);
await p.click(".bk-list [data-snap]"); await p.waitForTimeout(400);
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(900);
ok(await p.evaluate(() => { const s = window.__sonata.store; return s.songs.length === 2 && s.songs.find((x) => x.title === "Buwan").body.startsWith("Am  F  C  G"); }), "an earlier version on this device restores a song that was changed by mistake");
await p.setInputFiles("#importBackup", { name: "notes.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "other", songs: [] })) }); await p.waitForTimeout(600);
ok(await p.evaluate(() => window.__sonata.store.songs.length) === 2, "a file that is not a Sonata backup is refused");
await p.close();

// Screens load when first opened, not with the app.
p = await open("/songs");
const loaded = () => p.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name.split("/").pop()).filter((n) => /\.js$/.test(n)));
const atStart = await loaded();
ok(!atStart.some((n) => /^(playview|audio|theory|stage|drive|help|backup)-/.test(n)), "Play, the audio engine, Theory, Stage, Drive, Help and Backup are not fetched on the first screen");
await p.click('.tabs [data-view="tools"]'); await p.waitForTimeout(150);
await p.click('[data-open-tool="play:piano"]'); await p.waitForTimeout(700);
ok((await loaded()).some((n) => /^playview-/.test(n)) && await p.locator("#piano .pk").count() > 20, "opening Play loads it and draws the piano");
await p.click('.tabs [data-view="editor"]'); await p.waitForTimeout(300);
await p.click("#presentBtn"); await p.waitForTimeout(700);
ok(await p.locator("#stage:not([hidden])").count() === 1 && /\/stage$/.test(new URL(p.url()).pathname), "Present loads the stage and opens it");
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
await p.close();

console.log("Add to setlist");
p = await open("/songs");
await p.click('.row[data-id="song-feat-bbbbbb"] [aria-label="More actions"]'); await p.waitForTimeout(250);
await p.click('[data-m="set"]'); await p.waitForTimeout(400);
ok((await p.textContent("#sheetTitle")) === "New setlist" && (await p.locator("#slItems .set-item").allTextContents()).join().includes("Buwan"), "with no setlists, Add to setlist starts a new one with the song in it");
await p.fill("#slTitle", "Gig"); await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(300);
await p.click('.row[data-id="song-feat-aaaaaa"] [aria-label="More actions"]'); await p.waitForTimeout(250);
await p.click('[data-m="set"]'); await p.waitForTimeout(400);
await p.click(".set-pick"); await p.waitForTimeout(800);
const sets = await p.evaluate(() => JSON.parse(localStorage.getItem("sonata:v12:setlists") || "[]").map((s) => s.items.map((i) => i.songId)));
ok(sets.length === 1 && sets[0].join() === "song-feat-bbbbbb,song-feat-aaaaaa", "picking a setlist adds the song at the end");
await p.click('.row[data-id="song-feat-aaaaaa"] [aria-label="More actions"]'); await p.waitForTimeout(250);
await p.click('[data-m="set"]'); await p.waitForTimeout(400);
ok(await p.locator(".set-pick:disabled").count() === 1, "a setlist that already has the song is marked and can't add it twice");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);

console.log("Page-turner keys on stage");
await p.close();
const LONG = Array.from({ length: 40 }, (_, i) => `G        D        Em       C\nLine ${i + 1} of a long song`).join("\n");
p = await open("/songs", { songs: [{ id: "song-feat-long00", title: "Long one", body: LONG }, SONGS[1]] });
await p.emulateMedia({ reducedMotion: "reduce" });
await p.evaluate(() => { localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-feat-pedal0", title: "Pedal", items: [{ songId: "song-feat-long00" }, { songId: "song-feat-bbbbbb" }], date: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }])); });
await p.reload(); await p.waitForTimeout(600);
await p.click('[data-filter="setlists"]'); await p.waitForTimeout(200);
await p.click('[data-act="set-play"]'); await p.waitForTimeout(700);
const scrollTop = () => p.evaluate(() => document.getElementById("stageScroll").scrollTop);
const top0 = await scrollTop();
await p.keyboard.press("PageDown"); await p.waitForTimeout(150);
const top1 = await scrollTop();
ok(top0 === 0 && top1 > 300 && (await p.textContent("#stageTitle")) === "Long one", `Page Down turns one screen (${top0} → ${top1})`);
await p.keyboard.press("PageUp"); await p.waitForTimeout(150);
ok(await scrollTop() === 0, "Page Up turns back");
for (let i = 0; i < 30 && (await p.textContent("#stageTitle")) === "Long one"; i++) { await p.keyboard.press("ArrowDown"); await p.waitForTimeout(100); }
ok((await p.textContent("#stageTitle")) === "Buwan", "at the end of a song the next press opens the next song in the setlist");
await p.keyboard.press("PageUp"); await p.waitForTimeout(200);
ok((await p.textContent("#stageTitle")) === "Long one", "at the top, Page Up goes back to the previous song");
await p.close();

console.log("Charts fit a phone's width");
{
  const WIDE = "## Verse\nG                   D\nShould old acquaintance be forgotten\n    G               C\nAnd never brought to mind";
  const broken = (sel) => p.evaluate((sel) => [...document.querySelectorAll(`${sel} .ln-pair`)].filter((l) => { const s = [...l.children]; return s.length > 1 && s.at(-1).offsetTop > s[0].offsetTop; }).length, sel);
  p = await open("/editor", { songs: [{ id: "song-feat-wide00", title: "Wide", body: WIDE }], viewport: { width: 360, height: 740 }, touch: true });
  ok(await p.locator("#preview .ln-pair").count() === 2 && await broken("#preview") === 0, "View on a phone: chord lines stay whole (the text fits the width)");
  await p.click("#presentBtn"); await p.waitForTimeout(500);
  ok(await broken("#stageChart") === 0 && Number.parseFloat(await p.evaluate(() => getComputedStyle(document.querySelector("#stageChart .seg-l")).fontSize)) >= 14, "Stage on a phone: chord lines stay whole, at 14px or more");
  await p.close();
}

console.log("Chords-only mode, quick switcher, margins & Drive setlist UX");
{
  p = await open("/editor");
  await p.click('[data-mode="chords-only"]'); await p.waitForTimeout(150);
  const pvText = await p.textContent("#preview");
  ok(pvText.includes("G") && pvText.includes("D/F#") && !pvText.includes("Light of the world"), "chords-only view shows chords without lyrics");
  await p.click("#preview .ch >> nth=0"); await p.waitForTimeout(350);
  ok(await p.evaluate(() => document.getElementById("sheet").open) && (await p.textContent("#sheetTitle")) === "G", "tapping a chord in chords-only view opens its chord shapes");
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);

  // Side margins on preview and stage
  const pvPad = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById("preview")); return parseFloat(cs.paddingLeft); });
  ok(pvPad >= 24, `preview has generous side margin (${pvPad}px)`);
  await p.click("#presentBtn"); await p.waitForTimeout(350);
  const stMargins = await p.evaluate(() => {
    const sc = getComputedStyle(document.getElementById("stageScroll"));
    return { scrollPad: parseFloat(sc.paddingLeft), mode: document.getElementById("stageMode").value, nextVis: !document.getElementById("stageNext").hidden };
  });
  ok(stMargins.scrollPad >= 28 && stMargins.mode === "chords-only" && stMargins.nextVis, `stage keeps chords-only mode, side margins (${stMargins.scrollPad}px) and prev/next song switching`);
  await p.click("#stageSwitchBtn"); await p.waitForTimeout(250);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.body.classList.contains("stage-open") && !document.getElementById("sheet").open), "Escape in Quick Song Switcher over Stage closes dialog without closing Stage");
  await p.click("#stageSwitchBtn"); await p.waitForTimeout(250);
  await p.fill("#swSearch", "Buwan"); await p.waitForTimeout(100);
  await p.press("#swSearch", "Enter"); await p.waitForTimeout(250);
  ok((await p.textContent("#stageTitle")) === "Buwan", "quick song switcher works right from Stage view");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);

  // Switch song button & Ctrl+K from non-editor tabs
  await p.click('.tab[data-view="tools"]'); await p.waitForTimeout(150);
  await p.keyboard.press("Control+k"); await p.waitForTimeout(250);
  ok(await p.locator(".sw-opt").count() >= 2, "Ctrl+K opens Quick Song Switcher from Tools");
  await p.click('.sw-opt:has-text("Here I Am to Worship")'); await p.waitForTimeout(200);
  ok((await p.inputValue("#songTitle")) === "Here I Am to Worship" && await p.evaluate(() => window.__sonata.app.view === "editor"), "clicking a song in switcher navigates to Chart editor in 1 tap");
  await p.click('[data-mode="chords"]');
  await p.click("#switchSongBtn"); await p.waitForTimeout(200);
  ok(await p.locator(".sw-opt").count() >= 2, "Switch button opens Quick Song Switcher");
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);

  // Setlist pill strip + desktop single-click peek preserves active setlist + setlist PNG export
  await p.evaluate(() => {
    const s = window.__sonata.store;
    const set = s.saveSetlist({ title: "Sunday Worship", items: s.songs.map((x) => ({ songId: x.id })) });
    s.playSetlist(set.id);
  });
  await p.waitForTimeout(250);
  await p.click('.tab[data-view="songs"]'); await p.waitForTimeout(150);
  await p.click('#libraryList .row[data-id] >> nth=1 >> [data-act="open"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => Boolean(window.__sonata.store.currentSetlist())), "single-click peek in library preserves active setlist");
  await p.click('.tab[data-view="editor"]'); await p.waitForTimeout(150);
  ok(await p.locator("#setlistStrip .setlist-pill").count() === 2, "setlist pill strip shows all songs for 1-tap switching");
  await p.click('#setlistStrip .setlist-pill >> nth=1'); await p.waitForTimeout(200);
  ok((await p.inputValue("#songTitle")) === "Buwan", "tapping a setlist pill switches directly to that song");
  await p.click("#shareSongBtn"); await p.waitForTimeout(400);
  await p.click('#sheet [data-export="png"]'); await p.waitForTimeout(1500);
  ok(await p.locator(".png-page img").count() >= 1 && (await p.textContent("#sheetTitle")) === "Image preview", "PNG export works for setlists and multi-song views");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);

  // Import from chord-site link with Chords-only toggle
  await p.route("**/api/import*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ title: "Oceans", artist: "Hillsong United", text: "[Verse 1]\nBm        A/C#      D\nYou call me out upon the waters\nA                 G\nThe great unknown where feet may fail" })
  }));
  await p.click('.tabs [data-view="songs"]'); await p.waitForTimeout(150);
  await p.click("#addLinksBtn"); await p.waitForTimeout(200);
  await p.fill("#lkText", "https://chords.example-site.com/oceans"); await p.waitForTimeout(600);
  await p.check("#lkChordsOnly"); await p.waitForTimeout(150);
  const preText = await p.textContent(".import-preview");
  ok(preText.includes("Bm") && preText.includes("A/C♯") && !preText.includes("waters"), "chord-site link import toggles cleanly to chords only without lyrics");
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(300);
  ok((await p.inputValue("#songTitle")) === "Oceans" && !(await p.inputValue("#songBody")).includes("waters"), "added chart from chord link saves without lyrics when Chords only is checked");
  await p.close();
}

console.log("v7.2.0 chord/key detection, Key & Capo overrides, copy & link import on phone + desktop");
{
  const shot1Body = "## Intro\nG - D\n\n## Verse\nG/// - D/F#/// - G/// - D///\n\n## Pre-Chorus\nG/// //// - D/F#/// ////\nG/// //// - Bm///- A///\n\n## Chorus\nD/// - G/// - Bm///\nEm/// - A///\n\n## Bridge\nG/// //// - D/F#/// ////\nG/// //// - Bm///- A///";
  const holyBody = "## Chorus\nBm   D/F#m   G   A   D\nDwell in us\nG   D/F#m\nWe believe";
  p = await open("/editor", {
    viewport: { width: 390, height: 844 },
    touch: true,
    songs: [
      { id: "song-shot1", title: "Glory Worship", body: shot1Body },
      { id: "song-shot2", title: "Holy Spirit", body: holyBody, links: [{ name: "Chord reference", url: "https://tabs.ultimate-guitar.com/tab/bryan-torwalt/holy-spirit-123" }] }
    ]
  });
  ok((await p.textContent("#keyPillValue")) === "D" && await p.locator('#metaChips [data-open-key="key"]').textContent().then((s) => s.includes("Key D")), "Screenshot 1 detects Key D (not G) and renders clickable Key chip");
  const chTexts = await p.locator("#preview .ch").allInnerTexts();
  ok(chTexts.includes("Bm") && chTexts.includes("A"), "Bm///- A/// line renders Bm and A as interactive chords");
  ok((await p.textContent(".view-mode .active")).trim() === "Chords" && await p.isVisible('#metaChips [data-open-key="capo"]'), "Capo chip is directly clickable below title on phone");
  // Click Capo chip -> opens Key & capo -> tap + Capo stepper twice -> sets Capo 2
  await p.click('#metaChips [data-open-key="capo"]'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => document.getElementById("sheet").open), "tapping Capo chip opens Key & capo sheet");
  await p.click('[data-capo="1"]'); await p.click('[data-capo="1"]'); await p.waitForTimeout(150);
  // Open #ksKey dropdown menu -> verify Major/Minor group headers
  await p.dispatchEvent("#ksKey", "mousedown"); await p.waitForTimeout(150);
  ok(await p.locator(".ui-select-menu .ui-select-group").count() === 2, "key selector renders Major and Minor group headers");
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(200);
  ok((await p.textContent('#metaChips [data-open-key="capo"]')).includes("Capo 2"), "Capo 2 stepper persists and updates Capo chip");

  // Song details includes Capo override & Key override
  await p.click("#detailsBtn"); await p.waitForTimeout(250);
  ok(await p.isVisible("#dCapo") && (await p.inputValue("#dCapo")) === "2", "Song details includes editable Capo field synced to Capo 2");
  await p.selectOption("#dKey", "E:major");
  await p.selectOption("#dCapo", "3");
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(250);
  ok((await p.textContent("#keyPillValue")) === "E" && (await p.textContent('#metaChips [data-open-key="capo"]')).includes("Capo 3"), "Song details overrides both Song Key and Capo");

  // Open Holy Spirit -> D/F#m detected as chord, link labeled Ultimate Guitar with 1-tap Copy button
  await p.click(".bn[data-view='songs']"); await p.waitForTimeout(150);
  await p.click('#libraryList .row[data-id="song-shot2"]'); await p.waitForTimeout(300);
  const holyCh = await p.locator("#preview .ch").allInnerTexts();
  ok(holyCh.some((x) => x.startsWith("D/F#")), "D/F#m line renders D/F# as interactive chord");
  ok((await p.textContent("#songLinks .link-chip")).includes("Ultimate Guitar") && await p.isVisible('#songLinks [data-copy-url]'), "imported UG link shows source name and 1-tap copy button");
  await p.click('#songLinks [data-copy-url]'); await p.waitForTimeout(150);
  ok((await p.evaluate(() => navigator.clipboard.readText())).includes("ultimate-guitar.com"), "1-tap link copy button copies reference URL");

  // Mobile Share snippet import + inline Key & Capo overrides inside Import
  await p.route("**/api/import*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ title: "Here Again", artist: "Elevation Worship", source: "https://tabs.ultimate-guitar.com/tab/elevation-worship/here-again", text: "Key: D\nCapo 2\nG   Am   F\n|1---2---3---4---|\nCan't go back to the beginning\nC   G\nYou hold me" })
  }));
  await p.click(".bn[data-view='songs']"); await p.waitForTimeout(150);
  await p.click("#addLinksBtn"); await p.waitForTimeout(200);
  await p.fill("#lkText", "Here Again Chords by Elevation Worship https://tabs.ultimate-guitar.com/tab/elevation-worship/here-again");
  await p.waitForTimeout(600);
  ok((await p.textContent("#lkFound")).includes("Here Again") && await p.isVisible("#lkKey") && await p.isVisible("#lkCapo"), "mobile Share snippet with prepended title auto-fetches URL and shows Key & Capo overrides");
  await p.selectOption("#lkCapo", "4"); await p.waitForTimeout(150);
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(300);
  ok((await p.textContent('#metaChips [data-open-key="capo"]')).includes("Capo 4") && (await p.textContent("#keyPillValue")) === "D" && !(await p.inputValue("#songBody")).includes("1---2---3---4"), "Import saves Key & Capo overrides cleanly without beat grid noise");
  await p.close();
}

console.log("v7.3.0 Auto-Format, About cleanup, Mood/Tone, Tools Hub mobile ergonomics, Live Setlist alert");
{
  // 1. Auto-Format + Undo & About without Bible verse & Mood in Song Details
  p = await open("/editor", { viewport: { width: 1280, height: 860 }, songs: [{ id: "song-v73-1", title: "Messy Chart", body: "" }] });
  const rawMessy = "D: xx0232\nVerse 1:\nG        D/F#m\n\nAmazing grace how sweet the sound that saved a wretch like me";
  await p.fill("#songBody", rawMessy); await p.waitForTimeout(150);
  await p.click("#autoFormatBtn"); await p.waitForTimeout(200);
  const formattedBody = await p.inputValue("#songBody");
  ok(formattedBody.includes("## Verse 1") && formattedBody.includes("D/F#") && !formattedBody.includes("D/F#m") && !formattedBody.includes("xx0232") && !formattedBody.includes("D/F#\n\nAmazing"), "#autoFormatBtn formats sections, repairs chords, strips legends, and collapses blank gaps");
  await p.click("#undoBtn"); await p.waitForTimeout(150);
  ok((await p.inputValue("#songBody")) === rawMessy, "#undoBtn restores original messy paste cleanly after Auto-Format");

  // About sheet contains no Bible verse
  await p.click("#settingsBtn"); await p.waitForTimeout(250);
  await p.click("#aboutBtn"); await p.waitForTimeout(250);
  const aboutText = await p.textContent("#sheetBody");
  ok(!/glory of the lord|corinthians/i.test(aboutText || ""), "About sheet contains no religious verse");
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);

  // Mood/Tone in Song Details -> saved, shown in Songs row, searchable
  await p.click("#detailsBtn"); await p.waitForTimeout(250);
  await p.fill("#dMood", "Joyful");
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(250);
  await p.click('.tabs button[data-view="songs"]'); await p.waitForTimeout(250);
  ok((await p.textContent('#libraryList .row[data-id="song-v73-1"]')).includes("Joyful"), "optional mood shows on song row when set");
  await p.fill("#librarySearch", "joyful"); await p.waitForTimeout(200);
  ok(await p.locator('#libraryList .row[data-id="song-v73-1"]').count() === 1, "Songs search matches optional mood field");
  await p.close();

  // 2. Tools Hub phone ergonomics (Chord Finder 6-col roots + Chord Builder link; Key Finder mobile first order)
  p = await open("/chords/G", { viewport: { width: 390, height: 844 }, touch: true });
  const rootCols = await p.evaluate(() => getComputedStyle(document.getElementById("chordRoots")).gridTemplateColumns.split(" ").filter(Boolean).length);
  ok(rootCols === 6, `Chord Finder uses 6-column root buttons on phone (got ${rootCols})`);
  await p.click('[data-open-builder="piano"]'); await p.waitForTimeout(450);
  ok(new URL(p.url()).pathname === "/play/piano" && await p.isVisible('#piano'), "Custom chord? Chord Builder button jumps straight to Play Piano");
  await p.goto(BASE + "/tools/key-finder"); await p.waitForTimeout(450);
  const kfOrder = await p.evaluate(() => {
    const layout = document.querySelector("#view-theory .theory-layout");
    const kp = document.querySelector("#view-theory .key-panel")?.getBoundingClientRect();
    const cp = document.querySelector("#view-theory .circle-wrap")?.getBoundingClientRect();
    return { cls: layout?.classList.contains("key-finder-first"), kpY: kp?.y ?? 9999, cpY: cp?.y ?? 0 };
  });
  ok(kfOrder.cls && kfOrder.kpY < kfOrder.cpY, "Key Finder places .key-panel above Circle of Fifths on mobile viewports");
  await p.close();

  // 3. Drive live setlist update notification banner on Stage
  const LSID = "1LiVeSeTCheck0123456789abcdefghij";
  let remoteCalls = 0;
  p = await open("/songs", {
    route: (page) => page.route("**/api/set?**", (route) => {
      remoteCalls++;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "sonata-set",
          v: 1,
          t: "Sunday Worship Live",
          d: "",
          l: [],
          s: [
            { t: "Here I Am to Worship", artist: "Tim Hughes", b: "G D/F# Em C\nLight of the world", i: "aaaa111122" },
            { t: "Brand New Opening Song", b: "C G Am F\nNew song added by leader", i: "new9999888" }
          ]
        })
      });
    })
  });
  await p.evaluate((lsid) => {
    const songs = JSON.parse(localStorage.getItem("sonata:v12:songs"));
    songs[0].origin = "aaaa111122";
    localStorage.setItem("sonata:v12:songs", JSON.stringify(songs));
    localStorage.setItem("sonata:v12:setlists", JSON.stringify([{
      id: "set-live-check",
      title: "Sunday Worship Live",
      source: lsid,
      items: [{ songId: songs[0].id }]
    }]));
  }, LSID);
  await p.reload(); await p.waitForTimeout(500);
  await p.click('[data-filter="setlists"]'); await p.waitForTimeout(200);
  await p.click('#libraryList .row[data-id="set-live-check"] [data-act="set-open"]'); await p.waitForTimeout(350);
  await p.click("#presentBtn"); await p.waitForTimeout(800);
  ok(remoteCalls >= 1 && (await p.textContent("#toasts")).includes("newer version"), "opening Stage on a followed Drive live setlist checks for updates and shows Update toast");
  await p.click("#toasts .toast-action"); await p.waitForTimeout(500);
  const afterSync = await p.evaluate(() => window.__sonata.store.setlists.find((x) => x.id === "set-live-check")?.items.length);
  ok(afterSync === 2, "clicking Update in live setlist toast syncs new songs from Drive setlist");
  await p.close();
}

console.log("\nv7.4.0 upgrades");
{
  const fs = await import("node:fs");
  // 1. Per-setlist key & capo overrides via Setlist Editor and Key Sheet without mutating base song
  p = await open("/songs");
  await p.evaluate(() => {
    const s = window.__sonata.store;
    const g = s.createSong({ title: "Grace Base G", manualKey: "G:major", capo: 0, body: "## Verse 1\nG   D/F#   Em   C\nAmazing grace" });
    const d = s.createSong({ title: "Corner Base D", manualKey: "D:major", capo: 0, body: "D  G  A\nChrist alone" });
    s.saveSetlist({ title: "Sunday Set Overrides", items: [{ songId: g.id }, { songId: d.id }] });
  });
  await p.click('[data-filter="setlists"]'); await p.waitForTimeout(200);
  await p.click('#libraryList .row:first-child [data-act="set-more"]'); await p.waitForTimeout(200);
  await p.click('#sheet [data-m="edit"]'); await p.waitForTimeout(250);
  await p.selectOption('#slItems [data-slot-key="0"]', "A:major");
  await p.selectOption('#slItems [data-slot-capo="0"]', "2");
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(250);
  await p.click('#libraryList .row:first-child [data-act="set-open"]'); await p.waitForTimeout(300);
  const pillKey = await p.textContent("#setlistStrip .setlist-pill.active small");
  const chipText = await p.textContent(".meta-chips");
  ok(pillKey?.trim() === "A" && chipText?.includes("Capo 2"), "setlist slot override shows Key A & Capo 2 in setlist strip and chart chips");

  // Open Key sheet inside active setlist: shows scope banner & edits only the slot
  await p.click('[data-open-key="key"]'); await p.waitForTimeout(200);
  ok((await p.textContent("#ksScope"))?.includes("Sunday Set Overrides"), "Key sheet shows setlist-only scope banner");
  await p.selectOption("#ksKey", "Bb:major"); await p.waitForTimeout(120);
  await p.selectOption("#ksCapo", "3"); await p.waitForTimeout(120);
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(200);
  const afterSlotState = await p.evaluate(() => {
    const s = window.__sonata.store;
    const base = s.songs.find((x) => x.title === "Grace Base G");
    const slot = s.activeSetlistEntry()?.item;
    return { baseKey: base?.manualKey, baseTr: base?.transpose, baseCapo: base?.capo, slotKey: slot?.key, slotCapo: slot?.capo };
  });
  ok(
    afterSlotState.baseKey === "G:major" && afterSlotState.baseTr === 0 && afterSlotState.baseCapo === 0
      && afterSlotState.slotKey === "Bb:major" && afterSlotState.slotCapo === 3,
    "setlist Key & Capo overrides update active setlist slot while leaving base song untouched"
  );

  // Share & export ChordPro (.cho) honors active setlist slot key/capo
  await p.click("#shareSongBtn"); await p.waitForTimeout(350);
  const expCount = await p.locator("#sheet [data-export]").count();
  const [choDl] = await Promise.all([
    p.waitForEvent("download", { timeout: 5000 }),
    p.click('#sheet [data-export="cho"]')
  ]);
  const choText = fs.readFileSync(await choDl.path(), "utf8");
  ok(
    expCount === 5 && /\.cho$/i.test(choDl.suggestedFilename())
      && choText.includes("{title: Grace Base G}")
      && choText.includes("{key: Bb}") && choText.includes("{capo: 3}")
      && choText.includes("{comment: Verse 1}"),
    "Share sheet has 5 export buttons and ChordPro (.cho) downloads valid ChordPro with slot key/capo"
  );
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);

  // Test Reset slot override button in Key sheet
  await p.click('[data-open-key="key"]'); await p.waitForTimeout(200);
  await p.click("#ksReset"); await p.waitForTimeout(150);
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(150);
  const resetSlot = await p.evaluate(() => window.__sonata.store.activeSetlistEntry()?.item);
  ok(!resetSlot?.key && resetSlot?.capo === undefined, "Use song default clears setlist slot key/capo override");
  await p.close();

  // 2. Blocked-site graceful fallback: Paste chart text -> Auto-Format + Open page link
  p = await open("/songs", {
    route: (page) => page.route("**/api/import*", (route) => route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked" })
    }))
  });
  await p.click("#addLinksBtn"); await p.waitForTimeout(200);
  await p.fill("#lkText", "https://tabs.ultimate-guitar.com/tab/blocked-example"); await p.waitForTimeout(700);
  const hasFallback = await p.isVisible("#lkPasteFormatBtn");
  const openHref = await p.getAttribute("#lkOpenSourceLink", "href");
  ok(hasFallback && openHref === "https://tabs.ultimate-guitar.com/tab/blocked-example", "blocked import renders 1-tap Paste chart text -> Auto-Format and Open page link");
  await p.evaluate(() => navigator.clipboard.writeText("Verse 1:\nG        D/F#m\nAmazing grace how sweet the sound\n\n[Chorus]\nEm  C  G  D\nMy chains are gone"));
  await p.click("#lkPasteFormatBtn"); await p.waitForTimeout(350);
  const prevText = await p.textContent(".import-preview");
  ok(prevText?.includes("## Verse 1") && !prevText.includes("D/F#m"), "1-tap Paste chart text -> Auto-Format pastes clipboard and cleans sections/chords");
  await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(250);
  const savedSong = await p.evaluate(() => window.__sonata.store.active());
  ok(
    savedSong?.body.includes("## Verse 1") && savedSong?.links?.some((l) => l.url === "https://tabs.ultimate-guitar.com/tab/blocked-example"),
    "saving formatted blocked fallback preserves cleaned body and original reference URL"
  );
  await p.close();
}

// ---------------------------------------------------------------------------
// 11. v7.5.0 Drive persistence + silent refresh, setlist sort/tags/favs,
//     rich status badges, pagination, Antigravity sidebar recent, and native context menus
// ---------------------------------------------------------------------------
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("v7.5.0: " + e.message));

  await p.route(/accounts\.google\.com\/gsi\/client|apis\.google\.com/, (r) => r.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
  await p.route(/googleapis\.com\/(drive|upload)/, (r) => r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "mock-drive-file", files: [] }),
  }));

  await p.goto(BASE + "/");
  // Seed expired localStorage Drive token and verify silent GIS prompt: "none" refresh recovers without annoying toast
  await p.evaluate(() => {
    localStorage.setItem("sonata_google_token", "expired-tok");
    localStorage.setItem("sonata_google_token_expiry", String(Date.now() - 60000));
    localStorage.setItem("sonata_user_profile", JSON.stringify({ name: "Jethro", email: "jethro@example.com" }));
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient({ callback, prompt }) {
            return {
              requestAccessToken(opts) {
                const effPrompt = opts?.prompt || prompt;
                window.__gisCalls = (window.__gisCalls || []).concat([{ prompt: effPrompt }]);
                if (effPrompt === "none") {
                  callback({ access_token: "fresh-silent-tok", expires_in: 3600 });
                }
              },
            };
          },
        },
      },
    };
  });
  await p.evaluate(async () => {
    const drive = await window.__sonata.loadDrive();
    drive.init();
    await drive.silentRefresh();
  });
  await p.waitForTimeout(150);
  const driveOk = await p.evaluate(() => ({
    tok: localStorage.getItem("sonata_google_token"),
    prompt: window.__gisCalls?.[0]?.prompt,
    toasts: document.getElementById("toasts")?.textContent || "",
  }));
  ok(
    driveOk.tok === "fresh-silent-tok" && driveOk.prompt === "none" && !driveOk.toasts.toLowerCase().includes("session expired"),
    "Drive silentRefresh renews token with prompt:'none' and persists to localStorage without annoying toast"
  );

  // Seed 16 songs & tagged favorite setlists for sorting, badges, pagination, sidebar recent & context menu
  await p.evaluate(() => {
    const now = Date.now();
    const songs = Array.from({ length: 16 }, (_, i) => ({
      id: `v75-s-${i}`,
      title: `V75 Song ${String(i).padStart(2, "0")}`,
      artist: i === 0 ? "Elevation Worship" : "Jet Music",
      key: i % 2 ? "G" : "C",
      bpm: i === 0 ? 72 : 0,
      capo: i === 0 ? 2 : 0,
      genre: i === 0 ? "Worship" : "Acoustic",
      mood: i === 0 ? "Reflective" : "",
      body: "C G Am F\nLine",
      pinned: i === 1,
      isFavorite: i === 0 || i === 1,
      inBank: i === 0 || i === 2,
      origin: i === 0 ? "https://sonata.jethrofrane.xyz/s/demo" : "",
      lastOpenedAt: new Date(now - i * 3600 * 1000 * 4).toISOString(),
      updatedAt: new Date(now - i * 3600 * 1000 * 4).toISOString(),
    }));
    localStorage.setItem("sonata:v12:bank", JSON.stringify({ fileId: "bank-live-file-0123456789abcdef" }));
    localStorage.setItem("sonata:v12:songs", JSON.stringify(songs));
    localStorage.setItem("sonata:v12:setlists", JSON.stringify([
      {
        id: "v75-set-church",
        title: "Sunday Morning Live",
        items: [{ songId: "v75-s-0" }, { songId: "v75-s-1" }],
        tags: ["Church", "Worship"],
        isFavorite: true,
        liveId: "live-set-file-0123456789abcdef",
        updatedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      },
      {
        id: "v75-set-gig",
        title: "Coffeehouse Gig",
        items: [{ songId: "v75-s-2" }],
        tags: ["Gig"],
        isFavorite: false,
        updatedAt: new Date(now - 72 * 3600 * 1000).toISOString(),
      },
    ]));
  });
  await p.goto(BASE + "/songs");
  await p.waitForTimeout(350);

  // Latest-to-oldest order & Drive localStorage survived reload!
  ok(
    await p.evaluate(() => localStorage.getItem("sonata_google_token") === "fresh-silent-tok"),
    "Drive token in localStorage survives full page reload"
  );
  const firstRowInfo = await p.evaluate(() => {
    const first = document.querySelector(".row[data-id]");
    const sub = first?.querySelector(".row-sub")?.textContent || "";
    const pills = first?.querySelector(".row-badges")?.textContent || "";
    return { id: first?.dataset.id, sub, pills, count: document.querySelectorAll(".row[data-id]").length };
  });
  ok(
    firstRowInfo.id === "v75-s-0" &&
      firstRowInfo.count === 12 &&
      firstRowInfo.sub.includes("Updated") &&
      firstRowInfo.pills.includes("Live") &&
      firstRowInfo.pills.includes("Shared"),
    "All tab defaults latest-to-oldest, paginates at 12 rows, and renders Updated + Live + Shared badges"
  );

  // Switch to Oldest sort
  await p.selectOption("#librarySort", "oldest");
  await p.waitForTimeout(150);
  ok(
    await p.evaluate(() => document.querySelector(".row[data-id]")?.dataset.id === "v75-s-15"),
    "Oldest sort puts oldest song first"
  );
  await p.selectOption("#librarySort", "recent");
  await p.waitForTimeout(150);

  // Sidebar Recent shows Pinned section + artist/status subtext + relative hours/days
  const sidebarOk = await p.evaluate(() => {
    const recent = document.getElementById("recentList");
    const txt = recent?.textContent || "";
    const pinnedRow = recent?.querySelector('.recent-row .recent-item[data-recent="v75-s-1"]');
    const liveRow = recent?.querySelector('.recent-row .recent-item[data-recent="v75-s-0"]');
    return Boolean(
      recent?.querySelector(".recent-group-label") &&
        pinnedRow &&
        liveRow &&
        liveRow.textContent.includes("Elevation Worship") &&
        liveRow.textContent.includes("Open") &&
        txt.includes("Live") &&
        /\d+\s*hours?\s*ago/i.test(txt)
    );
  });
  ok(sidebarOk, "Sidebar Recent shows Pinned group, artist/status subtext, and relative timestamps");

  // Favorites tab surfaces Favorite Setlists + Badges
  await p.click('[data-filter="favorites"]');
  await p.waitForTimeout(200);
  ok(
    await p.evaluate(() => Boolean(document.querySelector(".fav-sets-head")) && (document.getElementById("libraryList")?.textContent || "").includes("Sunday Morning Live")),
    "Favorites tab shows favorited setlists"
  );

  // Setlists tab: sort dropdown visible + tag filter chips + favorite star + rich badges
  await p.click('[data-filter="setlists"]');
  await p.waitForTimeout(200);
  const setTabOk = await p.evaluate(() => ({
    sortHidden: document.getElementById("librarySort").hidden,
    firstSet: document.querySelector(".set-row")?.dataset.id,
    hasChurchChip: Boolean(document.querySelector('.set-filter-bar [data-set-tag-filter="Church"]')),
    txt: document.getElementById("libraryList")?.textContent || "",
  }));
  ok(
    !setTabOk.sortHidden &&
      setTabOk.firstSet === "v75-set-church" &&
      setTabOk.hasChurchChip &&
      setTabOk.txt.includes("Live") &&
      setTabOk.txt.includes("Church"),
    "Setlists tab keeps sort dropdown visible, sorts latest-to-oldest, renders tag filters & Live/tag badges"
  );

  await p.click('.set-filter-bar [data-set-tag-filter="Gig"]');
  await p.waitForTimeout(150);
  ok(
    await p.evaluate(() => {
      const txt = document.getElementById("libraryList")?.textContent || "";
      return txt.includes("Coffeehouse Gig") && !txt.includes("Sunday Morning Live");
    }),
    "Setlist tag filter filters to matching tag"
  );

  // Setlist editor: custom tag chip + custom styled .select.set-slot-select
  await p.click("#newSetlistBtn");
  await p.waitForTimeout(250);
  await p.click('#slTagChips [data-set-tag="Performance"]');
  await p.fill("#slTitle", "Festival Set");
  await p.click('#slPool [data-add="v75-s-0"]');
  await p.waitForTimeout(100);
  ok(
    await p.evaluate(() => document.querySelectorAll("#slItems select.select.set-slot-select").length >= 2),
    "Setlist editor uses styled .select.set-slot-select dropdowns for per-slot key and capo"
  );
  await p.click("#sheet .sheet-foot button.primary");
  await p.waitForTimeout(250);
  ok(
    await p.evaluate(() => {
      const created = window.__sonata.store.setlists.find((x) => x.title === "Festival Set");
      return Boolean(created && created.tags?.includes("Performance"));
    }),
    "Setlist sheet saves selected preset Performance tag"
  );

  // Back to All -> hover actions & right-click native context menu
  await p.click('[data-filter="all"]');
  await p.waitForTimeout(200);
  await p.locator('.row[data-id="v75-s-0"]').dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 260 });
  await p.waitForTimeout(250);
  const ctxOk = await p.evaluate(() => {
    const m = document.querySelector(".ui-ctx-menu");
    return Boolean(m && m.textContent.includes("Present") && m.textContent.includes("Pin"));
  });
  ok(ctxOk, "Right-click opens native .ui-ctx-menu with Present & Pin actions");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  ok(await p.locator(".ui-ctx-menu").count() === 0, "Escape closes .ui-ctx-menu");

  await p.close();
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);
