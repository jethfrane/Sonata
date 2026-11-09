// @ts-check
// Song Bank: anyone's public list of songs they know or offer (a singer, band, worship team,
// teacher or choir), so others can find a song, pick a key and send a request.
// The bank lives as one JSON file in the owner's own Google Drive, shared "anyone with the
// link can view". Sonata keeps no copy on any server and never handles money: payment QR
// codes (QR Ph: GCash, Maya, banks) are shown as the owner uploaded them.
// Pure functions (no DOM, no network) so they are unit-tested.

export const BANK_TYPE = "sonata-bank";
export const BANK_VERSION = 2;
/** Largest bank file we read (about 2,000 songs with charts, a photo and payment codes). */
export const MAX_BANK = 3 * 1024 * 1024;
/** Profile photo and uploaded payment images are small JPEG/PNG/WebP data URLs. */
export const MAX_IMAGE = 160 * 1024;

/**
 * @typedef {{ instagram: string, tiktok: string, facebook: string, youtube: string, spotify: string,
 *   x: string, threads: string, website: string, email: string }} Socials
 * @typedef {{ label: string, name: string, qr: string, img: string }} Payment
 *   `qr` is the text inside the code (redrawn crisply); `img` is the uploaded picture when the code couldn't be read.
 * @typedef {{ title: string, name: string, bio: string, photo: string, socials: Socials,
 *   links: { label: string, url: string }[], payments: Payment[], charts: boolean,
 *   fileId: string, publishedAt: string, updatedAt: string }} BankProfile
 * @typedef {{ id: string, t: string, a: string, g: string, k: string, bpm: number|null, b?: string }} BankSong
 * @typedef {{ type: string, v: number, title: string, name: string, bio: string, photo: string,
 *   socials: Socials, links: { label: string, url: string }[], payments: Payment[],
 *   updatedAt: string, songs: BankSong[] }} BankFile
 */

/** @param {unknown} v @param {number} [max] */
const str = (v, max = 400) => (typeof v === "string" ? v : "").trim().slice(0, max);

export const SOCIAL_KINDS = /** @type {const} */ (["instagram", "tiktok", "facebook", "youtube", "spotify", "x", "threads", "website", "email"]);
export const PAYMENT_LABELS = ["GCash", "Maya", "GoTyme", "BPI", "BDO", "UnionBank", "Metrobank", "Landbank", "Security Bank", "RCBC", "PNB", "ShopeePay", "Other"];

/** A user name from a handle or a profile link. @param {unknown} v @param {RegExp} prefix */
const handle = (v, prefix) => str(v, 200).replace(prefix, "").replace(/^@/, "").split(/[/?#]/)[0].replace(/[^\w.]/g, "").slice(0, 60);

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

/** @param {any} s @param {any} [old] older "contacts" (v1 files) @returns {Socials} */
export function normalizeSocials(s, old) {
  const o = s && typeof s === "object" ? s : {};
  const c = old && typeof old === "object" ? old : {};
  const yt = str(o.youtube, 300);
  return {
    instagram: handle(o.instagram || c.instagram, /^https?:\/\/(www\.)?instagram\.com\//i),
    tiktok: handle(o.tiktok, /^https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i),
    // v1 files kept a Messenger user name; it is the same as the Facebook one.
    facebook: handle(o.facebook || c.messenger, /^https?:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.com|m\.me)\/(profile\.php\?id=)?/i),
    youtube: /^@?[\w.-]{3,60}$/.test(yt) ? "@" + yt.replace(/^@/, "") : webLink(yt, /(^|\.)youtube\.com$|^youtu\.be$/i),
    spotify: webLink(o.spotify, /(^|\.)spotify\.com$/i),
    x: handle(o.x, /^https?:\/\/(www\.)?(x|twitter)\.com\//i),
    threads: handle(o.threads, /^https?:\/\/(www\.)?threads\.(net|com)\/@?/i),
    website: webLink(o.website),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(o.email || c.email, 120)) ? str(o.email || c.email, 120) : ""
  };
}

/** A small uploaded image, or "". @param {unknown} v */
export const imageData = (v) => (typeof v === "string" && v.length <= MAX_IMAGE * 1.37 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : "");

/** @param {any} p @returns {Payment[]} */
export function normalizePayments(p) {
  return (Array.isArray(p) ? p : []).slice(0, 4).map((x) => ({
    label: str(x?.label, 30) || "Other",
    name: str(x?.name, 60),
    // The text inside a QR Ph code: printable characters only (EMVCo payloads are plain ASCII).
    qr: /^[\x20-\x7e]{10,600}$/.test(String(x?.qr || "")) ? String(x.qr) : "",
    img: imageData(x?.img)
  })).filter((x) => x.qr || x.img);
}

/** @param {any} l */
const normalizeLinks = (l) => (Array.isArray(l) ? l : []).slice(0, 5).map((x) => ({ label: str(x?.label, 40), url: webLink(x?.url) })).filter((x) => x.url);

/** @param {any} p @returns {BankProfile} */
export function normalizeProfile(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    title: str(o.title, 80),
    name: str(o.name, 80),
    bio: str(o.bio, 400),
    photo: imageData(o.photo),
    socials: normalizeSocials(o.socials, o.contacts),
    links: normalizeLinks(o.links),
    payments: normalizePayments(o.payments),
    charts: o.charts !== false,
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
    name: profile.name, bio: profile.bio, photo: profile.photo,
    socials: profile.socials, links: profile.links, payments: profile.payments,
    updatedAt: new Date().toISOString(),
    songs: list
  };
}

/**
 * Check a downloaded bank file. Anything that isn't a Sonata bank is refused, so the
 * reader can never be used to fetch other Drive files. Version 1 files still open.
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
    photo: imageData(d.photo), socials: normalizeSocials(d.socials, d.contacts), links: normalizeLinks(d.links), payments: normalizePayments(d.payments),
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

/**
 * Profile links with their logos: what the public page and the Sonata Card show.
 * @param {Socials} s @param {{ label: string, url: string }[]} [links]
 * @returns {{ kind: string, label: string, href: string, text: string }[]}
 */
export function socialLinks(s, links = []) {
  /** @type {{ kind: string, label: string, href: string, text: string }[]} */
  const out = [];
  if (s.instagram) out.push({ kind: "instagram", label: "Instagram", href: `https://www.instagram.com/${s.instagram}/`, text: "@" + s.instagram });
  if (s.tiktok) out.push({ kind: "tiktok", label: "TikTok", href: `https://www.tiktok.com/@${s.tiktok}`, text: "@" + s.tiktok });
  if (s.facebook) out.push({ kind: "facebook", label: "Facebook", href: /^\d+$/.test(s.facebook) ? `https://www.facebook.com/profile.php?id=${s.facebook}` : `https://www.facebook.com/${s.facebook}`, text: s.facebook });
  if (s.youtube) out.push({ kind: "youtube", label: "YouTube", href: s.youtube.startsWith("@") ? `https://www.youtube.com/${s.youtube}` : s.youtube, text: s.youtube.startsWith("@") ? s.youtube : "YouTube" });
  if (s.spotify) out.push({ kind: "spotify", label: "Spotify", href: s.spotify, text: "Spotify" });
  if (s.x) out.push({ kind: "x", label: "X", href: `https://x.com/${s.x}`, text: "@" + s.x });
  if (s.threads) out.push({ kind: "threads", label: "Threads", href: `https://www.threads.net/@${s.threads}`, text: "@" + s.threads });
  if (s.website) out.push({ kind: "website", label: "Website", href: s.website, text: s.website.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "") });
  for (const l of links) out.push({ kind: "link", label: l.label || "Link", href: l.url, text: l.label || l.url.replace(/^https:\/\/(www\.)?/, "") });
  if (s.email) out.push({ kind: "email", label: "Email", href: `mailto:${s.email}`, text: s.email });
  return out;
}

/**
 * The request text someone sends.
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
 * Where a request can go. Messenger and email open with the text written; Instagram opens the
 * chat (the request is copied first so it can be pasted).
 * @param {Socials} s @param {string} text
 * @returns {{ kind: string, label: string, href: string, prefilled: boolean }[]}
 */
export function requestTargets(s, text) {
  const e = encodeURIComponent(text);
  /** @type {{ kind: string, label: string, href: string, prefilled: boolean }[]} */
  const out = [];
  if (s.facebook && !/^\d+$/.test(s.facebook)) out.push({ kind: "messenger", label: "Messenger", href: `https://m.me/${s.facebook}?text=${e}`, prefilled: true });
  if (s.instagram) out.push({ kind: "instagram", label: "Instagram", href: `https://ig.me/m/${s.instagram}`, prefilled: false });
  if (s.email) out.push({ kind: "email", label: "Email", href: `mailto:${s.email}?subject=${encodeURIComponent("Song request")}&body=${e}`, prefilled: true });
  return out;
}

/** Which wallet or bank a QR Ph code belongs to, guessed from its text. @param {string} payload */
export function guessPaymentLabel(payload) {
  const p = String(payload || "").toUpperCase();
  for (const [re, label] of /** @type {[RegExp, string][]} */ ([[/GCASH|G-XCHANGE|GXCHPHM2/, "GCash"], [/PAYMAYA|MAYA/, "Maya"], [/GOTYME/, "GoTyme"], [/BPI|BOPIPHMM/, "BPI"], [/BDO|BNORPHMM/, "BDO"], [/UNIONBANK|UBPHPHMM/, "UnionBank"], [/METROBANK|MBTCPHMM/, "Metrobank"], [/LANDBANK|TLBPPHMM/, "Landbank"], [/SECURITY ?BANK|SETCPHMM/, "Security Bank"], [/RCBC/, "RCBC"], [/SHOPEE/, "ShopeePay"]])) if (re.test(p)) return label;
  return "Other";
}

/** A QR Ph / EMVCo payment code starts "000201" (payload format indicator). @param {string} payload */
export const isPaymentQr = (payload) => /^000201/.test(String(payload || ""));

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
