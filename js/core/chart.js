// @ts-check
// Turns chart text into a clean line model, then into HTML or plain text.
// Inline chords ("[G]Amazing") become a chord line over a lyric line so every
// view, export and the stage share one layout.
import {
  parseChord, lineKind, mapChords, transposeChord, romanChord, nashvilleChord,
  keyFromTonic, prefersFlats, isChordLine
} from "./music.js";

/**
 * @typedef {import("./music.js").Key} Key
 * @typedef {import("./music.js").Chord} Chord
 * @typedef {"chords"|"nashville"|"roman"|"lyrics"} ViewMode
 * @typedef {{ mode?: ViewMode, key: Key, transpose?: number, capo?: number,
 *   spelling?: import("./music.js").Spelling, title?: string }} RenderOptions
 * @typedef {{ type: "header"|"section"|"note"|"lyrics", text: string }
 *   | { type: "divider" } | { type: "empty" }
 *   | { type: "chords", chords: string }
 *   | { type: "pair", chords: string, lyrics: string }} ChartLine
 */

/** @param {string} s */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Place chord labels at columns, never letting two touch.
 * @param {{ col: number, text: string }[]} items
 */
function layoutChords(items) {
  let out = "";
  for (const { col, text } of items) {
    const pad = Math.max(out.length ? 1 : 0, col - out.length);
    out += " ".repeat(pad) + text;
  }
  return out;
}

/**
 * Split "[G]Amazing [C]grace" into a chord line and a lyric line.
 * Brackets that are not chords (e.g. "[Chorus]") stay in the lyrics.
 * @param {string} line
 * @param {(c: Chord) => string} fn
 */
export function splitInline(line, fn) {
  let lyrics = "";
  /** @type {{ col: number, text: string }[]} */
  const chords = [];
  let last = 0;
  let chordEnd = 0;
  for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
    const idx = m.index ?? 0;
    lyrics += line.slice(last, idx);
    last = idx + m[0].length;
    const c = parseChord(m[1]);
    if (!c) { lyrics += m[0]; continue; }
    // A chord wider than the syllable before the next one: widen the lyric so
    // every chord still sits on its own syllable.
    const gap = chords.length ? chordEnd + 1 - lyrics.length : 0;
    if (gap > 0) lyrics += (/\S$/.test(lyrics) && /^\S/.test(line.slice(last)) ? "-" : " ").repeat(gap);
    const text = fn(c);
    chords.push({ col: lyrics.length, text });
    chordEnd = lyrics.length + text.length;
  }
  lyrics += line.slice(last);
  return { chords: layoutChords(chords), lyrics: lyrics.replace(/\s+$/, "") };
}

/**
 * The chord transform for a view mode.
 * @param {RenderOptions} o
 * @returns {(c: Chord) => string}
 */
export function chordTransform(o) {
  const mode = o.mode || "chords";
  if (mode === "nashville") return (c) => nashvilleChord(c, o.key);
  if (mode === "roman") return (c) => romanChord(c, o.key);
  const steps = (o.transpose || 0) - (o.capo || 0);
  const shapeKey = keyFromTonic(o.key.tonic + steps, o.key.mode);
  if (!steps && (o.spelling || "auto") === "auto") return (c) => c.raw.replace(/\/{2,}$|\/$/, "") + c.slashes;
  const flats = prefersFlats(shapeKey, o.spelling);
  return (c) => transposeChord(c, steps, flats);
}

/**
 * @param {string} body
 * @param {RenderOptions} o
 * @returns {ChartLine[]}
 */
export function buildLines(body, o) {
  const mode = o.mode || "chords";
  const fn = chordTransform(o);
  const src = String(body || "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {ChartLine[]} */
  const out = [];
  let titleSkipped = false;
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const kind = lineKind(line);
    const t = line.trim();
    if (kind === "empty") { out.push({ type: "empty" }); continue; }
    if (kind === "header") {
      const text = t.replace(/^#\s+/, "");
      if (!titleSkipped && o.title && text.toLowerCase() === o.title.trim().toLowerCase()) { titleSkipped = true; continue; }
      out.push({ type: "header", text }); continue;
    }
    if (kind === "subheader") { out.push({ type: "section", text: t.replace(/^##\s+/, "") }); continue; }
    if (kind === "divider") { out.push({ type: "divider" }); continue; }
    if (kind === "note") { if (mode !== "lyrics") out.push({ type: "note", text: t.replace(/^(>|\/\/)\s*/, "") }); continue; }
    if (kind === "inline") {
      if (mode === "lyrics") {
        const text = line.replace(/\[([^\]]+)\]/g, (w, inner) => (parseChord(inner) ? "" : w)).replace(/\s{2,}/g, " ").trim();
        if (text) out.push({ type: "lyrics", text });
        continue;
      }
      const { chords, lyrics } = splitInline(line, fn);
      out.push(chords.trim() ? { type: "pair", chords, lyrics } : { type: "lyrics", text: lyrics });
      continue;
    }
    if (kind === "chords") {
      if (mode === "lyrics") continue;
      const chords = mapChords(line, fn);
      const next = src[i + 1];
      if (next !== undefined && lineKind(next) === "lyrics") {
        out.push({ type: "pair", chords, lyrics: next.replace(/\s+$/, "") });
        i++;
      } else {
        out.push({ type: "chords", chords });
      }
      continue;
    }
    out.push({ type: "lyrics", text: mode === "lyrics" ? line.trim() : line.replace(/\s+$/, "") });
  }
  // Lyrics view: collapse the blank runs left behind by removed chord lines.
  if (mode === "lyrics") {
    return out.filter((l, i, a) => !(l.type === "empty" && (i === 0 || a[i - 1].type === "empty")));
  }
  return out;
}

/** Wrap chord tokens (and rhythm slashes) in spans. @param {string} text */
function chordHtml(text) {
  return text.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    if (/^[|:%.\-]+$|^x\d+$|^\d+x$/i.test(tok)) return `<span class="ch-mark">${esc(tok)}</span>`;
    const m = tok.match(/^(.*?)(\/{2,}|\/)$/);
    if (m && m[1] && !m[1].endsWith("/")) return `<b class="ch">${esc(m[1])}</b><span class="ch-mark">${esc(m[2])}</span>`;
    if (/^\/+$/.test(tok)) return `<span class="ch-mark">${esc(tok)}</span>`;
    return `<b class="ch">${esc(tok)}</b>`;
  }).join("");
}

/**
 * Break a chord/lyric pair into segments that can wrap without losing alignment.
 * A break is allowed where both lines have a space (or the chord line ended).
 * @param {string} chords
 * @param {string} lyrics
 */
export function pairSegments(chords, lyrics) {
  const len = Math.max(chords.length, lyrics.length);
  const isGap = (/** @type {string} */ str, /** @type {number} */ i) => i >= str.length || str[i] === " ";
  /** @type {{ c: string, l: string }[]} */
  const segs = [];
  let start = 0;
  for (let i = 1; i < len; i++) {
    if (isGap(lyrics, i - 1) && isGap(chords, i - 1) && !(isGap(lyrics, i) && isGap(chords, i))) {
      segs.push({ c: chords.slice(start, i), l: lyrics.slice(start, i) });
      start = i;
    }
  }
  segs.push({ c: chords.slice(start), l: lyrics.slice(start) });
  return segs;
}

/**
 * @param {ChartLine[]} lines
 * @returns {string}
 */
export function linesToHtml(lines) {
  return lines.map((l) => {
    switch (l.type) {
      case "empty": return `<div class="ln ln-empty"></div>`;
      case "divider": return `<hr class="ln-divider">`;
      case "header": return `<h3 class="ln ln-header">${esc(l.text)}</h3>`;
      case "section": return `<div class="ln ln-section"><span>${esc(l.text)}</span></div>`;
      case "note": return `<div class="ln ln-note">${esc(l.text)}</div>`;
      case "chords": return `<div class="ln ln-chords">${chordHtml(l.chords)}</div>`;
      case "lyrics": return `<div class="ln ln-lyrics">${esc(l.text) || "&nbsp;"}</div>`;
      case "pair": {
        const segs = pairSegments(l.chords, l.lyrics)
          .map((s) => `<span class="seg"><span class="seg-c">${chordHtml(s.c) || " "}</span><span class="seg-l">${esc(s.l) || " "}</span></span>`)
          .join("");
        return `<div class="ln ln-pair">${segs}</div>`;
      }
    }
    return "";
  }).join("");
}

/**
 * Plain text for TXT, copy, PDF and PNG exports.
 * @param {ChartLine[]} lines
 */
export function linesToText(lines) {
  return lines.map((l) => {
    switch (l.type) {
      case "empty": return "";
      case "divider": return "---";
      case "header": return l.text.toUpperCase();
      case "section": return `[${l.text}]`;
      case "note": return `(${l.text})`;
      case "chords": return l.chords;
      case "lyrics": return l.text;
      case "pair": return l.chords.replace(/\s+$/, "") + "\n" + l.lyrics;
    }
    return "";
  }).join("\n");
}

/**
 * Count of distinct chords in order of first use, after the view transform.
 * @param {string} body
 * @param {RenderOptions} o
 */
export function uniqueChords(body, o) {
  const fn = chordTransform({ ...o, mode: "chords" });
  /** @type {string[]} */
  const seen = [];
  for (const line of String(body || "").split("\n")) {
    const kind = lineKind(line);
    /** @type {string[]} */
    let raw = [];
    if (kind === "inline") raw = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    else if (kind === "chords" && isChordLine(line)) raw = line.trim().split(/\s+/);
    for (const r of raw) {
      const c = parseChord(r.replace(/^[|(]+|[|)]+$/g, ""));
      if (!c) continue;
      const name = fn({ ...c, slashes: "" });
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}
