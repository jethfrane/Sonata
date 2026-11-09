// @ts-check
// SVG chord diagrams: chord boxes (guitar, ukulele), a bass neck map and piano keys.
// Colours come from CSS (currentColor and classes), so they follow the theme.
import { noteName, mod12 } from "../core/music.js";

/** @param {string} s */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Chord box: strings run top to bottom, low string on the left (as chord books print it).
 * @param {import("../core/chords.js").Voicing} v
 * @param {{ names: string[], tuning: number[], rootPc: number, bassPc: number|null, flats?: boolean, label?: string }} o
 */
export function chordBox(v, o) {
  const n = v.frets.length;
  const rows = 5;
  const gap = n === 4 ? 26 : 22, fretH = 26, left = 30, top = 34;
  const w = left + gap * (n - 1) + 24, h = top + fretH * rows + 40;
  const x = (/** @type {number} */ s) => left + s * gap;
  const base = v.base;
  let svg = "";
  // Nut or starting fret number.
  svg += base <= 1
    ? `<rect x="${x(0) - 1}" y="${top - 5}" width="${gap * (n - 1) + 2}" height="5" rx="1.5" class="cb-nut"/>`
    : `<text x="${left - 10}" y="${top + fretH / 2 + 5}" text-anchor="end" class="cb-fr">${base}fr</text>`;
  for (let r = 0; r <= rows; r++) svg += `<line x1="${x(0)}" x2="${x(n - 1)}" y1="${top + r * fretH}" y2="${top + r * fretH}" class="cb-fret"/>`;
  for (let s = 0; s < n; s++) svg += `<line x1="${x(s)}" x2="${x(s)}" y1="${top}" y2="${top + rows * fretH}" class="cb-string"/>`;
  // Barre.
  if (v.barre) {
    const on = v.frets.map((f, i) => (f === v.barre ? i : -1)).filter((i) => i >= 0);
    const y = top + (v.barre - (base <= 1 ? 1 : base) + 0.5) * fretH;
    svg += `<rect x="${x(on[0]) - 9}" y="${y - 9}" width="${x(on[on.length - 1]) - x(on[0]) + 18}" height="18" rx="9" class="cb-barre"/>`;
  }
  v.frets.forEach((f, s) => {
    const midi = f >= 0 ? o.tuning[s] + f : -1;
    const pc = mod12(midi);
    if (f < 0) svg += `<text x="${x(s)}" y="${top - 12}" text-anchor="middle" class="cb-mute">×</text>`;
    else if (f === 0) svg += `<circle cx="${x(s)}" cy="${top - 17}" r="6" class="cb-open${pc === o.rootPc ? " root" : ""}"/>`;
    else {
      const y = top + (f - (base <= 1 ? 1 : base) + 0.5) * fretH;
      const cls = pc === (o.bassPc ?? -1) && midi === v.notes[0] ? "bass" : pc === o.rootPc ? "root" : "";
      if (!(v.barre && f === v.barre && cls === "")) svg += `<circle cx="${x(s)}" cy="${y}" r="9" class="cb-dot ${cls}"/>`;
    }
    // Note name under each string.
    svg += `<text x="${x(s)}" y="${top + rows * fretH + 18}" text-anchor="middle" class="cb-note">${f < 0 ? "" : esc(noteName(pc, Boolean(o.flats)))}</text>`;
    svg += `<text x="${x(s)}" y="${top + rows * fretH + 33}" text-anchor="middle" class="cb-tune">${esc(o.names[s])}</text>`;
  });
  const label = o.label || v.frets.map((f) => (f < 0 ? "x" : f)).join(" ");
  return `<svg class="chord-box" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}

/**
 * Bass neck map: frets 0–7 across, strings top (G) to bottom (E), every chord tone marked.
 * @param {{ string: number, fret: number, pc: number, root: boolean, bass: boolean }[]} spots
 * @param {{ names: string[], flats?: boolean, label: string }} o
 */
export function neckMap(spots, o) {
  const strings = o.names.length, frets = 7;
  const fw = 34, sh = 22, left = 22, top = 10;
  const w = left + fw * (frets + 1) + 6, h = top + sh * (strings - 1) + 30;
  const y = (/** @type {number} */ s) => top + (strings - 1 - s) * sh;
  let svg = `<line x1="${left + fw}" x2="${left + fw}" y1="${top - 4}" y2="${y(0) + 4}" class="cb-nut-line"/>`;
  for (let f = 2; f <= frets + 1; f++) svg += `<line x1="${left + f * fw}" x2="${left + f * fw}" y1="${top}" y2="${y(0)}" class="cb-fret"/>`;
  for (let s = 0; s < strings; s++) {
    svg += `<line x1="${left}" x2="${w - 6}" y1="${y(s)}" y2="${y(s)}" class="cb-string"/>`;
    svg += `<text x="${left - 8}" y="${y(s) + 4}" text-anchor="end" class="cb-tune">${esc(o.names[s])}</text>`;
  }
  for (const f of [3, 5, 7]) svg += `<text x="${left + f * fw + fw / 2}" y="${y(0) + 20}" text-anchor="middle" class="cb-tune">${f}</text>`;
  for (const p of spots) {
    const cx = p.fret === 0 ? left + fw / 2 : left + p.fret * fw + fw / 2;
    svg += `<circle cx="${cx}" cy="${y(p.string)}" r="8.5" class="cb-dot ${p.bass ? "bass" : p.root ? "root" : "tone"}"/><text x="${cx}" y="${y(p.string) + 3.5}" text-anchor="middle" class="cb-in">${esc(noteName(p.pc, Boolean(o.flats)))}</text>`;
  }
  return `<svg class="neck-map" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label)}">${svg}</svg>`;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/**
 * Piano keys with the chord's notes marked (bass note in its own colour).
 * @param {{ bass: number, notes: number[] }} v MIDI notes
 * @param {{ flats?: boolean, label: string }} o
 */
export function pianoKeys(v, o) {
  const lo = Math.floor(Math.min(v.bass, ...v.notes) / 12) * 12;
  const hi = Math.ceil((Math.max(v.bass, ...v.notes) + 1) / 12) * 12 - 1;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (WHITE.includes(mod12(m))) whites.push(m);
  const kw = 22, kh = 92, bw = 14, bh = 58;
  const w = whites.length * kw + 2, h = kh + 4;
  const on = new Set(v.notes);
  let svg = "";
  whites.forEach((m, i) => {
    const cls = m === v.bass ? "bass" : on.has(m) ? "on" : "";
    svg += `<rect x="${1 + i * kw}" y="1" width="${kw - 1}" height="${kh}" rx="3" class="pk-w ${cls}"/>`;
    if (cls) svg += `<text x="${1 + i * kw + kw / 2 - 0.5}" y="${kh - 8}" text-anchor="middle" class="pk-l ${cls}">${esc(noteName(m, Boolean(o.flats)))}</text>`;
  });
  whites.forEach((m, i) => {
    if (![0, 2, 5, 7, 9].includes(mod12(m)) || m + 1 > hi) return;
    const b = m + 1;
    const cls = b === v.bass ? "bass" : on.has(b) ? "on" : "";
    const bx = 1 + (i + 1) * kw - bw / 2 - 0.5;
    svg += `<rect x="${bx}" y="1" width="${bw}" height="${bh}" rx="2" class="pk-b ${cls}"/>`;
    if (cls) svg += `<text x="${bx + bw / 2}" y="${bh - 8}" text-anchor="middle" class="pk-l on-b">${esc(noteName(b, Boolean(o.flats)).replace(/[#b]$/, (a) => (a === "#" ? "♯" : "♭")))}</text>`;
  });
  return `<svg class="piano-keys" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label)}">${svg}</svg>`;
}
