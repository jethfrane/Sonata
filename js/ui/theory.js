// @ts-check
import { $, $$, esc, toast } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, tick } from "./ctx.js";
import {
  CIRCLE, keyFromTonic, prefersFlats, noteName, diatonicChords, keySignature, relativeKey,
  pretty, keyShort, keyValue, mod12, chordTones, parseChord, SHARP_NOTES
} from "../core/music.js";
import { playChord } from "../audio.js";

/** @type {import("../core/music.js").Key|null} null = follow the song */
let picked = null;
let format = "roman";

const ORDER_SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const ORDER_FLATS = ["B", "E", "A", "D", "G", "C", "F"];

export function theoryKey() {
  return picked || soundingKey(store.active());
}

export function initTheory() {
  try { format = localStorage.getItem("sonata_circle_format") === "nashville" ? "nashville" : "roman"; } catch { /* ignore */ }
  $$("[data-circle-format]").forEach((b) => b.addEventListener("click", () => {
    format = b.dataset.circleFormat || "roman";
    try { localStorage.setItem("sonata_circle_format", format); } catch { /* ignore */ }
    renderTheory();
  }));
  $$("[data-key-mode]").forEach((b) => b.addEventListener("click", () => {
    const k = theoryKey();
    const mode = /** @type {"major"|"minor"} */ (b.dataset.keyMode);
    if (mode !== k.mode) picked = mode === "minor" ? keyFromTonic(k.tonic + 9, "minor") : keyFromTonic(k.tonic + 3, "major");
    renderTheory();
  }));
  $("keyPicker").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-tonic]"));
    if (!b) return;
    picked = keyFromTonic(Number(b.dataset.tonic), theoryKey().mode);
    tick();
    renderTheory();
  });
  $("circle").addEventListener("click", onWedge);
  $("circle").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWedge(e); } });
  $("diatonic").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-chord]"));
    if (b) { tick(); playChord(chordTones(b.dataset.chord || "")); }
  });
  $("theoryFromSongBtn").addEventListener("click", () => { picked = null; renderTheory(); });
  $("theoryToSongBtn").addEventListener("click", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    const k = theoryKey();
    // Set the transpose so the song sounds in the chosen key, keeping the written chart.
    const written = soundingKey({ ...s, transpose: 0 });
    let tr = mod12(k.tonic - written.tonic);
    if (tr > 6) tr -= 12;
    if (written.mode !== k.mode) { store.update(s, { manualKey: keyValue(k), transpose: 0 }); }
    else store.update(s, { transpose: tr });
    picked = null;
    toast(t("keyOf", "Key of {key}", { key: pretty(k.name) }), "success");
    renderTheory();
  });
  store.on("change", () => { if (app.view === "theory") renderTheory(); });
  store.on("song-open", () => { picked = null; if (app.view === "theory") renderTheory(); });
}

/** @param {Event} e */
function onWedge(e) {
  const g = /** @type {SVGElement|null} */ (/** @type {Element} */ (e.target).closest("[data-wedge]"));
  if (!g) return;
  const pc = Number(g.getAttribute("data-pc"));
  const ring = g.getAttribute("data-ring");
  tick();
  if (ring === "dim") { playChord([pc, mod12(pc + 3), mod12(pc + 6)]); return; }
  const mode = ring === "minor" ? "minor" : "major";
  picked = keyFromTonic(pc, mode);
  playChord(mode === "minor" ? [pc, mod12(pc + 3), mod12(pc + 7)] : [pc, mod12(pc + 4), mod12(pc + 7)]);
  renderTheory();
}

/** @param {number} cx @param {number} cy @param {number} r @param {number} deg */
const pt = (cx, cy, r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

/** @param {number} r1 outer @param {number} r2 inner @param {number} a1 @param {number} a2 */
function arc(r1, r2, a1, a2) {
  const [x1, y1] = pt(200, 200, r1, a1), [x2, y2] = pt(200, 200, r1, a2);
  const [x3, y3] = pt(200, 200, r2, a2), [x4, y4] = pt(200, 200, r2, a1);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r1} ${r1} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${r2} ${r2} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}

/** Numeral of a chord in the selected key. @param {number} pc @param {string} q @param {import("../core/music.js").Key} key */
function numeral(pc, q, key) {
  const c = parseChord(SHARP_NOTES[pc] + q);
  if (!c) return "";
  const d = diatonicChords(key).find((x) => x.pc === pc && ((x.quality === "minor") === (q === "m")) && ((x.quality === "diminished") === (q === "dim")));
  if (!d) return "";
  if (format === "nashville") return String(d.degree) + (q === "m" ? "m" : q === "dim" ? "°" : "");
  return d.numeral;
}

function renderCircle() {
  const key = theoryKey();
  const flats = prefersFlats(key);
  // Index of the relative major on the circle; the key family sits on its wedge and both neighbours.
  const majorPc = key.mode === "minor" ? mod12(key.tonic + 3) : key.tonic;
  const home = CIRCLE.indexOf(majorPc);
  const near = (/** @type {number} */ i) => { const d = mod12(i - home); return d === 0 || d === 1 || d === 11; };
  /** @param {number} pc @param {number} i position on the circle */
  const nm = (pc, i) => {
    // Use key context for the enharmonic wedges at the bottom of the circle.
    if (i >= 5 && i <= 7) return noteName(pc, flats);
    return noteName(pc, i > 6);
  };
  let svg = `<svg viewBox="0 0 400 400" class="circle-svg" role="presentation">`;
  CIRCLE.forEach((pc, i) => {
    const a1 = i * 30 - 15, a2 = i * 30 + 15;
    const minorPc = mod12(pc + 9), dimPc = mod12(pc + 11);
    const fam = near(i);
    const rings = [
      { ring: "major", pc, r1: 194, r2: 138, label: nm(pc, i), q: "", size: 19, rText: 166, active: key.mode === "major" && key.tonic === pc },
      { ring: "minor", pc: minorPc, r1: 136, r2: 94, label: nm(minorPc, i) + "m", q: "m", size: 14.5, rText: 115, active: key.mode === "minor" && key.tonic === minorPc },
      { ring: "dim", pc: dimPc, r1: 92, r2: 64, label: nm(dimPc, i) + "°", q: "dim", size: 11, rText: 78, active: false }
    ];
    for (const w of rings) {
      const inKey = w.ring === "dim" ? mod12(i - home) === 0 : fam;
      const num = inKey ? numeral(w.pc, w.q, key) : "";
      const [tx, ty] = pt(200, 200, w.rText, i * 30);
      const cls = `wedge ${w.ring}${inKey ? " family" : ""}${w.active ? " tonic" : ""}`;
      const label = `${pretty(w.label)}${num ? `, ${num}` : ""}`;
      svg += `<g class="${cls}" data-wedge data-ring="${w.ring}" data-pc="${w.pc}" tabindex="0" role="button" aria-label="${esc(label)}">
        <path d="${arc(w.r1, w.r2, a1, a2)}"/>
        <text x="${tx.toFixed(1)}" y="${(ty + (num ? -3 : 1)).toFixed(1)}" font-size="${w.size}">${esc(pretty(w.label))}</text>
        ${num ? `<text class="num" x="${tx.toFixed(1)}" y="${(ty + w.size * 0.72).toFixed(1)}" font-size="${Math.max(8, w.size * 0.58)}">${esc(pretty(num))}</text>` : ""}
      </g>`;
    }
  });
  const sig = keySignature(key);
  const sigText = sig === 0 ? "♮" : `${Math.abs(sig)}${sig > 0 ? "♯" : "♭"}`;
  svg += `<circle cx="200" cy="200" r="61" class="hub"/>
    <text x="200" y="196" class="hub-key">${esc(pretty(keyShort(key)))}</text>
    <text x="200" y="222" class="hub-sub">${esc(sigText)}</text></svg>`;
  $("circle").innerHTML = svg;
}

export function renderTheory() {
  const key = theoryKey();
  $$("[data-circle-format]").forEach((b) => { const on = b.dataset.circleFormat === format; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $$("[data-key-mode]").forEach((b) => { const on = b.dataset.keyMode === key.mode; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $("keyPicker").innerHTML = Array.from({ length: 12 }, (_, pc) => {
    const k = keyFromTonic(pc, key.mode);
    const on = pc === key.tonic;
    return `<button type="button" class="key-btn${on ? " on" : ""}" data-tonic="${pc}" aria-pressed="${on}">${esc(pretty(k.root))}</button>`;
  }).join("");
  $("keyTitle").textContent = pretty(key.name);
  const sig = keySignature(key);
  const accs = sig > 0 ? ORDER_SHARPS.slice(0, sig).map((n) => n + "♯") : ORDER_FLATS.slice(0, -sig).map((n) => n + "♭");
  $("keySig").textContent = sig === 0 ? t("noAccidentals", "No sharps or flats") : `${Math.abs(sig)} ${sig > 0 ? "♯" : "♭"} · ${accs.join(" ")}`;
  const rel = relativeKey(key);
  $("keyRelative").textContent = pretty(rel.name);
  $("diatonic").innerHTML = diatonicChords(key).map((d) => {
    const n = format === "nashville" ? String(d.degree) + (d.quality === "minor" ? "m" : d.quality === "diminished" ? "°" : "") : d.numeral;
    return `<button type="button" class="dia${d.degree === 1 ? " tonic" : ""}" data-chord="${esc(d.name)}"><span class="dia-num">${esc(pretty(n))}</span><span class="dia-name">${esc(pretty(d.name.replace(/dim$/, "°")))}</span></button>`;
  }).join("");
  const s = store.active();
  /** @type {HTMLButtonElement} */ ($("theoryFromSongBtn")).hidden = !picked;
  /** @type {HTMLButtonElement} */ ($("theoryToSongBtn")).disabled = !s || Boolean(s.readonly) || !picked;
  renderCircle();
}
