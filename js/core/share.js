// @ts-check
import { slugify } from "../router.js";
// Share links carry the song itself, compressed into the URL (?s=...).
// The format matches Sonata v1 so old links and QR codes still open.

/**
 * @typedef {import("./store.js").Song} Song
 * @typedef {{ t: string, b: string, k?: string, c?: number, tr?: number, a?: string,
 *   cr?: string, d?: string, l?: { name: string, url: string }[], bpm?: number, g?: string }} SharedSong
 * @typedef {{ type: "set", t: string, d?: string, l?: { name: string, url: string }[],
 *   s: SharedSong[] }} SharedSet
 */

/** Only plain web links are ever shown as links (never javascript:, data: or file: URLs). @param {string} url */
export function safeHref(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}

/** @param {any} l */
const cleanLinks = (l) => (Array.isArray(l) ? l : [])
  .filter((x) => x && (String(x.name || "").trim() || String(x.url || "").trim()))
  .map((x) => ({ name: String(x.name || "").trim(), url: String(x.url || "").trim() }));

/**
 * Compact form of a song (also accepts an already compact one).
 * @param {any} song
 * @returns {SharedSong}
 */
export function packSong(song) {
  const body = String(song.body ?? song.b ?? "")
    .replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  /** @type {SharedSong} */
  const d = { t: String(song.title ?? song.t ?? "").trim() || "Untitled Song", b: body };
  const k = song.manualKey ?? song.k;
  if (k && k !== "auto") d.k = String(k).trim();
  const capo = Number(song.capo ?? song.c);
  if (capo > 0) d.c = Math.round(capo);
  const tr = Number(song.transpose ?? song.tr);
  if (tr) d.tr = Math.round(tr);
  const a = String(song.artist ?? song.a ?? "").trim(); if (a) d.a = a;
  const cr = String(song.creator ?? song.cr ?? "").trim(); if (cr) d.cr = cr;
  const desc = String(song.description ?? song.d ?? "").trim(); if (desc) d.d = desc;
  const links = cleanLinks(song.links ?? song.l); if (links.length) d.l = links;
  const bpm = Number(song.bpm); if (bpm >= 30 && bpm <= 300) d.bpm = Math.round(bpm);
  const g = String(song.genre ?? song.g ?? "").trim(); if (g) d.g = g;
  return d;
}

/**
 * @param {{ title?: string, description?: string, links?: any[] }} set
 * @param {any[]} songs
 * @returns {SharedSet}
 */
export function packSet(set, songs) {
  /** @type {SharedSet} */
  const d = { type: "set", t: String(set.title || "").trim() || "Untitled Setlist", s: songs.map(packSong) };
  const desc = String(set.description || "").trim(); if (desc) d.d = desc;
  const links = cleanLinks(set.links); if (links.length) d.l = links;
  return d;
}

/** Shared data back into song fields. @param {any} d */
export function unpackSong(d) {
  return {
    title: typeof d?.t === "string" && d.t.trim() ? d.t.trim() : "Shared Song",
    body: typeof d?.b === "string" ? d.b : "",
    manualKey: typeof d?.k === "string" ? d.k : "auto",
    capo: Number(d?.c) || 0,
    transpose: Number(d?.tr) || 0,
    artist: typeof d?.a === "string" ? d.a : "",
    creator: typeof d?.cr === "string" ? d.cr : "",
    description: typeof d?.d === "string" ? d.d : "",
    links: cleanLinks(d?.l),
    bpm: Number(d?.bpm) || null,
    genre: typeof d?.g === "string" ? d.g : ""
  };
}

/** @param {Uint8Array} bytes */
const toBase64Url = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// ---- v4: positional arrays (no field names) ----
// Song: [4, title, body, key, capo, transpose, artist, arranger, notes, links, bpm, genre]
// Set:  [5, title, notes, links, [song, song, …]]   (each song as above, without the leading 4)
const SONG_FIELDS = ["t", "b", "k", "c", "tr", "a", "cr", "d", "l", "bpm", "g"];

/** @param {any} d */
function songToArray(d) {
  const a = SONG_FIELDS.map((f) => d[f] ?? "");
  while (a.length && (a[a.length - 1] === "" || a[a.length - 1] === 0)) a.pop();
  return a.map((v) => (Array.isArray(v) ? v.map((l) => [l.name, l.url]) : v));
}

/** @param {any[]} a */
function arrayToSong(a) {
  /** @type {any} */
  const d = {};
  SONG_FIELDS.forEach((f, i) => { const v = a[i]; if (v !== undefined && v !== "" && v !== 0) d[f] = f === "l" && Array.isArray(v) ? v.map((x) => ({ name: String(x?.[0] ?? ""), url: String(x?.[1] ?? "") })) : v; });
  return d;
}

/** Compact array form of a shared song or setlist. @param {SharedSong|SharedSet} data */
export function toCompact(data) {
  const d = /** @type {any} */ (data);
  if (d.type === "set") return [5, d.t, d.d || "", (d.l || []).map((/** @type {any} */ l) => [l.name, l.url]), d.s.map(songToArray)];
  return [4, ...songToArray(d)];
}

/** Back from the compact array (or pass an object through). @param {any} v */
export function fromCompact(v) {
  if (!Array.isArray(v)) return v;
  if (v[0] === 4) return arrayToSong(v.slice(1));
  if (v[0] === 5) {
    /** @type {any} */
    const set = { type: "set", t: String(v[1] ?? ""), s: Array.isArray(v[4]) ? v[4].filter(Array.isArray).map(arrayToSong) : [] };
    if (v[2]) set.d = String(v[2]);
    if (Array.isArray(v[3]) && v[3].length) set.l = v[3].map((x) => ({ name: String(x?.[0] ?? ""), url: String(x?.[1] ?? "") }));
    return set;
  }
  return null;
}

/** Raw-deflate bytes (or the plain bytes where the browser can't compress). @param {string} text */
async function deflate(text) {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return raw;
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return raw; }
}

/**
 * The ?s= value for a song or setlist.
 * @param {SharedSong|SharedSet} data
 * @returns {Promise<string>}
 */
export async function encodeShare(data) {
  return toBase64Url(await deflate(JSON.stringify(toCompact(data))));
}

// ---- QR form: upper-case only, so the code uses the QR "alphanumeric" mode (about 30% fewer squares) ----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** @param {Uint8Array} bytes */
export function toBase32(bytes) {
  let bits = 0, v = 0, out = "";
  for (const x of bytes) { v = ((v << 8) | x) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += B32[(v << (5 - bits)) & 31];
  return out;
}

/** @param {string} text */
export function fromBase32(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, "");
  const out = new Uint8Array(Math.floor(clean.length * 5 / 8));
  let bits = 0, v = 0, i = 0;
  for (const ch of clean) { v = ((v << 5) | B32.indexOf(ch)) & 0xffff; bits += 5; if (bits >= 8) { out[i++] = (v >>> (bits - 8)) & 255; bits -= 8; } }
  return out.subarray(0, i);
}

/**
 * Link for a QR code: HTTPS://SONATA.JETHROFRANE.XYZ/Q/<BASE32>. All characters are in the QR
 * alphanumeric set, which packs 5.5 bits per character instead of 8.
 * @param {string} origin e.g. https://sonata.jethrofrane.xyz
 * @param {SharedSong|SharedSet} data
 */
export async function qrUrl(origin, data) {
  return `${origin.replace(/\/$/, "").toUpperCase()}/Q/${toBase32(await deflate(JSON.stringify(toCompact(data))))}`;
}

/** Decode the part after /q/. @param {string} value */
export async function decodeQr(value) {
  if (!value || value.length > MAX_LINK) return null;
  try {
    const bytes = fromBase32(value);
    let text = "";
    if (typeof DecompressionStream !== "undefined") { try { text = await inflateCapped(bytes); } catch { text = ""; } }
    if (!text) text = new TextDecoder().decode(bytes);
    return fromCompact(JSON.parse(text));
  } catch { return null; }
}

/** @param {string} text */
const stripVersion = (text) => (/^v\d\./.test(text) ? text.slice(3) : text);

/** Longest ?s= value we accept (QR codes top out near 3 KB; links stay well under this). */
export const MAX_LINK = 64 * 1024;
/** Largest decompressed song or setlist (a whole setlist is a few hundred KB at most). */
export const MAX_JSON = 2 * 1024 * 1024;

/** Inflate with a size cap, so a crafted link can't expand into gigabytes and freeze the tab. @param {Uint8Array} bytes */
async function inflateCapped(bytes) {
  const reader = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON) { reader.cancel().catch(() => {}); throw new Error("share too large"); }
    parts.push(value);
  }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}

/**
 * Decode a ?s= value. Handles compressed and plain (older) links.
 * @param {string} value
 * @returns {Promise<any|null>}
 */
export async function decodeShare(value) {
  if (!value || String(value).length > MAX_LINK) return null;
  try {
    let b64 = String(value).trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "+");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    let text = "";
    if (typeof DecompressionStream !== "undefined") {
      try {
        text = await inflateCapped(bytes);
      } catch { text = ""; }
    }
    if (!text) text = new TextDecoder().decode(bytes);
    return fromCompact(JSON.parse(stripVersion(text)));
  } catch {
    try {
      const legacy = decodeURIComponent(escape(atob(decodeURIComponent(String(value)))));
      return JSON.parse(stripVersion(legacy));
    } catch {
      return null;
    }
  }
}

/**
 * Full share URL for a page origin + path.
 * @param {string} base e.g. https://sonata.jethrofrane.xyz/
 * @param {SharedSong|SharedSet} data
 */
export async function shareUrl(base, data) {
  // /share/<name> keeps the link readable where no preview card is shown; old ?s= links still open.
  const name = slugify(/** @type {any} */ (data).t || "").slice(0, 32).replace(/-+$/, "");
  return `${base}${name ? `share/${name}` : ""}?s=${await encodeShare(data)}`;
}

/** Sonata links in any text: ?s= links (any path), /q/ QR links and old ?share= links. */
const LINK_RE = /https?:\/\/[^\s<>"')]+/gi;

/**
 * Read a pasted message: every Sonata song link in order, plus a setlist title when the
 * message was made by "Share as song links" (first line "Setlist: …") or holds one setlist link.
 * @param {string} text
 * @returns {Promise<{ title: string, songs: any[], sets: any[] }>}
 */
export async function parseLinks(text) {
  const src = String(text || "").slice(0, 600_000);
  /** @type {any[]} */ const songs = [];
  /** @type {any[]} */ const sets = [];
  for (const m of src.matchAll(LINK_RE)) {
    let u;
    try { u = new URL(m[0].replace(/[.,;:!?]+$/, "")); } catch { continue; }
    const q = u.pathname.match(/^\/q\/([A-Za-z2-7]+)/i);
    const s = u.searchParams.get("s") || u.searchParams.get("share");
    const d = q ? await decodeQr(q[1]) : s ? await decodeShare(s) : null;
    if (!d || typeof d !== "object") continue;
    if (d.type === "set" && Array.isArray(d.s)) sets.push(d);
    else if (typeof d.t === "string" || typeof d.b === "string") songs.push(d);
  }
  const head = src.split("\n").map((l) => l.trim()).find((l) => /^(setlist|set list|lineup)\s*[:\-–]/i.test(l));
  const title = head ? head.replace(/^(setlist|set list|lineup)\s*[:\-–]\s*/i, "").replace(/\s*[·|].*$/, "").trim() : "";
  return { title, songs, sets };
}

/**
 * A setlist as a plain message: one link per song, so each link stays short and opens on its own.
 * Pasting the whole message into Sonata (Songs → Add from links) rebuilds the setlist.
 * @param {string} base @param {{ title: string }} set @param {any[]} songs
 */
export async function setlistMessage(base, set, songs) {
  const lines = [`Setlist: ${set.title}`];
  let i = 0;
  for (const s of songs) lines.push(`${++i}. ${s.title}${s.artist ? ` (${s.artist})` : ""}\n${await shareUrl(base, packSong(s))}`);
  lines.push("", "Open a link to see the chart, or paste this whole message into Sonata → Songs → Add from links to get the setlist.");
  return lines.join("\n");
}
