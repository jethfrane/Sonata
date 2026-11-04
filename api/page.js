// Serves index.html for every app route (/song/…, /play/piano, /share/…) with
// per-page link-preview tags. Shared links (?s=) get the song's own title.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ORIGIN = "https://sonata.jethrofrane.xyz";
const OG = `${ORIGIN}/icons/og-image.png`;
const PAGES = {
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

function decodeShare(value) {
  try {
    if (String(value).length > MAX_LINK) return null;
    const bytes = Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    let text;
    try { text = zlib.inflateRawSync(bytes, { maxOutputLength: MAX_JSON }).toString("utf8"); } catch { text = bytes.length <= MAX_JSON ? bytes.toString("utf8") : "{}"; }
    return JSON.parse(text.replace(/^v\d\./, ""));
  } catch { return null; }
}

function describe(route, query) {
  const seg = route.split("/").filter(Boolean).map((x) => x.toLowerCase());
  if (query.s) {
    const d = decodeShare(query.s);
    if (d && typeof d.t === "string") {
      if (d.type === "set") return { title: `${clip(d.t, 60)} · Setlist`, desc: `A setlist of ${Array.isArray(d.s) ? d.s.length : 0} songs. Open it in Sonata to see the charts, transpose and present.`, robots: true };
      const k = typeof d.k === "string" ? d.k : "";
      const bits = [d.a ? `by ${clip(String(d.a), 40)}` : "", k ? `in ${clip(k.split(":")[0], 8)}${k.endsWith("minor") ? "m" : ""}` : ""].filter(Boolean).join(" ");
      return { title: clip(d.t, 70), desc: `Chord chart${bits ? " " + bits : ""}. Open it in Sonata to transpose, play along and present. Free, no account.`, robots: true };
    }
  }
  // Personal song pages hold nothing to index; keep search engines out of them.
  const personal = seg[0] === "song" || seg[0] === "s";
  let [a, b] = seg[0] === "song" ? [seg[2] || "editor", seg[3]] : [seg[0], seg[1]];
  if (a === "tools") a = "editor";
  if (a === "play" && PAGES[b]) return { title: PAGES[b][0], desc: PAGES[b][1], robots: personal };
  if (PAGES[a === "stage" ? "editor" : a]) {
    const p = PAGES[a === "stage" ? "editor" : a];
    return { title: a === "stage" ? "Stage view" : p[0], desc: a === "stage" ? "A big, clear chart for the stage with auto-scroll and a metronome." : p[1], robots: personal };
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
    const info = describe(route, query);
    let html = template;
    if (info) {
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
        `<meta property="og:image" content="${OG}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:url" content="${esc(canonical)}">`,
        `<meta property="og:type" content="website">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(title)}">`,
        `<meta name="twitter:description" content="${esc(info.desc)}">`,
        `<meta name="twitter:image" content="${OG}">`
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
