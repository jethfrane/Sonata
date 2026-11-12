// @ts-check
// Song Bank: anyone's public, view-only list of songs they know or offer (a singer, band, worship
// team, teacher or choir), so others can find a song, read a chart in their key and support them.
// The bank lives as one JSON file in the owner's own Google Drive, shared "anyone with the
// link can view". Sonata keeps no copy on any server and never handles money: payment QR
// codes (QR Ph: GCash, Maya, banks) are shown as the owner uploaded them.
// Pure functions (no DOM, no network) so they are unit-tested.

export const BANK_TYPE = "sonata-bank";
export const BANK_VERSION = 4;
/** Largest bank file we read (about 2,000 songs with charts, a photo and payment codes). */
export const MAX_BANK = 3 * 1024 * 1024;
/** Profile photo and uploaded payment images are small JPEG/PNG/WebP data URLs. */
export const MAX_IMAGE = 160 * 1024;

/**
 * @typedef {{ title: string, name: string, bio: string, charts: boolean, theme: Theme, gigs: Gig[],
 *   fileId: string, publishedAt: string, updatedAt: string }} BankProfile
 * @typedef {{ id: string, t: string, a: string, g: string, k: string, bpm: number|null, b?: string }} BankSong
 * @typedef {{ type: string, v: number, title: string, name: string, bio: string, theme: Theme, gigs: Gig[],
 *   updatedAt: string, songs: BankSong[] }} BankFile
 * @typedef {{ preset: string, accent: string, font: string, cover: string }} Theme
 * @typedef {{ date: string, time: string, place: string, note: string, url: string }} Gig
 */

/** @param {unknown} v @param {number} [max] */
const str = (v, max = 400) => (typeof v === "string" ? v : "").trim().slice(0, max);

/** Only plain https links. @param {unknown} v @param {RegExp} [host] */
function webLink(v, host) {
  try {
    const raw = str(v, 300);
    if (!raw) return "";
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (host && !host.test(u.hostname)) return "";
    return u.href.replace(/^http:/, "https:");
  } catch { return ""; }
}

/** A small uploaded image, or "". @param {unknown} v */
export const imageData = (v) => (typeof v === "string" && v.length <= MAX_IMAGE * 1.37 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : "");

/** Looks an owner can pick. `auto` follows the visitor's own light or dark setting. Colors are the page, card and text. */
export const THEMES = /** @type {const} */ ({
  auto: { dark: false, bg: "", surface: "", text: "" },
  paper: { dark: false, bg: "#f6f5f2", surface: "#ffffff", text: "#1b1b1f" },
  night: { dark: true, bg: "#0d0d0f", surface: "#161619", text: "#f2f2f4" },
  stage: { dark: true, bg: "#0b0a07", surface: "#1a1710", text: "#fdf3d6" },
  sunrise: { dark: false, bg: "#fff4e6", surface: "#fffaf3", text: "#2b1608" },
  ocean: { dark: false, bg: "#e8f2fd", surface: "#f8fbff", text: "#0b2540" },
  garden: { dark: false, bg: "#e9f4ec", surface: "#f9fcfa", text: "#10281a" },
  rose: { dark: false, bg: "#fdeaf0", surface: "#fff8fa", text: "#3b0a1e" }
});
export const FONTS = ["modern", "classic", "rounded"];

/** @param {string} hex "#rrggbb" @returns {number} relative luminance 0..1 */
export function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio of two "#rrggbb" colors. @param {string} a @param {string} b */
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
/** @param {string} hex @param {string} toward "#000000" or "#ffffff" @param {number} k 0..1 */
export function mixHex(hex, toward, k) {
  const h = (/** @type {string} */ x, /** @type {number} */ i) => parseInt(x.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(h(hex, i) + (h(toward, i) - h(hex, i)) * k).toString(16).padStart(2, "0")).join("");
}
/**
 * An accent color that stays readable as text on the given surface (contrast 4.5:1 or more):
 * the owner's color is nudged darker on light pages and lighter on dark ones until it is.
 * @param {string} accent "#rrggbb" @param {string} surface "#rrggbb"
 */
export function readableAccent(accent, surface) {
  if (!/^#[0-9a-f]{6}$/i.test(accent) || !/^#[0-9a-f]{6}$/i.test(surface)) return accent;
  const toward = luminance(surface) > 0.4 ? "#000000" : "#ffffff";
  let c = accent.toLowerCase();
  for (let i = 0; i < 20 && contrast(c, surface) < 4.5; i++) c = mixHex(c, toward, 0.08);
  return c;
}
/** Black or white, whichever is readable on this accent. @param {string} accent */
export const inkOn = (accent) => (contrast(accent, "#ffffff") >= contrast(accent, "#111111") ? "#ffffff" : "#111111");

/** @param {any} t @returns {Theme} */
export function normalizeTheme(t) {
  const o = t && typeof t === "object" ? t : {};
  return {
    preset: typeof o.preset === "string" && Object.prototype.hasOwnProperty.call(THEMES, o.preset) ? o.preset : "auto",
    accent: /^#[0-9a-f]{6}$/i.test(String(o.accent || "")) ? String(o.accent).toLowerCase() : "",
    font: FONTS.includes(o.font) ? o.font : "modern",
    cover: imageData(o.cover)
  };
}

/** Upcoming gigs or events the owner lists (at most six). @param {any} g @returns {Gig[]} */
export function normalizeGigs(g) {
  return (Array.isArray(g) ? g : []).map((x) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(x?.date)) && !Number.isNaN(Date.parse(String(x.date))) ? String(x.date) : "";
    return { date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x?.time)) ? String(x.time) : "", place: str(x?.place, 80), note: str(x?.note, 120), url: webLink(x?.url) };
  }).filter((x) => x.date && x.place).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
}
/** Gigs that haven't happened yet. @param {Gig[]} gigs @param {string} today "YYYY-MM-DD" */
export const upcomingGigs = (gigs, today) => gigs.filter((g) => g.date >= today);

/** @param {any} p @returns {BankProfile} */
export function normalizeProfile(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    title: str(o.title, 80),
    name: str(o.name, 80),
    bio: str(o.bio, 400),
    charts: o.charts !== false,
    theme: normalizeTheme(o.theme),
    gigs: normalizeGigs(o.gigs),
    fileId: /^[\w-]{10,80}$/.test(str(o.fileId, 80)) ? str(o.fileId, 80) : "",
    publishedAt: str(o.publishedAt, 40),
    updatedAt: str(o.updatedAt, 40)
  };
}

/** Drive file ids are letters, digits, - and _. @param {string} id */
export const validBankId = (id) => /^[\w-]{20,80}$/.test(String(id || ""));

/** The readable tail of a Song Bank link: /bank/<id>/<name>. @param {string} name */
export const bankSlug = (name) => String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/**
 * The public file: profile plus the songs marked "in my Song Bank".
 * Charts are included only when the owner allows it.
 * @param {BankProfile} profile
 * @param {any[]} songs the whole library; only songs with inBank are published
 * @param {(song: any) => string} keyOf the key to show (e.g. "G", "Em")
 * @returns {BankFile}
 */
export function buildBankFile(profile, songs, keyOf) {
  const list = songs.filter((s) => s && s.inBank && !s.readonly)
    .map((s) => {
      /** @type {BankSong} */
      const b = { id: String(s.id).slice(-12), t: str(s.title, 120) || "Untitled", a: str(s.artist, 120), g: str(s.genre, 40), k: keyOf(s), bpm: Number(s.bpm) || null };
      if (profile.charts && s.body) b.b = String(s.body).slice(0, 20000);
      return b;
    })
    .sort((a, b) => a.t.localeCompare(b.t, undefined, { sensitivity: "base", numeric: true }));
  return {
    type: BANK_TYPE, v: BANK_VERSION,
    title: profile.title || (profile.name ? `${profile.name}'s Song Bank` : "Song Bank"),
    name: profile.name, bio: profile.bio,
    theme: normalizeTheme(profile.theme), gigs: upcomingGigs(normalizeGigs(profile.gigs), new Date(Date.now() - 864e5).toISOString().slice(0, 10)),
    updatedAt: new Date().toISOString(),
    songs: list
  };
}

/**
 * Check a downloaded bank file. Anything that isn't a Sonata bank is refused, so the
 * reader can never be used to fetch other Drive files. Older files still open; fields Sonata no longer uses (photo, social links, payment codes) are ignored.
 * @param {any} d
 * @returns {BankFile|null}
 */
export function parseBankFile(d) {
  if (!d || typeof d !== "object" || Array.isArray(d) || d.type !== BANK_TYPE || !Array.isArray(d.songs)) return null;
  /** @type {BankSong[]} */
  const songs = d.songs.filter((s) => s && typeof s === "object" && typeof s.t === "string").slice(0, 5000).map((s) => {
    /** @type {BankSong} */
    const o = { id: str(s.id, 40), t: str(s.t, 120) || "Untitled", a: str(s.a, 120), g: str(s.g, 40), k: str(s.k, 8), bpm: Number(s.bpm) >= 30 && Number(s.bpm) <= 300 ? Math.round(Number(s.bpm)) : null };
    if (typeof s.b === "string" && s.b) o.b = s.b.slice(0, 20000);
    return o;
  });
  return {
    type: BANK_TYPE, v: Number(d.v) || 1, title: str(d.title, 80) || "Song Bank", name: str(d.name, 80), bio: str(d.bio, 400),
    theme: normalizeTheme(d.theme), gigs: normalizeGigs(d.gigs),
    updatedAt: str(d.updatedAt, 40), songs
  };
}

/** Genres in a bank, most used first. @param {{ g: string }[]} songs */
export function genres(songs) {
  /** @type {Map<string, { name: string, n: number }>} */
  const m = new Map();
  for (const s of songs) { const g = s.g.trim(); if (!g) continue; const k = g.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { name: g, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
}

/** Search a bank: title, artist and genre, accent- and case-insensitive. @param {BankSong[]} songs @param {string} q @param {{ genre?: string, artist?: string }} [f] */
export function searchBank(songs, q, f = {}) {
  const fold = (/** @type {string} */ s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = fold(q).split(/\s+/).filter(Boolean);
  return songs.filter((s) => {
    if (f.genre && fold(s.g) !== fold(f.genre)) return false;
    if (f.artist && fold(s.a) !== fold(f.artist)) return false;
    const hay = fold(`${s.t} ${s.a} ${s.g}`);
    return words.every((w) => hay.includes(w));
  });
}
