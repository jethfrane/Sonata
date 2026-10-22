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

/** @param {string} hex */
function hexToRgb(hex) {
  const h = String(hex || "#2563eb").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16) || 0x2563eb;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(3));
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
 * Build a PDF with one or more songs (a setlist prints one song per page group).
 * @param {ExportDoc[]} docs
 * @param {ExportOptions} [o]
 */
export function buildPdf(docs, o = {}) {
  const columns = Math.min(3, Math.max(1, o.columns || 1));
  const W = o.landscape ? 792 : 612;
  const H = o.landscape ? 612 : 792;
  const M = 46;
  const gap = 22;
  const colW = (W - M * 2 - gap * (columns - 1)) / columns;
  const size = columns === 3 ? 9 : columns === 2 ? 10 : 11;
  const lh = size * 1.42;
  const charW = size * 0.6;
  const maxChars = Math.max(14, Math.floor(colW / charW));
  const [ar, ag, ab] = hexToRgb(o.accent || "#2563eb");
  const bottom = 56;

  /** @type {{ ops: string[], doc: ExportDoc }[]} */
  const pages = [];
  for (const doc of docs) {
    const rows = printRows(doc.lines, maxChars);
    const top = H - (doc.artist || doc.creator ? 112 : 96);
    let page = { ops: /** @type {string[]} */ ([]), doc };
    pages.push(page);
    let col = 0;
    let y = top;
    const newColumn = () => {
      col++;
      if (col >= columns) { page = { ops: [], doc }; pages.push(page); col = 0; }
      y = top;
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const need = r.keep ? lh * 2 : r.kind === "section" ? lh * 2.2 : lh;
      if (y - need < bottom) newColumn();
      if (r.kind === "gap" && y === top) continue;
      const x = M + col * (colW + gap);
      const t = (/** @type {string} */ font, /** @type {number} */ sz, /** @type {string} */ color, /** @type {string} */ text) =>
        page.ops.push(`${color} rg BT /${font} ${sz} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(text)}) Tj ET`);
      switch (r.kind) {
        case "gap": y -= lh * 0.6; break;
        case "divider": page.ops.push(`q 0.85 0.87 0.9 RG 0.8 w ${x.toFixed(2)} ${(y + 4).toFixed(2)} m ${(x + colW).toFixed(2)} ${(y + 4).toFixed(2)} l S Q`); y -= lh; break;
        case "header": t("F3", size + 2, "0.1 0.12 0.16", r.text); y -= lh * 1.3; break;
        case "section": y -= lh * 0.3; t("F3", size - 0.5, `${ar} ${ag} ${ab}`, r.text); y -= lh * 1.1; break;
        case "note": t("F5", size - 0.5, "0.42 0.45 0.5", r.text); y -= lh; break;
        case "chord": t("F4", size, `${ar} ${ag} ${ab}`, r.text); y -= lh * 0.92; break;
        default: t("F1", size, "0.08 0.09 0.11", r.text); y -= lh * 1.08; break;
      }
    }
  }

  /** @type {string[]} */
  const objects = [];
  const add = (/** @type {string} */ v) => { objects.push(v); return objects.length; };
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
    let head = `q 0.965 0.97 0.98 rg 0 ${H - 80 - (d.artist || d.creator ? 16 : 0)} ${W} ${80 + (d.artist || d.creator ? 16 : 0)} re f Q\n`;
    head += `q ${ar} ${ag} ${ab} rg 0 ${H - 4} ${W} 4 re f Q\n`;
    head += `0.06 0.08 0.12 rg BT /F3 19 Tf ${M} ${H - 40} Td (${pdfString(d.title)}) Tj ET\n`;
    let hy = H - 58;
    const by = [d.artist ? `by ${d.artist}` : "", d.creator ? `arr. ${d.creator}` : ""].filter(Boolean).join("   ·   ");
    if (by) { head += `0.3 0.33 0.38 rg BT /F2 10.5 Tf ${M} ${hy} Td (${pdfString(by)}) Tj ET\n`; hy -= 15; }
    head += `0.42 0.45 0.5 rg BT /F2 9.5 Tf ${M} ${hy} Td (${pdfString(d.meta)}) Tj ET\n`;
    const foot = `Sonata  ·  sonata.jethrofrane.xyz${total > 1 ? `  ·  Page ${i + 1} of ${total}` : ""}`;
    head += `q 0.88 0.9 0.92 RG 0.6 w ${M} 40 m ${W - M} 40 l S Q\n0.55 0.58 0.62 rg BT /F2 8.5 Tf ${M} 26 Td (${pdfString(foot)}) Tj ET\n`;
    const content = head + p.ops.join("\n");
    const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fonts} >> >> /Contents ${cid} 0 R >>`));
  });
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const title = docs.length > 1 ? "Sonata setlist" : docs[0]?.title || "Sonata chart";
  const infoId = add(`<< /Title (${pdfString(title)}) /Producer (Sonata) >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

/**
 * Render a song to a PNG image.
 * @param {ExportDoc} doc
 * @param {ExportOptions & { fontFamily?: string, uiFont?: string, logo?: HTMLImageElement|null, qr?: { n: number, dark: (r: number, c: number) => boolean }|null, qrNote?: string }} [o]
 * @returns {Promise<Blob>}
 */
export async function renderPng(doc, o = {}) {
  const columns = Math.min(3, Math.max(1, o.columns || 1));
  const mono = o.fontFamily || "'JetBrains Mono', ui-monospace, Menlo, monospace";
  const ui = o.uiFont || "'Plus Jakarta Sans', system-ui, sans-serif";
  const accent = o.accent || "#2563eb";
  const size = 18;
  const lh = Math.round(size * 1.5);
  const pad = 56;
  const maxChars = columns === 1 ? 64 : columns === 2 ? 44 : 32;
  const rows = printRows(doc.lines, maxChars);
  const canvas = document.createElement("canvas");
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  ctx.font = `${size}px ${mono}`;
  const charW = ctx.measureText("M").width;
  const colW = Math.ceil(maxChars * charW) + 24;
  const perCol = Math.ceil(rows.length / columns);
  const headH = doc.artist || doc.creator ? 150 : 128;
  const width = Math.max(720, pad * 2 + colW * columns);
  const qrBlock = o.qr ? 250 : 0;
  const height = headH + pad + perCol * lh + 70 + qrBlock;
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f5f7fa"; ctx.fillRect(0, 0, width, headH - 24);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, width, 6);
  let x0 = pad;
  if (o.logo && o.logo.complete && o.logo.naturalWidth) {
    try { ctx.drawImage(o.logo, pad, 32, 44, 44); x0 = pad + 58; } catch { /* tainted */ }
  }
  ctx.fillStyle = "#0f172a"; ctx.font = `700 30px ${ui}`; ctx.textBaseline = "alphabetic";
  ctx.fillText(doc.title, x0, 64, width - x0 - pad);
  let y = 92;
  const by = [doc.artist ? `by ${doc.artist}` : "", doc.creator ? `arr. ${doc.creator}` : ""].filter(Boolean).join("   ·   ");
  if (by) { ctx.fillStyle = "#475569"; ctx.font = `600 16px ${ui}`; ctx.fillText(by, x0, y); y += 22; }
  ctx.fillStyle = "#64748b"; ctx.font = `500 14px ${ui}`; ctx.fillText(doc.meta, x0, y);
  rows.forEach((r, i) => {
    const col = Math.floor(i / perCol);
    const x = pad + col * colW;
    const ry = headH + pad / 2 + (i % perCol) * lh;
    if (r.kind === "divider") { ctx.fillStyle = "#e2e8f0"; ctx.fillRect(x, ry - lh / 3, colW - 24, 1); return; }
    if (r.kind === "gap") return;
    if (r.kind === "section") { ctx.fillStyle = accent; ctx.font = `800 ${size - 3}px ${ui}`; ctx.fillText(r.text, x, ry); return; }
    if (r.kind === "header") { ctx.fillStyle = "#0f172a"; ctx.font = `700 ${size + 2}px ${ui}`; ctx.fillText(r.text, x, ry); return; }
    if (r.kind === "note") { ctx.fillStyle = "#64748b"; ctx.font = `italic ${size - 2}px ${ui}`; ctx.fillText(r.text, x, ry); return; }
    ctx.fillStyle = r.kind === "chord" ? accent : "#0f172a";
    ctx.font = `${r.kind === "chord" ? 700 : 400} ${size}px ${mono}`;
    ctx.fillText(r.text, x, ry);
  });
  if (o.qr) {
    // QR drawn in whole device pixels so every module stays sharp and scannable.
    const quiet = 4, target = 440;
    const mod = Math.max(2, Math.floor(target / (o.qr.n + quiet * 2)));
    const side = mod * (o.qr.n + quiet * 2);
    const qx = pad * scale, qy = Math.round((height - qrBlock - 40) * scale) + 24 * scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, qy, side, side);
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2; ctx.strokeRect(qx - 1, qy - 1, side + 2, side + 2);
    ctx.fillStyle = "#0b1220";
    for (let r = 0; r < o.qr.n; r++) for (let c = 0; c < o.qr.n; c++) if (o.qr.dark(r, c)) ctx.fillRect(qx + (c + quiet) * mod, qy + (r + quiet) * mod, mod, mod);
    ctx.restore();
    const tx = pad + side / scale + 28;
    ctx.textAlign = "left"; ctx.fillStyle = "#0f172a"; ctx.font = `700 22px ${ui}`;
    ctx.fillText("Scan to open this chart", tx, qy / scale + 70);
    ctx.fillStyle = "#475569"; ctx.font = `500 16px ${ui}`;
    ctx.fillText(o.qrNote || "Opens in Sonata on any phone.", tx, qy / scale + 98);
    ctx.fillText("Free, works offline, no account.", tx, qy / scale + 122);
  }
  ctx.fillStyle = "#94a3b8"; ctx.font = `500 12px ${ui}`; ctx.textAlign = "center";
  ctx.fillText("Made with Sonata  ·  sonata.jethrofrane.xyz", width / 2, height - 26);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
}
