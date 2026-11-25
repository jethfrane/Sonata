// @ts-check
// Dependency-free exports: PDF (built by hand), PNG (canvas) and plain text.
// Exports always use a light, print-friendly look regardless of app theme.
import { pairSegments, linesToText, longestLine, inlineSectionLabel } from "../core/chart.js";

/**
 * @typedef {import("../core/chart.js").ChartLine} ChartLine
 * @typedef {{ title: string, artist?: string, creator?: string, key?: string, capo?: number, bpm?: number | null,
 *   meta: string, lines: ChartLine[], notes?: string }} ExportDoc
 * @typedef {{ columns?: number, landscape?: boolean, accent?: string }} ExportOptions
 */

const CHO_NEUTRAL_RE = /^(?:[|/\\\-–—.:*%~]+|\(?x\d+\)?|\(?hold\)?|N\.?C\.?|repeat|intro|outro|verse|chorus|bridge|tag|turnaround|vamp|pre-chorus|inst(?:rumental)?|solo|ending|coda|interlude)$/i;
const CHO_TOKEN_RE = /^(?:[A-G](?:#|b)?(?:(?:maj|min|m|dim|aug|sus|add|M|dom|alt|\+|-|\d+|b5|#5|b9|#9|#11|b13|\([^)]*\))*)(?:\/[A-G](?:#|b)?(?:m|min)?)?|[#b]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:maj|min|m|dim|aug|sus|add|\d)*(?:\/[#b]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))?|[#b]?[1-7](?:m|min|dim|aug|sus|add|\d)*(?:\/[#b]?[1-7])?)$/;

const asciiAcc = (/** @type {string} */ s) => String(s || "").replace(/♯/g, "#").replace(/♭/g, "b");

function formatChoToken(raw) {
  if (!raw || CHO_NEUTRAL_RE.test(raw)) return raw;
  const ascii = asciiAcc(raw);
  const m = ascii.match(/^(.*?)(\/{2,}|\/)$/);
  const core = m && m[1] && !m[1].endsWith("/") ? m[1] : ascii;
  const tail = m && m[1] && !m[1].endsWith("/") ? m[2] : "";
  const clean = core.replace(/^\[|\]$/g, "");
  return CHO_TOKEN_RE.test(clean) ? `[${clean}]${tail}` : raw;
}

function mergeChoPair(chords, lyrics) {
  const tokens = [...String(chords || "").matchAll(/\S+/g)];
  const lyr = String(lyrics || "");
  if (!tokens.length) return lyr;
  let out = "";
  let pos = 0;
  for (const m of tokens) {
    const idx = m.index ?? 0;
    const tok = formatChoToken(m[0]);
    if (idx <= lyr.length) {
      if (idx > pos) out += lyr.slice(pos, idx);
      out += tok;
      pos = idx;
    } else {
      if (pos < lyr.length) { out += lyr.slice(pos); pos = lyr.length; }
      out += ` ${tok}`;
    }
  }
  if (pos < lyr.length) out += lyr.slice(pos);
  return out;
}

/**
 * Render an ExportDoc in standard ChordPro (.cho) format for OnSong, Planning Center, or SongSelect.
 * @param {ExportDoc} doc
 */
export function docChordPro(doc) {
  const out = [`{title: ${doc.title}}`];
  if (doc.artist) out.push(`{artist: ${doc.artist}}`);
  if (doc.creator) out.push(`{composer: ${doc.creator}}`);
  if (doc.key) out.push(`{key: ${asciiAcc(doc.key)}}`);
  if (doc.capo) out.push(`{capo: ${doc.capo}}`);
  if (doc.bpm) out.push(`{tempo: ${doc.bpm}}`);
  out.push("");
  for (const l of doc.lines) {
    if (l.type === "empty") out.push("");
    else if (l.type === "header" || l.type === "section" || l.type === "note") out.push(`{comment: ${l.text}}`);
    else if (l.type === "divider") out.push("");
    else if (l.type === "lyrics") out.push(l.text || "");
    else if (l.type === "chords") out.push(String(l.chords || "").trim().replace(/\S+/g, formatChoToken).replace(/\s{2,}/g, "  "));
    else if (l.type === "pair") out.push(mergeChoPair(l.chords, l.lyrics));
  }
  if (doc.notes) out.push("", `{comment: ${doc.notes}}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** @param {ExportDoc} doc */
export function docText(doc) {
  const head = [doc.title];
  if (doc.artist) head.push(`by ${doc.artist}`);
  if (doc.creator) head.push(`Arranged by ${doc.creator}`);
  head.push(doc.meta);
  return head.join("\n") + "\n\n" + linesToText(doc.lines) + "\n";
}

/** @param {string} hex @returns {number[]} 0–255 */
function hexToRgb255(hex) {
  const h = String(hex || "#2563eb").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  const v = Number.isFinite(n) ? n : 0x2563eb;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Relative luminance (WCAG). @param {number[]} rgb */
const luminance = (rgb) => rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

/**
 * The accent as ink on white paper: darkened until it reads at 4.5:1 or better.
 * (The dark theme's accent is a light tint that would wash out on a white export.)
 * @param {string} [hex] @returns {number[]} 0–255
 */
export function accentInk(hex) {
  const [r, g, b] = hexToRgb255(hex || "#2563eb").map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let l = (max + min) / 2;
  const hue = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  // Keep the hue, keep it colourful (a pastel only turns grey when darkened), and lower the lightness until it reads.
  const sat = d === 0 ? 0 : Math.max(0.62, d / (1 - Math.abs(2 * l - 1)));
  const rgb = () => {
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((hue % 2) - 1)), m = l - c / 2;
    const [R, G, B] = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
    return [R, G, B].map((v) => Math.round((v + m) * 255));
  };
  let out = rgb();
  for (let i = 0; i < 60 && 1.05 / (luminance(out) + 0.05) < 4.5; i++) { l -= 0.015; out = rgb(); }
  return out;
}

/**
 * Split a chord line into words with their column, marking timing marks (/ - | x2) so
 * they can be drawn quieter than the chords.
 * @param {string} text @returns {{ i: number, text: string, mark: boolean }[]}
 */
export function chordRuns(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ i: m.index, text: m[0], mark: /^(?:[\/\-|.%:–—]+|\(?x\d+\)?)$/i.test(m[0]) });
  return out;
}

// Characters outside Latin-1 that WinAnsi still has.
/** @type {Record<string, number>} */
const WINANSI = { "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "…": 0x85, "€": 0x80, "♯": 0x23, "♭": 0x62, "°": 0xb0 };

/** PDF string literal in WinAnsi with octal escapes; the file stays pure ASCII. @param {string} text */
export function pdfString(text) {
  let out = "";
  for (const ch of String(text ?? "")) {
    let code = WINANSI[ch] ?? ch.codePointAt(0) ?? 32;
    if (ch === "ø") code = 0xf8;
    if (code === 9) code = 32;
    if (code > 255 || (code < 32 && code !== 10)) code = 63; // "?"
    if (code === 10) code = 32;
    if (code === 40 || code === 41 || code === 92) out += "\\" + String.fromCharCode(code);
    else if (code > 126) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Greedy wrap for a chord/lyric pair: keeps chords on their syllables.
 * @param {string} chords @param {string} lyrics @param {number} max
 */
function wrapPair(chords, lyrics, max) {
  /** @type {{ c: string, l: string }[]} */
  const rows = [];
  let cur = { c: "", l: "" };
  for (const s of pairSegments(chords, lyrics)) {
    const w = Math.max(s.c.length, s.l.length);
    const curW = Math.max(cur.c.length, cur.l.length);
    if (curW && curW + w > max) { rows.push(cur); cur = { c: "", l: "" }; }
    const width = Math.max(cur.c.length, cur.l.length);
    cur = { c: cur.c.padEnd(width) + s.c, l: cur.l.padEnd(width) + s.l };
  }
  rows.push(cur);
  // A single segment wider than the column: hard split.
  return rows.flatMap((r) => {
    const out = [];
    const w = Math.max(r.c.length, r.l.length);
    for (let i = 0; i < w; i += max) out.push({ c: r.c.slice(i, i + max), l: r.l.slice(i, i + max) });
    return out.length ? out : [r];
  });
}

/** @param {string} text @param {number} max */
function wrapText(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = "";
  for (const word of text.split(/(\s+)/)) {
    if ((cur + word).length > max && cur.trim()) { out.push(cur.replace(/\s+$/, "")); cur = word.trimStart(); }
    else cur += word;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Flatten chart lines into printable rows (after wrapping).
 * @param {ChartLine[]} lines @param {number} max
 * @returns {{ kind: string, text: string, keep?: boolean }[]}
 */
function printRows(lines, max) {
  /** @type {{ kind: string, text: string, keep?: boolean }[]} */
  const rows = [];
  for (const l of lines) {
    if (l.type === "empty") rows.push({ kind: "gap", text: "" });
    else if (l.type === "divider") rows.push({ kind: "divider", text: "" });
    else if (l.type === "header") wrapText(l.text, max).forEach((t) => rows.push({ kind: "header", text: t }));
    else if (l.type === "section") rows.push({ kind: "section", text: l.text.toUpperCase() });
    else if (l.type === "note") wrapText(l.text, max).forEach((t) => rows.push({ kind: "note", text: t }));
    else if (l.type === "lyrics" && inlineSectionLabel(l.text)) rows.push({ kind: "section", text: inlineSectionLabel(l.text).toUpperCase() });
    else if (l.type === "lyrics") wrapText(l.text, max).forEach((t) => rows.push({ kind: "lyric", text: t }));
    else if (l.type === "chords") wrapText(l.chords, max).forEach((t) => rows.push({ kind: "chord", text: t }));
    else if (l.type === "pair") wrapPair(l.chords, l.lyrics, max).forEach((r) => {
      rows.push({ kind: "chord", text: r.c, keep: true });
      rows.push({ kind: "lyric", text: r.l });
    });
  }
  return rows;
}

/**
 * The PDF's objects for one or more songs (a setlist prints one song per page group).
 * @param {ExportDoc[]} docs
 * @param {ExportOptions} [o]
 */
function pdfObjects(docs, o = {}) {
  const columns = Math.min(3, Math.max(1, o.columns || 1));
  const W = o.landscape ? 792 : 612;
  const H = o.landscape ? 612 : 792;
  const M = 46;
  const gap = 22;
  const colW = (W - M * 2 - gap * (columns - 1)) / columns;
  // Short lines get bigger type (up to +3pt) so a simple chart is not tiny on the page.
  const base = columns === 3 ? 9 : columns === 2 ? 10 : 11;
  const longest = Math.max(1, ...docs.map((d) => longestLine(d.lines)));
  const size = Math.min(base + 3, Math.max(base, Math.floor((colW / (longest * 0.6)) * 2) / 2));
  const lh = size * 1.42;
  const charW = size * 0.6;
  const maxChars = Math.max(14, Math.floor(colW / charW));
  const [ar, ag, ab] = accentInk(o.accent).map((v) => +(v / 255).toFixed(3));
  const bottom = 56;

  /** @type {{ ops: string[], doc: ExportDoc, first: boolean }[]} */
  const pages = [];
  for (const doc of docs) {
    const rows = printRows(doc.lines, maxChars);
    const firstTop = H - (doc.artist || doc.creator ? 124 : 108);
    const nextTop = H - 78;
    let page = { ops: /** @type {string[]} */ ([]), doc, first: true };
    pages.push(page);
    let col = 0;
    let top = firstTop;
    let y = top;
    const newColumn = () => {
      col++;
      if (col >= columns) { page = { ops: [], doc, first: false }; pages.push(page); col = 0; top = nextTop; }
      y = top;
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      // A section name stays with the lines under it; a chord line stays with its words.
      const need = r.keep ? lh * 2 : r.kind === "section" ? lh * (rows[i + 1]?.keep ? 3.6 : 2.6) : lh;
      if (y - need < bottom) newColumn();
      if (r.kind === "gap" && y === top) continue;
      const x = M + col * (colW + gap);
      const t = (/** @type {string} */ font, /** @type {number} */ sz, /** @type {string} */ color, /** @type {string} */ text, dx = 0) =>
        page.ops.push(`${color} rg BT /${font} ${sz} Tf ${(x + dx).toFixed(2)} ${y.toFixed(2)} Td (${pdfString(text)}) Tj ET`);
      switch (r.kind) {
        case "gap": y -= lh * 0.6; break;
        case "divider": page.ops.push(`q 0.85 0.87 0.9 RG 0.8 w ${x.toFixed(2)} ${(y + 4).toFixed(2)} m ${(x + colW).toFixed(2)} ${(y + 4).toFixed(2)} l S Q`); y -= lh; break;
        case "header": t("F3", size + 2, "0.1 0.12 0.16", r.text); y -= lh * 1.3; break;
        case "section": if (y !== top) y -= lh * 0.35; t("F3", size - 1, `${ar} ${ag} ${ab}`, r.text); y -= lh * 1.15; break;
        case "note": t("F5", size - 0.5, "0.39 0.45 0.55", r.text); y -= lh; break;
        case "chord":
          for (const run of chordRuns(r.text)) t("F4", size, run.mark ? "0.39 0.45 0.55" : `${ar} ${ag} ${ab}`, run.text, run.i * charW);
          y -= lh * (r.keep ? 0.92 : 1.25);
          break;
        default: t("F1", size, "0.08 0.09 0.11", r.text); y -= lh * 1.08; break;
      }
    }
  }

  /** @type {(string|{ dict: string, data: string })[]} */
  const objects = [];
  const add = (/** @type {string|{ dict: string, data: string }} */ v) => { objects.push(v); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const enc = "/Encoding /WinAnsiEncoding";
  const fonts = [
    ["F1", "Courier"], ["F2", "Helvetica"], ["F3", "Helvetica-Bold"], ["F4", "Courier-Bold"], ["F5", "Helvetica-Oblique"]
  ].map(([n, base]) => `/${n} ${add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} ${enc} >>`)} 0 R`).join(" ");
  const pageIds = [];
  const total = pages.length;
  pages.forEach((p, i) => {
    const d = p.doc;
    let head = `q ${ar} ${ag} ${ab} rg 0 ${H - 4} ${W} 4 re f Q\n`;
    if (p.first) {
      head += `0.06 0.08 0.12 rg BT /F3 20 Tf ${M} ${H - 50} Td (${pdfString(d.title)}) Tj ET\n`;
      let hy = H - 68;
      const by = [d.artist ? `by ${d.artist}` : "", d.creator ? `arr. ${d.creator}` : ""].filter(Boolean).join("   ·   ");
      if (by) { head += `0.28 0.33 0.41 rg BT /F2 10.5 Tf ${M} ${hy} Td (${pdfString(by)}) Tj ET\n`; hy -= 16; }
      head += `0.39 0.45 0.55 rg BT /F2 9.5 Tf ${M} ${hy} Td (${pdfString(d.meta)}) Tj ET\n`;
      head += `q 0.88 0.9 0.92 RG 0.8 w ${M} ${hy - 12} m ${W - M} ${hy - 12} l S Q\n`;
    } else {
      // Later pages of the same song: a slim running title leaves more room for the chart.
      head += `0.06 0.08 0.12 rg BT /F3 11 Tf ${M} ${H - 44} Td (${pdfString(d.title)}) Tj ET\n`;
      head += `q 0.88 0.9 0.92 RG 0.8 w ${M} ${H - 56} m ${W - M} ${H - 56} l S Q\n`;
    }
    const foot = `Sonata  ·  sonata.jethrofrane.xyz${total > 1 ? `  ·  Page ${i + 1} of ${total}` : ""}`;
    head += `q 0.88 0.9 0.92 RG 0.6 w ${M} 40 m ${W - M} 40 l S Q\n0.39 0.45 0.55 rg BT /F2 8.5 Tf ${M} 26 Td (${pdfString(foot)}) Tj ET\n`;
    const content = head + p.ops.join("\n");
    const cid = add({ dict: "", data: content });
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fonts} >> >> /Contents ${cid} 0 R >>`));
  });
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const title = docs.length > 1 ? "Sonata setlist" : docs[0]?.title || "Sonata chart";
  const infoId = add(`<< /Title (${pdfString(title)}) /Producer (Sonata) >>`);
  return { objects, catalogId, infoId };
}

/**
 * Write the PDF file. With `deflate`, page streams are Flate-compressed (a chart PDF is
 * about a quarter of the size); without it the file is plain ASCII.
 * @param {ReturnType<typeof pdfObjects>} d
 * @param {((text: string) => Uint8Array)|null} [deflate]
 */
function assemble(d, deflate = null) {
  const enc = new TextEncoder();
  /** @type {Uint8Array[]} */
  const parts = [];
  let size = 0;
  const put = (/** @type {string|Uint8Array} */ x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); size += b.length; };
  put("%PDF-1.4\n");
  const offsets = [];
  d.objects.forEach((obj, i) => {
    offsets.push(size);
    put(`${i + 1} 0 obj\n`);
    if (typeof obj === "string") put(obj);
    else {
      const data = deflate ? deflate(obj.data) : enc.encode(obj.data);
      put(`<< /Length ${data.length}${deflate ? " /Filter /FlateDecode" : ""} >>\nstream\n`);
      put(data);
      put("\nendstream");
    }
    put("\nendobj\n");
  });
  const xref = size;
  put(`xref\n0 ${d.objects.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join(""));
  put(`trailer\n<< /Size ${d.objects.length + 1} /Root ${d.catalogId} 0 R /Info ${d.infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(/** @type {BlobPart[]} */ (parts), { type: "application/pdf" });
}

/** Build a PDF (plain, uncompressed). @param {ExportDoc[]} docs @param {ExportOptions} [o] */
export function buildPdf(docs, o = {}) { return assemble(pdfObjects(docs, o)); }

/**
 * Build a smaller PDF: page streams compressed with the browser's built-in deflate.
 * Falls back to the plain file where CompressionStream is missing.
 * @param {ExportDoc[]} docs @param {ExportOptions} [o]
 */
export async function buildPdfSmall(docs, o = {}) {
  const d = pdfObjects(docs, o);
  if (typeof CompressionStream === "undefined") return assemble(d);
  /** @type {Map<string, Uint8Array>} */
  const done = new Map();
  for (const obj of d.objects) {
    if (typeof obj === "string" || done.has(obj.data)) continue;
    const stream = new Blob([obj.data]).stream().pipeThrough(new CompressionStream("deflate"));
    done.set(obj.data, new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return assemble(d, (text) => /** @type {Uint8Array} */ (done.get(text)));
}

/**
 * @typedef {ExportOptions & { fontFamily?: string, uiFont?: string, logo?: HTMLImageElement|null,
 *   qr?: { n: number, dark: (r: number, c: number) => boolean }|null, qrNote?: string,
 *   qrTitle?: string, setLabel?: string }} PngOptions
 */

/** Row heights in units of the type size. Chord lines with no words get more air. @param {{ kind: string, keep?: boolean }} r */
const rowUnits = (r) => r.kind === "gap" ? 0.8 : r.kind === "divider" ? 1.2 : r.kind === "header" ? 1.9 : r.kind === "section" ? 1.8
  : r.kind === "note" ? 1.5 : r.kind === "chord" ? (r.keep ? 1.5 : 1.8) : 1.35;

/**
 * Place rows into columns and pages. Pure arithmetic, so it can be tested without a canvas.
 * A chord line stays with its words, a section name stays with what follows, and no column starts with a gap.
 * @param {{ kind: string, text: string, keep?: boolean }[]} rows
 * @param {{ size: number, columns: number, first: number, rest: number }} o  `first`/`rest`: usable height on page 1 / later pages
 * @returns {{ pages: { row: number, col: number, y: number }[][], used: number }} `used`: tallest column of the last page
 */
export function flowRows(rows, o) {
  const h = (/** @type {number} */ i) => rowUnits(rows[i]) * o.size;
  const total = rows.reduce((sum, _, i) => sum + h(i), 0);
  const run = (/** @type {number} */ firstLimit) => {
    /** @type {{ row: number, col: number, y: number }[][]} */
    const pages = [[]];
    let col = 0, y = 0, used = 0;
    let limit = firstLimit;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.kind === "gap" && y === 0) continue;
      let need = h(i);
      if (r.keep && rows[i + 1]) need += h(i + 1);
      if (r.kind === "section" && rows[i + 1]) need += h(i + 1) + (rows[i + 1].keep && rows[i + 2] ? h(i + 2) : 0);
      if (y > 0 && y + need > limit) {
        col++; y = 0;
        if (col >= o.columns) { pages.push([]); col = 0; used = 0; limit = o.rest; }
        if (r.kind === "gap") continue;
      }
      pages[pages.length - 1].push({ row: i, col, y });
      y += h(i);
      used = Math.max(used, y);
    }
    return { pages, used };
  };
  // Everything fits on one page: balance the columns instead of filling the first one to the bottom.
  if (o.columns > 1 && total <= o.first * o.columns * 0.92) {
    const balanced = run(Math.min(o.first, total / o.columns + o.size * 3));
    if (balanced.pages.length === 1) return balanced;
  }
  return run(o.first);
}

/**
 * Render a song as one PNG per page. Every page is 9:16 (1080×1920 at 2×), the shape of a phone
 * screen and of a story, so it fills the screen when opened in a chat. Landscape makes 16:9 pages.
 * The type is as large as the page allows; long charts continue on more pages instead of shrinking it.
 * @param {ExportDoc} doc @param {PngOptions} [o]
 * @returns {Promise<Blob[]>}
 */
export async function renderPngPages(doc, o = {}) {
  const land = Boolean(o.landscape);
  // Two columns at most on a tall page: three would make lines too short to read on a phone.
  const columns = Math.min(land ? 3 : 2, Math.max(1, o.columns || 1));
  // The fonts Sonata ships (self-hosted), so the image matches the app on every device.
  const mono = o.fontFamily || "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, monospace";
  const ui = o.uiFont || "'Inter Variable', Inter, system-ui, sans-serif";
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([document.fonts.load(`400 18px ${mono}`), document.fonts.load(`700 18px ${mono}`), document.fonts.load(`750 48px ${ui}`), document.fonts.load(`500 20px ${ui}`)]).catch(() => {});
  }
  const ink = accentInk(o.accent);
  const accent = `rgb(${ink.join(",")})`;
  const tint = `rgba(${ink.join(",")},.1)`;
  const C = { text: "#1c2027", sub: "#3a404c", muted: "#5a6170", line: "#e1e4ea", soft: "#eef0f4" };
  const W = land ? 1920 : 1080;
  const H = land ? 1080 : 1920;
  const pad = land ? 96 : 84, gap = land ? 54 : 44, scale = 2;
  const colW = (W - pad * 2 - gap * (columns - 1)) / columns;
  const hasBy = Boolean(doc.artist || doc.creator);
  // Header: title, credits and key pills. Later pages repeat a slim title bar.
  const titleY = 104, byY = 142;
  const pillY = hasBy ? 164 : 128, pillH = 38;
  const headH = pillY + pillH + 30;
  const headRest = 108;
  const qrUnits = 136;
  const footQr = o.qr ? qrUnits + 64 : 76;
  const footRest = 76;

  const probe = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  probe.font = `400 100px ${mono}`;
  const ratio = probe.measureText("M").width / 100 || 0.6;

  // Type size: maximize readability and fill available canvas space while keeping lines intact when possible.
  const minSize = columns === 1 ? 20 : 17;
  const maxSize = columns === 1 ? 48 : 36;
  const lineLens = doc.lines.map((l) => {
    if (l.type === "pair") return Math.max(l.chords.length, l.lyrics.length);
    if (l.type === "chords") return l.chords.length;
    if (l.type === "lyrics" || l.type === "note") return l.text.length;
    return 0;
  }).filter((n) => n > 0).sort((a, b) => a - b);
  const longest = lineLens.length ? lineLens[lineLens.length - 1] : 1;
  const fitSize = Math.floor(colW / (longest * ratio));
  let targetStart = fitSize;
  if (fitSize < minSize && lineLens.length) {
    const p85 = Math.max(36, lineLens[Math.min(lineLens.length - 1, Math.floor((lineLens.length - 1) * 0.85))]);
    targetStart = Math.floor(colW / (p85 * ratio));
  }
  const startSize = Math.max(minSize, Math.min(maxSize, targetStart));
  const plan = (/** @type {number} */ size) => {
    const rows = printRows(doc.lines, Math.max(14, Math.floor(colW / (size * ratio))));
    return { size, rows, ...flowRows(rows, { size, columns, first: H - headH - footQr - 16, rest: H - headRest - footRest - 16 }) };
  };
  const fewest = plan(minSize).pages.length;
  let best = plan(startSize);
  for (let size = startSize - 1; size >= minSize && best.pages.length > fewest; size--) best = plan(size);
  // If a single-page chart fits easily with room to spare at a larger size, step up carefully.
  if (best.pages.length === 1 && fitSize > startSize) {
    for (let size = Math.min(maxSize, fitSize); size > best.size; size--) {
      const cand = plan(size);
      if (cand.pages.length === 1) { best = cand; break; }
    }
  }
  const { size, rows, pages } = best;
  const charW = size * ratio;
  const total = pages.length;

  /** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} max */
  const fit = (ctx, text, max) => {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  };
  /** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
  const pill = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); };
  const spacing = (/** @type {CanvasRenderingContext2D} */ ctx, /** @type {string} */ v) => { try { /** @type {any} */ (ctx).letterSpacing = v; } catch { /* older browsers */ } };

  /** @type {Promise<Blob>[]} */
  const out = [];
  pages.forEach((items, pi) => {
    const first = pi === 0;
    const foot = first ? footQr : footRest;
    const headCur = first ? headH : headRest;
    const avail = H - headCur - foot;
    // Open row spacing slightly on short one-page charts so they fill the frame cleanly with balanced top breathing room.
    const vScale = total === 1 && best.used > 0 ? Math.min(1.12, Math.max(1, (avail * 0.84) / best.used)) : 1;
    const scaledUsed = best.used * vScale;
    const maxTopPad = Math.max(0, Math.floor((avail - scaledUsed) * 0.5));
    const top = headCur + (total === 1 ? Math.min(maxTopPad, Math.max(12, Math.round((avail - scaledUsed) * 0.22))) : 10);
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 10);

    // ---- Header
    if (first) {
      let x0 = pad;
      if (o.logo && o.logo.complete && o.logo.naturalWidth) {
        try { ctx.drawImage(o.logo, pad, 56, 58, 58); x0 = pad + 76; } catch { /* tainted */ }
      }
      let ts = 50;
      ctx.font = `750 ${ts}px ${ui}`;
      while (ts > 32 && ctx.measureText(doc.title).width > W - x0 - pad) { ts -= 2; ctx.font = `750 ${ts}px ${ui}`; }
      ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, doc.title, W - x0 - pad), x0, titleY);
      const by = [doc.artist ? `by ${doc.artist}` : "", doc.creator ? `arr. ${doc.creator}` : ""].filter(Boolean).join("   ·   ");
      if (by) { ctx.fillStyle = C.sub; ctx.font = `550 23px ${ui}`; ctx.fillText(fit(ctx, by, W - x0 - pad), x0, byY); }
      // Key, tempo and view as pills: the key is the one a player looks for first.
      let px = pad;
      ctx.font = `650 19px ${ui}`;
      doc.meta.split("·").map((x) => x.trim()).filter(Boolean).forEach((label, i) => {
        const w = Math.ceil(ctx.measureText(label).width) + 34;
        if (px + w > W - pad) return;
        ctx.fillStyle = i === 0 ? tint : C.soft; pill(ctx, px, pillY, w, pillH, pillH / 2);
        ctx.fillStyle = i === 0 ? accent : C.sub; ctx.fillText(label, px + 17, pillY + 26);
        px += w + 10;
      });
      ctx.fillStyle = C.line; ctx.fillRect(pad, headH - 18, W - pad * 2, 1);
    } else {
      ctx.fillStyle = C.text; ctx.font = `700 28px ${ui}`;
      ctx.fillText(fit(ctx, doc.title, W - pad * 2 - 260), pad, 70);
      ctx.fillStyle = C.muted; ctx.font = `600 19px ${ui}`; ctx.textAlign = "right";
      ctx.fillText(doc.meta.split("·")[0].trim(), W - pad, 70);
      ctx.textAlign = "left";
      ctx.fillStyle = C.line; ctx.fillRect(pad, headRest - 18, W - pad * 2, 1);
    }
    if (columns > 1 && items.some((it) => it.col > 0)) {
      ctx.fillStyle = C.line;
      for (let c = 1; c < columns; c++) {
        const gx = Math.round(pad + c * colW + (c - 1) * gap + gap / 2);
        ctx.fillRect(gx, headCur, 1, H - headCur - foot - 6);
      }
    }

    // ---- Chart
    for (const it of items) {
      const r = rows[it.row];
      const x = pad + it.col * (colW + gap);
      const yTop = top + it.y * vScale;
      const base = yTop + rowUnits(r) * size - size * 0.25;
      if (r.kind === "gap") continue;
      if (r.kind === "divider") { ctx.fillStyle = C.line; ctx.fillRect(x, yTop + size * 0.6, colW, 1); continue; }
      if (r.kind === "section") {
        // Rounded pill badge in the accent tint + subtle rule to the column edge.
        ctx.font = `750 ${Math.round(size * 0.72)}px ${ui}`; spacing(ctx, "0.075em");
        const label = fit(ctx, r.text, colW - 24);
        const lw = ctx.measureText(label).width;
        const pw = Math.min(colW, Math.ceil(lw + 20)), ph = Math.round(size * 1.16);
        ctx.fillStyle = tint; pill(ctx, x, base - ph + Math.round(size * 0.28), pw, ph, 8);
        ctx.fillStyle = accent; ctx.fillText(label, x + 10, base);
        spacing(ctx, "0px");
        if (pw + 14 < colW) { ctx.fillStyle = C.line; ctx.fillRect(x + pw + 12, base - size * 0.26, colW - pw - 12, 1); }
        continue;
      }
      if (r.kind === "header") { ctx.fillStyle = C.text; ctx.font = `700 ${Math.round(size * 1.12)}px ${ui}`; ctx.fillText(fit(ctx, r.text, colW), x, base); continue; }
      if (r.kind === "note") { ctx.fillStyle = C.muted; ctx.font = `italic 500 ${Math.round(size * 0.86)}px ${ui}`; ctx.fillText(fit(ctx, r.text, colW), x, base); continue; }
      if (r.kind === "chord") {
        ctx.font = `700 ${size}px ${mono}`;
        for (const run of chordRuns(r.text)) { ctx.fillStyle = run.mark ? C.muted : accent; ctx.fillText(run.text, x + run.i * charW, base); }
        continue;
      }
      ctx.fillStyle = C.text; ctx.font = `400 ${size}px ${mono}`;
      ctx.fillText(r.text, x, base);
    }

    // ---- Footer
    const credit = o.setLabel ? `${o.setLabel}  ·  sonata.jethrofrane.xyz` : "Sonata  ·  sonata.jethrofrane.xyz";
    const pageNote = total > 1 ? `Page ${pi + 1} of ${total}` : "";
    ctx.fillStyle = C.line; ctx.fillRect(pad, H - foot + 10, W - pad * 2, 1);
    if (first && o.qr) {
      // QR drawn in whole device pixels so every module stays sharp and scannable.
      const quiet = 4;
      const mod = Math.max(2, Math.floor((qrUnits * scale) / (o.qr.n + quiet * 2)));
      const side = mod * (o.qr.n + quiet * 2);
      const qTop = H - foot + 28;
      const qx = pad * scale, qy = Math.round(qTop * scale);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, qy, side, side);
      ctx.fillStyle = "#0b1220";
      for (let r = 0; r < o.qr.n; r++) for (let c = 0; c < o.qr.n; c++) if (o.qr.dark(r, c)) ctx.fillRect(qx + (c + quiet) * mod, qy + (r + quiet) * mod, mod, mod);
      ctx.restore();
      const tx = pad + side / scale + 24;
      const ty = qTop + side / scale / 2;
      const tw = W - tx - pad;
      ctx.fillStyle = C.text; ctx.font = `700 25px ${ui}`; ctx.fillText(fit(ctx, o.qrTitle || "Scan to open this chart", tw), tx, ty - 24);
      ctx.fillStyle = C.sub; ctx.font = `500 19px ${ui}`;
      ctx.fillText(fit(ctx, o.qrNote || "Opens in Sonata on any phone.", tw), tx, ty + 6);
      ctx.fillStyle = C.muted; ctx.fillText(fit(ctx, "Free, works offline, no account.", tw), tx, ty + 34);
      ctx.font = `500 17px ${ui}`;
      ctx.fillText(fit(ctx, pageNote ? `${credit}  ·  ${pageNote}` : credit, tw), tx, ty + 64);
    } else {
      ctx.fillStyle = C.muted; ctx.font = `500 18px ${ui}`;
      ctx.fillText(fit(ctx, credit, pageNote ? W - pad * 2 - 140 : W - pad * 2), pad, H - 28);
      if (pageNote) { ctx.textAlign = "right"; ctx.font = `650 18px ${ui}`; ctx.fillText(pageNote, W - pad, H - 28); ctx.textAlign = "left"; }
    }
    out.push(new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png")));
  });
  return Promise.all(out);
}

/** The first page only (kept for callers that want a single image). @param {ExportDoc} doc @param {PngOptions} [o] */
export async function renderPng(doc, o = {}) { return (await renderPngPages(doc, o))[0]; }
