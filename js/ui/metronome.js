// @ts-check
// Metronome + Simple Studio Drum Beat Loops (3/4, 4/4, 6/8) & Drum Pads (Play → Metronome).
import { $, esc, toast, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, metronome, drumLooper } from "./ctx.js";
import { TIME_SIGNATURES, DRUM_PADS, DRUM_PRESETS, playDrum } from "../audio.js";

const DRUM_KEYS_STORAGE = "sonata_drum_keys";
/** @type {Record<string, string>} padId -> key */
const padKeys = Object.fromEntries(DRUM_PADS.map((p) => [p.id, p.defaultKey]));
let bindMode = false;
/** @type {string|null} */
let waitingPadId = null;

function loadPadKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRUM_KEYS_STORAGE) || "null");
    if (raw && typeof raw === "object") {
      for (const p of DRUM_PADS) if (typeof raw[p.id] === "string" && raw[p.id].length === 1) padKeys[p.id] = raw[p.id].toLowerCase();
    }
  } catch { /* ignore */ }
}

function savePadKeys() {
  try { localStorage.setItem(DRUM_KEYS_STORAGE, JSON.stringify(padKeys)); } catch { /* ignore */ }
}

export function initMetronome() {
  loadPadKeys();
  const sig = /** @type {HTMLSelectElement} */ ($("sigSelect"));
  sig.innerHTML = TIME_SIGNATURES.map((x) => `<option value="${x.id}">${x.id}</option>`).join("");
  const savedSig = TIME_SIGNATURES.find((x) => x.beats === store.settings.metronomeBeats) || TIME_SIGNATURES[2];
  sig.value = savedSig.id;
  metronome.setSignature(savedSig.id);
  drumLooper.syncSignature(savedSig.id);
  metronome.setBpm(store.settings.metronomeBpm);
  drumLooper.setBpm(store.settings.metronomeBpm);
  metronome.volume = store.settings.metronomeVolume;
  sig.addEventListener("change", () => {
    metronome.setSignature(sig.value);
    store.settings.metronomeBeats = metronome.sig.beats;
    store.changed("settings");
    drumLooper.syncSignature(sig.value);
    const presetSel = /** @type {HTMLSelectElement|null} */ (document.getElementById("drumPreset"));
    if (presetSel) presetSel.value = drumLooper.preset;
    renderDots();
  });
  const setBpm = (/** @type {number} */ v) => {
    metronome.setBpm(v);
    drumLooper.setBpm(metronome.bpm);
    store.settings.metronomeBpm = metronome.bpm;
    store.changed("settings");
    syncBpm();
  };
  $("bpmDown").addEventListener("click", () => setBpm(metronome.bpm - 1));
  $("bpmUp").addEventListener("click", () => setBpm(metronome.bpm + 1));
  $("drumBpmDown").addEventListener("click", () => setBpm(metronome.bpm - 1));
  $("drumBpmUp").addEventListener("click", () => setBpm(metronome.bpm + 1));
  $("drumBpm").addEventListener("change", (e) => setBpm(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("bpmRange").addEventListener("input", (e) => setBpm(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("bpmInput").addEventListener("change", (e) => setBpm(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("tapBtn").addEventListener("click", () => { const b = metronome.tap(); if (b) setBpm(b); flash(0, "strong"); });
  $("metroBtn").addEventListener("click", () => { metronome.toggle(); syncMetroButton(); });
  $("songTempoBtn").addEventListener("click", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    store.update(s, { bpm: metronome.bpm });
    toast(t("tempoSaved", "Saved {bpm} BPM to the song", { bpm: metronome.bpm }), "success");
  });
  metronome.onBeat((b, accent) => { flash(b, accent); app.beatListeners.forEach((fn) => fn(b, accent)); });
  store.on("song-open", (/** @type {any} */ s) => { if (s?.bpm && !metronome.running && !drumLooper.running) { metronome.setBpm(s.bpm); drumLooper.setBpm(s.bpm); syncBpm(); } renderMetronome(); });
  initDrumsAndLooper();
  renderDots();
  renderMetronome();
}

function initDrumsAndLooper() {
  const presetSel = /** @type {HTMLSelectElement|null} */ (document.getElementById("drumPreset"));
  if (!presetSel) return;
  presetSel.innerHTML = Object.entries(DRUM_PRESETS).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join("");
  presetSel.value = drumLooper.preset;
  presetSel.addEventListener("change", () => {
    drumLooper.loadPreset(presetSel.value);
    const sig = /** @type {HTMLSelectElement|null} */ (document.getElementById("sigSelect"));
    if (sig && sig.value !== drumLooper.sig && TIME_SIGNATURES.some((x) => x.id === drumLooper.sig)) {
      sig.value = drumLooper.sig;
      metronome.setSignature(drumLooper.sig);
      store.settings.metronomeBeats = metronome.sig.beats;
      store.changed("settings");
      renderDots();
    }
  });

  const bindBtn = document.getElementById("drumBindBtn");
  bindBtn?.addEventListener("click", () => {
    bindMode = !bindMode;
    waitingPadId = null;
    bindBtn.classList.toggle("on", bindMode);
    bindBtn.setAttribute("aria-pressed", String(bindMode));
    const sub = document.getElementById("drumSub");
    if (sub) sub.textContent = bindMode
      ? t("drumBindHint", "Tap a pad below, then press any laptop key to assign it.")
      : t("drumSub", "Practice over 3/4, 4/4 and 6/8 drum beats, or tap the pads.");
    const keysHint = document.getElementById("drumKeysHint");
    if (keysHint) keysHint.hidden = bindMode;
    renderDrumPads();
  });

  const padsEl = document.getElementById("drumPads");
  padsEl?.addEventListener("pointerdown", (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-pad]"));
    if (!btn || !btn.dataset.pad) return;
    e.preventDefault();
    const padId = btn.dataset.pad;
    if (bindMode) {
      waitingPadId = padId;
      renderDrumPads();
      return;
    }
    triggerPad(padId);
  });
  padsEl?.addEventListener("keydown", (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-pad]"));
    if (!btn || !btn.dataset.pad) return;
    if (!bindMode && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      triggerPad(btn.dataset.pad);
    }
  });

  document.getElementById("loopPlayBtn")?.addEventListener("click", () => {
    drumLooper.toggle();
    syncLoopButtons();
  });

  drumLooper.onStep((beatIdx, pads) => {
    if (!metronome.running) flash(beatIdx % metronome.sig.beats, beatIdx === 0 ? "strong" : "weak");
    for (const p of pads) flashPad(p);
  });

  window.addEventListener("keydown", (e) => {
    if (app.view !== "play") return;
    const playView = document.getElementById("view-play");
    if (playView?.dataset.inst !== "metronome") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tgt = /** @type {HTMLElement|null} */ (e.target);
    if (tgt && (tgt.closest("input, textarea, select") || tgt.isContentEditable)) return;
    if (document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (bindMode && waitingPadId && k.length === 1 && /^[a-z0-9]$/.test(k)) {
      e.preventDefault();
      padKeys[waitingPadId] = k;
      waitingPadId = null;
      savePadKeys();
      renderDrumPads();
      return;
    }
    if (e.repeat) return;
    const hit = DRUM_PADS.find((p) => padKeys[p.id] === k);
    if (hit) {
      e.preventDefault();
      triggerPad(hit.id);
    }
  });

  renderDrumPads();
  syncLoopButtons();
}

/** @param {string} padId */
function triggerPad(padId) {
  playDrum(padId, 0.88);
  flashPad(padId);
}

/** @param {string} padId */
function flashPad(padId) {
  const el = document.querySelector(`#drumPads [data-pad="${padId}"]`);
  if (!el) return;
  el.classList.add("hit");
  setTimeout(() => el.classList.remove("hit"), 150);
}

function renderDrumPads() {
  const host = document.getElementById("drumPads");
  if (!host) return;
  host.innerHTML = DRUM_PADS.map((p) => {
    const k = (padKeys[p.id] || p.defaultKey).toUpperCase();
    const waiting = bindMode && waitingPadId === p.id;
    return `<button type="button" class="drum-pad${waiting ? " waiting" : ""}" data-pad="${p.id}" aria-label="${esc(p.label)} (${esc(k)})">
      <span class="dp-name">${esc(p.label)}</span>
      <kbd class="dp-key">${esc(waiting ? "Press key…" : k)}</kbd>
    </button>`;
  }).join("");
}

export function syncLoopButtons() {
  const playBtn = document.getElementById("loopPlayBtn");
  const on = drumLooper.running;
  if (playBtn) {
    playBtn.innerHTML = `<span data-icon="${on ? "stop" : "play"}"></span><span>${esc(on ? t("stopLoop", "Stop beat") : t("playLoop", "Play beat"))}</span>`;
    playBtn.classList.toggle("danger", on);
    playBtn.classList.toggle("primary", !on);
    playBtn.setAttribute("aria-pressed", String(on));
    paintIcons(playBtn);
  }
  document.querySelectorAll('[data-role="beat"]').forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  if (!on && !metronome.running) for (const d of $("beatDots").children) d.classList.remove("on");
}

function renderDots() {
  $("beatDots").innerHTML = Array.from({ length: metronome.sig.beats }, (_, i) => `<span class="${i === 0 ? "down" : metronome.sig.accents.includes(i) ? "mid" : ""}"></span>`).join("");
}

/** @param {number} b @param {string} accent */
function flash(b, accent) {
  const dots = $("beatDots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === b);
  $("beatDots").dataset.accent = accent;
}

function syncBpm() {
  /** @type {HTMLInputElement} */ ($("bpmInput")).value = String(metronome.bpm);
  /** @type {HTMLInputElement} */ ($("drumBpm")).value = String(metronome.bpm);
  /** @type {HTMLInputElement} */ ($("bpmRange")).value = String(metronome.bpm);
  const st = document.getElementById("stageBpm");
  if (st) st.textContent = String(metronome.bpm);
}

export function syncMetroButton() {
  const b = $("metroBtn");
  const on = metronome.running;
  b.innerHTML = `<span data-icon="${on ? "stop" : "play"}"></span><span>${esc(on ? t("stop", "Stop") : t("start", "Start"))}</span>`;
  b.classList.toggle("danger", on);
  b.classList.toggle("primary", !on);
  b.setAttribute("aria-pressed", String(on));
  paintIcons(b);
  document.getElementById("stageMetroBtn")?.classList.toggle("on", on);
  if (!on) for (const d of $("beatDots").children) d.classList.remove("on");
}

export function renderMetronome() {
  const s = store.active();
  /** @type {HTMLButtonElement} */ ($("songTempoBtn")).disabled = !s || Boolean(s.readonly);
  syncBpm();
  syncMetroButton();
}
