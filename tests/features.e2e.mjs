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

console.log("Play: every song chord");
const many = ["C", "Cm", "C7", "D", "Dm", "D7", "E", "Em", "E7", "F", "Fm", "F7", "G", "Gm", "G7", "A", "Am", "A7", "B", "Bm", "B7", "Cmaj7", "Dmaj7", "Emaj7", "Fmaj7"];
p = await open("/play/piano", { songs: [{ id: "song-many-cccccc", title: "Many", body: many.join(" ") }] });
ok(await p.locator("#pianoPlayer .cp-chips .chip").count() === 25, "all 25 song chords listed (was capped at 18)");
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
await p.close();

console.log("Song bank: musician");
const drive = { files: new Map(), perms: [], uploads: 0 };
const fakeDrive = async (page) => page.route("https://www.googleapis.com/**", async (route) => {
  const req = route.request(); const url = new URL(req.url()); const m = req.method();
  const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o), headers: { "access-control-allow-origin": "*" } });
  const id = (url.pathname.match(/files\/([^/?]+)/) || [])[1];
  if (url.pathname.includes("/permissions")) { drive.perms.push([m, id, req.postData()]); return json({ id: "anyoneWithLink" }); }
  if (url.pathname.startsWith("/upload")) { drive.uploads++; const body = (req.postData() || "").split("\r\n\r\n")[2]?.split("\r\n--")[0] || ""; const nid = id || "bankfile-" + "x".repeat(24); drive.files.set(nid, body); return json({ id: nid }); }
  if (url.searchParams.get("alt") === "media") return json(JSON.parse(drive.files.get(id) || "{}"));
  if (id) return json(drive.files.has(id) ? { id, trashed: false, md5Checksum: "1", modifiedTime: "t" } : {});
  return json({ files: [...drive.files.keys()].filter((k) => !k.startsWith("bankfile") || url.searchParams.get("q")?.includes("songbank")).map((x) => ({ id: x })) });
});
p = await open("/songs", { route: fakeDrive });
await p.evaluate(() => { sessionStorage.setItem("sonata_google_token", "tok"); sessionStorage.setItem("sonata_google_token_expiry", String(Date.now() + 3600000)); localStorage.setItem("sonata_user_profile", JSON.stringify({ email: "t@example.com" })); });
await p.reload(); await p.waitForTimeout(1500);
await p.click('[data-act="more"] >> nth=0'); await p.click('.menu-item[data-m="bank"]'); await p.waitForTimeout(300);
await p.click('[data-filter="bank"]'); await p.waitForTimeout(200);
ok(await p.locator(".row[data-id]").count() === 1 && await p.locator(".bank-card").isVisible(), "song menu adds a song to the bank; Song bank filter shows it");
await p.click('[data-act="bank"]'); await p.waitForTimeout(400);
await p.fill('[data-p="name"]', "Jethro"); await p.fill('[data-c="whatsapp"]', "+63 917 000 0000");
await p.click("#bankPublish"); await p.waitForTimeout(1500);
const published = [...drive.files.entries()].find(([k]) => k.startsWith("bankfile"));
const bankJson = published ? JSON.parse(published[1]) : null;
ok(bankJson?.type === "sonata-bank" && bankJson.songs.length === 1 && bankJson.name === "Jethro" && bankJson.contacts.whatsapp === "+639170000000", "publishing writes the bank file to the musician's Drive");
ok(drive.perms.some(([m, , body]) => m === "POST" && body.includes('"type":"anyone"')), "the bank file (only) is shared as anyone-with-link");
ok((await p.inputValue("#bankLink")).endsWith("/bank/" + published?.[0]), "public link shown");
const libFile = [...drive.files.entries()].find(([k]) => !k.startsWith("bankfile"));
ok(!drive.perms.some(([, id]) => id === libFile?.[0]), "the private library file is never shared");
await p.close();

console.log("Song bank: listener");
const BANK = { type: "sonata-bank", v: 1, title: "Jethro's busking list", name: "Jethro", bio: "OPM and pop", contacts: { whatsapp: "+639170000000", email: "j@example.com" }, updatedAt: "2026-11-09",
  songs: [{ id: "a", t: "Buwan", a: "Juan Karlos", g: "OPM", k: "Am", b: "Am  F  C  G\nIkaw ang buwan" }, { id: "b", t: "Perfect", a: "Ed Sheeran", g: "Pop", k: "G" }, { id: "c", t: "Mundo", a: "IV of Spades", g: "OPM", k: "C" }] };
const BID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
p = await open(`/bank/${BID}`, { touch: true, viewport: { width: 390, height: 844 }, songs: [], route: (page) => page.route(`**/api/bank?id=${BID}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BANK) })) });
ok((await p.textContent("#bankHeading")) === "Jethro's busking list" && await p.locator(".bank-list .row").count() === 3, "listener sees the list");
await p.click('.bank-genres [data-genre="OPM"]'); await p.waitForTimeout(150);
ok(await p.locator(".bank-list .row").count() === 2, "genre filter");
await p.fill("#bankSearch", "mundo"); await p.waitForTimeout(150);
ok(await p.locator(".bank-list .row").count() === 1, "search");
await p.fill("#bankSearch", ""); await p.click('.bank-genres [data-genre=""]'); await p.waitForTimeout(150);
await p.click('.row[data-sid="a"] .row-main'); await p.waitForTimeout(300);
await p.click('[data-step="1"]'); await p.waitForTimeout(150);
ok((await p.locator(".bank-chart").innerText()).includes("A♯m") || (await p.locator(".bank-chart").innerText()).includes("Bbm"), "chart transposes for the listener");
await p.click("#sheetFoot .btn.primary"); await p.waitForTimeout(400);
ok((await p.textContent("#sheetTitle")) === "Send request", "Request in this key opens the request sheet");
await p.fill("#rqFrom", "Ana");
const [popup] = await Promise.all([p.waitForEvent("popup").catch(() => null), p.click('[data-go="whatsapp"]')]);
const wa = popup ? (await popup.waitForURL(/wa\.me|whatsapp/, { timeout: 5000 }).catch(() => {}), popup.url()) : "";
if (process.env.DEBUG) console.log("popup:", wa);
const waText = decodeURIComponent(wa.replace(/\+/g, " "));
ok(/(wa\.me\/|phone=)639170000000/.test(wa) && waText.includes("Song request from Ana") && waText.includes("Buwan (Juan Karlos) in B♭m"), "WhatsApp opens with the request written");
await p.close();
p = await open(`/bank/${BID}`, { songs: [], route: (page) => page.route("**/api/bank?**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"x"}' })) });
ok((await p.textContent("#bankBody")).includes("isn't available"), "a stopped or wrong list says so");
await p.close();

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);
