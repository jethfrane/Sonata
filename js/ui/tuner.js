// @ts-check
import { $, esc, toast, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store } from "./ctx.js";
import { audio, pluck } from "../audio.js";
import { detectPitch, noteFromFreq } from "../core/pitch.js";
import { midiToFreq, pretty, SHARP_NOTES } from "../core/music.js";

/** @typedef {{ label: string, kind: string, strings: number[] }} Tuning */

/** @type {Tuning} */
let tuning = { label: "", kind: "guitar", strings: [64, 59, 55, 50, 45, 40] };
/** @type {MediaStream|null} */
let stream = null;
/** @type {AnalyserNode|null} */
let analyser = null;
/** @type {ReturnType<typeof setInterval>|undefined} */
let timer;
/** @type {number[]} */
let recent = [];
let smoothCents = 0;
let lastHeard = 0;
let targetMidi = -1;

export function initTuner(/** @type {Tuning} */ tun) {
  tuning = tun;
  const a4 = /** @type {HTMLInputElement} */ ($("a4Input"));
  a4.value = String(store.settings.a4);
  a4.addEventListener("change", () => {
    const v = Math.round(Number(a4.value));
    store.settings.a4 = v >= 415 && v <= 466 ? v : 440;
    a4.value = String(store.settings.a4);
    store.changed("settings");
  });
  $("tunerBtn").addEventListener("click", () => (stream ? stopTuner() : startTuner()));
  $("tunerStrings").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-midi]"));
    if (b) pluck(Number(b.dataset.midi), /** @type {any} */ (tuning.kind === "uke" ? "uke" : tuning.kind === "bass" ? "bass" : "guitar"), 0.9);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopTuner(); });
  drawGauge(null);
  renderTunerStrings();
}

/** @param {Tuning} tun */
export function setTuning(tun) { tuning = tun; renderTunerStrings(); }

export function renderTunerStrings() {
  const host = $("tunerStrings");
  if (!host) return;
  host.innerHTML = [...tuning.strings].reverse().map((m) => {
    const name = SHARP_NOTES[m % 12];
    return `<button type="button" class="string-btn${m === targetMidi ? " target" : ""}" data-midi="${m}"><strong>${esc(pretty(name))}</strong><small>${Math.floor(m / 12) - 1}</small></button>`;
  }).join("");
}

async function startTuner() {
  const ac = audio();
  if (!ac) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    toast(/** @type {any} */ (e)?.name === "NotFoundError" ? t("micUnavailable", "No microphone found.") : t("micDenied", "The tuner needs the microphone. Allow it in your browser settings."), "error", { ms: 5000 });
    stream = null;
    return;
  }
  const src = ac.createMediaStreamSource(stream);
  analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  recent = [];
  $("tuner").classList.add("live");
  setButton(true);
  $("tunerDetail").textContent = t("listening", "Listening…");
  timer = setInterval(() => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, ac.sampleRate, { minFreq: tuning.kind === "bass" ? 28 : 55, maxFreq: 1400 });
    if (r && r.clarity > 0.75) { lastHeard = performance.now(); update(r.freq); }
    else if (performance.now() - lastHeard > 1200) idle();
  }, 45);
}

export function stopTuner() {
  clearInterval(timer);
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
  analyser = null;
  targetMidi = -1;
  $("tuner")?.classList.remove("live", "good");
  setButton(false);
  idle(t("tunerIdle", "Tap Start and play one string."));
  renderTunerStrings();
}

/** @param {boolean} on */
function setButton(on) {
  const b = $("tunerBtn");
  b.innerHTML = `<span data-icon="${on ? "stop" : "mic"}"></span><span>${esc(on ? t("stopTuner", "Stop tuner") : t("startTuner", "Start tuner"))}</span>`;
  b.classList.toggle("danger", on);
  b.classList.toggle("primary", !on);
  paintIcons(b);
}

/** @param {string} [text] */
function idle(text) {
  recent = [];
  $("tunerNote").textContent = "—";
  $("tunerNote").className = "tuner-note";
  $("tunerDetail").textContent = text || t("listening", "Listening…");
  $("tuner").classList.remove("good");
  drawGauge(null);
}

/** @param {number} freq */
function update(freq) {
  recent.push(freq);
  if (recent.length > 5) recent.shift();
  const med = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
  const a4 = store.settings.a4;
  // Snap to the nearest open string when close, so the readout guides tuning.
  const nearest = tuning.strings.reduce((best, m) => (Math.abs(Math.log2(med / midiToFreq(m, a4))) < Math.abs(Math.log2(med / midiToFreq(best, a4))) ? m : best), tuning.strings[0]);
  const nearCents = 1200 * Math.log2(med / midiToFreq(nearest, a4));
  const n = noteFromFreq(med, a4);
  const cents = Math.abs(nearCents) < 120 ? nearCents : n.cents;
  smoothCents = recent.length < 2 ? cents : smoothCents * 0.6 + cents * 0.4;
  const c = Math.round(smoothCents);
  const shown = Math.abs(nearCents) < 120 ? { name: SHARP_NOTES[nearest % 12], octave: Math.floor(nearest / 12) - 1 } : n;
  const newTarget = Math.abs(nearCents) < 120 ? nearest : -1;
  if (newTarget !== targetMidi) { targetMidi = newTarget; renderTunerStrings(); }
  const good = Math.abs(c) <= 4;
  $("tunerNote").innerHTML = `${esc(pretty(shown.name))}<sub>${shown.octave}</sub>`;
  $("tunerNote").className = `tuner-note${good ? " good" : ""}`;
  $("tuner").classList.toggle("good", good);
  $("tunerDetail").textContent = `${med.toFixed(1)} Hz · ${c > 0 ? "+" : ""}${c} cents · ${good ? t("inTune", "In tune") : c < 0 ? t("tooLow", "Low · tighten") : t("tooHigh", "High · loosen")}`;
  drawGauge(c);
}

/** @param {number|null} cents */
function drawGauge(cents) {
  const svg = document.getElementById("tunerSvg");
  if (!svg) return;
  const cx = 120, cy = 120, r = 100;
  let ticks = "";
  for (let c = -50; c <= 50; c += 10) {
    const a = ((c / 50) * 60 - 90) * Math.PI / 180;
    const r1 = c === 0 ? 78 : 86;
    ticks += `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(cy + r * Math.sin(a)).toFixed(1)}" class="${c === 0 ? "tick zero" : "tick"}"/>`;
  }
  const arc = (/** @type {number} */ c1, /** @type {number} */ c2, /** @type {string} */ cls) => {
    const a1 = ((c1 / 50) * 60 - 90) * Math.PI / 180, a2 = ((c2 / 50) * 60 - 90) * Math.PI / 180;
    return `<path class="${cls}" d="M${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a2)).toFixed(1)} ${(cy + r * Math.sin(a2)).toFixed(1)}"/>`;
  };
  const v = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const ang = (v / 50) * 60;
  svg.innerHTML = `${arc(-50, 50, "track")}${arc(-5, 5, "zone")}${ticks}
    <text x="22" y="128" class="g-lbl">♭</text><text x="210" y="128" class="g-lbl">♯</text>
    <g class="needle${cents === null ? " idle" : ""}" style="transform: rotate(${ang}deg)"><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 92}"/><circle cx="${cx}" cy="${cy}" r="6"/></g>`;
}
