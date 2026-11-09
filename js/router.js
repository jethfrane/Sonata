// @ts-check
// Pure URL helpers: every section, song, stage and instrument has its own path.
//   /songs  /chords  /chords/<chord>  /theory  /play  /play/piano|guitar|tuner|metronome   (old /tools links open the chart)
//   /bank/<drive file id>   a public Song Bank      /q/<CODE>   a song or setlist from a QR code
//   /song/<slug>  /song/<slug>/stage  /song/<slug>/play/piano
// A song's slug is its title plus the tail of its id. The tail is what we look
// up, so a link keeps working after the song is renamed.

export const SECTIONS = ["songs", "editor", "chords", "theory", "play", "bank"];
export const INSTRUMENTS = ["piano", "guitar", "tuner", "metronome"];

/** @param {string} s */
export function slugify(s) {
  return String(s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** @param {string} id */
const tail = (id) => String(id).replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase();

/** @param {{ id: string, title: string }} song */
export const songSlug = (song) => `${slugify(song.title) || "song"}-${tail(song.id)}`;

/** @template {{ id: string }} T @param {T[]} songs @param {string} slug @returns {T|undefined} */
export function findSong(songs, slug) {
  const want = String(slug).slice(-6).toLowerCase();
  return songs.find((s) => tail(s.id) === want);
}

/**
 * @param {string} pathname
 * @returns {{ view: string, slug: string, sub: string, stage: boolean, raw: string }}
 * `raw` keeps the case of the second part (chord names, Drive ids and QR codes need it).
 */
export function parsePath(pathname) {
  // A malformed escape such as %E0%A4 must not break the app: use the raw text instead.
  const decode = (/** @type {string} */ x) => { try { return decodeURIComponent(x); } catch { return x; } };
  const rawSeg = pathname.split("/").filter(Boolean).map(decode);
  const seg = rawSeg.map((x) => x.toLowerCase());
  if (seg[0] === "q" || seg[0] === "bank" || seg[0] === "chords") {
    return { view: seg[0] === "q" ? "q" : seg[0], slug: "", sub: "", stage: false, raw: (rawSeg[1] || "").replace(/-over-/i, "/") };
  }
  let slug = "";
  if (seg[0] === "song" || seg[0] === "s") { slug = seg[1] || ""; seg.splice(0, 2); }
  let view = seg[0] || (slug ? "editor" : "");
  if (view === "library") view = "songs";
  if (view === "instruments") view = "play";
  if (view === "tools" || view === "chart") view = "editor";
  if (view === "metronome") { view = "play"; seg[1] = "metronome"; }
  const stage = view === "stage";
  if (stage) view = "editor";
  const sub = stage ? "" : seg[1] || "";
  return { view, slug, sub, stage, raw: "" };
}

/**
 * @param {{ view: string, song?: { id: string, title: string }|null, sub?: string, stage?: boolean }} r
 */
export function buildPath(r) {
  const song = r.song;
  if (r.stage) return song ? `/song/${songSlug(song)}/stage` : "/stage";
  if (r.view === "editor") return song ? `/song/${songSlug(song)}` : "/editor";
  if (r.view === "play") return `/play${r.sub ? `/${r.sub}` : ""}`;
  // Chord names keep their case; "/" in a slash chord is written "-over-" so the path stays one segment.
  if (r.view === "chords") return r.sub ? `/chords/${encodeURIComponent(r.sub.replace("/", "-over-"))}` : "/chords";
  if (r.view === "bank") return r.sub ? `/bank/${r.sub}` : "/songs";
  return `/${r.view}`;
}

/** Page title and description per route (also mirrored by api/page.js). */
export const PAGE_META = {
  songs: ["Songs", "Your chord charts and setlists."],
  editor: ["Chart editor", "Write and transpose a chord chart."],
  theory: ["Circle of fifths", "Explore keys and the chords that belong to them."],
  chords: ["Chords", "Any chord on guitar, ukulele, bass and piano."],
  bank: ["Song Bank", "Find a song, pick a key and send a request."],
  play: ["Play", "Piano, fretboard, tuner and metronome."]
};
