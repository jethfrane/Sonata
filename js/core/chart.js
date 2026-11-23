// @ts-check
// Turns chart text into a clean line model, then into HTML or plain text.
// Inline chords ("[G]Amazing") become a chord line over a lyric line so every
// view, export and the stage share one layout.
import {
  parseChord, lineKind, mapChords, transposeChord, romanChord, nashvilleChord,
  keyFromTonic, prefersFlats, isChordLine, isNeutralToken, tokenizeChordChunk
} from "./music.js";

/**
 * @typedef {import("./music.js").Key} Key
 * @typedef {import("./music.js").Chord} Chord
 * @typedef {"chords"|"chords-only"|"nashville"|"roman"|"lyrics"} ViewMode
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
 * Compact wide lyric-alignment gaps when showing chords without lyrics.
 * @param {string} chords
 */
function compactChordLine(chords) {
  return String(chords || "").trim().replace(/\s{3,}/g, "  ");
}

/** Canonical section keywords shared across parser, preview and Auto-Format. */
const SECTION_WORDS = "intro|introd(?:u[cç][aã]o|ucción)?|pre[- ]?chorus|post[- ]?chorus|verse|verso|estrofe|estrofa|stanza|primeira\\s+parte|segunda\\s+parte|terceira\\s+parte|pr[eé][- ]?(?:refr[aã]o|coro)|chorus|refr[aã]o|coro|koro|bridge|ponte|puente|tulalay|interlude|interl[uú]dio|instrumental|(?:guitar|piano|keys|bass|sax|drum|violin|synth)\\s+solo|solo|outro|final|tag|ending|refrain|hook|vamp|coda|turnaround|break|channel|rap|chant|ad[- ]?lib|modulation|key\\s+change";
export const SECTION_LINE_RE = new RegExp(`^\\s*[\\[(]?\\s*(?:${SECTION_WORDS})(?:\\s+(?:\\d+[a-z]?|x\\s?\\d+|\\d+\\s?x|[ivx]{1,4}|[ab]))?(?:\\s*\\([^)\\n]{1,24}\\))?\\s*[\\])]?\\s*:?\\s*$`, "i");
const BRACKET_TAG_RE = /^\s*\[([^\]\n]{1,32})\]\s*:?\s*$/;

/** Format a raw section heading into crisp Title Case (e.g. "PRE CHORUS 1" -> "Pre-Chorus 1"). @param {string} raw */
export function formatSectionLabel(raw) {
  let s = String(raw || "").replace(/^#+\s*/, "").replace(/^[\[|(]+|[\]|)]+$/g, "").replace(/:\s*$/, "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/\b(pre|post)\s+(chorus)\b/gi, "$1-$2");
  return s.split(" ").map((w) => {
    if (/^([ivx]+|\d+x|x\d+|\(\d+x\)|\(x\d+\))$/i.test(w)) return w.toLowerCase();
    return w.split("-").map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p).join("-");
  }).join(" ");
}

/**
 * Extract a section name from a standalone section line without `##` (e.g. "[Chorus]", "Verse 1:", "[Guitar Solo]").
 * @param {string} line
 */
export function inlineSectionLabel(line) {
  const t = String(line || "").trim();
  if (!t) return "";
  const br = t.match(BRACKET_TAG_RE);
  if (br) {
    const clean = br[1].replace(/:\s*$/, "").trim();
    return clean && !parseChord(clean) && !isNeutralToken(clean) ? clean : "";
  }
  if (!SECTION_LINE_RE.test(t)) return "";
  const clean = t.replace(/^\[|\]$/g, "").replace(/:\s*$/, "").trim();
  return clean && !parseChord(clean) && !isNeutralToken(clean) ? clean : "";
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
      if (mode === "chords-only") {
        const sec = inlineSectionLabel(line);
        if (sec) { out.push({ type: "section", text: sec }); continue; }
        /** @type {string[]} */
        const parts = [];
        for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
          const inner = m[1].trim();
          const c = parseChord(inner);
          if (c) parts.push(fn(c));
          else if (isNeutralToken(inner)) parts.push(inner);
        }
        if (parts.length) out.push({ type: "chords", chords: parts.join("  ") });
        continue;
      }
      const { chords, lyrics } = splitInline(line, fn);
      out.push(chords.trim() ? { type: "pair", chords, lyrics } : { type: "lyrics", text: lyrics });
      continue;
    }
    if (kind === "chords") {
      if (mode === "lyrics") continue;
      if (mode === "chords-only") {
        const chords = compactChordLine(mapChords(line, fn));
        const next = src[i + 1];
        if (next !== undefined && lineKind(next) === "lyrics" && !inlineSectionLabel(next)) i++;
        if (chords) out.push({ type: "chords", chords });
        continue;
      }
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
    if (mode === "chords-only") {
      const sec = inlineSectionLabel(line);
      if (sec) out.push({ type: "section", text: sec });
      continue;
    }
    out.push({ type: "lyrics", text: mode === "lyrics" ? line.trim() : line.replace(/\s+$/, "") });
  }
  // Lyrics / Chords-only view: collapse blank runs left behind by stripped lines.
  if (mode === "lyrics" || mode === "chords-only") {
    const collapsed = out.filter((l, i, a) => !(l.type === "empty" && (i === 0 || a[i - 1].type === "empty")));
    while (collapsed.length && collapsed[collapsed.length - 1].type === "empty") collapsed.pop();
    return collapsed;
  }
  return out;
}

/**
 * Convert a full chart body (including charts imported from chord websites) into a clean
 * chords-only chart string with sections, notes, and chord progressions (no lyrics).
 * @param {string} body
 * @param {{ key?: Key, spelling?: import("./music.js").Spelling }} [o]
 */
export function stripLyricsToChordsOnly(body, o = {}) {
  const key = o.key || keyFromTonic(0, "major");
  const lines = buildLines(body, { mode: "chords-only", key, spelling: o.spelling || "auto" });
  return lines.map((l) => {
    switch (l.type) {
      case "empty": return "";
      case "divider": return "---";
      case "header": return `# ${l.text}`;
      case "section": return `## ${l.text}`;
      case "note": return `> ${l.text}`;
      case "chords": return l.chords;
      default: return "";
    }
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Wrap chord tokens (and rhythm slashes, hyphens, cues) in spans. @param {string} text */
function chordHtml(text) {
  const leadSec = text.match(/^\s*(\[?\s*(?:intro|outro|interlude|instrumental|inst|tag|turnaround|turn|vamp|ending|end|coda|riff|solo|break|refrain|link|hook|verse|chorus|pre-?chorus|post-?chorus|bridge|stanza|koro|coro|verso|ponte|v|c|br|pc)(?:\s+\d+[a-z]?)?\s*\]?:\s+)/i);
  const head = leadSec ? `<span class="ch-mark">${esc(leadSec[0])}</span>` : "";
  const rest = leadSec ? text.slice(leadSec[0].length) : text;
  const parts = rest.match(/\s+|\S*\([^)]*\)\S*|\S+/g) || [];
  return head + parts.map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    if (isNeutralToken(tok)) return `<span class="ch-mark">${esc(tok)}</span>`;
    const sub = tokenizeChordChunk(tok);
    if (sub) {
      return sub.map((p) => {
        if (p.kind === "mark") return `<span class="ch-mark">${esc(p.text)}</span>`;
        const m = p.core.match(/^(.*?)(\/{2,}|\/)$/);
        if (m && m[1] && !m[1].endsWith("/")) return `<b class="ch">${esc(m[1])}</b><span class="ch-mark">${esc(m[2])}</span>`;
        return `<b class="ch">${esc(p.core)}</b>`;
      }).join("");
    }
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

/** Longest line of a chart, in characters. @param {ChartLine[]} lines */
export function longestLine(lines) {
  let n = 0;
  for (const l of lines) {
    if (l.type === "pair") n = Math.max(n, l.chords.length, l.lyrics.length);
    else if (l.type === "chords") n = Math.max(n, l.chords.length);
    else if (l.type === "lyrics" || l.type === "note") n = Math.max(n, l.text.length);
  }
  return n;
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
    if (kind === "inline") {
      for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
        const c = parseChord(m[1]);
        if (!c) continue;
        const name = fn({ ...c, slashes: "" });
        if (!seen.includes(name)) seen.push(name);
      }
    } else if (kind === "chords" && isChordLine(line)) {
      const toks = line.trim().match(/\S*\([^)]*\)\S*|\S+/g) || [];
      for (const tok of toks) {
        const parts = tokenizeChordChunk(tok);
        if (!parts) continue;
        for (const p of parts) {
          if (p.kind !== "chord") continue;
          const name = fn({ ...p.chord, slashes: "" });
          if (!seen.includes(name)) seen.push(name);
        }
      }
    }
  }
  return seen;
}

/** Friendly label for a reference link URL (e.g. "Ultimate Guitar" instead of generic "Chord reference"). @param {string} url */
export function friendlyLinkName(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^tabs\.|^m\./, "").toLowerCase();
    if (/youtu\.?be/.test(h)) return "YouTube";
    if (h.includes("ultimate-guitar")) return "Ultimate Guitar";
    if (h.includes("worshiptogether")) return "WorshipTogether";
    if (h.includes("cifraclub")) return "Cifra Club";
    if (h.includes("praisecharts")) return "PraiseCharts";
    if (h.includes("songselect") || h.includes("ccli")) return "SongSelect";
    if (h.includes("chordify")) return "Chordify";
    if (h.includes("lacuerda")) return "LaCuerda";
    if (h.includes("azchords")) return "AZChords";
    if (h.includes("ukutabs")) return "UkuTabs";
    if (h.includes("essentialworship")) return "EssentialWorship";
    if (h.includes("multitracks")) return "MultiTracks";
    if (h.includes("worshipchords")) return "WorshipChords";
    if (h.includes("tabs4acoustic")) return "Tabs4Acoustic";
    if (h.includes("chordie")) return "Chordie";
    if (h.includes("spotify")) return "Spotify";
    if (h.includes("e-chords")) return "E-Chords";
    return h || "Chord reference";
  } catch {
    return "Chord reference";
  }
}
