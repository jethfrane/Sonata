// @ts-check
// Share links carry the song itself, compressed into the URL (?s=...).
// The format matches Sonata v1 so old links and QR codes still open.

/**
 * @typedef {import("./store.js").Song} Song
 * @typedef {{ t: string, b: string, k?: string, c?: number, tr?: number, a?: string,
 *   cr?: string, d?: string, l?: { name: string, url: string }[], bpm?: number }} SharedSong
 * @typedef {{ type: "set", t: string, d?: string, l?: { name: string, url: string }[],
 *   s: SharedSong[] }} SharedSet
 */

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
    bpm: Number(d?.bpm) || null
  };
}

/** @param {Uint8Array} bytes */
const toBase64Url = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * @param {SharedSong|SharedSet} data
 * @returns {Promise<string>}
 */
export async function encodeShare(data) {
  const text = "v3." + JSON.stringify(data);
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return toBase64Url(raw);
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch {
    return toBase64Url(raw);
  }
}

/** @param {string} text */
const stripVersion = (text) => (/^v\d\./.test(text) ? text.slice(3) : text);

/**
 * Decode a ?s= value. Handles compressed and plain (older) links.
 * @param {string} value
 * @returns {Promise<any|null>}
 */
export async function decodeShare(value) {
  if (!value) return null;
  try {
    let b64 = String(value).trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "+");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    let text = "";
    if (typeof DecompressionStream !== "undefined") {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        text = await new Response(stream).text();
      } catch { text = ""; }
    }
    if (!text) text = new TextDecoder().decode(bytes);
    return JSON.parse(stripVersion(text));
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
  return `${base}?s=${await encodeShare(data)}`;
}
