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
ok(await p.locator(".ui-select-drawer .ui-select-opt").count() === 8 && await p.locator(".ui-select-more").count() === 1, "the chord type menu shows song, all and six common types, with More");
await p.click(".ui-select-more"); await p.waitForTimeout(100);
ok(await p.locator(".ui-select-drawer .ui-select-opt").count() === 17 && await p.locator(".ui-select-more").count() === 0, "More reveals every chord type");
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
// In-interface dropdown opens inline inside the card
await p.dispatchEvent("#tuningSelect", "mousedown"); await p.waitForTimeout(100);
ok(await p.locator(".ui-select-drawer").isVisible(), "clicking a select opens an in-interface option drawer");
await p.click('.ui-select-drawer .ui-select-opt[data-val="uke"]'); await p.waitForTimeout(120);
ok((await p.inputValue("#tuningSelect")) === "uke", "choosing an option in the inline drawer updates the select and fretboard");
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
await p.click('button.tab[data-view="theory"]'); await p.waitForTimeout(150);
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
ok(/^HTTPS?:\/\/127\.0\.0\.1:5391\/Q\/[A-Z2-7]+$/.test(read), "on-screen QR scans and holds the compact upper-case link");
const p2 = await (await b.newContext()).newPage();
await p2.goto(read.replace(/^HTTPS?:\/\//, "http://")); await p2.waitForTimeout(700);
ok((await p2.inputValue("#songTitle")) === "Here I Am to Worship" && await p2.locator("#sharedBanner").isVisible(), "scanning the QR opens the song for a new person");
await p2.close();
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.click(".yt-chip"); await p.waitForTimeout(300);
ok((await p.getAttribute("#ytPlayer iframe", "src") || "").startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "YouTube link plays inside Sonata (privacy-enhanced player)");
await p.click("#ytClose"); ok(await p.locator("#ytPlayer").isHidden(), "player closes");
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

console.log("Exports");
p = await open("/editor");
await p.click("#shareSongBtn"); await p.waitForTimeout(600);
let [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-export="pdf"]')]);
const pdf = require("node:fs").readFileSync(await dl.path(), "latin1");
ok(pdf.startsWith("%PDF") && pdf.includes("/FlateDecode"), "PDF downloads, compressed");
[dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-export="png"]')]);
const png = require("node:fs").readFileSync(await dl.path());
ok(png.subarray(1, 4).toString() === "PNG" && png.length > 20000, "PNG downloads");
ok(png.readUInt32BE(16) === 2160 && png.readUInt32BE(20) < 2880, "a short chart makes one image, cropped to the chart");
await p.close();
p = await open("/editor", { songs: [{ id: "song-feat-long00", title: "Long Song", body: "Verse:\nG        D/F#      Em        C\nHere I am to worship, here I am to bow down\n\n".repeat(30) }] });
await p.click("#shareSongBtn"); await p.waitForTimeout(600);
const pngPages = [];
p.on("download", (d) => pngPages.push(d));
await p.click('[data-export="png"]'); await p.waitForTimeout(3000);
const pngSizes = await Promise.all(pngPages.map(async (d) => { const f = require("node:fs").readFileSync(await d.path()); return `${f.readUInt32BE(16)}x${f.readUInt32BE(20)}`; }));
ok(pngPages.length >= 2 && pngPages[0].suggestedFilename() === "long-song-page-1.png" && pngSizes.every((x) => x === "2160x2880"), `a long chart exports one image per page, all the same size (${pngPages.length} pages)`);
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

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);
