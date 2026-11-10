// @ts-check
import { $, $$, esc, toast, setIcon } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, tick } from "./ctx.js";
import {
  CIRCLE, keyFromTonic, prefersFlats, noteName, diatonicChords, keySignature, relativeKey,
  pretty, keyShort, keyValue, mod12, chordTones, parseChord, SHARP_NOTES, chordsForKey, CHORD_TYPES, chordInfo, findKeysFromChords
} from "../core/music.js";
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

const ORDER_SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const ORDER_FLATS = ["B", "E", "A", "D", "G", "C", "F"];

export function theoryKey() {
  return picked || soundingKey(store.active());
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
  $("circle").addEventListener("click", onWedge);
  $("circle").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWedge(e); } });
  $("diatonic").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-chord]"));
    if (!b) return;
    triggerDiatonicBtn(b);
  });
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
        triggerDiatonicBtn(b);
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
  typeSel.innerHTML = CHORD_TYPES.map((x) => `<option value="${x.id}"${x.id === chordType ? " selected" : ""}>${esc(x.label)}</option>`).join("");
  typeSel.addEventListener("change", () => { chordType = typeSel.value; try { localStorage.setItem("sonata_theory_type", chordType); } catch { /* ignore */ } lastChord = ""; $("theoryShapes").hidden = true; renderTheory(); });
  $("theoryShapes").addEventListener("click", () => { if (lastChord) openChordSheet(lastChord); });
  $("theoryFromSongBtn").addEventListener("click", () => { picked = null; locked = false; saveLock(); renderTheory(); });
  const kfInput = /** @type {HTMLInputElement|null} */ (document.getElementById("keyFinderInput"));
  const kfRes = document.getElementById("keyFinderResult");
  if (kfInput && kfRes) {
    const updateKf = () => {
      const res = findKeysFromChords(kfInput.value);
      if (!res) { kfRes.hidden = true; kfRes.innerHTML = ""; return; }
      kfRes.hidden = false;
      const prog = res.progression.map((p) => `${pretty(p.name)} (${format === "nashville" ? p.nashville : p.roman})`).join(" · ");
      kfRes.innerHTML = `<div class="kf-row"><span class="kf-main">${esc(t("detectedKey", "Key"))}: <strong>${esc(pretty(res.best.name))}</strong> <span class="muted">(${esc(t("relative", "Relative"))}: ${esc(pretty(res.relative.name))})</span></span><button type="button" class="chip accent" data-use-key="${res.best.tonic}:${res.best.mode}">${esc(t("selectKey", "Select {k}", { k: pretty(keyShort(res.best)) }))}</button></div><div class="kf-prog muted">${esc(prog)}</div>`;
    };
    kfInput.addEventListener("input", updateKf);
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

/** Play and highlight a diatonic chord button on the Circle of Fifths. @param {HTMLElement} b */
function triggerDiatonicBtn(b) {
  tick();
  lastChord = b.dataset.chord || "";
  const info = chordInfo(lastChord);
  if (info) playChord(info.pcs, "piano", info.bassPc); else playChord(chordTones(lastChord));
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
}

/** @param {Event} e */
function onWedge(e) {
  const g = /** @type {SVGElement|null} */ (/** @type {Element} */ (e.target).closest("[data-wedge]"));
  if (!g) return;
  const pc = Number(g.getAttribute("data-pc"));
  const ring = g.getAttribute("data-ring");
  tick();
  if (ring === "dim") { playChord([pc, mod12(pc + 3), mod12(pc + 6)]); ping(g); return; }
  const mode = ring === "minor" ? "minor" : "major";
  playChord(mode === "minor" ? [pc, mod12(pc + 3), mod12(pc + 7)] : [pc, mod12(pc + 4), mod12(pc + 7)]);
  if (locked) { ping(g); return; }
  picked = keyFromTonic(pc, mode);
  renderTheory();
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
  $$("[data-circle-format]").forEach((b) => { const on = b.dataset.circleFormat === format; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  $$("[data-key-mode]").forEach((b) => { const on = b.dataset.keyMode === key.mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
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
