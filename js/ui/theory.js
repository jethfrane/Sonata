// @ts-check
import "../../css/music.css";
import { $, $$, esc, toast, setIcon } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, renderOptions, tick } from "./ctx.js";
import {
  CIRCLE, keyFromTonic, prefersFlats, noteName, diatonicChords, keySignature, relativeKey,
  pretty, keyShort, keyValue, mod12, chordTones, parseChord, chordFamily, SHARP_NOTES, chordsForKey, CHORD_TYPES, chordInfo, findKeysFromChords
} from "../core/music.js";
import { uniqueChords } from "../core/chart.js";
import { openChordSheet } from "./sheets-lazy.js";
import { playChord } from "../audio.js";

/** @type {import("../core/music.js").Key|null} null = follow the song */
let picked = null;
let format = "roman";
/** When locked, tapping a wedge only plays it; the highlighted key stays put. */
let locked = false;
/** Auto-rotate turns the circle so the chosen key sits at the top. */
let rotate = false;
let rotDeg = 0;
/** Which chords of the key are listed (triads, 7ths, slash chords…). */
let chordType = "triad";
/** Last chord tapped in the list (for "See shapes"). */
let lastChord = "";
/** Wedges highlighted by Key Finder input (`"<ring>:<pc>"`). @type {Set<string>} */
const foundWedges = new Set();
/** Refreshes Key Finder controls/output when song, key or format changes. @type {(() => void)|null} */
let refreshKeyFinder = null;
let spotlightTimer = 0;

const QUICK_CHORDS = ["C", "G", "Am", "F", "D", "Em", "Bm", "Dm"];
const ORDER_SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const ORDER_FLATS = ["B", "E", "A", "D", "G", "C", "F"];

export function theoryKey() {
  return picked || soundingKey(store.active());
}

/** Unique chords in the active song (empty when no song or no chords). */
function activeSongChords() {
  const s = store.active();
  if (!s || !s.body.trim()) return [];
  return uniqueChords(s.body, renderOptions(s, "chords"));
}

/** Scroll to Key Finder, highlight it briefly, and focus the input (used by Tools -> Key Finder). */
export function focusKeyFinder() {
  const box = document.getElementById("keyFinder");
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById("keyFinderInput"));
  if (box) {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    box.classList.remove("spotlight");
    void box.offsetWidth;
    box.classList.add("spotlight");
    clearTimeout(spotlightTimer);
    spotlightTimer = window.setTimeout(() => box.classList.remove("spotlight"), 1800);
  }
  if (input) {
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    input.select();
  }
}

/** Mark wedges on #circle that match chords typed in Key Finder. */
function paintFoundOnCircle() {
  $$("#circle .wedge").forEach((g) => {
    const on = foundWedges.has(`${g.getAttribute("data-ring")}:${g.getAttribute("data-pc")}`);
    g.classList.toggle("found", on);
    if (on) g.setAttribute("data-found", "1");
    else g.removeAttribute("data-found");
  });
}

/** @param {string[]} chordNames */
function syncFoundWedges(chordNames) {
  foundWedges.clear();
  for (const name of chordNames) {
    const c = parseChord(name);
    if (!c) continue;
    const fam = chordFamily(c);
    const ring = (fam === "diminished" || fam === "half-diminished") ? "dim" : fam === "minor" ? "minor" : "major";
    foundWedges.add(`${ring}:${c.rootPc}`);
  }
  paintFoundOnCircle();
}

export function initTheory() {
  try {
    format = localStorage.getItem("sonata_circle_format") === "nashville" ? "nashville" : "roman";
    locked = localStorage.getItem("sonata_circle_lock") === "1";
    rotate = localStorage.getItem("sonata_circle_rotate") === "1";
    const saved = localStorage.getItem("sonata_circle_key");
    if (locked && saved) { const [pc, mode] = saved.split(":"); picked = keyFromTonic(Number(pc), mode === "minor" ? "minor" : "major"); }
  } catch { /* ignore */ }
  $("circleLock").addEventListener("click", () => {
    locked = !locked;
    if (locked) picked = theoryKey();
    saveLock();
    tick();
    renderTheory();
  });
  $("circleRotate").addEventListener("click", () => {
    rotate = !rotate;
    try { localStorage.setItem("sonata_circle_rotate", rotate ? "1" : "0"); } catch { /* ignore */ }
    tick();
    renderTheory();
  });
  $$("[data-circle-format]").forEach((b) => b.addEventListener("click", () => {
    format = b.dataset.circleFormat || "roman";
    try { localStorage.setItem("sonata_circle_format", format); } catch { /* ignore */ }
    renderTheory();
  }));
  $$("[data-key-mode]").forEach((b) => b.addEventListener("click", () => {
    const k = theoryKey();
    const mode = /** @type {"major"|"minor"} */ (b.dataset.keyMode);
    if (mode !== k.mode) picked = mode === "minor" ? keyFromTonic(k.tonic + 9, "minor") : keyFromTonic(k.tonic + 3, "major");
    saveLock();
    renderTheory();
  }));
  $("keyPicker").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-tonic]"));
    if (!b) return;
    picked = keyFromTonic(Number(b.dataset.tonic), theoryKey().mode);
    saveLock();
    tick();
    renderTheory();
  });
  // Tap: a short chord. Press and hold: it keeps sounding until you let go, then rings out.
  pressToPlay($("circle"), "[data-wedge]", (el) => onWedge(el));
  $("circle").addEventListener("keydown", (e) => {
    const g = /** @type {Element} */ (e.target).closest("[data-wedge]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(onWedge(g)); }
  });
  pressToPlay($("diatonic"), "[data-chord]", (el) => triggerDiatonicBtn(/** @type {HTMLElement} */ (el)));
  window.addEventListener("keydown", (e) => {
    if (app.view !== "theory") return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const tgt = /** @type {HTMLElement|null} */ (e.target);
    if (tgt && (tgt.closest("input, textarea, select") || tgt.isContentEditable)) return;
    if (document.querySelector("dialog[open]")) return;
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const btns = $$("#diatonic .dia");
      const b = /** @type {HTMLElement|undefined} */ (btns[idx]);
      if (b) {
        e.preventDefault();
        tap(triggerDiatonicBtn(b));
      }
      return;
    }
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      const k = theoryKey();
      const idx = CIRCLE.indexOf(k.mode === "minor" ? mod12(k.tonic + 3) : k.tonic);
      const nextMajor = CIRCLE[mod12(idx + (e.key === "]" ? 1 : -1))];
      picked = keyFromTonic(k.mode === "minor" ? mod12(nextMajor + 9) : nextMajor, k.mode);
      saveLock();
      tick();
      renderTheory();
    }
  });
  try { const ct = localStorage.getItem("sonata_theory_type"); if (ct && CHORD_TYPES.some((x) => x.id === ct)) chordType = ct; } catch { /* ignore */ }
  const typeSel = /** @type {HTMLSelectElement} */ ($("theoryType"));
  typeSel.innerHTML = CHORD_TYPES.map((x) => `<option value="${x.id}"${/** @type {any} */ (x).more ? " data-more" : ""}${x.id === chordType ? " selected" : ""}>${esc(x.label)}</option>`).join("");
  typeSel.addEventListener("change", () => { chordType = typeSel.value; try { localStorage.setItem("sonata_theory_type", chordType); } catch { /* ignore */ } lastChord = ""; $("theoryShapes").hidden = true; renderTheory(); });
  $("theoryShapes").addEventListener("click", () => { if (lastChord) openChordSheet(lastChord); });
  $("theoryFromSongBtn").addEventListener("click", () => { picked = null; locked = false; saveLock(); renderTheory(); });
  const kfBox = document.getElementById("keyFinder");
  const kfInput = /** @type {HTMLInputElement|null} */ (document.getElementById("keyFinderInput"));
  const kfRes = document.getElementById("keyFinderResult");
  if (kfBox && kfInput && kfRes) {
    let actionsRow = kfBox.querySelector(".kf-actions");
    if (!actionsRow) {
      actionsRow = document.createElement("div");
      actionsRow.className = "kf-actions";
      actionsRow.innerHTML = `<button type="button" class="chip kf-song-btn" id="kfUseSong">${esc(t("useSongChords", "Use song chords"))}</button><button type="button" class="chip kf-clear-btn" id="kfClear" hidden>${esc(t("clear", "Clear"))}</button>`;
      kfBox.insertBefore(actionsRow, kfRes);
    }
    let quickRow = kfBox.querySelector(".kf-quick");
    if (!quickRow) {
      quickRow = document.createElement("div");
      quickRow.className = "kf-quick";
      quickRow.setAttribute("role", "group");
      quickRow.setAttribute("aria-label", t("quickChords", "Quick chords"));
      quickRow.innerHTML = QUICK_CHORDS.map((ch) => `<button type="button" class="chip kf-chip" data-kf-add="${ch}">${esc(ch)}</button>`).join("");
      kfBox.insertBefore(quickRow, kfRes);
    }
    const kfSongBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("kfUseSong"));
    const kfClearBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("kfClear"));

    const updateKf = () => {
      const songCh = activeSongChords();
      if (kfSongBtn) {
        const empty = songCh.length === 0;
        kfSongBtn.hidden = empty;
        kfSongBtn.disabled = empty;
      }
      if (kfClearBtn) kfClearBtn.hidden = !kfInput.value.trim();
      const res = findKeysFromChords(kfInput.value);
      if (!res) {
        syncFoundWedges([]);
        kfRes.hidden = true;
        kfRes.innerHTML = "";
        return;
      }
      syncFoundWedges(res.chords);
      kfRes.hidden = false;
      const cur = theoryKey();
      const bestCand = res.candidates[0];
      const activeCand = res.candidates.find((c) => c.key.tonic === cur.tonic && c.key.mode === cur.mode) || bestCand;
      const prog = activeCand.progression.map((p) => `${pretty(p.name)} (${format === "nashville" ? p.nashville : p.roman})`).join(" · ");
      const modeText = res.best.mode === "minor" ? t("minor", "Minor") : t("major", "Major");
      const candsHtml = res.candidates.map((cand) => {
        const isOn = cand.key.tonic === cur.tonic && cand.key.mode === cur.mode;
        return `<button type="button" class="kf-cand${isOn ? " on" : ""}" data-use-key="${cand.key.tonic}:${cand.key.mode}" aria-pressed="${isOn}"><span>${esc(pretty(cand.key.name))}</span><span class="kf-ratio">${cand.matched}/${cand.total}</span></button>`;
      }).join("");
      kfRes.innerHTML = `<div class="kf-row"><span class="kf-main"><strong>${esc(pretty(res.best.name))}</strong><span class="kf-badge">${esc(modeText)}</span><span class="kf-match">${bestCand.matched}/${bestCand.total} ${esc(t("match", "match"))}</span></span><button type="button" class="chip accent" data-use-key="${res.best.tonic}:${res.best.mode}">${esc(t("selectKey", "Select {k}", { k: pretty(keyShort(res.best)) }))}</button></div><div class="kf-candidates" role="group" aria-label="${esc(t("matchingKeys", "Matching keys"))}">${candsHtml}</div><div class="kf-prog muted">${esc(prog)}</div>`;
    };
    refreshKeyFinder = updateKf;
    kfInput.addEventListener("input", updateKf);
    if (kfSongBtn) {
      kfSongBtn.addEventListener("click", () => {
        const chords = activeSongChords();
        if (!chords.length) return;
        kfInput.value = chords.join(" ");
        tick();
        updateKf();
        kfInput.focus();
      });
    }
    if (kfClearBtn) {
      kfClearBtn.addEventListener("click", () => {
        kfInput.value = "";
        tick();
        updateKf();
        kfInput.focus();
      });
    }
    quickRow.addEventListener("click", (e) => {
      const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-kf-add]"));
      const ch = btn?.dataset.kfAdd;
      if (!ch) return;
      const curVal = kfInput.value.trim();
      kfInput.value = curVal ? `${curVal} ${ch}` : ch;
      tick();
      const info = chordInfo(ch);
      if (info) tap(playChord(info.pcs, "piano", info.bassPc));
      updateKf();
    });
    kfRes.addEventListener("click", (e) => {
      const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-use-key]"));
      if (!btn || !btn.dataset.useKey) return;
      const [pc, mode] = btn.dataset.useKey.split(":");
      picked = keyFromTonic(Number(pc), mode === "minor" ? "minor" : "major");
      saveLock();
      tick();
      renderTheory();
    });
  }
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
    if (!locked) picked = null;
    toast(t("keyOf", "Key of {key}", { key: pretty(k.name) }), "success");
    renderTheory();
  });
  store.on("change", () => { if (app.view === "theory") renderTheory(); });
  store.on("song-open", () => { if (!locked) picked = null; if (app.view === "theory") renderTheory(); });
}

function saveLock() {
  try {
    localStorage.setItem("sonata_circle_lock", locked ? "1" : "0");
    if (locked && picked) localStorage.setItem("sonata_circle_key", `${picked.tonic}:${picked.mode}`);
  } catch { /* ignore */ }
}

/** A press shorter than this is a tap. */
const TAP_MS = 380;
/** Let a tapped chord sound briefly, then fade. @param {import("../audio.js").Voice} v @param {number} [held] ms already held */
const tap = (v, held = 0) => setTimeout(() => v.stop(0.45), Math.max(0, TAP_MS - held));

/**
 * Tap to hear a short chord; press and hold to keep it sounding until release. The keyboard
 * (Enter/Space on a focused control) gives the tap. Pointer capture keeps the release even when the
 * pressed element is redrawn (the circle re-renders when a key is picked).
 * @param {HTMLElement} host @param {string} sel @param {(el: Element) => import("../audio.js").Voice} play
 */
function pressToPlay(host, sel, play) {
  /** @type {{ v: import("../audio.js").Voice, t0: number, id: number }|null} */
  let held = null;
  const release = () => {
    if (!held) return;
    const { v, t0 } = held;
    held = null;
    const d = performance.now() - t0;
    host.classList.remove("holding");
    if (d < TAP_MS) tap(v, d); else v.stop(1.4);
  };
  host.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    const el = /** @type {Element} */ (e.target).closest(sel);
    if (!el) return;
    release();
    held = { v: play(el), t0: performance.now(), id: e.pointerId };
    host.classList.add("holding");
    try { host.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
    host.addEventListener(ev, (e) => { if (held && /** @type {PointerEvent} */ (e).pointerId === held.id) release(); });
  }
  // A click with no pointer behind it (keyboard on a button, assistive tech) plays a tap.
  host.addEventListener("click", (e) => {
    if (/** @type {MouseEvent} */ (e).detail !== 0) return;
    const el = /** @type {Element} */ (e.target).closest(sel);
    if (el) tap(play(el));
  });
  // A long press should not open the text-selection or image menu.
  host.addEventListener("contextmenu", (e) => { if (/** @type {Element} */ (e.target).closest(sel)) e.preventDefault(); });
}

/** Play and highlight a diatonic chord button on the Circle of Fifths. @param {HTMLElement} b */
function triggerDiatonicBtn(b) {
  tick();
  lastChord = b.dataset.chord || "";
  const info = chordInfo(lastChord);
  const voice = info ? playChord(info.pcs, "piano", info.bassPc) : playChord(chordTones(lastChord));
  $$("#diatonic .dia").forEach((x) => x.classList.toggle("on", x === b));
  $("theoryShapes").hidden = false;
  $("theoryShapesLabel").textContent = t("seeShapes", "See {c} shapes", { c: pretty(lastChord) });
  if (info) {
    const ring = info.pcs.includes(mod12(info.rootPc + 3))
      ? (info.pcs.includes(mod12(info.rootPc + 6)) ? "dim" : "minor")
      : "major";
    const wedge = document.querySelector(`#circle .wedge[data-ring="${ring}"][data-pc="${info.rootPc}"]`);
    if (wedge) ping(wedge);
  }
  return voice;
}

/** Play a wedge's chord and (unless locked) make it the key. @param {Element} g @returns {import("../audio.js").Voice} */
function onWedge(g) {
  const pc = Number(g.getAttribute("data-pc"));
  const ring = g.getAttribute("data-ring");
  tick();
  if (ring === "dim") { const v = playChord([pc, mod12(pc + 3), mod12(pc + 6)]); ping(g); return v; }
  const mode = ring === "minor" ? "minor" : "major";
  const v = playChord(mode === "minor" ? [pc, mod12(pc + 3), mod12(pc + 7)] : [pc, mod12(pc + 4), mod12(pc + 7)]);
  if (locked) { ping(g); return v; }
  picked = keyFromTonic(pc, mode);
  renderTheory();
  return v;
}

/** Brief flash on a wedge that was played but not selected. @param {Element} g */
function ping(g) {
  g.classList.remove("ping");
  void (/** @type {any} */ (g)).getBoundingClientRect();
  g.classList.add("ping");
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
  const isMinor = key.mode === "minor";
  const flats = prefersFlats(key);
  const sig = keySignature(key);
  const host = $("circle");
  host.dataset.mode = key.mode;
  // Index of the relative major on the circle; the key family sits on its wedge and both neighbours.
  const majorPc = isMinor ? mod12(key.tonic + 3) : key.tonic;
  const home = CIRCLE.indexOf(majorPc);
  const near = (/** @type {number} */ i) => { const d = mod12(i - home); return d === 0 || d === 1 || d === 11; };
  /** @param {number} pc @param {number} i position on the circle */
  const nm = (pc, i) => {
    // Use key context for the enharmonic wedges at the bottom of the circle.
    if (i === 6) return noteName(pc, flats);
    if ((i === 5 || i === 7) && sig !== 0) return noteName(pc, flats);
    return noteName(pc, i > 6);
  };
  let svg = `<svg viewBox="0 0 400 400" class="circle-svg" role="presentation">`;
  CIRCLE.forEach((pc, i) => {
    const a1 = i * 30 - 15, a2 = i * 30 + 15;
    const minorPc = mod12(pc + 9), dimPc = mod12(pc + 11);
    const fam = near(i);
    const rings = isMinor
      ? [
          { pos: "outer", ring: "minor", pc: minorPc, r1: 194, r2: 138, label: nm(minorPc, i) + "m", q: "m", size: 19, rText: 166, active: key.tonic === minorPc },
          { pos: "middle", ring: "major", pc, r1: 136, r2: 94, label: nm(pc, i), q: "", size: 14.5, rText: 115, active: false },
          { pos: "inner", ring: "dim", pc: dimPc, r1: 92, r2: 64, label: nm(dimPc, i) + "°", q: "dim", size: 11, rText: 78, active: false }
        ]
      : [
          { pos: "outer", ring: "major", pc, r1: 194, r2: 138, label: nm(pc, i), q: "", size: 19, rText: 166, active: key.tonic === pc },
          { pos: "middle", ring: "minor", pc: minorPc, r1: 136, r2: 94, label: nm(minorPc, i) + "m", q: "m", size: 14.5, rText: 115, active: false },
          { pos: "inner", ring: "dim", pc: dimPc, r1: 92, r2: 64, label: nm(dimPc, i) + "°", q: "dim", size: 11, rText: 78, active: false }
        ];
    for (const w of rings) {
      const inKey = w.ring === "dim" ? mod12(i - home) === 0 : fam;
      const num = inKey ? numeral(w.pc, w.q, key) : "";
      const isFound = foundWedges.has(`${w.ring}:${w.pc}`);
      const [tx, ty] = pt(200, 200, w.rText, i * 30);
      const cls = `wedge ${w.ring} ${w.pos}${inKey ? " family" : ""}${w.active ? " tonic" : ""}${isFound ? " found" : ""}`;
      const label = `${pretty(w.label)}${num ? `, ${num}` : ""}`;
      svg += `<g class="${cls}" data-wedge data-ring="${w.ring}" data-pos="${w.pos}" data-pc="${w.pc}"${isFound ? ' data-found="1"' : ""} tabindex="0" role="button" aria-label="${esc(label)}">
        <path d="${arc(w.r1, w.r2, a1, a2)}"/>
        <text x="${tx.toFixed(1)}" y="${(ty + (num ? -3 : 1)).toFixed(1)}" font-size="${w.size}">${esc(pretty(w.label))}</text>
        ${num ? `<text class="num" x="${tx.toFixed(1)}" y="${(ty + w.size * 0.72).toFixed(1)}" font-size="${Math.max(8, w.size * 0.58)}">${esc(pretty(num))}</text>` : ""}
      </g>`;
    }
  });
  const sigText = sig === 0 ? "0♯/♭" : `${Math.abs(sig)}${sig > 0 ? "♯" : "♭"}`;
  const modeLabel = isMinor ? t("minor", "Minor").toUpperCase() : t("major", "Major").toUpperCase();
  svg += `<circle cx="200" cy="200" r="61" class="hub"/>
    <g class="hub-labels">
      <text x="200" y="175" class="hub-mode">${esc(modeLabel)}</text>
      <text x="200" y="207" class="hub-key">${esc(pretty(keyShort(key)))}</text>
      <text x="200" y="228" class="hub-sub">${esc(sigText)}</text>
    </g></svg>`;
  host.innerHTML = svg;
}

export function renderTheory() {
  const key = theoryKey();
  $$("[data-circle-format]").forEach((b) => { const on = b.dataset.circleFormat === format; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  $$("[data-key-mode]").forEach((b) => { const on = b.dataset.keyMode === key.mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  $("keyPicker").innerHTML = Array.from({ length: 12 }, (_, pc) => {
    const k = keyFromTonic(pc, key.mode);
    const on = pc === key.tonic;
    const label = pretty(k.root) + (key.mode === "minor" ? "m" : "");
    return `<button type="button" class="key-btn${on ? " on" : ""}" data-tonic="${pc}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  $("keyTitle").textContent = pretty(key.name);
  const sig = keySignature(key);
  const accs = sig > 0 ? ORDER_SHARPS.slice(0, sig).map((n) => n + "♯") : ORDER_FLATS.slice(0, -sig).map((n) => n + "♭");
  $("keySig").textContent = sig === 0 ? t("noAccidentals", "No sharps or flats") : `${Math.abs(sig)} ${sig > 0 ? "♯" : "♭"} · ${accs.join(" ")}`;
  const rel = relativeKey(key);
  $("keyRelative").textContent = pretty(rel.name);
  if (chordType === "triad") {
    $("diatonic").innerHTML = diatonicChords(key).map((d) => {
      const n = format === "nashville" ? String(d.degree) + (d.quality === "minor" ? "m" : d.quality === "diminished" ? "°" : "") : d.numeral;
      return `<button type="button" class="dia${d.degree === 1 ? " tonic" : ""}${d.name === lastChord ? " on" : ""}" data-chord="${esc(d.name)}"><span class="dia-num">${esc(pretty(n))}</span><span class="dia-name">${esc(pretty(d.name.replace(/dim$/, "°")))}</span></button>`;
    }).join("");
  } else {
    // Longer names (Gmaj7, D/F#, F#m7b5) get wider buttons.
    $("diatonic").innerHTML = chordsForKey(key, chordType).map((c, i) => `<button type="button" class="dia wide${i === 0 && chordType !== "secondary" && chordType !== "passing" ? " tonic" : ""}${c.name === lastChord ? " on" : ""}" data-chord="${esc(c.name)}"><span class="dia-num">${esc(pretty(c.numeral))}</span><span class="dia-name">${esc(pretty(c.name))}</span></button>`).join("");
  }
  $("diatonic").dataset.type = chordType;
  const s = store.active();
  const lb = $("circleLock");
  lb.setAttribute("aria-pressed", String(locked));
  lb.classList.toggle("on", locked);
  setIcon(/** @type {HTMLElement} */ (lb.firstElementChild), locked ? "lock" : "unlock");
  /** @type {HTMLElement} */ (lb.querySelector(".lock-text")).textContent = locked ? t("keyLocked", "Locked") : t("lockKey", "Lock key");
  $("lockHint").hidden = !locked;
  /** @type {HTMLButtonElement} */ ($("theoryFromSongBtn")).hidden = !picked;
  /** @type {HTMLButtonElement} */ ($("theoryToSongBtn")).hidden = !s || Boolean(s.readonly) || !picked;
  renderCircle();
  applyRotation();
  if (refreshKeyFinder) refreshKeyFinder();
}

/** Turn the whole circle (labels stay upright) so the key's wedge is at 12 o'clock. */
function applyRotation() {
  const host = $("circle");
  const key = theoryKey();
  const majorPc = key.mode === "minor" ? mod12(key.tonic + 3) : key.tonic;
  const idx = CIRCLE.indexOf(majorPc);
  let target = rotate ? -idx * 30 : 0;
  // Take the short way round so it never spins backwards through a full turn.
  while (target - rotDeg > 180) target -= 360;
  while (target - rotDeg < -180) target += 360;
  rotDeg = target;
  host.dataset.rotate = rotate ? "1" : "0";
  host.style.setProperty("--rot", `${rotDeg}deg`);
  const b = $("circleRotate");
  b.setAttribute("aria-pressed", String(rotate));
  b.classList.toggle("on", rotate);
}
