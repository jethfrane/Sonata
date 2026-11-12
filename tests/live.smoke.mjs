// Smoke test for a real deployment (preview or production).
//   BASE=https://sonata.jethrofrane.xyz node tests/live.smoke.mjs
//   SHARE=<Vercel share link> BASE=<preview url> node tests/live.smoke.mjs   (protected previews)
import { packSong, encodeShare, qrUrl } from "../js/core/share.js";
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "https://sonata.jethrofrane.xyz").replace(/\/$/, "");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };
if (process.env.SHARE) { await p.goto(process.env.SHARE); await p.waitForTimeout(800); }
else { await p.goto(BASE + "/songs"); await p.waitForTimeout(800); }

const head = async (path) => p.evaluate(async (u) => { const r = await fetch(u, { headers: { "user-agent": "facebookexternalhit/1.1" } }); return { status: r.status, html: await r.text() }; }, BASE + path);
const meta = (html, prop) => (html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)) || [])[1] || "";

const v = await p.evaluate(async (u) => (await (await fetch(u + "/version.json", { cache: "no-store" })).json()).version, BASE);
const want = JSON.parse((await import("node:fs")).readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
ok(v === want, `version.json is ${v} (this checkout is ${want})`);

for (const [path, title, img] of [["/chords", "Chord finder", "chords"], ["/chords/Am7-over-G", "Am7/G chord", "chords"], ["/theory", "Circle of fifths", "theory"], ["/play/tuner", "Tuner", "tuner"], ["/songs", "Songs", "songs"]]) {
  const r = await head(path);
  ok(r.status === 200 && meta(r.html, "og:title") === `${title} · Sonata` && meta(r.html, "og:image").endsWith(`/og/${img}.png`), `preview ${path}: ${meta(r.html, "og:title")}`);
}
const song = packSong({ title: "Here I Am to Worship", artist: "Tim Hughes", manualKey: "G:major", body: "G D/F# Em\nLight of the world" });
let r = await head(`/share/here-i-am?s=${await encodeShare(song)}`);
ok(meta(r.html, "og:title") === "Here I Am to Worship · Sonata" && /by Tim Hughes in G/.test(meta(r.html, "og:description")), "shared song preview");
const q = await qrUrl(BASE, song);
r = await head(q.slice(BASE.length));
ok(meta(r.html, "og:title") === "Here I Am to Worship · Sonata", "QR link preview");
const img = await p.evaluate(async (u) => { const x = await fetch(u + "/og/bank.png"); return [x.status, x.headers.get("content-type")]; }, BASE);
ok(img[0] === 200 && img[1] === "image/png", "preview images served");
const bank = await p.evaluate(async (u) => (await fetch(u + "/api/bank?id=notarealidnotarealid123")).status, BASE);
ok(bank === 404, "bank reader refuses an unknown id (404)");
const bad = await p.evaluate(async (u) => (await fetch(u + "/api/bank?id=../x")).status, BASE);
ok(bad === 400, "bank reader rejects a malformed id (400)");

await p.goto(q.replace(/^HTTPS:\/\/[^/]+/i, BASE)); await p.waitForTimeout(1200);
ok((await p.inputValue("#songTitle")) === "Here I Am to Worship", "QR link opens the song in the app");
await p.goto(BASE + "/chords/D-over-F%23"); await p.waitForTimeout(1200);
ok((await p.textContent(".cr-name")) === "D/F♯" && await p.locator('svg.chord-box[aria-label*="2 0 0 2 3 2"]').count() === 1, "Chords tab renders D/F# (200232)");
await p.goto(BASE + "/theory"); await p.waitForTimeout(800);
await p.selectOption("#theoryType", "slash"); await p.waitForTimeout(200);
ok((await p.locator("#diatonic .dia-name").count()) > 6, "Theory slash chords");
const csp = await p.evaluate(async (u) => (await fetch(u + "/songs")).headers.get("content-security-policy") || "", BASE);
ok(csp.includes("youtube-nocookie.com") && csp.includes("default-src 'self'"), "CSP allows the YouTube player only");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll on a phone");
console.log(`\n${pass} passed, ${fail} failed; page errors: ${errors.join(" | ") || "none"}`);
await b.close();
process.exit(fail || errors.length ? 1 : 0);
