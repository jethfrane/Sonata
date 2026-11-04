// @ts-check
// Metronome panel (Play → Metronome). The stage dock shares the same metronome.
import { $, esc, toast, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, metronome } from "./ctx.js";
import { TIME_SIGNATURES } from "../audio.js";

export function initMetronome() {
  const sig = /** @type {HTMLSelectElement} */ ($("sigSelect"));
  sig.innerHTML = TIME_SIGNATURES.map((x) => `<option value="${x.id}">${x.id}</option>`).join("");
  const savedSig = TIME_SIGNATURES.find((x) => x.beats === store.settings.metronomeBeats) || TIME_SIGNATURES[2];
  sig.value = savedSig.id;
  metronome.setSignature(savedSig.id);
  metronome.setBpm(store.settings.metronomeBpm);
  metronome.volume = store.settings.metronomeVolume;
  sig.addEventListener("change", () => { metronome.setSignature(sig.value); store.settings.metronomeBeats = metronome.sig.beats; store.changed("settings"); renderDots(); });
  const setBpm = (/** @type {number} */ v) => { metronome.setBpm(v); store.settings.metronomeBpm = metronome.bpm; store.changed("settings"); syncBpm(); };
  $("bpmDown").addEventListener("click", () => setBpm(metronome.bpm - 1));
  $("bpmUp").addEventListener("click", () => setBpm(metronome.bpm + 1));
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
  store.on("song-open", (/** @type {any} */ s) => { if (s?.bpm && !metronome.running) { metronome.setBpm(s.bpm); syncBpm(); } renderMetronome(); });
  renderDots();
  renderMetronome();
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
