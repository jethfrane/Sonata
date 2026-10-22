// @ts-check
// Pure URL helpers: every section, song, stage and instrument has its own path.
//   /songs  /tools  /theory  /play  /play/piano|guitar|tuner
//   /song/<slug>  /song/<slug>/stage  /song/<slug>/play/piano
// A song's slug is its title plus the tail of its id. The tail is what we look
// up, so a link keeps working after the song is renamed.

export const SECTIONS = ["songs", "editor", "tools", "theory", "play"];
export const INSTRUMENTS = ["piano", "guitar", "tuner"];

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
 * @returns {{ view: string, slug: string, sub: string, stage: boolean }}
 */
export function parsePath(pathname) {
  const seg = pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x).toLowerCase());
  let slug = "";
  if (seg[0] === "song" || seg[0] === "s") { slug = seg[1] || ""; seg.splice(0, 2); }
  let view = seg[0] || (slug ? "editor" : "");
  if (view === "library") view = "songs";
  if (view === "instruments") view = "play";
  const stage = view === "stage";
  if (stage) view = "editor";
  const sub = stage ? "" : seg[1] || "";
  return { view, slug, sub, stage };
}

/**
 * @param {{ view: string, song?: { id: string, title: string }|null, sub?: string, stage?: boolean }} r
 */
export function buildPath(r) {
  const song = r.song;
  if (r.stage) return song ? `/song/${songSlug(song)}/stage` : "/stage";
  if (r.view === "editor") return song ? `/song/${songSlug(song)}` : "/editor";
  if (r.view === "play") return `/play${r.sub ? `/${r.sub}` : ""}`;
  return `/${r.view}`;
}

/** Page title and description per route (also mirrored by api/page.js). */
export const PAGE_META = {
  songs: ["Songs", "Your chord charts and setlists."],
  editor: ["Chart editor", "Write and transpose a chord chart."],
  tools: ["Tools", "Transpose, capo, metronome, share and export."],
  theory: ["Circle of fifths", "Explore keys and the chords that belong to them."],
  play: ["Piano, guitar and tuner", "Play along on a piano, fretboard or tuner."]
};
