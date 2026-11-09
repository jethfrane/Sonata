// Serves index.html for every app route (/song/…, /play/piano, /share/…, /q/…, /chords/…, /bank/…)
// with per-page link-preview tags and images. Shared links get the song's own title; a song bank
// link gets the Song Bank's name and size (read from their Drive at request time, not stored).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { loadBank } from "./bank.js";

const ORIGIN = "https://sonata.jethrofrane.xyz";
/** One preview image per kind of page (public/og/*.png, made by tests/og.mjs). */
const og = (name) => `${ORIGIN}/og/${name}.png`;
const PAGES = {
  chords: ["Chord finder", "Any chord with guitar, ukulele, bass and piano diagrams. Slash chords included."],
  songs: ["Songs", "Your chord charts and setlists in Sonata."],
  editor: ["Chart editor", "Write chords above lyrics, transpose and present."],
  metronome: ["Metronome", "A steady metronome with tap tempo and accents for 2/4 to 12/8."],
  theory: ["Circle of fifths", "Explore keys and the chords that belong to them."],
  play: ["Play", "Piano, fretboard, tuner and metronome for practice and rehearsal."],
  piano: ["Piano", "Play scales and chords in any key on a piano."],
  guitar: ["Guitar fretboard", "See and hear scales and chords on a guitar, bass or ukulele."],
  tuner: ["Tuner", "Tune guitar, bass or ukulele with your phone microphone."]
};

let template = "";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Caps match js/core/share.js: a crafted ?s= value can't make the function inflate gigabytes.
const MAX_LINK = 64 * 1024;
const MAX_JSON = 2 * 1024 * 1024;

/** v4 links are positional arrays: [4, title, body, key, capo, transpose, artist…] or [5, title, notes, links, songs]. */
function fromCompact(v) {
  if (!Array.isArray(v)) return v;
  if (v[0] === 4) return { t: v[1], b: v[2], k: v[3], a: v[6] };
  if (v[0] === 5) return { type: "set", t: v[1], s: Array.isArray(v[4]) ? v[4] : [] };
  return null;
}

function inflate(bytes) {
  try { return zlib.inflateRawSync(bytes, { maxOutputLength: MAX_JSON }).toString("utf8"); } catch { return bytes.length <= MAX_JSON ? bytes.toString("utf8") : "{}"; }
}

function decodeShare(value) {
  try {
    if (String(value).length > MAX_LINK) return null;
    const bytes = Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return fromCompact(JSON.parse(inflate(bytes).replace(/^v\d\./, "")));
  } catch { return null; }
}

/** The /q/<BASE32> form used in QR codes. */
function decodeQr(value) {
  try {
    if (String(value).length > MAX_LINK) return null;
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = String(value).toUpperCase().replace(/[^A-Z2-7]/g, "");
    const out = []; let bits = 0, v = 0;
    for (const ch of clean) { v = ((v << 5) | A.indexOf(ch)) & 0xffff; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
    return fromCompact(JSON.parse(inflate(Buffer.from(out))));
  } catch { return null; }
}

/** Title and description for a shared song or setlist. */
function sharedInfo(d) {
  if (!d || typeof d.t !== "string") return null;
  if (d.type === "set") return { title: `${clip(d.t, 60)} · Setlist`, desc: `A setlist of ${Array.isArray(d.s) ? d.s.length : 0} songs. Open it in Sonata to see the charts, transpose and present.`, robots: true, image: og("setlist") };
  const k = typeof d.k === "string" ? d.k : "";
  const bits = [d.a ? `by ${clip(String(d.a), 40)}` : "", k ? `in ${clip(k.split(":")[0], 8)}${k.endsWith("minor") ? "m" : ""}` : ""].filter(Boolean).join(" ");
  return { title: clip(d.t, 70), desc: `Chord chart${bits ? " " + bits : ""}. Open it in Sonata to transpose, play along and present. Free, no account.`, robots: true, image: og("song") };
}

/** A chord name from the address: /chords/Am7, /chords/D%2FF%23 or /chords/D-over-F%23. */
function chordFromPath(raw) {
  let name = "";
  try { name = decodeURIComponent(raw || ""); } catch { name = raw || ""; }
  name = name.replace(/-over-/i, "/").replace(/sharp/gi, "#").trim();
  return /^[A-G][#b]?[A-Za-z0-9#b+°ø()/-]{0,14}$/.test(name) ? name : "";
}

async function describe(route, query) {
  const rawSeg = route.split("/").filter(Boolean);
  const seg = rawSeg.map((x) => x.toLowerCase());
  if (query.s) { const info = sharedInfo(decodeShare(query.s)); if (info) return info; }
  if (seg[0] === "q" && rawSeg[1]) { const info = sharedInfo(decodeQr(rawSeg[1])); if (info) return info; }
  if (seg[0] === "bank" && rawSeg[1]) {
    // A public Song Bank: name and size, read from their Drive (not stored here).
    const r = await Promise.race([loadBank(rawSeg[1]), new Promise((ok) => setTimeout(() => ok({ status: 504 }), 2500))]);
    if (r.status === 200) {
      const b = r.bank;
      const gs = [...new Set(b.songs.map((x) => x.g).filter(Boolean))].slice(0, 4).join(", ");
      return { title: clip(b.title, 70), desc: `${b.songs.length} songs${gs ? ` · ${gs}` : ""}${b.name ? ` · ${clip(b.name, 40)}` : ""}. Find a song and send a request with Sonata.`, robots: true, image: og("bank") };
    }
    return { title: "Song Bank", desc: "A Song Bank on Sonata. Find a song, pick a key and send a request.", robots: true, image: og("bank") };
  }
  if (seg[0] === "chords") {
    const name = chordFromPath(rawSeg[1]);
    if (name) return { title: `${name} chord`, desc: `How to play ${name}: notes, guitar, ukulele and bass shapes, and piano keys. Tap to hear it.`, robots: false, image: og("chords") };
  }
  // Personal song pages hold nothing to index; keep search engines out of them.
  const personal = seg[0] === "song" || seg[0] === "s";
  let [a, b] = seg[0] === "song" ? [seg[2] || "editor", seg[3]] : [seg[0], seg[1]];
  if (a === "tools") a = "editor";
  if (a === "play" && PAGES[b]) return { title: PAGES[b][0], desc: PAGES[b][1], robots: personal, image: og(b) };
  if (PAGES[a === "stage" ? "editor" : a]) {
    const p = PAGES[a === "stage" ? "editor" : a];
    return { title: a === "stage" ? "Stage view" : p[0], desc: a === "stage" ? "A big, clear chart for the stage with auto-scroll and a metronome." : p[1], robots: personal, image: og(a === "stage" ? "stage" : a) };
  }
  return null;
}

/** The built page (dist/index.html has the hashed asset links). If the file wasn't bundled with
 * the function, fetch the static copy from this same deployment instead. @param {any} req */
async function readTemplate(req) {
  try { return fs.readFileSync(path.join(process.cwd(), "dist/index.html"), "utf8"); } catch { /* not bundled */ }
  // Only this deployment's own address: a forged Host header must never choose where the page comes from.
  const base = process.env.VERCEL_URL && /^[a-z0-9.-]+$/i.test(process.env.VERCEL_URL) ? `https://${process.env.VERCEL_URL}` : ORIGIN;
  const r = await fetch(`${base}/index.html`, { headers: { "x-sonata-template": "1" } });
  if (!r.ok) throw new Error(`index.html ${r.status}`);
  return r.text();
}

export default async function handler(req, res) {
  try {
    if (!template) template = await readTemplate(req);
    const url = new URL(req.url, ORIGIN);
    const route = "/" + (url.searchParams.get("p") || "").replace(/^\/+/, "");
    const query = { s: url.searchParams.get("s") || "" };
    const info = await describe(route, query);
    let html = template;
    if (!info) {
      // Not a page we describe (an unknown address): keep it out of search results. The home page stays indexable.
      if (route !== "/") html = html.replace("<!--meta:start-->", () => `<!--meta:start-->\n  <meta name="robots" content="noindex">`);
    } else {
      const title = `${info.title} · Sonata`;
      const canonical = ORIGIN + route.split("?")[0];
      const head = [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(info.desc)}">`,
        info.robots ? `<meta name="robots" content="noindex">` : "",
        `<link rel="canonical" href="${esc(canonical)}">`,
        `<meta property="og:site_name" content="Sonata">`,
        `<meta property="og:title" content="${esc(title)}">`,
        `<meta property="og:description" content="${esc(info.desc)}">`,
        `<meta property="og:image" content="${esc(info.image || og("home"))}">`,
        `<meta property="og:image:alt" content="${esc(info.title)} in Sonata">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:url" content="${esc(canonical)}">`,
        `<meta property="og:type" content="website">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(title)}">`,
        `<meta name="twitter:description" content="${esc(info.desc)}">`,
        `<meta name="twitter:image" content="${esc(info.image || og("home"))}">`
      ].filter(Boolean).join("\n  ");
      // A function replacement: a title such as "Cost $& more" must not be read as a $ pattern.
      html = html.replace(/<!--meta:start-->[\s\S]*?<!--meta:end-->/, () => `<!--meta:start-->\n  ${head}\n  <!--meta:end-->`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.status(200).send(html);
  } catch {
    res.status(500).send("Sonata is having trouble. Please reload.");
  }
}
