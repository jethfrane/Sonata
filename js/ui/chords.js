// @ts-check
// Chords: look up any chord (or tap one in a chart) and see it on guitar, ukulele,
// bass and piano, with every shape Sonata can find. Tap to hear it.
import { $, esc, icon, openSheet, paintIcons, toast, copyText } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, tick, renderOptions } from "./ctx.js";
import { pretty, noteName, NOTE_TO_PC } from "../core/music.js";
import { uniqueChords } from "../core/chart.js";
import { QUALITIES, QUALITY_GROUPS, describeChord, voicings, bassMap, pianoVoicing, inversions, TUNINGS, ROOTS } from "../core/chords.js";
import { chordBox, neckMap, pianoKeys } from "./diagrams.js";
import { playChord, pluck, piano } from "../audio.js";

const KEY = "sonata_chord";
let current = "C";
/** Which shape is shown per instrument (reset when the chord changes). */
const shape = { guitar: 0, ukulele: 0 };

/** @param {string} name */
const flatsFor = (name) => /^[A-G]b|\/[A-G]b/.test(name) || /^(F|Bb|Eb|Ab|Db|Gb)(?![#])/.test(name) || /^(D|G|C|F)m/.test(name);

/** Hear a chord. @param {string} name @param {"piano"|"guitar"|"ukulele"|"bass"} [voice] */
export function hear(name, voice = "piano") {
  const d = describeChord(name);
  if (!d) return;
  tick();
  if (voice === "piano") { const v = pianoVoicing(name); if (v) { piano(v.bass, 0.6); v.notes.forEach((m) => piano(m, 0.62)); } return; }
  if (voice === "bass") { const v = pianoVoicing(name); if (v) pluck(v.bass - 12, "bass", 0.9); return; }
  const tun = voice === "ukulele" ? TUNINGS.ukulele.strings : TUNINGS.guitar.strings;
  const vs = voicings(name, tun);
  const v = vs[Math.min(shape[voice], vs.length - 1)];
  if (!v) { playChord(d.pcs, "guitar", d.bassPc); return; }
  // Strum low to high (ukulele: string order, its high G rings first).
  v.frets.forEach((f, i) => { if (f >= 0) pluck(tun[i] + f, voice === "ukulele" ? "uke" : "guitar", 0.8, i * 0.028); });
}

/** Chord diagrams for one chord, as HTML. @param {string} name @param {{ compact?: boolean }} [o] */
function diagramsHtml(name, o = {}) {
  const d = describeChord(name);
  if (!d) return "";
  const flats = flatsFor(d.name);
  const card = (/** @type {string} */ inst, /** @type {string} */ title, /** @type {string} */ inner, /** @type {string} */ foot = "") =>
    `<article class="card dg-card" data-inst="${inst}"><header class="dg-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn small" data-hear="${inst}" aria-label="${esc(t("hearOn", "Play on {i}", { i: title }))}">${icon("play")}</button></header>${inner}${foot}</article>`;
  const fretted = (/** @type {"guitar"|"ukulele"} */ inst) => {
    const tun = TUNINGS[inst];
    const vs = voicings(name, tun.strings);
    if (!vs.length) return card(inst, tun.label, `<p class="muted dg-none">${esc(t("noShape", "No easy shape for this chord on {i}.", { i: tun.label }))}</p>`);
    const i = Math.min(shape[inst], vs.length - 1);
    const v = vs[i];
    const where = v.base > 1 ? t("atFret", "at fret {n}", { n: v.base }) : t("openPos", "open position");
    const nav = vs.length > 1 ? `<div class="dg-nav"><button type="button" class="icon-btn small" data-shape="${inst}:-1" aria-label="${esc(t("prevShape", "Previous shape"))}" ${i === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><span>${i + 1} / ${vs.length} · ${esc(where)}${v.barre ? " · " + esc(t("barre", "barre")) : ""}</span><button type="button" class="icon-btn small" data-shape="${inst}:1" aria-label="${esc(t("nextShape", "Next shape"))}" ${i === vs.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button></div>` : `<div class="dg-nav"><span>${esc(where)}</span></div>`;
    return card(inst, tun.label, chordBox(v, { names: tun.names, tuning: tun.strings, rootPc: d.rootPc, bassPc: d.bassPc, flats, label: `${pretty(d.name)} ${tun.label}: ${v.frets.map((f) => (f < 0 ? "x" : f)).join(" ")}` }), nav);
  };
  const pv = pianoVoicing(name);
  const pianoCard = pv ? card("piano", t("piano", "Piano"), pianoKeys(pv, { flats, label: `${pretty(d.name)} on piano: ${[pv.bass, ...pv.notes].map((m) => noteName(m, flats)).join(" ")}` }), `<p class="dg-cap">${esc(t("leftHand", "Left hand"))}: ${esc(pretty(noteName(pv.bass, flats)))} · ${esc(t("rightHand", "right hand"))}: ${esc(pv.notes.map((m) => pretty(noteName(m, flats))).join(" "))}</p>`) : "";
  const bassCard = card("bass", t("bass", "Bass"), neckMap(bassMap(name), { names: TUNINGS.bass.names, flats, label: `${pretty(d.name)} notes on bass` }), `<p class="dg-cap">${esc(t("bassHint", "Play the bass note ({n}); the other dots are chord tones for fills.", { n: pretty(d.bassNote || d.root) }))}</p>`);
  return `<div class="dg-grid${o.compact ? " compact" : ""}">${fretted("guitar")}${pianoCard}${fretted("ukulele")}${bassCard}</div>`;
}

/** Name, notes and formula. @param {string} name */
function headHtml(name) {
  const d = describeChord(name);
  if (!d) return "";
  const notes = d.notes.map((n, i) => `<span class="cr-note${i === 0 ? " root" : ""}"><b>${esc(pretty(n))}</b><small>${esc(d.formula[i])}</small></span>`).join("");
  const full = `${pretty(d.root)} ${d.label === "Major" ? t("major", "major") : d.label === "Minor" ? t("minor", "minor") : pretty(d.label)}${d.bass ? ` ${t("over", "over")} ${pretty(d.bassNote)}` : ""}`;
  return `<div class="cr-head"><div><h2 class="cr-name">${esc(pretty(d.name))}</h2><p class="cr-full">${esc(full)}</p></div>
    <div class="cr-notes">${d.bass ? `<span class="cr-note bass"><b>${esc(pretty(d.bassNote))}</b><small>${esc(t("bassNote", "bass"))}</small></span>` : ""}${notes}</div></div>`;
}

/** Slash versions and the same chord's relatives. @param {string} name */
function relatedHtml(name) {
  const d = describeChord(name);
  if (!d) return "";
  const base = d.root + d.quality;
  const inv = inversions(base);
  const near = ["", "m", "7", "maj7", "m7", "sus2", "sus4", "add9", "6"].map((q) => d.root + q).filter((x) => x !== base);
  const chip = (/** @type {string} */ c) => `<button type="button" class="chip chord-chip${c === d.name ? " on" : ""}" data-pick="${esc(c)}">${esc(pretty(c))}</button>`;
  return `<div class="cr-rel"><p class="mini-label">${esc(t("slashChords", "Slash chords"))}</p><div class="chip-row">${[base, ...inv].map(chip).join("")}</div>
    <p class="mini-label">${esc(t("sameRoot", "Same root"))}</p><div class="chip-row">${near.map(chip).join("")}</div></div>`;
}

/** Chords used in the open song (for one-tap lookup). */
function songChords() {
  const s = store.active();
  if (!s || !s.body.trim()) return [];
  return uniqueChords(s.body, renderOptions(s, "chords"));
}

export function initChords() {
  try { const c = localStorage.getItem(KEY); if (c && describeChord(c)) current = c; } catch { /* ignore */ }
  const view = $("view-chords");
  $("chordRoots").innerHTML = ROOTS.map((r) => `<button type="button" class="key-btn" data-root="${r}">${esc(pretty(r))}</button>`).join("");
  $("chordQuals").innerHTML = QUALITY_GROUPS.map((g) => `<div class="cq-group"><span class="cq-label">${esc(g)}</span><div class="chip-row">${QUALITIES.filter((q) => q.group === g).map((q) => `<button type="button" class="chip" data-qual="${esc(q.id)}">${esc(pretty(q.label))}</button>`).join("")}</div></div>`).join("");
  const bassSel = /** @type {HTMLSelectElement} */ ($("chordBass"));
  bassSel.innerHTML = `<option value="">${esc(t("noSlash", "Root (no slash)"))}</option>` + ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((n) => `<option value="${n}">/ ${esc(pretty(n))}</option>`).join("");
  view.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const b = /** @type {HTMLElement|null} */ (el.closest("button"));
    if (!b) return;
    const d = describeChord(current);
    if (b.dataset.root && d) select(b.dataset.root + d.quality + (d.bass ? "/" + d.bass : ""));
    else if (b.dataset.qual !== undefined && d) select(d.root + b.dataset.qual + (d.bass ? "/" + d.bass : ""));
    else if (b.dataset.pick) select(b.dataset.pick);
    else if (b.dataset.hear) hear(current, /** @type {any} */ (b.dataset.hear));
    else if (b.dataset.shape) step(b.dataset.shape);
    else if (b.id === "chordCopy") copyText(current).then((ok) => ok && toast(t("copied", "Copied"), "success"));
  });
  bassSel.addEventListener("change", () => { const d = describeChord(current); if (d) select(d.root + d.quality + (bassSel.value && NOTE_TO_PC[bassSel.value] !== d.rootPc ? "/" + bassSel.value : "")); });
  const search = /** @type {HTMLInputElement} */ ($("chordSearch"));
  const tryName = () => {
    const v = search.value.trim().replace(/♯/g, "#").replace(/♭/g, "b").replace(/\s+/g, "");
    const fixed = v.charAt(0).toUpperCase() + v.slice(1);
    const d = describeChord(fixed);
    search.setAttribute("aria-invalid", String(Boolean(v) && !d));
    $("chordSearchHint").textContent = v && !d ? t("notAChord", "Not a chord Sonata knows. Try Am7, D/F#, Csus4, Bbmaj9.") : "";
    if (d) select(d.name, { keepSearch: true });
  };
  search.addEventListener("input", tryName);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); search.blur(); } });
}

/** @param {string} spec "guitar:1" */
function step(spec) {
  const [inst, d] = spec.split(":");
  if (inst !== "guitar" && inst !== "ukulele") return;
  shape[inst] = Math.max(0, shape[inst] + Number(d));
  renderChords();
  hear(current, inst);
}

/** Show a chord (from a tap, a search or a link). @param {string} name @param {{ keepSearch?: boolean, silent?: boolean }} [o] */
export function select(name, o = {}) {
  const d = describeChord(name);
  if (!d) return;
  const changed = d.name !== current;
  current = d.name;
  if (changed) { shape.guitar = 0; shape.ukulele = 0; }
  try { localStorage.setItem(KEY, current); } catch { /* ignore */ }
  if (!o.keepSearch) /** @type {HTMLInputElement} */ ($("chordSearch")).value = "";
  renderChords();
  if (!o.silent) hear(current, "piano");
  app.onChordChange?.(current);
}

export const currentChord = () => current;

export function renderChords() {
  const d = describeChord(current);
  if (!d) return;
  document.querySelectorAll("#chordRoots [data-root]").forEach((b) => { const on = NOTE_TO_PC[/** @type {HTMLElement} */ (b).dataset.root || ""] === d.rootPc; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  document.querySelectorAll("#chordQuals [data-qual]").forEach((b) => { const on = /** @type {HTMLElement} */ (b).dataset.qual === d.quality; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  /** @type {HTMLSelectElement} */ ($("chordBass")).value = d.bass ? (["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].find((n) => NOTE_TO_PC[n] === d.bassPc) || "") : "";
  const sc = songChords();
  $("songChordsRow").hidden = !sc.length;
  $("songChordsList").innerHTML = sc.map((c) => `<button type="button" class="chip chord-chip${c === d.name ? " on" : ""}" data-pick="${esc(c)}">${esc(pretty(c))}</button>`).join("");
  $("chordResult").innerHTML = `<section class="card cr-card">${headHtml(current)}
      <div class="cr-actions"><button type="button" class="btn primary" data-hear="piano">${icon("play")}${esc(t("playIt", "Play"))}</button><button type="button" class="btn" data-hear="guitar">${icon("guitar")}${esc(t("strum", "Strum"))}</button><button type="button" class="btn ghost" id="chordCopy">${icon("copy")}${esc(t("copyName", "Copy"))}</button></div>
      ${relatedHtml(current)}</section>${diagramsHtml(current)}`;
  paintIcons($("view-chords"));
}

/**
 * A chord in a sheet, from a chart, Theory or Play: shapes and sound without leaving the page.
 * @param {string} name
 */
export function openChordSheet(name) {
  const d = describeChord(name);
  if (!d) return;
  shape.guitar = 0; shape.ukulele = 0;
  const draw = () => `${headHtml(d.name)}<div class="cr-actions"><button type="button" class="btn primary" data-hear="piano">${icon("play")}${esc(t("playIt", "Play"))}</button><button type="button" class="btn" data-hear="guitar">${icon("guitar")}${esc(t("strum", "Strum"))}</button></div>${diagramsHtml(d.name, { compact: true })}`;
  const body = openSheet({
    title: pretty(d.name), wide: true, className: "chord-sheet", focus: false, body: draw(),
    actions: [{ label: t("openInChords", "Open in Chords"), kind: "ghost", onClick: () => { app.show("chords", { sub: d.name }); } }, { label: t("done", "Done"), kind: "primary" }]
  });
  paintIcons(body);
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.dataset.hear) hear(d.name, /** @type {any} */ (b.dataset.hear));
    if (b.dataset.shape) {
      const [inst, n] = b.dataset.shape.split(":");
      if (inst === "guitar" || inst === "ukulele") { shape[inst] = Math.max(0, shape[inst] + Number(n)); body.innerHTML = draw(); paintIcons(body); hear(d.name, inst); }
    }
  });
  hear(d.name, "piano");
}

/** For tests and the router: make sure the root of a chord exists. @param {string} name */
export const isChord = (name) => Boolean(describeChord(name));
