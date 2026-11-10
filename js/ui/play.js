// @ts-check
import { $, $$, esc } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, shapeKey, renderOptions, tick, drumLooper } from "./ctx.js";
import { uniqueChords } from "../core/chart.js";
import { SCALES, mod12, noteName, prefersFlats, keyFromTonic, keyShort, pretty, parseChord, diatonicChords, CHORD_TYPES, chordsForKey, chordInfo, identifyChord, transposeChord, DEGREE_FROM_SEMITONES, INTERVAL_LABELS } from "../core/music.js";
import { piano, pluck, playChord, preloadSamples } from "../audio.js";
import { initTuner, setTuning, renderTunerStrings, stopTuner } from "./tuner.js";
import { openChordSheet } from "./sheets-lazy.js";

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
const INSTS = ["piano", "guitar", "tuner", "metronome"];

/**
 * Computer keyboard → MIDI note map for playing the virtual piano directly from a laptop/desktop keyboard.
 * Middle row (A..') plays white keys C4..F5; top row (W E T Y U O P) plays black keys; bottom row (Z..M) plays C3..B3.
 * @type {Record<string, number>}
 */
export const KEY_TO_MIDI = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ";": 76, "'": 77,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59
};

/** Short computer key hint shown on C4–E5 keys when note labels are enabled. @type {Record<number, string>} */
const MIDI_TO_KBD = {
  60: "A", 61: "W", 62: "S", 63: "E", 64: "D", 65: "F", 66: "T", 67: "G", 68: "Y", 69: "H", 70: "U", 71: "J",
  72: "K", 73: "O", 74: "L", 75: "P", 76: ";"
};

/** Each instrument keeps its own chord player: what it shows, which family of chords, custom chords, and chord-builder state. */
const players = {
  piano: { chord: /** @type {string|null} */ (null), type: "song", build: false, custom: /** @type {string[]} */ ([]) },
  guitar: { chord: /** @type {string|null} */ (null), type: "song", build: false, custom: /** @type {string[]} */ ([]) }
};
/** Pinned notes in "Build chord" mode: piano stores MIDI numbers; guitar stores stringIndex → MIDI. */
const built = {
  piano: /** @type {number[]} */ ([]),
  guitar: /** @type {Map<number, number>} */ (new Map())
};
/** Auto-sustain keeps piano notes ringing smoothly for vocal warm-ups and chord practice. */
let sustain = true;
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
  $$("button[data-inst]").forEach((b) => { const on = b.dataset.inst === inst; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  $$("[data-inst-panel]").forEach((el) => { el.hidden = el.dataset.instPanel !== inst; });
}

export function playKey() {
  if (pickedKey) { const [r, m] = pickedKey.split(":"); return keyFromTonic(Number(r), /** @type {any} */ (m)); }
  return shapeKey(store.active());
}

function savePlayer() {
  try { localStorage.setItem("sonata_players", JSON.stringify(players)); } catch { /* ignore */ }
}

/** @param {"piano"|"guitar"} name */
function builtMidis(name) {
  return name === "piano" ? [...built.piano].sort((a, b) => a - b) : [...built.guitar.values()].sort((a, b) => a - b);
}

export function initPlay() {
  try {
    const saved = localStorage.getItem("sonata_tuning");
    if (saved && saved in TUNINGS) tuning = /** @type {any} */ (saved);
    const pi = localStorage.getItem("sonata_play_inst");
    if (pi && INSTS.includes(pi)) inst = pi;
    const sus = localStorage.getItem("sonata_sustain");
    if (sus !== null) sustain = sus !== "0";
    const sp = JSON.parse(localStorage.getItem("sonata_players") || "null");
    if (sp) for (const k of /** @type {const} */ (["piano", "guitar"])) if (sp[k]) {
      players[k].type = String(sp[k].type || "song");
      players[k].chord = sp[k].chord || null;
      players[k].custom = Array.isArray(sp[k].custom) ? sp[k].custom.filter((x) => typeof x === "string" && chordInfo(x)) : [];
    }
  } catch { /* ignore */ }
  const susEl = /** @type {HTMLInputElement|null} */ (document.getElementById("pianoSustain"));
  if (susEl) {
    susEl.checked = sustain;
    susEl.addEventListener("change", () => {
      sustain = susEl.checked;
      try { localStorage.setItem("sonata_sustain", sustain ? "1" : "0"); } catch { /* ignore */ }
    });
  }
  const tsel = /** @type {HTMLSelectElement} */ ($("tuningSelect"));
  tsel.innerHTML = Object.entries(TUNINGS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  tsel.value = tuning;
  tsel.addEventListener("change", () => {
    tuning = /** @type {any} */ (tsel.value);
    try { localStorage.setItem("sonata_tuning", tuning); } catch { /* ignore */ }
    built.guitar.clear();
    preloadSamples(/** @type {any} */ (TUNINGS[tuning].kind));
    setTuning(TUNINGS[tuning]);
    renderFretboard();
    renderReadout("guitar");
  });
  $$("button[data-inst]").forEach((b) => b.addEventListener("click", () => { tick(); app.show("play", { sub: b.dataset.inst }); }));
  $("view-play").querySelector(".inst-tabs")?.addEventListener("keydown", (ev) => {
    const e = /** @type {KeyboardEvent} */ (ev);
    const tabs = /** @type {HTMLButtonElement[]} */ ($$("button[data-inst]"));
    const i = tabs.findIndex((b) => b.dataset.inst === inst);
    const n = tabs.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tick(); app.show("play", { sub: tabs[to].dataset.inst });
    requestAnimationFrame(() => tabs[to].focus());
  });
  $("playKeySelect").addEventListener("change", (e) => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value;
    pickedKey = v === "song" ? null : v;
    players.piano.chord = null; players.guitar.chord = null;
    renderPlay();
  });
  for (const name of /** @type {const} */ (["piano", "guitar"])) {
    const host = $(name + "Player");
    host.addEventListener("click", (e) => onPlayer(name, /** @type {HTMLElement} */ (e.target)));
    host.addEventListener("change", (e) => {
      const el = /** @type {HTMLSelectElement|HTMLInputElement} */ (e.target);
      if (el.dataset.role === "type") {
        players[name].type = el.value;
        players[name].chord = null;
        players[name].build = false;
        savePlayer();
        renderPlay();
      } else if (el.dataset.role === "add-chord") {
        addTypedChord(name, /** @type {HTMLInputElement} */ (el));
      }
    });
    host.addEventListener("keydown", (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (el.dataset.role === "add-chord" && e.key === "Enter") {
        e.preventDefault();
        addTypedChord(name, /** @type {HTMLInputElement} */ (el));
      }
    });
  }
  $("pianoLabels").addEventListener("change", renderPiano);
  bindPress("piano", $("piano"), ".pk", (el) => piano(Number(el.dataset.midi), 0.78), (m) => { held.piano = m; renderReadout("piano"); });
  bindPress("guitar", $("fretboard"), ".fc", (el) => pluck(Number(el.dataset.midi), /** @type {any} */ (TUNINGS[tuning].kind), 0.85), (m) => { held.guitar = m; renderReadout("guitar"); });
  bindKeyboardPiano();
  initTuner(TUNINGS[tuning]);
  paintInstrument();
  store.on("change", () => { if (app.view === "play") renderPlay(); });
  store.on("song-open", () => { players.piano.chord = null; players.guitar.chord = null; pickedKey = null; if (app.view === "play") renderPlay(); });
}

/** Parse and add one or more typed chords (e.g. "D/F#" or "G D Em C") into the active player. @param {"piano"|"guitar"} name @param {HTMLInputElement} input */
function addTypedChord(name, input) {
  const raw = input.value.trim();
  if (!raw) return;
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  let lastValid = /** @type {string|null} */ (null);
  const p = players[name];
  for (const tok of tokens) {
    const clean = tok.replace(/♯/g, "#").replace(/♭/g, "b");
    const fixed = clean.charAt(0).toUpperCase() + clean.slice(1);
    const info = chordInfo(fixed);
    if (info) {
      if (!p.custom.includes(info.name)) p.custom.push(info.name);
      lastValid = info.name;
    }
  }
  if (!lastValid) {
    input.setAttribute("aria-invalid", "true");
    return;
  }
  input.removeAttribute("aria-invalid");
  input.value = "";
  p.build = false;
  p.chord = lastValid;
  savePlayer();
  playFor(name, lastValid);
  renderInstrument(name);
  renderPlayer(name);
  renderReadout(name);
}

/** Sound the notes pinned in Build chord mode. @param {"piano"|"guitar"} name */
function playBuilt(name) {
  const midis = builtMidis(name);
  if (!midis.length) return;
  if (name === "piano") {
    midis.forEach((m, i) => piano(m, i === 0 ? 0.8 : 0.68, i * 0.016));
  } else {
    const kind = /** @type {any} */ (TUNINGS[tuning].kind);
    midis.forEach((m, i) => pluck(m, kind, i === 0 ? 0.86 : 0.76, i * 0.028));
  }
}

/** Play a 1–3–5–8–5–3–1 vocal warm-up pattern in the current chord or key. @param {"piano"|"guitar"} name */
function playWarmup(name) {
  const p = players[name];
  const k = playKey();
  let rootPc = k.tonic;
  let minor = k.mode === "minor";
  if (p.build && builtMidis(name).length) {
    const id = identifyChord(builtMidis(name), prefersFlats(k));
    const info = id ? chordInfo(id) : null;
    if (info) { rootPc = info.rootPc; minor = info.pcs.includes(mod12(rootPc + 3)) && !info.pcs.includes(mod12(rootPc + 4)); }
    else rootPc = mod12(builtMidis(name)[0]);
  } else if (p.chord) {
    const info = chordInfo(p.chord);
    if (info) {
      rootPc = info.rootPc;
      minor = info.pcs.includes(mod12(rootPc + 3)) && !info.pcs.includes(mod12(rootPc + 4));
    }
  }
  // Place the warm-up root in a comfortable vocal register (C4–B4, or F3–E4 for higher keys).
  let base = 60 + mod12(rootPc);
  if (base > 66) base -= 12;
  const third = minor ? 3 : 4;
  const pattern = [0, third, 7, 12, 7, third, 0].map((semi) => base + semi);
  const stepSec = 0.24;
  const kind = name === "guitar" ? /** @type {any} */ (TUNINGS[tuning].kind) : "piano";
  pattern.forEach((m, i) => {
    const vel = i === 3 ? 0.84 : i === 0 || i === 6 ? 0.78 : 0.7;
    if (kind === "piano") piano(m, vel, i * stepSec);
    else pluck(m, kind, vel, i * stepSec);
  });
}

/** Transpose the active chord, built chord, or key by delta semitones (-1 or +1) and play it immediately. @param {"piano"|"guitar"} name @param {number} delta */
function stepSemitone(name, delta) {
  const p = players[name];
  const k = playKey();
  if (p.build && builtMidis(name).length) {
    if (name === "piano") {
      built.piano = built.piano.map((m) => Math.max(PIANO_LOW, Math.min(PIANO_HIGH, m + delta)));
    } else {
      const tun = TUNINGS[tuning].strings;
      const next = new Map();
      for (const [si, m] of built.guitar.entries()) {
        const f = (m + delta) - tun[si];
        if (f >= 0 && f <= FRETS) next.set(si, m + delta);
        else next.set(si, m);
      }
      built.guitar = next;
    }
    playBuilt(name);
    renderInstrument(name);
    renderPlayer(name);
    renderReadout(name);
    return;
  }
  if (p.chord) {
    const parsed = parseChord(p.chord);
    const next = parsed ? transposeChord(parsed, delta, prefersFlats(k)) : "";
    if (next && chordInfo(next)) {
      const list = chordsFor(name);
      if (!list.includes(next) && !p.custom.includes(next)) p.custom.push(next);
      p.chord = next;
      savePlayer();
      playFor(name, next);
      renderInstrument(name);
      renderPlayer(name);
      renderReadout(name);
      return;
    }
  }
  const nextTonic = mod12(k.tonic + delta);
  pickedKey = `${nextTonic}:${k.mode}`;
  const nk = playKey();
  const tonicChord = diatonicChords(nk)[0]?.name;
  renderPlay();
  if (tonicChord) playFor(name, tonicChord);
}

/** @param {"piano"|"guitar"} name @param {HTMLElement} target */
function onPlayer(name, target) {
  const btn = /** @type {HTMLElement|null} */ (target.closest("button"));
  if (!btn) return;
  const p = players[name];
  const role = btn.dataset.role;
  tick();
  if (role === "scale") { p.chord = null; p.build = false; }
  else if (role === "build") {
    p.build = !p.build;
    if (p.build && !builtMidis(name).length && p.chord) {
      seedBuiltFromChord(name, p.chord);
    }
  }
  else if (role === "clear-build") {
    if (name === "piano") built.piano = []; else built.guitar.clear();
  }
  else if (role === "save-built") {
    const id = identifyChord(builtMidis(name), prefersFlats(playKey()));
    if (id && chordInfo(id)) {
      if (!p.custom.includes(id)) p.custom.push(id);
      p.chord = id;
      p.build = false;
      playFor(name, id);
    }
  }
  else if (role === "clear-custom") {
    p.custom = [];
  }
  else if (role === "warmup") { playWarmup(name); return; }
  else if (role === "beat") {
    drumLooper.toggle();
    renderPlayer("piano");
    renderPlayer("guitar");
    return;
  }
  else if (role === "step-down") { stepSemitone(name, -1); return; }
  else if (role === "step-up") { stepSemitone(name, 1); return; }
  else if (role === "again") {
    if (p.build) playBuilt(name);
    else if (p.chord) playFor(name, p.chord);
    return;
  }
  else if (role === "shapes") {
    const ch = p.build ? identifyChord(builtMidis(name), prefersFlats(playKey())) : p.chord;
    if (ch) openChordSheet(ch);
    return;
  }
  else if (btn.dataset.chord) {
    p.build = false;
    p.chord = btn.dataset.chord;
    playFor(name, p.chord);
  }
  savePlayer();
  renderInstrument(name);
  renderPlayer(name);
  renderReadout(name);
}

/** Pre-populate Build chord notes from a named chord so the user can tweak notes immediately. @param {"piano"|"guitar"} name @param {string} chord */
function seedBuiltFromChord(name, chord) {
  const info = chordInfo(chord);
  if (!info || !info.pcs.length) return;
  if (name === "piano") {
    const out = [];
    const bassPc = info.bassPc !== null ? info.bassPc : info.rootPc;
    let b = 48 + bassPc;
    if (b < PIANO_LOW) b += 12;
    out.push(b);
    let prev = 59;
    for (const pc of info.pcs) {
      let m = 60 + pc;
      while (m <= prev) m += 12;
      if (m <= PIANO_HIGH && !out.includes(m)) { out.push(m); prev = m; }
    }
    built.piano = out.sort((a, b) => a - b);
  } else {
    built.guitar.clear();
    const tun = TUNINGS[tuning].strings;
    const pcs = new Set(info.pcs);
    tun.forEach((open, si) => {
      for (let f = 0; f <= 4; f++) {
        if (pcs.has(mod12(open + f))) { built.guitar.set(si, open + f); break; }
      }
    });
  }
}

/** Sound a chord with the instrument's own voice. @param {"piano"|"guitar"} name @param {string} chord */
function playFor(name, chord) {
  const info = chordInfo(chord);
  if (info && info.pcs.length) playChord(info.pcs, name === "guitar" ? "guitar" : "piano", info.bassPc);
}

/** Chord names for one player: the song's own chords, a family built from the key, or all combined + custom chords. @param {"piano"|"guitar"} name */
function chordsFor(name) {
  const p = players[name];
  const type = p.type;
  /** @type {string[]} */
  let base = [];
  if (type === "song") {
    const names = songChordNames();
    base = (names.length ? names : diatonicChords(playKey()).map((d) => d.name)).slice(0, 80);
  } else if (type === "all") {
    const names = songChordNames();
    const dia = diatonicChords(playKey()).map((d) => d.name);
    const sev = chordsForKey(playKey(), "7th").map((c) => c.name);
    const sus = chordsForKey(playKey(), "sus").map((c) => c.name);
    base = [...new Set([...names, ...dia, ...sev, ...sus])].slice(0, 80);
  } else {
    base = chordsForKey(playKey(), type).map((c) => c.name);
  }
  if (!p.custom.length) return base;
  return [...base, ...p.custom.filter((c) => !base.includes(c))];
}

/** @param {"piano"|"guitar"} name */
function renderPlayer(name) {
  const p = players[name];
  const hasSong = songChordNames().length > 0;
  const type = p.type;
  const types = [
    { id: "song", label: hasSong ? t("songChords", "Song chords") : t("keyChords", "Chords in key") },
    { id: "all", label: t("allChords", "All (song + key)") },
    ...CHORD_TYPES
  ];
  const list = chordsFor(name);
  if (p.chord && !list.includes(p.chord)) p.chord = null;
  const sel = `<select class="select cp-type" data-role="type" aria-label="${esc(t("chordType", "Chord type"))}">${types.map((x) => `<option value="${x.id}"${x.id === type ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`;
  const chips = list.map((c) => `<button type="button" class="chip chord-chip${!p.build && p.chord === c ? " on" : ""}" data-chord="${esc(c)}" aria-pressed="${!p.build && p.chord === c}">${esc(pretty(c))}</button>`).join("");
  const builtId = p.build ? identifyChord(builtMidis(name), prefersFlats(playKey())) : null;
  const canPlayAgain = p.build ? builtMidis(name).length > 0 : Boolean(p.chord);
  const canShapes = p.build ? Boolean(builtId && chordInfo(builtId)) : Boolean(p.chord);
  const buildActions = p.build && builtMidis(name).length
    ? `${builtId ? `<button type="button" class="chip accent" data-role="save-built">+ ${esc(t("keepChord", "Keep {c}", { c: pretty(builtId) }))}</button>` : ""}<button type="button" class="chip" data-role="clear-build">${esc(t("clearNotes", "Clear"))}</button>`
    : "";
  const addInput = `<input type="text" class="input cp-add" data-role="add-chord" placeholder="${esc(t("addChordPh", "+ Type chord (e.g. D/F#)"))}" aria-label="${esc(t("addChordLabel", "Type a chord to add and play"))}">`;
  const beatOn = drumLooper.running;
  $(name + "Player").innerHTML = `<div class="cp-bar">${sel}<button type="button" class="chip${!p.chord && !p.build ? " on" : ""}" data-role="scale" aria-pressed="${!p.chord && !p.build}">${esc(t("scaleChip", "Scale"))}</button><button type="button" class="chip${p.build ? " on" : ""}" data-role="build" aria-pressed="${p.build}">${esc(t("buildChord", "Build chord"))}</button>${canPlayAgain ? `<button type="button" class="chip" data-role="again" aria-label="${esc(t("playAgain", "Play again"))}">▶ ${esc(name === "guitar" ? t("strum", "Strum") : t("playIt", "Play"))}</button>` : ""}${canShapes ? `<button type="button" class="chip" data-role="shapes">${esc(t("chordShapes", "Shapes"))}</button>` : ""}${buildActions}<button type="button" class="chip" data-role="warmup" title="${esc(t("warmupHint", "Play 1–3–5–8–5–3–1 vocal warm-up"))}">♪ ${esc(t("warmup", "Warm-up"))}</button><button type="button" class="chip${beatOn ? " on" : ""}" data-role="beat" aria-pressed="${beatOn}" title="${esc(t("beatLoopHint", "Play/stop the drum beat loop"))}">🥁 ${esc(t("beatLoop", "Beat"))}</button><button type="button" class="chip cp-step" data-role="step-down" aria-label="${esc(t("transposeDown", "Half step down"))}">− ½</button><button type="button" class="chip cp-step" data-role="step-up" aria-label="${esc(t("transposeUp", "Half step up"))}">+ ½</button>${addInput}</div><div class="cp-chips">${chips}</div>`;
}

/** Held notes per instrument, so the readout can name what you are playing. @type {Record<string, number[]>} */
const held = { piano: [], guitar: [] };

/** Format notes and interval degrees for built or held chords. @param {number[]} sorted @param {boolean} flats @param {string|null} id */
function formatNotesAndDegrees(sorted, flats, id) {
  const info = id ? chordInfo(id) : null;
  const rootPc = info ? info.rootPc : mod12(sorted[0]);
  const bassPc = info && info.bassPc !== null ? info.bassPc : mod12(sorted[0]);
  const noteParts = sorted.map((m, i) => {
    const pc = mod12(m);
    const n = pretty(noteName(pc, flats));
    const cls = i === 0 && sorted.length > 1 && pc === bassPc && pc !== rootPc ? "n-bass" : pc === rootPc ? "n-root" : "";
    return `<span class="${cls}">${esc(n)}</span>`;
  });
  const uniqueSemis = [...new Set(sorted.map((m) => mod12(m - rootPc)))].sort((a, b) => a - b);
  const degs = uniqueSemis.map((s) => DEGREE_FROM_SEMITONES[s] || INTERVAL_LABELS[s] || "").filter(Boolean).join("–");
  return `${noteParts.join(" · ")}${degs && sorted.length > 1 ? ` <em>(${esc(degs)})</em>` : ""}`;
}

/** Show the chord that is selected, built, or being held right now. @param {"piano"|"guitar"} name */
function renderReadout(name) {
  const host = $(name + "Readout");
  const p = players[name];
  const h = highlight(name);
  const midis = held[name];
  let title = "";
  let sub = "";
  if (p.build) {
    const bm = builtMidis(name);
    if (bm.length) {
      const id = identifyChord(bm, h.flats);
      const names = bm.map((m) => noteName(mod12(m), h.flats));
      title = id ? pretty(id) : bm.length === 1 ? pretty(names[0]) : t("customVoicing", "Custom voicing");
      sub = formatNotesAndDegrees(bm, h.flats, id);
      host.dataset.state = "playing";
    } else {
      title = t("buildChord", "Build chord");
      sub = `<em>${esc(name === "piano" ? t("buildPianoHint", "Tap keys to stack notes — Sonata names the chord automatically.") : t("buildGuitarHint", "Tap one fret per string to build a chord — Sonata names it automatically."))}</em>`;
      host.dataset.state = "chord";
    }
  } else if (midis.length) {
    const sorted = [...midis].sort((a, b) => a - b);
    const names = sorted.map((m) => noteName(mod12(m), h.flats));
    const id = identifyChord(sorted, h.flats);
    title = id ? pretty(id) : names.length === 1 ? pretty(names[0]) : "—";
    sub = formatNotesAndDegrees(sorted, h.flats, id);
    host.dataset.state = "playing";
  } else if (p.chord) {
    const info = chordInfo(p.chord);
    title = pretty(info ? info.name : p.chord);
    if (info) {
      const order = info.bassPc !== null ? [info.bassPc, ...info.pcs.filter((x) => x !== info.bassPc)] : info.pcs;
      sub = order.map((pc, i) => `<span class="${info.bassPc !== null && i === 0 ? "n-bass" : pc === info.rootPc ? "n-root" : ""}">${esc(pretty(noteName(pc, h.flats)))}</span>`).join(" · ");
      if (info.bassPc !== null) sub += ` <em>${esc(t("overBass", "bass {note}", { note: pretty(noteName(info.bassPc, h.flats)) }))}</em>`;
    }
    host.dataset.state = "chord";
  } else {
    title = pretty(playKey().name) + " " + t("scaleWord", "scale");
    sub = [...h.pcs].sort((a, b) => mod12(a - playKey().tonic) - mod12(b - playKey().tonic)).map((pc) => pretty(noteName(pc, h.flats))).join(" · ");
    host.dataset.state = "scale";
  }
  host.innerHTML = `<strong class="ro-name">${esc(title)}</strong><span class="ro-notes">${sub.includes("<") ? sub : esc(sub)}</span>`;
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
  const p = players[name];
  if (p.build) {
    const bm = builtMidis(name);
    const flats = prefersFlats(key);
    const id = identifyChord(bm, flats);
    const info = id ? chordInfo(id) : null;
    const pcs = new Set(bm.map((m) => mod12(m)));
    const root = info ? info.rootPc : (bm.length ? mod12(bm[0]) : -1);
    const bass = info && info.bassPc !== null ? info.bassPc : (bm.length > 1 && mod12(bm[0]) !== root ? mod12(bm[0]) : -1);
    return {
      pcs,
      midis: new Set(bm),
      stringMap: name === "guitar" ? built.guitar : null,
      root,
      bass,
      flats,
      label: id ? t("chordOf", "Chord: {chord}", { chord: pretty(id) }) : t("buildChord", "Build chord")
    };
  }
  const chord = p.chord;
  if (chord) {
    const info = chordInfo(chord);
    const c = parseChord(chord);
    const flats = c ? c.root.includes("b") || (c.bass.includes("b")) || (!c.root.includes("#") && prefersFlats(key)) : false;
    return { pcs: new Set(info ? info.pcs : []), midis: null, stringMap: null, root: info ? info.rootPc : -1, bass: info && info.bassPc !== null ? info.bassPc : -1, flats, label: t("chordOf", "Chord: {chord}", { chord: pretty(chord) }) };
  }
  const pcs = SCALES[key.mode].map((i) => mod12(key.tonic + i));
  return { pcs: new Set(pcs), midis: null, stringMap: null, root: key.tonic, bass: -1, flats: prefersFlats(key), label: t("scaleOf", "{key} scale", { key: pretty(key.name) }) };
}

/** Toggle a note in Build chord mode. @param {"piano"|"guitar"} name @param {HTMLElement} el */
function onBuildTap(name, el) {
  const midi = Number(el.dataset.midi);
  if (name === "piano") {
    const idx = built.piano.indexOf(midi);
    if (idx >= 0) built.piano.splice(idx, 1);
    else { built.piano.push(midi); built.piano.sort((a, b) => a - b); }
  } else {
    const si = Number(el.dataset.string);
    if (built.guitar.get(si) === midi) built.guitar.delete(si);
    else built.guitar.set(si, midi);
  }
  renderInstrument(name);
  renderPlayer(name);
  renderReadout(name);
}

/**
 * Press-and-hold playing with glide across keys/frets, plus Build chord note toggling.
 * @param {"piano"|"guitar"} name
 * @param {HTMLElement} host @param {string} sel @param {(el: HTMLElement) => import("../audio.js").Voice} start
 * @param {(midis: number[]) => void} [onHeld] called with every note currently held
 */
function bindPress(name, host, sel, start, onHeld) {
  /** @type {Map<number, { el: HTMLElement, voice: import("../audio.js").Voice }>} */
  const active = new Map();
  const report = () => onHeld?.([...active.values()].map((a) => Number(a.el.dataset.midi)));
  const releaseTime = () => name === "piano" ? (sustain ? 3.8 : 0.32) : 2.6;
  /** Keep a pressed note lit for a moment after release so it is easy to see. @param {HTMLElement} el */
  const afterglow = (el) => {
    el.classList.remove("down");
    el.classList.add("lit");
    setTimeout(() => el.classList.remove("lit"), 650);
  };
  const end = (/** @type {number} */ id) => {
    const a = active.get(id);
    if (!a) return;
    a.voice.stop(releaseTime());
    afterglow(a.el);
    active.delete(id);
    report();
  };
  host.addEventListener("pointerdown", (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(sel));
    if (!el) return;
    e.preventDefault();
    end(e.pointerId);
    if (players[name].build) {
      const v = start(el);
      setTimeout(() => v.stop(releaseTime()), 180);
      onBuildTap(name, el);
      return;
    }
    el.classList.add("down");
    active.set(e.pointerId, { el, voice: start(el) });
    report();
  });
  host.addEventListener("pointermove", (e) => {
    if (players[name].build) return;
    const a = active.get(e.pointerId);
    if (!a || e.pointerType === "mouse" && !e.buttons) return;
    const under = /** @type {HTMLElement|null} */ (document.elementFromPoint(e.clientX, e.clientY)?.closest(sel) || null);
    if (under && under !== a.el && host.contains(under)) {
      a.voice.stop(releaseTime());
      afterglow(a.el);
      under.classList.add("down");
      active.set(e.pointerId, { el: under, voice: start(under) });
      report();
    }
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) host.addEventListener(ev, (e) => end(/** @type {PointerEvent} */ (e).pointerId));
  host.addEventListener("keydown", (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(sel));
    if (el && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (players[name].build) {
        const v = start(el);
        setTimeout(() => v.stop(releaseTime()), 180);
        onBuildTap(name, el);
        return;
      }
      const v = start(el);
      el.classList.add("down");
      onHeld?.([Number(el.dataset.midi)]);
      setTimeout(() => { v.stop(releaseTime()); afterglow(el); onHeld?.([]); }, 600);
    }
  });
}

/** Computer keyboard shortcuts for playing the virtual piano, triggering chords (1-9), and stepping semitones ([ / ]). */
function bindKeyboardPiano() {
  /** @type {Map<string, { midi: number, voice: import("../audio.js").Voice }>} */
  const kbdActive = new Map();
  const syncHeld = () => {
    held.piano = [...kbdActive.values()].map((x) => x.midi);
    renderReadout("piano");
  };
  window.addEventListener("keydown", (e) => {
    if (app.view !== "play" || (inst !== "piano" && inst !== "guitar")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tgt = /** @type {HTMLElement|null} */ (e.target);
    if (tgt && (tgt.closest("input, textarea, select") || tgt.isContentEditable)) return;
    if (document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    // 1..9 triggers the Nth chord chip on the active instrument
    if (/^[1-9]$/.test(k)) {
      const idx = Number(k) - 1;
      const chip = /** @type {HTMLButtonElement|null} */ (document.querySelectorAll(`#${inst}Player .cp-chips .chord-chip`)[idx]);
      if (chip && chip.dataset.chord) {
        e.preventDefault();
        players[/** @type {"piano"|"guitar"} */ (inst)].build = false;
        players[/** @type {"piano"|"guitar"} */ (inst)].chord = chip.dataset.chord;
        savePlayer();
        playFor(/** @type {"piano"|"guitar"} */ (inst), chip.dataset.chord);
        renderInstrument(/** @type {"piano"|"guitar"} */ (inst));
        renderPlayer(/** @type {"piano"|"guitar"} */ (inst));
        renderReadout(/** @type {"piano"|"guitar"} */ (inst));
      }
      return;
    }
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      stepSemitone(/** @type {"piano"|"guitar"} */ (inst), e.key === "[" ? -1 : 1);
      return;
    }
    if (inst !== "piano") return;
    const midi = KEY_TO_MIDI[k];
    if (midi === undefined || e.repeat || kbdActive.has(k)) return;
    e.preventDefault();
    const keyEl = /** @type {HTMLElement|null} */ ($("piano").querySelector(`.pk[data-midi="${midi}"]`));
    if (players.piano.build && keyEl) {
      const v = piano(midi, 0.78);
      setTimeout(() => v.stop(sustain ? 3.8 : 0.32), 180);
      onBuildTap("piano", keyEl);
      return;
    }
    const voice = piano(midi, 0.78);
    if (keyEl) {
      keyEl.classList.remove("lit");
      keyEl.classList.add("down");
    }
    kbdActive.set(k, { midi, voice });
    syncHeld();
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    const a = kbdActive.get(k);
    if (!a) return;
    a.voice.stop(sustain ? 3.8 : 0.32);
    kbdActive.delete(k);
    const keyEl = /** @type {HTMLElement|null} */ ($("piano").querySelector(`.pk[data-midi="${a.midi}"]`));
    if (keyEl) {
      keyEl.classList.remove("down");
      keyEl.classList.add("lit");
      setTimeout(() => keyEl.classList.remove("lit"), 650);
    }
    syncHeld();
  });
  window.addEventListener("blur", () => {
    if (!kbdActive.size) return;
    for (const a of kbdActive.values()) a.voice.stop(0.32);
    kbdActive.clear();
    held.piano = [];
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
    const on = h.midis ? h.midis.has(m) : h.pcs.has(pc);
    const root = on && pc === h.root;
    const name = noteName(pc, h.flats);
    const bass = on && pc === h.bass;
    const kbd = labels ? MIDI_TO_KBD[m] || "" : "";
    const cls = `pk ${black ? "black" : "white"}${on ? " on" : ""}${root ? " root" : ""}${bass ? " bass" : ""}`;
    const showName = labels && (on || !black);
    const kbdHtml = kbd ? `<kbd class="pk-kbd" aria-hidden="true">${esc(kbd)}</kbd>` : "";
    const html = `<button type="button" class="${cls}" data-midi="${m}" aria-label="${esc(name + (Math.floor(m / 12) - 1))}"${black ? ` style="--i:${wi}"` : ""}>${kbdHtml}${showName ? `<span>${esc(pretty(name))}${pc === 0 && !on ? `<sub>${Math.floor(m / 12) - 1}</sub>` : ""}</span>` : ""}</button>`;
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
      const on = h.stringMap ? h.stringMap.get(si) === midi : h.pcs.has(pc);
      const root = on && pc === h.root;
      const name = noteName(pc, h.flats);
      cells += `<button type="button" class="fc${f === 0 ? " open" : ""}${on ? " on" : ""}${root ? " root" : ""}${on && pc === h.bass ? " bass" : ""}" data-midi="${midi}" data-string="${si}" data-fret="${f}" aria-label="${esc(`${name} · fret ${f}`)}">${on ? `<span>${esc(pretty(name))}</span>` : ""}</button>`;
    }
    return `<div class="fb-row fb-string" style="--g:${(1 + si * 0.5).toFixed(2)}px">${cells}</div>`;
  }).join("");
  let inlays = `<div class="fb-inlays" aria-hidden="true"><span class="fb-open"></span>`;
  for (let f = 1; f <= FRETS; f++) inlays += `<span class="${f === 12 ? "dbl" : marks.includes(f) ? "dot" : ""}"></span>`;
  inlays += "</div>";
  host.innerHTML = head + `<div class="fb-board">${inlays}${rows}</div>`;
}

export function renderPlay() {
  preloadSamples("piano");
  preloadSamples(/** @type {any} */ (TUNINGS[tuning].kind));
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
  $("playSub").textContent = inst === "metronome" ? t("metroSub", "Steady time, tap tempo and accents. It keeps running on stage.")
    : inst === "tuner" ? t("tunerSub", "Play one string at a time near your phone or laptop.")
    : s && s.capo && !pickedKey ? `${h.label} · ${t("capoN", "Capo {n}", { n: s.capo })}` : h.label;
  paintInstrument();
  renderPlayer("piano");
  renderPlayer("guitar");
  renderPiano();
  renderFretboard();
  renderReadout("piano");
  renderReadout("guitar");
  renderTunerStrings();
}
