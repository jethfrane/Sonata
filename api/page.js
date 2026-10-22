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
  tools: ["Tools", "Transpose, capo, metronome, share and export your charts."],
  theory: ["Circle of fifths", "Explore keys and the chords that belong to them."],
  play: ["Piano, guitar and tuner", "Play chords on a piano or fretboard and tune your instrument."],
  piano: ["Piano", "Play scales and chords in any key on a piano."],
  guitar: ["Guitar fretboard", "See and hear scales and chords on a guitar, bass or ukulele."],
  tuner: ["Tuner", "Tune guitar, bass or ukulele with your phone microphone."]
};

let template = "";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function decodeShare(value) {
  try {
    const bytes = Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    let text;
    try { text = zlib.inflateRawSync(bytes).toString("utf8"); } catch { text = bytes.toString("utf8"); }
    return JSON.parse(text.replace(/^v\d\./, ""));
  } catch { return null; }
}

function describe(route, query) {
  const seg = route.split("/").filter(Boolean).map((x) => x.toLowerCase());
  if (query.s) {
    const d = decodeShare(query.s);
    if (d && typeof d.t === "string") {
      if (d.type === "set") return { title: `${clip(d.t, 60)} · Setlist`, desc: `A setlist of ${(d.s || []).length} songs. Open it in Sonata to see the charts, transpose and present.`, robots: true };
      const bits = [d.a ? `by ${clip(String(d.a), 40)}` : "", d.k ? `in ${String(d.k).split(":")[0]}${d.k.endsWith("minor") ? "m" : ""}` : ""].filter(Boolean).join(" ");
      return { title: clip(d.t, 70), desc: `Chord chart${bits ? " " + bits : ""}. Open it in Sonata to transpose, play along and present. Free, no account.`, robots: true };
    }
  }
  const [a, b] = seg[0] === "song" ? [seg[2] || "editor", seg[3]] : [seg[0], seg[1]];
  if (a === "play" && PAGES[b]) return { title: PAGES[b][0], desc: PAGES[b][1] };
  if (PAGES[a === "stage" ? "editor" : a]) {
    const p = PAGES[a === "stage" ? "editor" : a];
    return { title: a === "stage" ? "Stage view" : p[0], desc: a === "stage" ? "A big, clear chart for the stage with auto-scroll and a metronome." : p[1] };
  }
  return null;
}

export default function handler(req, res) {
  try {
    if (!template) template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
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
      html = html.replace(/<!--meta:start-->[\s\S]*?<!--meta:end-->/, `<!--meta:start-->\n  ${head}\n  <!--meta:end-->`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.status(200).send(html);
  } catch {
    res.status(500).send("Sonata is having trouble. Please reload.");
  }
}
