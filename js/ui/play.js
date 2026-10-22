// @ts-check
import { $, $$, esc } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, shapeKey, renderOptions, tick } from "./ctx.js";
import { uniqueChords } from "../core/chart.js";
import { SCALES, mod12, noteName, prefersFlats, keyFromTonic, keyShort, pretty, chordTones, parseChord, diatonicChords, CHORD_TYPES, chordsForKey } from "../core/music.js";
import { piano, pluck, playChord } from "../audio.js";
import { initTuner, setTuning, renderTunerStrings, stopTuner } from "./tuner.js";

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
const INSTS = ["piano", "guitar", "tuner"];

/** Each instrument keeps its own chord player: what it shows and which family of chords. */
const players = {
  piano: { chord: /** @type {string|null} */ (null), type: "song" },
  guitar: { chord: /** @type {string|null} */ (null), type: "song" }
};
/** @type {string} */
let inst = "piano";
/** @type {string|null} key value like "G:major" or null to follow the song */
let pickedKey = null;
/** @type {keyof typeof TUNINGS} */
let tuning = "guitar";

export const currentInstrument = () => inst;

/** Switch the visible instrument. @param {string} name */
export function setInstrument(name) {
  const want = name === "fretboard" ? "guitar" : name;
  if (!INSTS.includes(want)) return;
  inst = want;
  try { localStorage.setItem("sonata_play_inst", inst); } catch { /* ignore */ }
  if (inst !== "tuner") stopTuner();
  paintInstrument();
}

function paintInstrument() {
  $("view-play").dataset.inst = inst;
  $$("[data-inst]").forEach((b) => { const on = b.dataset.inst === inst; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $$("[data-inst-panel]").forEach((el) => { el.hidden = el.dataset.instPanel !== inst; });
}

export function playKey() {
  if (pickedKey) { const [r, m] = pickedKey.split(":"); return keyFromTonic(Number(r), /** @type {any} */ (m)); }
  return shapeKey(store.active());
}

function savePlayer() {
  try { localStorage.setItem("sonata_players", JSON.stringify(players)); } catch { /* ignore */ }
}

export function initPlay() {
  try {
    const saved = localStorage.getItem("sonata_tuning");
    if (saved && saved in TUNINGS) tuning = /** @type {any} */ (saved);
    const pi = localStorage.getItem("sonata_play_inst");
    if (pi && INSTS.includes(pi)) inst = pi;
    const sp = JSON.parse(localStorage.getItem("sonata_players") || "null");
    if (sp) for (const k of /** @type {const} */ (["piano", "guitar"])) if (sp[k]) { players[k].type = String(sp[k].type || "song"); players[k].chord = sp[k].chord || null; }
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
  $$("button[data-inst]").forEach((b) => b.addEventListener("click", () => { tick(); app.show("play", { sub: b.dataset.inst }); }));
  $("playKeySelect").addEventListener("change", (e) => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value;
    pickedKey = v === "song" ? null : v;
    players.piano.chord = null; players.guitar.chord = null;
    renderPlay();
  });
  for (const name of /** @type {const} */ (["piano", "guitar"])) {
    $(name + "Player").addEventListener("click", (e) => onPlayer(name, /** @type {HTMLElement} */ (e.target)));
    $(name + "Player").addEventListener("change", (e) => {
      const el = /** @type {HTMLSelectElement} */ (e.target);
      if (el.dataset.role !== "type") return;
      players[name].type = el.value;
      players[name].chord = null;
      savePlayer();
      renderPlay();
    });
  }
  $("pianoLabels").addEventListener("change", renderPiano);
  bindPress($("piano"), ".pk", (el) => piano(Number(el.dataset.midi), 0.75));
  bindPress($("fretboard"), ".fc", (el) => pluck(Number(el.dataset.midi), /** @type {any} */ (TUNINGS[tuning].kind), 0.85));
  initTuner(TUNINGS[tuning]);
  paintInstrument();
  store.on("change", () => { if (app.view === "play") renderPlay(); });
  store.on("song-open", () => { players.piano.chord = null; players.guitar.chord = null; pickedKey = null; if (app.view === "play") renderPlay(); });
}

/** @param {"piano"|"guitar"} name @param {HTMLElement} target */
function onPlayer(name, target) {
  const btn = /** @type {HTMLElement|null} */ (target.closest("button"));
  if (!btn) return;
  const p = players[name];
  const role = btn.dataset.role;
  tick();
  if (role === "scale") { p.chord = null; }
  else if (role === "again") { if (p.chord) playFor(name, p.chord); return; }
  else if (btn.dataset.chord) { p.chord = btn.dataset.chord; playFor(name, p.chord); }
  savePlayer();
  renderInstrument(name);
  renderPlayer(name);
}

/** Sound a chord with the instrument's own voice. @param {"piano"|"guitar"} name @param {string} chord */
function playFor(name, chord) {
  const pcs = chordTones(chord);
  if (pcs.length) playChord(pcs, name === "guitar" ? "guitar" : "piano");
}

/** Chord names for one player: the song's own chords, or a family built from the key. @param {"piano"|"guitar"} name */
function chordsFor(name) {
  const type = players[name].type;
  if (type === "song") {
    const names = songChordNames();
    return (names.length ? names : diatonicChords(playKey()).map((d) => d.name)).slice(0, 18);
  }
  return chordsForKey(playKey(), type).map((c) => c.name);
}

/** @param {"piano"|"guitar"} name */
function renderPlayer(name) {
  const p = players[name];
  const hasSong = songChordNames().length > 0;
  let type = p.type;
  if (type === "song" && !hasSong) type = "song";
  const types = [{ id: "song", label: hasSong ? t("songChords", "Song chords") : t("keyChords", "Chords in key") }, ...CHORD_TYPES];
  const list = chordsFor(name);
  if (p.chord && !list.includes(p.chord)) p.chord = null;
  const sel = `<select class="select cp-type" data-role="type" aria-label="${esc(t("chordType", "Chord type"))}">${types.map((x) => `<option value="${x.id}"${x.id === type ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`;
  const chips = list.map((c) => `<button type="button" class="chip chord-chip${p.chord === c ? " on" : ""}" data-chord="${esc(c)}" aria-pressed="${p.chord === c}">${esc(pretty(c))}</button>`).join("");
  $(name + "Player").innerHTML = `<div class="cp-bar">${sel}<button type="button" class="chip${p.chord ? "" : " on"}" data-role="scale">${esc(t("scaleChip", "Scale"))}</button>${p.chord ? `<button type="button" class="chip" data-role="again" aria-label="${esc(t("playAgain", "Play again"))}">▶ ${esc(name === "guitar" ? t("strum", "Strum") : t("playIt", "Play"))}</button>` : ""}</div><div class="cp-chips">${chips}</div>`;
}

/** @param {"piano"|"guitar"} name */
function renderInstrument(name) {
  if (name === "piano") renderPiano(); else renderFretboard();
}

function songChordNames() {
  const s = store.active();
  if (!s || !s.body.trim()) return [];
  // Shapes the player actually fingers (after transpose and capo).
  return uniqueChords(s.body, renderOptions(s, "chords"));
}

/** What to light up on one instrument: pitch classes, the root, and labels. @param {"piano"|"guitar"} name */
function highlight(name) {
  const key = playKey();
  const chord = players[name].chord;
  if (chord) {
    const c = parseChord(chord);
    const pcs = c ? chordTones(c) : [];
    const flats = c ? c.root.includes("b") || (!c.root.includes("#") && prefersFlats(key)) : false;
    return { pcs: new Set(pcs), root: c ? c.rootPc : -1, flats, label: t("chordOf", "Chord: {chord}", { chord: pretty(chord) }) };
  }
  const pcs = SCALES[key.mode].map((i) => mod12(key.tonic + i));
  return { pcs: new Set(pcs), root: key.tonic, flats: prefersFlats(key), label: t("scaleOf", "{key} scale", { key: pretty(key.name) }) };
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


function renderPiano() {
  const h = highlight("piano");
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
  const h = highlight("guitar");
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
  const s = store.active();
  const sel = /** @type {HTMLSelectElement} */ ($("playKeySelect"));
  const songK = shapeKey(s);
  let opts = `<option value="song">${esc(t("songKey", "Song key"))} (${esc(pretty(keyShort(songK)))})</option>`;
  for (const mode of /** @type {const} */ (["major", "minor"])) for (let pc = 0; pc < 12; pc++) {
    const k = keyFromTonic(pc, mode);
    opts += `<option value="${pc}:${mode}">${esc(pretty(keyShort(k)))}</option>`;
  }
  sel.innerHTML = opts;
  sel.value = pickedKey || "song";
  const h = highlight(inst === "guitar" ? "guitar" : "piano");
  $("playSub").textContent = s && s.capo && !pickedKey ? `${h.label} · ${t("capoN", "Capo {n}", { n: s.capo })}` : h.label;
  paintInstrument();
  renderPlayer("piano");
  renderPlayer("guitar");
  renderPiano();
  renderFretboard();
  renderTunerStrings();
}
