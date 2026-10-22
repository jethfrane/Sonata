// @ts-check
import { $, $$, esc } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, shapeKey, renderOptions, tick } from "./ctx.js";
import { uniqueChords } from "../core/chart.js";
import { SCALES, mod12, noteName, prefersFlats, keyFromTonic, keyShort, pretty, chordTones, parseChord, diatonicChords } from "../core/music.js";
import { piano, pluck, playChord } from "../audio.js";
import { initTuner, setTuning, renderTunerStrings } from "./tuner.js";

export const TUNINGS = {
  guitar: { label: "Guitar · E A D G B E", kind: "guitar", strings: [64, 59, 55, 50, 45, 40] },
  dropd: { label: "Guitar · Drop D", kind: "guitar", strings: [64, 59, 55, 50, 45, 38] },
  bass: { label: "Bass · E A D G", kind: "bass", strings: [43, 38, 33, 28] },
  bass5: { label: "Bass 5 · B E A D G", kind: "bass", strings: [43, 38, 33, 28, 23] },
  uke: { label: "Ukulele · G C E A", kind: "uke", strings: [69, 64, 60, 67] }
};
const FRETS = 15;
const PIANO_LOW = 48; // C3
const PIANO_HIGH = 83; // B5

/** @type {"scale"|"chord"} */
let show = "scale";
/** @type {string|null} */
let chord = null;
/** @type {string|null} key value like "G:major" or null to follow the song */
let pickedKey = null;
/** @type {keyof typeof TUNINGS} */
let tuning = "guitar";

export function playKey() {
  if (pickedKey) { const [r, m] = pickedKey.split(":"); return keyFromTonic(Number(r), /** @type {any} */ (m)); }
  return shapeKey(store.active());
}

export function initPlay() {
  try {
    const saved = localStorage.getItem("sonata_tuning");
    if (saved && saved in TUNINGS) tuning = /** @type {any} */ (saved);
  } catch { /* ignore */ }
  const tsel = /** @type {HTMLSelectElement} */ ($("tuningSelect"));
  tsel.innerHTML = Object.entries(TUNINGS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  tsel.value = tuning;
  tsel.addEventListener("change", () => {
    tuning = /** @type {any} */ (tsel.value);
    try { localStorage.setItem("sonata_tuning", tuning); } catch { /* ignore */ }
    setTuning(TUNINGS[tuning]);
    renderFretboard();
  });
  $$("[data-show]").forEach((b) => b.addEventListener("click", () => { show = /** @type {any} */ (b.dataset.show); if (show === "chord" && !chord) chord = firstChord(); renderPlay(); }));
  $("playKeySelect").addEventListener("change", (e) => { const v = /** @type {HTMLSelectElement} */ (e.target).value; pickedKey = v === "song" ? null : v; renderPlay(); });
  $("songChords").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-chord]"));
    if (!b) return;
    tick();
    chord = b.dataset.chord || null;
    show = "chord";
    playChord(chordTones(chord || ""), "guitar");
    renderPlay();
  });
  $("pianoLabels").addEventListener("change", renderPiano);
  bindPress($("piano"), ".pk", (el) => piano(Number(el.dataset.midi), 0.75));
  bindPress($("fretboard"), ".fc", (el) => pluck(Number(el.dataset.midi), /** @type {any} */ (TUNINGS[tuning].kind), 0.85));
  initTuner(TUNINGS[tuning]);
  store.on("change", () => { if (app.view === "play") renderPlay(); });
  store.on("song-open", () => { chord = null; pickedKey = null; if (app.view === "play") renderPlay(); });
}

/**
 * Press-and-hold playing with glide across keys/frets.
 * @param {HTMLElement} host @param {string} sel @param {(el: HTMLElement) => import("../audio.js").Voice} start
 */
function bindPress(host, sel, start) {
  /** @type {Map<number, { el: HTMLElement, voice: import("../audio.js").Voice }>} */
  const active = new Map();
  const end = (/** @type {number} */ id) => { const a = active.get(id); if (a) { a.voice.stop(); a.el.classList.remove("down"); active.delete(id); } };
  host.addEventListener("pointerdown", (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(sel));
    if (!el) return;
    e.preventDefault();
    end(e.pointerId);
    el.classList.add("down");
    active.set(e.pointerId, { el, voice: start(el) });
  });
  host.addEventListener("pointermove", (e) => {
    const a = active.get(e.pointerId);
    if (!a || e.pointerType === "mouse" && !e.buttons) return;
    const under = /** @type {HTMLElement|null} */ (document.elementFromPoint(e.clientX, e.clientY)?.closest(sel) || null);
    if (under && under !== a.el && host.contains(under)) {
      a.voice.stop();
      a.el.classList.remove("down");
      under.classList.add("down");
      active.set(e.pointerId, { el: under, voice: start(under) });
    }
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) host.addEventListener(ev, (e) => end(/** @type {PointerEvent} */ (e).pointerId));
  host.addEventListener("keydown", (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(sel));
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); const v = start(el); el.classList.add("down"); setTimeout(() => { v.stop(); el.classList.remove("down"); }, 600); }
  });
}

function songChordNames() {
  const s = store.active();
  if (!s || !s.body.trim()) return [];
  // Shapes the player actually fingers (after transpose and capo).
  return uniqueChords(s.body, renderOptions(s, "chords"));
}

function firstChord() {
  return songChordNames()[0] || diatonicChords(playKey())[0].name;
}

/** What to light up: pitch classes, the root, and labels. */
function highlight() {
  const key = playKey();
  if (show === "chord" && chord) {
    const c = parseChord(chord);
    const pcs = c ? chordTones(c) : [];
    const flats = c ? c.root.includes("b") || (!c.root.includes("#") && prefersFlats(key)) : false;
    return { pcs: new Set(pcs), root: c ? c.rootPc : -1, flats, label: t("chordOf", "Chord: {chord}", { chord: pretty(chord) }) };
  }
  const pcs = SCALES[key.mode].map((i) => mod12(key.tonic + i));
  return { pcs: new Set(pcs), root: key.tonic, flats: prefersFlats(key), label: t("scaleOf", "{key} scale", { key: pretty(key.name) }) };
}

function renderPiano() {
  const h = highlight();
  const labels = /** @type {HTMLInputElement} */ ($("pianoLabels")).checked;
  const whites = [];
  const blacks = [];
  let wi = 0;
  for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
    const pc = mod12(m);
    const black = [1, 3, 6, 8, 10].includes(pc);
    const on = h.pcs.has(pc);
    const root = pc === h.root;
    const name = noteName(pc, h.flats);
    const cls = `pk ${black ? "black" : "white"}${on ? " on" : ""}${root ? " root" : ""}`;
    const showName = labels && (on || !black);
    const html = `<button type="button" class="${cls}" data-midi="${m}" aria-label="${esc(name + (Math.floor(m / 12) - 1))}"${black ? ` style="--i:${wi}"` : ""}>${showName ? `<span>${esc(pretty(name))}${pc === 0 && !on ? `<sub>${Math.floor(m / 12) - 1}</sub>` : ""}</span>` : ""}</button>`;
    if (black) blacks.push(html); else { whites.push(html); wi++; }
  }
  const host = $("piano");
  host.style.setProperty("--whites", String(wi));
  host.innerHTML = `<div class="pk-whites">${whites.join("")}</div><div class="pk-blacks">${blacks.join("")}</div>`;
}

function renderFretboard() {
  const h = highlight();
  const tun = TUNINGS[tuning];
  const host = $("fretboard");
  host.style.setProperty("--strings", String(tun.strings.length));
  const marks = [3, 5, 7, 9, 12, 15];
  let head = `<div class="fb-row fb-nums"><span class="fb-open"></span>`;
  for (let f = 1; f <= FRETS; f++) head += `<span class="fb-num${marks.includes(f) ? " mark" : ""}">${f}</span>`;
  head += "</div>";
  const rows = tun.strings.map((open, si) => {
    let cells = "";
    for (let f = 0; f <= FRETS; f++) {
      const midi = open + f;
      const pc = mod12(midi);
      const on = h.pcs.has(pc);
      const root = pc === h.root;
      const name = noteName(pc, h.flats);
      cells += `<button type="button" class="fc${f === 0 ? " open" : ""}${on ? " on" : ""}${root ? " root" : ""}" data-midi="${midi}" aria-label="${esc(`${name} · fret ${f}`)}">${on ? `<span>${esc(pretty(name))}</span>` : ""}</button>`;
    }
    return `<div class="fb-row fb-string" style="--g:${(1 + si * 0.5).toFixed(2)}px">${cells}</div>`;
  }).join("");
  let inlays = `<div class="fb-inlays" aria-hidden="true"><span class="fb-open"></span>`;
  for (let f = 1; f <= FRETS; f++) inlays += `<span class="${f === 12 ? "dbl" : marks.includes(f) ? "dot" : ""}"></span>`;
  inlays += "</div>";
  host.innerHTML = head + `<div class="fb-board">${inlays}${rows}</div>`;
}

export function renderPlay() {
  const key = playKey();
  const s = store.active();
  $$("[data-show]").forEach((b) => { const on = b.dataset.show === show; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  const sel = /** @type {HTMLSelectElement} */ ($("playKeySelect"));
  const songK = shapeKey(s);
  let opts = `<option value="song">${esc(t("songKey", "Song key"))} (${esc(pretty(keyShort(songK)))})</option>`;
  for (const mode of /** @type {const} */ (["major", "minor"])) for (let pc = 0; pc < 12; pc++) {
    const k = keyFromTonic(pc, mode);
    opts += `<option value="${pc}:${mode}">${esc(pretty(keyShort(k)))}</option>`;
  }
  sel.innerHTML = opts;
  sel.value = pickedKey || "song";
  const names = songChordNames();
  const chips = (names.length ? names : diatonicChords(key).map((d) => d.name)).slice(0, 16);
  $("songChords").innerHTML = chips.map((c) => `<button type="button" class="chip chord-chip${show === "chord" && chord === c ? " on" : ""}" data-chord="${esc(c)}">${esc(pretty(c))}</button>`).join("");
  const h = highlight();
  $("playSub").textContent = s && s.capo && !pickedKey ? `${h.label} · ${t("capoN", "Capo {n}", { n: s.capo })}` : h.label;
  renderPiano();
  renderFretboard();
  renderTunerStrings();
}
