// @ts-check
// Song bank: a musician's public list of songs they can play, for requests.
// The bank lives as one JSON file in the musician's own Google Drive, shared
// "anyone with the link can view". Sonata keeps no copy on any server.
// Pure functions (no DOM, no network) so they are unit-tested.

export const BANK_TYPE = "sonata-bank";
export const BANK_VERSION = 1;
/** Largest bank file we read (about 2,000 songs with charts). */
export const MAX_BANK = 3 * 1024 * 1024;

/**
 * @typedef {{ messenger: string, whatsapp: string, sms: string, email: string, telegram: string, instagram: string }} Contacts
 * @typedef {{ title: string, name: string, bio: string, contacts: Contacts, charts: boolean,
 *   fileId: string, publishedAt: string, updatedAt: string }} BankProfile
 * @typedef {{ id: string, t: string, a: string, g: string, k: string, bpm: number|null, b?: string }} BankSong
 * @typedef {{ type: string, v: number, title: string, name: string, bio: string, contacts: Contacts,
 *   updatedAt: string, songs: BankSong[] }} BankFile
 */

/** @param {unknown} v @param {number} [max] */
const str = (v, max = 400) => (typeof v === "string" ? v : "").trim().slice(0, max);

export const CONTACT_KINDS = /** @type {const} */ (["messenger", "whatsapp", "sms", "telegram", "email", "instagram"]);

/** @param {any} c @returns {Contacts} */
export function normalizeContacts(c) {
  const o = c && typeof c === "object" ? c : {};
  return {
    messenger: str(o.messenger, 80).replace(/^https?:\/\/(www\.)?(m\.me|messenger\.com\/t|facebook\.com)\//i, "").replace(/[^\w.]/g, ""),
    whatsapp: str(o.whatsapp, 24).replace(/[^\d+]/g, ""),
    sms: str(o.sms, 24).replace(/[^\d+]/g, ""),
    telegram: str(o.telegram, 40).replace(/^@|^https?:\/\/t\.me\//i, "").replace(/[^\w]/g, ""),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(o.email, 120)) ? str(o.email, 120) : "",
    instagram: str(o.instagram, 40).replace(/^@|^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[^\w.]/g, "")
  };
}

/** @param {any} p @returns {BankProfile} */
export function normalizeProfile(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    title: str(o.title, 80),
    name: str(o.name, 80),
    bio: str(o.bio, 400),
    contacts: normalizeContacts(o.contacts),
    charts: o.charts !== false,
    fileId: /^[\w-]{10,80}$/.test(str(o.fileId, 80)) ? str(o.fileId, 80) : "",
    publishedAt: str(o.publishedAt, 40),
    updatedAt: str(o.updatedAt, 40)
  };
}

/** Drive file ids are letters, digits, - and _. @param {string} id */
export const validBankId = (id) => /^[\w-]{20,80}$/.test(String(id || ""));

/**
 * The public file: profile plus the songs marked "in my song bank".
 * Charts are included only when the musician allows it.
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
    title: profile.title || (profile.name ? `${profile.name}'s songs` : "Song list"),
    name: profile.name, bio: profile.bio, contacts: profile.contacts,
    updatedAt: new Date().toISOString(),
    songs: list
  };
}

/**
 * Check a downloaded bank file. Anything that isn't a Sonata bank is refused, so the
 * reader can never be used to fetch other Drive files.
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
  return { type: BANK_TYPE, v: Number(d.v) || 1, title: str(d.title, 80) || "Song list", name: str(d.name, 80), bio: str(d.bio, 400), contacts: normalizeContacts(d.contacts), updatedAt: str(d.updatedAt, 40), songs };
}

/** Genres in a bank, most used first. @param {{ g: string }[]} songs */
export function genres(songs) {
  /** @type {Map<string, { name: string, n: number }>} */
  const m = new Map();
  for (const s of songs) { const g = s.g.trim(); if (!g) continue; const k = g.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { name: g, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
}

/**
 * The request text a listener sends.
 * @param {{ t: string, a?: string, key?: string }[]} picks
 * @param {{ from?: string, note?: string, bank?: string }} [o]
 */
export function requestText(picks, o = {}) {
  const lines = picks.map((p, i) => `${picks.length > 1 ? `${i + 1}. ` : ""}${p.t}${p.a ? ` (${p.a})` : ""}${p.key ? ` in ${p.key}` : ""}`);
  return [
    `Song request${o.from ? ` from ${o.from}` : ""}${o.bank ? ` · ${o.bank}` : ""}:`,
    ...lines,
    o.note ? `\n${o.note}` : "",
    "\nSent with Sonata"
  ].filter((l) => l !== "").join("\n");
}

/**
 * Where a request can go. Each entry opens the musician's app with the text filled in where the app allows it.
 * @param {Contacts} c @param {string} text
 * @returns {{ kind: string, label: string, href: string, prefilled: boolean }[]}
 */
export function requestTargets(c, text) {
  const e = encodeURIComponent(text);
  /** @type {{ kind: string, label: string, href: string, prefilled: boolean }[]} */
  const out = [];
  if (c.whatsapp) out.push({ kind: "whatsapp", label: "WhatsApp", href: `https://wa.me/${c.whatsapp.replace(/^\+/, "")}?text=${e}`, prefilled: true });
  if (c.messenger) out.push({ kind: "messenger", label: "Messenger", href: `https://m.me/${c.messenger}?text=${e}`, prefilled: true });
  if (c.telegram) out.push({ kind: "telegram", label: "Telegram", href: `https://t.me/${c.telegram}?text=${e}`, prefilled: false });
  if (c.sms) out.push({ kind: "sms", label: "Text message", href: `sms:${c.sms}?&body=${e}`, prefilled: true });
  if (c.email) out.push({ kind: "email", label: "Email", href: `mailto:${c.email}?subject=${encodeURIComponent("Song request")}&body=${e}`, prefilled: true });
  if (c.instagram) out.push({ kind: "instagram", label: "Instagram", href: `https://ig.me/m/${c.instagram}`, prefilled: false });
  return out;
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
