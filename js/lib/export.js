// @ts-check
// Dependency-free exports: PDF (built by hand), PNG (canvas) and plain text.
// Exports always use a light, print-friendly look regardless of app theme.
import { pairSegments, linesToText } from "../core/chart.js";

/**
 * @typedef {import("../core/chart.js").ChartLine} ChartLine
 * @typedef {{ title: string, artist?: string, creator?: string, meta: string,
 *   lines: ChartLine[], notes?: string }} ExportDoc
 * @typedef {{ columns?: number, landscape?: boolean, accent?: string }} ExportOptions
 */

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

/** A short line that names a part of the song ("Verse:", "Chorus 2", "Bridge:"), written without the ## mark. */
const SECTION_NAME = /^\s*\[?\s*(?:pre[- ]?chorus|post[- ]?chorus|verse|chorus|bridge|intro|outro|interlude|instrumental|refrain|tag|coda|ending|hook|turnaround|vamp|solo|break|koro)(?:\s*\d+)?(?:\s*\(?x\s?\d+\)?)?\s*\]?\s*:?\s*$/i;
const LABEL_LINE = /^\S[^:]{0,22}:\s*$/;
/** @param {string} text */
const sectionLabel = (text) => (SECTION_NAME.test(text) || LABEL_LINE.test(text) ? text.trim().replace(/^\[|\]$/g, "").replace(/:\s*$/, "").trim() : "");

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

/** Longest line of a chart, in characters. @param {ChartLine[]} lines */
function longestLine(lines) {
  let n = 0;
  for (const l of lines) {
    if (l.type === "pair") n = Math.max(n, l.chords.length, l.lyrics.length);
    else if (l.type === "chords") n = Math.max(n, l.chords.length);
    else if (l.type === "lyrics" || l.type === "note") n = Math.max(n, l.text.length);
  }
  return n;
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
    else if (l.type === "lyrics" && sectionLabel(l.text)) rows.push({ kind: "section", text: sectionLabel(l.text).toUpperCase() });
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
 *   qr?: { n: number, dark: (r: number, c: number) => boolean }|null, qrNote?: string }} PngOptions
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
 * Render a song as one PNG per page. Short charts make one image cropped to the chart;
 * long charts continue on more pages of the same size instead of shrinking the type.
 * @param {ExportDoc} doc @param {PngOptions} [o]
 * @returns {Promise<Blob[]>}
 */
export async function renderPngPages(doc, o = {}) {
  const columns = Math.min(3, Math.max(1, o.columns || 1));
  // The fonts Sonata ships (self-hosted), so the image matches the app on every device.
  const mono = o.fontFamily || "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, monospace";
  const ui = o.uiFont || "'Inter Variable', Inter, system-ui, sans-serif";
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([document.fonts.load(`400 18px ${mono}`), document.fonts.load(`700 18px ${mono}`), document.fonts.load(`700 30px ${ui}`), document.fonts.load(`500 16px ${ui}`)]).catch(() => {});
  }
  const ink = accentInk(o.accent);
  const accent = `rgb(${ink.join(",")})`;
  const tint = `rgba(${ink.join(",")},.1)`;
  const C = { text: "#0f172a", sub: "#334155", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9" };
  // A 3:4 page (4:3 in landscape) reads well full-screen on a phone and prints cleanly.
  const W = o.landscape ? 1440 : 1080;
  const maxH = o.landscape ? 1080 : 1440;
  const pad = 64, gap = 40, scale = 2;
  const colW = (W - pad * 2 - gap * (columns - 1)) / columns;
  const hasBy = Boolean(doc.artist || doc.creator);
  const headH = hasBy ? 214 : 184;
  const headRest = 104;
  const footQr = o.qr ? 196 : 64;
  const footRest = 64;

  const probe = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  probe.font = `400 100px ${mono}`;
  const ratio = probe.measureText("M").width / 100 || 0.6;

  // Type size: as large as the longest line allows (up to 30px), then stepped down only while that saves a page.
  const minSize = columns === 1 ? 18 : 16;
  const longest = Math.max(1, longestLine(doc.lines));
  const startSize = Math.max(minSize, Math.min(30, Math.floor(colW / (longest * ratio))));
  const plan = (/** @type {number} */ size) => {
    const rows = printRows(doc.lines, Math.max(14, Math.floor(colW / (size * ratio))));
    return { size, rows, ...flowRows(rows, { size, columns, first: maxH - headH - footQr, rest: maxH - headRest - footRest }) };
  };
  const fewest = plan(minSize).pages.length;
  let best = plan(startSize);
  for (let size = startSize - 1; size >= minSize && best.pages.length > fewest; size--) best = plan(size);
  const { size, rows, pages } = best;
  const charW = size * ratio;
  const total = pages.length;
  const single = total === 1;

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
    const top = first ? headH : headRest;
    const foot = first ? footQr : footRest;
    const height = single ? Math.max(Math.ceil(top + best.used + foot + 12), 560) : maxH;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = height * scale;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 8);

    // ---- Header
    if (first) {
      let x0 = pad;
      if (o.logo && o.logo.complete && o.logo.naturalWidth) {
        try { ctx.drawImage(o.logo, pad, 52, 52, 52); x0 = pad + 70; } catch { /* tainted */ }
      }
      let ts = 40;
      ctx.font = `750 ${ts}px ${ui}`;
      while (ts > 28 && ctx.measureText(doc.title).width > W - x0 - pad) { ts -= 2; ctx.font = `750 ${ts}px ${ui}`; }
      ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, doc.title, W - x0 - pad), x0, hasBy ? 84 : 92);
      const by = [doc.artist ? `by ${doc.artist}` : "", doc.creator ? `arr. ${doc.creator}` : ""].filter(Boolean).join("   ·   ");
      if (by) { ctx.fillStyle = C.sub; ctx.font = `550 18px ${ui}`; ctx.fillText(fit(ctx, by, W - x0 - pad), x0, 112); }
      // Key, tempo and view as pills: the key is the one a player looks for first.
      let px = pad;
      const py = hasBy ? 138 : 122;
      ctx.font = `650 15px ${ui}`;
      doc.meta.split("·").map((x) => x.trim()).filter(Boolean).forEach((label, i) => {
        const w = Math.ceil(ctx.measureText(label).width) + 28;
        if (px + w > W - pad) return;
        ctx.fillStyle = i === 0 ? tint : C.soft; pill(ctx, px, py, w, 34, 17);
        ctx.fillStyle = i === 0 ? accent : C.sub; ctx.fillText(label, px + 14, py + 22.5);
        px += w + 8;
      });
      ctx.fillStyle = C.line; ctx.fillRect(pad, headH - 22, W - pad * 2, 1);
    } else {
      ctx.fillStyle = C.text; ctx.font = `700 22px ${ui}`;
      ctx.fillText(fit(ctx, doc.title, W - pad * 2 - 220), pad, 62);
      ctx.fillStyle = C.muted; ctx.font = `550 15px ${ui}`; ctx.textAlign = "right";
      ctx.fillText(doc.meta.split("·")[0].trim(), W - pad, 62);
      ctx.textAlign = "left";
      ctx.fillStyle = C.line; ctx.fillRect(pad, headRest - 22, W - pad * 2, 1);
    }

    // ---- Chart
    for (const it of items) {
      const r = rows[it.row];
      const x = pad + it.col * (colW + gap);
      const yTop = top + it.y;
      const base = yTop + rowUnits(r) * size - size * 0.25;
      if (r.kind === "gap") continue;
      if (r.kind === "divider") { ctx.fillStyle = C.line; ctx.fillRect(x, yTop + size * 0.6, colW, 1); continue; }
      if (r.kind === "section") {
        // Small capitals in the accent, with a rule running to the edge of the column.
        ctx.fillStyle = accent; ctx.font = `750 ${Math.round(size * 0.74)}px ${ui}`; spacing(ctx, "0.08em");
        const label = fit(ctx, r.text, colW);
        ctx.fillText(label, x, base);
        const lw = ctx.measureText(label).width;
        spacing(ctx, "0px");
        if (lw + 16 < colW) { ctx.fillStyle = C.line; ctx.fillRect(x + lw + 14, base - size * 0.27, colW - lw - 14, 1); }
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
    const credit = "Made with Sonata  ·  sonata.jethrofrane.xyz";
    const pageNote = total > 1 ? `Page ${pi + 1} of ${total}` : "";
    ctx.fillStyle = C.line; ctx.fillRect(pad, height - foot + 8, W - pad * 2, 1);
    if (first && o.qr) {
      // QR drawn in whole device pixels so every module stays sharp and scannable.
      const quiet = 4, target = 264;
      const mod = Math.max(2, Math.floor(target / (o.qr.n + quiet * 2)));
      const side = mod * (o.qr.n + quiet * 2);
      const qx = pad * scale, qy = Math.round((height - foot + 30) * scale);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, qy, side, side);
      ctx.fillStyle = "#0b1220";
      for (let r = 0; r < o.qr.n; r++) for (let c = 0; c < o.qr.n; c++) if (o.qr.dark(r, c)) ctx.fillRect(qx + (c + quiet) * mod, qy + (r + quiet) * mod, mod, mod);
      ctx.restore();
      const tx = pad + side / scale + 20;
      const ty = height - foot + 30 + side / scale / 2;
      ctx.fillStyle = C.text; ctx.font = `700 19px ${ui}`; ctx.fillText("Scan to open this chart", tx, ty - 14);
      ctx.fillStyle = C.sub; ctx.font = `500 15px ${ui}`;
      ctx.fillText(o.qrNote || "Opens in Sonata on any phone.", tx, ty + 10);
      ctx.fillStyle = C.muted; ctx.fillText("Free, works offline, no account.", tx, ty + 32);
      ctx.textAlign = "right"; ctx.font = `500 13px ${ui}`;
      ctx.fillText(credit, W - pad, height - 30);
      if (pageNote) { ctx.font = `650 13px ${ui}`; ctx.fillText(pageNote, W - pad, height - 52); }
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = C.muted; ctx.font = `500 13px ${ui}`; ctx.fillText(credit, pad, height - 26);
      if (pageNote) { ctx.textAlign = "right"; ctx.font = `650 13px ${ui}`; ctx.fillText(pageNote, W - pad, height - 26); ctx.textAlign = "left"; }
    }
    out.push(new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png")));
  });
  return Promise.all(out);
}

/** The first page only (kept for callers that want a single image). @param {ExportDoc} doc @param {PngOptions} [o] */
export async function renderPng(doc, o = {}) { return (await renderPngPages(doc, o))[0]; }
