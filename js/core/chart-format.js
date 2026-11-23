// @ts-check
// Raw-paste chord chart analyzer and Auto-Format (loaded on demand when formatting or importing).
import {
  parseChord, lineKind, mapChords, romanChord, keyFromTonic, extractChords,
  detectKey, parseKey, keyValue, chordFitRatio, transposeText, mod12
} from "./music.js";
import { stripAsciiTabLines } from "./import.js";
import { friendlyLinkName, uniqueChords, formatSectionLabel, SECTION_LINE_RE } from "./chart.js";

/** Parse a capo number including Roman numerals (I..XI). @param {string} s */
function parseCapoToken(s) {
  const rom = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11 };
  const t = String(s || "").trim().toLowerCase();
  if (t in rom) return /** @type {any} */ (rom)[t];
  return parseInt(t, 10) || 0;
}

/**
 * Extract metadata headers and standardize section markers from raw pasted text.
 * Shared by both `analyzeRawChart` and `autoFormatChart`.
 * @param {string} raw
 */
function parseRawSectionsAndMeta(raw) {
  const cleaned = String(raw || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const lines = stripAsciiTabLines(cleaned).split("\n");
  let title = "";
  let artist = "";
  let manualKey = "auto";
  let capo = 0;
  let bpm = 0;
  let sectionsNormalized = 0;
  /** @type {{ name: string, url: string }[]} */
  const links = [];
  /** @type {string[]} */
  const bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const t = rawLine.trim();
    if (!t) {
      if (bodyLines.length && bodyLines[bodyLines.length - 1] !== "") bodyLines.push("");
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(t) && !/(\?s=|\/q\/|\/share\/)/i.test(t)) {
      links.push({ name: friendlyLinkName(t), url: t });
      continue;
    }
    const cp = t.match(/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i);
    if (cp) {
      const k = cp[1].toLowerCase();
      const v = (cp[2] || "").trim();
      if ((k === "t" || k === "title") && v) title = v;
      else if ((k === "st" || k === "subtitle" || k === "artist") && v) artist = v;
      else if (k === "key" && v) { const pk = parseKey(v); if (pk) manualKey = keyValue(pk); }
      else if (k === "capo" && v) capo = Math.max(0, Math.min(11, parseCapoToken(v)));
      else if ((k === "tempo" || k === "bpm") && v) bpm = Math.max(30, Math.min(300, parseInt(v, 10) || 0));
      else if (k === "soc" || k === "start_of_chorus") { bodyLines.push("## Chorus"); sectionsNormalized++; }
      else if (k === "sov" || k === "start_of_verse") { bodyLines.push("## Verse"); sectionsNormalized++; }
      else if (k === "sob" || k === "start_of_bridge") { bodyLines.push("## Bridge"); sectionsNormalized++; }
      else if ((k === "c" || k === "comment") && v) {
        if (/^verse|chorus|bridge|intro|outro|pre-?chorus|interlude|tag/i.test(v)) {
          bodyLines.push(`## ${formatSectionLabel(v)}`); sectionsNormalized++;
        } else {
          bodyLines.push(`> ${v}`);
        }
      }
      continue;
    }
    const metaTitle = t.match(/^title\s*:\s*(.+)$/i);
    if (metaTitle && !title) { title = metaTitle[1].trim(); continue; }
    const metaArtist = t.match(/^(?:artist|by|author|writer)\s*:\s*(.+)$/i);
    if (metaArtist && !artist) { artist = metaArtist[1].trim(); continue; }
    const metaKey = t.match(/^(?:key|tom|tonalidad)\s*:\s*([A-G][#b♯♭]?\s*(?:m|min|minor|maj|major|menor|maior)?)$/i);
    if (metaKey) {
      const kStr = metaKey[1].replace(/\bmenor\b/i, "m").replace(/\bmaior\b/i, "");
      const pk = parseKey(kStr);
      if (pk) manualKey = keyValue(pk);
      continue;
    }
    const metaCapo = t.match(/^\[?(?:capo|capotraste)\s*:?\s*(?:(\d{1,2}|[ivx]{1,4})(?:st|nd|rd|th|ª|º)?(?:\s+(?:fret|casa|traste))?|(?:fret|casa|traste)\s*(\d{1,2})|none|no\s+capo)\]?$/i);
    if (metaCapo) { capo = Math.max(0, Math.min(11, parseCapoToken(metaCapo[1] || metaCapo[2] || "0"))); continue; }
    const metaBpm = t.match(/^(?:tempo|bpm)\s*:?\s*(\d{2,3})(?:\s*bpm)?$/i) || t.match(/^(\d{2,3})\s*bpm$/i);
    if (metaBpm) { bpm = Math.max(30, Math.min(300, parseInt(metaBpm[1], 10) || 0)); continue; }

    if (t.startsWith("## ")) {
      const lbl = formatSectionLabel(t);
      const nextH = lbl ? `## ${lbl}` : t;
      if (nextH !== t) sectionsNormalized++;
      bodyLines.push(nextH);
      continue;
    }
    if (SECTION_LINE_RE.test(t) && !parseChord(t.replace(/^[\[|(]+|[\]|)]+$/g, ""))) {
      const lbl = formatSectionLabel(t);
      if (lbl) {
        bodyLines.push(`## ${lbl}`);
        sectionsNormalized++;
        continue;
      }
    }
    bodyLines.push(rawLine.replace(/\s+$/, ""));
  }

  if (!title && bodyLines.length >= 2) {
    const first = bodyLines[0].trim();
    if (first && !first.startsWith("#") && lineKind(first) === "lyrics" && first.length <= 64) {
      const m = first.match(/^(.+?)\s+[–—-]\s+(.+)$/);
      if (m) { title = m[1].trim(); if (!artist) artist = m[2].trim(); }
      else title = first;
      bodyLines.shift();
      if (bodyLines[0] === "") bodyLines.shift();
    }
  }
  return { title, artist, manualKey, capo, bpm, links, bodyLines, sectionsNormalized };
}

/**
 * Wrap one chord-over-lyric pair at natural word/chord boundaries without losing alignment.
 * @param {string} chords
 * @param {string} lyrics
 * @param {number} maxCols
 * @returns {{ chords: string, lyrics: string }[]}
 */
function wrapChordLyricPair(chords, lyrics, maxCols) {
  let c = chords.replace(/\s+$/, "");
  let l = lyrics.replace(/\s+$/, "");
  if (Math.max(c.length, l.length) <= maxCols) return [{ chords: c, lyrics: l }];
  /** @type {{ chords: string, lyrics: string }[]} */
  const out = [];
  let guard = 0;
  while (Math.max(c.length, l.length) > maxCols && guard++ < 16) {
    /** @type {[number, number][]} */
    const spans = [];
    for (const m of c.matchAll(/\S+/g)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    const inChord = (/** @type {number} */ pos) => spans.some(([a, b]) => pos > a && pos < b);
    const minCut = Math.max(16, Math.floor(maxCols * 0.42));
    const maxLen = Math.max(c.length, l.length);
    let bestCut = -1;
    let bestScore = -1e9;
    const scoreAt = (/** @type {number} */ pos) => {
      if (pos <= 0 || pos >= maxLen || inChord(pos)) return -1e9;
      const lOk = pos >= l.length || l[pos] === " " || l[pos - 1] === " ";
      if (!lOk) return -1e9;
      let sc = pos;
      if (pos > 0 && /[,;!?.)\]]/.test(l[pos - 1] || "")) sc += 20;
      if (pos >= c.length || c[pos - 1] === " " || c[pos] === " ") sc += 6;
      return sc;
    };
    for (let i = Math.min(maxCols, maxLen - 1); i >= minCut; i--) {
      const sc = scoreAt(i);
      if (sc > bestScore) { bestScore = sc; bestCut = i; }
    }
    if (bestCut < 0) {
      for (let i = maxCols + 1; i < maxLen; i++) {
        if (scoreAt(i) > -1e8) { bestCut = i; break; }
      }
    }
    if (bestCut < 0) break;
    const headC = c.slice(0, bestCut).replace(/\s+$/, "");
    const headL = l.slice(0, bestCut).replace(/\s+$/, "");
    if (headC || headL) out.push({ chords: headC, lyrics: headL });
    let remC = c.slice(bestCut);
    let remL = l.slice(bestCut);
    const leadL = (remL.match(/^ +/) || [""])[0].length;
    const leadC = (remC.match(/^ +/) || [""])[0].length;
    const shift = remL.trim() ? Math.min(leadL, leadC) : leadC;
    remC = remC.slice(shift).replace(/\s+$/, "");
    remL = remL.slice(shift).replace(/\s+$/, "");
    c = remC;
    l = remL;
  }
  if (c || l) out.push({ chords: c, lyrics: l });
  return out.length ? out : [{ chords: c, lyrics: l }];
}

/**
 * Clean a chord token typo on a chord line (e.g. D/F#m -> D/F#, g -> G) while keeping valid voicings intact.
 * @param {string} line
 */
function cleanChordLine(line) {
  return mapChords(line, (c) => {
    const raw = c.raw.replace(/♯/g, "#").replace(/♭/g, "b");
    const fixedRoot = /^[a-g]/.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
    if (c.bass && /\/[A-Ga-g][#b]?(?:m|min|maj|dim|aug|sus|add|dom|\d)/i.test(fixedRoot)) {
      return `${c.root}${c.quality}/${c.bass}${c.slashes}`;
    }
    return fixedRoot;
  });
}

/**
 * Normalize concert-pitch header key + Capo into sounding key, or drop stale manual key hints that fit poorly.
 * @param {string} body
 * @param {ReturnType<typeof extractChords>} parsedChords
 * @param {string} manualKey
 * @param {number} capo
 */
function resolveImportedKey(body, parsedChords, manualKey, capo) {
  let detected = parsedChords.length ? detectKey(parsedChords) : null;
  const headerKey = manualKey !== "auto" ? parseKey(manualKey) : null;
  if (headerKey && detected) {
    const dFit = chordFitRatio(parsedChords, detected);
    const hFit = chordFitRatio(parsedChords, headerKey);
    if (capo > 0 && headerKey.mode === detected.mode && mod12(headerKey.tonic - capo) === detected.tonic && dFit >= 0.72 && hFit < dFit - 0.1) {
      body = transposeText(body, capo, detected, "auto");
      parsedChords = extractChords(body);
      const lifted = detectKey(parsedChords);
      if (lifted) {
        detected = lifted;
        if (lifted.tonic === headerKey.tonic && lifted.mode === headerKey.mode) manualKey = "auto";
      }
    } else if (parsedChords.length >= 4 && hFit + 0.15 < dFit) {
      manualKey = "auto";
    }
  }
  return { body, parsedChords, detected, manualKey };
}

/**
 * Intelligent Raw-Paste Auto-Format for Sonata charts:
 * extracts metadata, standardizes section headers to `## Section`, removes tab/legend noise,
 * repairs chord typos (e.g. `D/F#m` -> `D/F#`), collapses chord/lyric blank gaps, and wraps long lines cleanly.
 * @param {string} raw
 * @param {{ maxCols?: number, wrap?: boolean }} [opts]
 */
export function autoFormatChart(raw, opts = {}) {
  const maxCols = Math.max(36, Math.min(100, Number(opts.maxCols) || 58));
  const doWrap = opts.wrap !== false;
  const srcClean = String(raw || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const meta = parseRawSectionsAndMeta(srcClean);
  let { title, artist, manualKey, capo, bpm, links, bodyLines, sectionsNormalized } = meta;

  const resolved = resolveImportedKey(bodyLines.join("\n").trim(), extractChords(bodyLines.join("\n").trim()), manualKey, capo);
  let { body, parsedChords, detected } = resolved;
  manualKey = resolved.manualKey;

  const rawLines = body.split("\n");
  /** @type {string[]} */
  const compacted = [];
  let wrappedCount = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i].replace(/\s+$/, "");
    if (!l.trim()) {
      const prev = compacted[compacted.length - 1];
      const next = rawLines[i + 1];
      if (prev && next && lineKind(prev) === "chords" && lineKind(next) === "lyrics" && !next.trim().startsWith("##")) {
        continue;
      }
      if (compacted.length && compacted[compacted.length - 1] !== "") compacted.push("");
      continue;
    }
    if (l.startsWith("## ")) {
      if (compacted.length && compacted[compacted.length - 1] !== "") compacted.push("");
      compacted.push(l);
      continue;
    }
    if (lineKind(l) === "inline") {
      compacted.push(l.replace(/\[([^\]]+)\]/g, (w, inner) => {
        const c = parseChord(inner);
        return c ? `[${c.raw.charAt(0).toUpperCase() + c.raw.slice(1).replace(/♯/g, "#").replace(/♭/g, "b")}]` : w;
      }));
      continue;
    }
    compacted.push(lineKind(l) === "chords" ? cleanChordLine(l) : l);
  }

  /** @type {string[]} */
  const finalLines = [];
  for (let i = 0; i < compacted.length; i++) {
    const line = compacted[i];
    if (!doWrap) { finalLines.push(line); continue; }
    const kind = lineKind(line);
    const next = compacted[i + 1];
    if (kind === "chords" && next !== undefined && lineKind(next) === "lyrics") {
      const pieces = wrapChordLyricPair(line, next, maxCols);
      if (pieces.length > 1) wrappedCount++;
      for (const p of pieces) {
        if (p.chords) finalLines.push(p.chords);
        if (p.lyrics) finalLines.push(p.lyrics);
      }
      i++;
      continue;
    }
    if (kind === "chords" && line.length > maxCols) {
      const pieces = wrapChordLyricPair(line, "", maxCols);
      if (pieces.length > 1) wrappedCount++;
      for (const p of pieces) if (p.chords) finalLines.push(p.chords);
      continue;
    }
    finalLines.push(line);
  }
  while (finalLines.length && !finalLines[finalLines.length - 1].trim()) finalLines.pop();

  const formattedBody = finalLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const keyObj = (manualKey !== "auto" ? parseKey(manualKey) : null) || detected || keyFromTonic(0, "major");
  const distinct = parsedChords.length ? uniqueChords(formattedBody, { key: keyObj, mode: "chords" }) : [];
  const romans = [...new Set(parsedChords.slice(0, 8).map((c) => romanChord(c, keyObj)))].slice(0, 6);

  const changes = [];
  if (sectionsNormalized) changes.push(`${sectionsNormalized} section${sectionsNormalized === 1 ? "" : "s"}`);
  if (wrappedCount) changes.push(`${wrappedCount} wrapped line${wrappedCount === 1 ? "" : "s"}`);
  const changed = formattedBody !== srcClean.trim();

  return {
    title,
    artist,
    manualKey,
    capo,
    bpm: bpm || null,
    links,
    body: formattedBody,
    chords: distinct,
    keyName: keyObj.name,
    romanSummary: romans.join(" – "),
    changed,
    changes
  };
}

/**
 * Smart Chord Sheet & Reference Link Analyzer:
 * Parses raw pasted chord charts (ChordPro, Ultimate Guitar, Worship charts, or progression + reference URL)
 * into a clean Sonata song object with detected key, capo, BPM, reference links, and Roman progression.
 * @param {string} raw
 */
export function analyzeRawChart(raw) {
  const meta = parseRawSectionsAndMeta(raw);
  let { title, artist, manualKey, capo, bpm, links } = meta;
  const resolved = resolveImportedKey(meta.bodyLines.join("\n").trim(), extractChords(meta.bodyLines.join("\n").trim()), manualKey, capo);
  const { body, parsedChords, detected } = resolved;
  manualKey = resolved.manualKey;
  if (!parsedChords.length) return null;

  const keyObj = (manualKey !== "auto" ? parseKey(manualKey) : null) || detected || keyFromTonic(0, "major");
  const distinct = uniqueChords(body, { key: keyObj, mode: "chords" });
  const romans = [...new Set(parsedChords.slice(0, 8).map((c) => romanChord(c, keyObj)))].slice(0, 6);
  if (!title) {
    title = links.length ? `Imported Chart (${keyObj.name})` : `Chart in ${keyObj.name}`;
  }
  return {
    title,
    artist,
    manualKey,
    capo,
    bpm: bpm || null,
    links,
    body,
    chords: distinct,
    keyName: keyObj.name,
    romanSummary: romans.join(" – ")
  };
}
