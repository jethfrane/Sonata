// @ts-check
// Web Audio: piano and plucked-string voices, chords, and a sample-accurate
// metronome (look-ahead scheduler instead of setInterval).
import { midiToFreq } from "./core/music.js";

/** @typedef {{ stop: (release?: number) => void }} Voice */
const SILENT = /** @type {Voice} */ ({ stop() {} });

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

/** Create (or resume) the audio context. Must follow a user gesture. */
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    ctx = /** @type {AudioContext} */ (new AC({ latencyHint: "interactive" }));
    master = ctx.createGain();
    master.gain.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 10; limiter.ratio.value = 6;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Resume after tab switches (iOS suspends audio). */
export function keepAlive() {
  const wake = () => { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });
  document.addEventListener("pointerdown", wake, { passive: true });
}

/**
 * Piano-like voice: a few detuned partials through a closing low-pass,
 * a felt "thump", and a damper when the key is released.
 * @param {number} midi @param {number} [vel] 0..1
 * @returns {Voice}
 */
export function piano(midi, vel = 0.7) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const f = midiToFreq(midi);
  const t = ac.currentTime;
  const decay = Math.max(1.6, Math.min(7, 7.5 - (midi - 36) * 0.09));
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.42 * vel, t + 0.005);
  out.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(14000, f * (6 + vel * 6)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(220, f * 1.8), t + decay * 0.7);
  lp.connect(out).connect(master);
  const partials = [[1, 0.6, 0], [1, 0.25, 4], [2, 0.32, -3], [3, 0.14, 2], [4, 0.07, 0], [5, 0.035, 0]];
  /** @type {OscillatorNode[]} */
  const oscs = [];
  for (const [mult, g, cents] of partials) {
    // Slight stretch tuning like a real string.
    const pf = f * mult * (1 + 0.0004 * mult * mult);
    if (pf > 16000) continue;
    const o = ac.createOscillator();
    o.type = mult === 1 ? "triangle" : "sine";
    o.frequency.value = pf;
    o.detune.value = cents;
    const pg = ac.createGain();
    pg.gain.setValueAtTime(g, t);
    if (mult > 2) pg.gain.exponentialRampToValueAtTime(0.0005, t + decay / mult);
    o.connect(pg).connect(lp);
    o.start(t);
    o.stop(t + decay + 0.2);
    oscs.push(o);
  }
  // Hammer
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.03);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = Math.min(4000, f * 3); bp.Q.value = 1.4;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.09 * vel, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  n.connect(bp).connect(ng).connect(lp);
  n.start(t);
  let stopped = false;
  return {
    stop(release = 0.28) {
      if (stopped || !ctx) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + release);
      oscs.forEach((o) => { try { o.stop(now + release + 0.05); } catch { /* already stopped */ } });
    }
  };
}

/** @type {Map<AudioContext, AudioBuffer>} */
const noiseCache = new Map();
/** @param {AudioContext} ac @param {number} seconds */
function noiseBuffer(ac, seconds) {
  const cached = noiseCache.get(ac);
  if (cached && cached.duration >= seconds) return cached;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.006));
  noiseCache.set(ac, buf);
  return buf;
}

/** @type {Map<string, AudioBuffer>} */
const pluckCache = new Map();

/**
 * Karplus-Strong plucked string, rendered once per pitch and cached.
 * @param {AudioContext} ac @param {number} midi @param {"guitar"|"bass"|"uke"} kind
 */
function pluckBuffer(ac, midi, kind) {
  const key = `${kind}:${midi}:${ac.sampleRate}`;
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const sr = ac.sampleRate;
  const f = midiToFreq(midi);
  const seconds = kind === "bass" ? 3.2 : kind === "uke" ? 1.6 : 2.8;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  // Loop delay = ring length - 0.5 (averaging with the next sample) + allpass fraction.
  const period = sr / f;
  let N = Math.floor(period + 0.5);
  let d = period + 0.5 - N;
  if (d < 0.1) { N -= 1; d += 1; }
  const C = (1 - d) / (1 + d);
  const ring = new Float32Array(N);
  // Pick position shapes the tone: a filtered noise burst.
  let prev = 0;
  const bright = kind === "bass" ? 0.35 : kind === "uke" ? 0.7 : 0.55;
  for (let i = 0; i < N; i++) { prev += bright * (Math.random() * 2 - 1 - prev); ring[i] = prev; }
  const damp = kind === "bass" ? 0.997 : kind === "uke" ? 0.991 : 0.996;
  let idx = 0, x1 = 0, y1 = 0;
  for (let i = 0; i < len; i++) {
    const y = ring[idx];
    const avg = damp * 0.5 * (y + ring[(idx + 1) % N]);
    const ap = C * avg + x1 - C * y1;
    x1 = avg; y1 = ap;
    ring[idx] = ap;
    out[i] = y;
    idx = (idx + 1) % N;
  }
  // Normalize and add a short fade so the buffer never clicks.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= g * (i > len - 2000 ? (len - i) / 2000 : 1);
  pluckCache.set(key, buf);
  return buf;
}

/**
 * Plucked string voice.
 * @param {number} midi @param {"guitar"|"bass"|"uke"} [kind] @param {number} [vel]
 * @param {number} [when] seconds from now
 * @returns {Voice}
 */
export function pluck(midi, kind = "guitar", vel = 0.8, when = 0) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const t = ac.currentTime + when;
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(ac, midi, kind);
  const body = ac.createBiquadFilter();
  body.type = "peaking"; body.frequency.value = kind === "bass" ? 90 : 180; body.Q.value = 1; body.gain.value = 4;
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass"; tone.frequency.value = kind === "bass" ? 2200 : 6500;
  const g = ac.createGain();
  g.gain.value = 0.55 * vel;
  src.connect(body).connect(tone).connect(g).connect(master);
  src.start(t);
  let stopped = false;
  return {
    stop(release = 0.12) {
      if (stopped || !ctx) return;
      stopped = true;
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + release);
      try { src.stop(now + release + 0.05); } catch { /* not started */ }
    }
  };
}

/**
 * Play a chord from pitch classes, voiced around middle C with the root below.
 * @param {number[]} pcs root first
 * @param {"piano"|"guitar"} [voice]
 * @returns {Voice}
 */
export function playChord(pcs, voice = "piano") {
  if (!pcs.length) return SILENT;
  const root = 48 + pcs[0];
  const notes = [root - 12 >= 36 ? root - 12 : root];
  let last = root;
  for (const pc of pcs) {
    let m = 48 + pc;
    while (m <= last) m += 12;
    if (pc === pcs[0]) m = root;
    notes.push(m);
    last = Math.max(last, m);
  }
  const uniq = [...new Set(notes)].sort((a, b) => a - b).slice(0, 6);
  const voices = uniq.map((m, i) => (voice === "guitar" ? pluck(m, "guitar", 0.65, i * 0.025) : piano(m, i === 0 ? 0.55 : 0.42)));
  return { stop: (r) => voices.forEach((v) => v.stop(r)) };
}

/** A short reference tone (tuner). @param {number} freq @param {number} [seconds] */
export function tone(freq, seconds = 2.5) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.04);
  g.gain.setValueAtTime(0.28, t + seconds - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + seconds + 0.05);
  return { stop() { try { const n = ac.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08); o.stop(n + 0.1); } catch { /* done */ } } };
}

export const TIME_SIGNATURES = [
  { id: "2/4", beats: 2, accents: [0] },
  { id: "3/4", beats: 3, accents: [0] },
  { id: "4/4", beats: 4, accents: [0] },
  { id: "5/4", beats: 5, accents: [0, 3] },
  { id: "6/8", beats: 6, accents: [0, 3] },
  { id: "12/8", beats: 12, accents: [0, 3, 6, 9] }
];

/**
 * Metronome with a look-ahead scheduler: clicks are booked on the audio clock,
 * so timing stays steady even when the page is busy.
 */
export class Metronome {
  constructor() {
    this.bpm = 90;
    this.sig = TIME_SIGNATURES[2];
    this.volume = 0.6;
    this.running = false;
    this.beat = 0;
    this.nextTime = 0;
    /** @type {ReturnType<typeof setInterval>|undefined} */
    this.timer = undefined;
    /** @type {Set<(beat: number, accent: "strong"|"medium"|"weak") => void>} */
    this.listeners = new Set();
    /** @type {number[]} */ this.taps = [];
  }

  /** @param {(beat: number, accent: "strong"|"medium"|"weak") => void} fn */
  onBeat(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** @param {number} bpm */
  setBpm(bpm) { this.bpm = Math.min(300, Math.max(30, Math.round(Number(bpm) || 90))); }

  /** @param {string|number} id */
  setSignature(id) {
    this.sig = TIME_SIGNATURES.find((s) => s.id === id || s.beats === Number(id)) || TIME_SIGNATURES[2];
    this.beat = 0;
  }

  start() {
    const ac = audio();
    if (!ac || this.running) return;
    this.running = true;
    this.beat = 0;
    this.nextTime = ac.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.beat = 0;
  }

  toggle() { this.running ? this.stop() : this.start(); return this.running; }

  schedule() {
    if (!ctx || !master || !this.running) return;
    // Compound meters count in eighth notes: the BPM is the dotted-quarter pulse.
    const per = this.sig.id.endsWith("/8") ? 60 / this.bpm / 3 : 60 / this.bpm;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const b = this.beat % this.sig.beats;
      const accent = b === 0 ? "strong" : this.sig.accents.includes(b) ? "medium" : "weak";
      this.click(this.nextTime, accent);
      const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
      setTimeout(() => this.listeners.forEach((fn) => fn(b, accent)), delay);
      this.nextTime += per;
      this.beat++;
    }
  }

  /** @param {number} t @param {"strong"|"medium"|"weak"} accent */
  click(t, accent) {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = accent === "strong" ? 1760 : accent === "medium" ? 1320 : 990;
    const peak = this.volume * (accent === "strong" ? 0.9 : accent === "medium" ? 0.65 : 0.45);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.06);
  }

  /** Tap tempo; returns the new BPM once there are two taps. */
  tap() {
    const t = performance.now();
    this.taps = this.taps.filter((x) => t - x < 2500);
    this.taps.push(t);
    if (this.taps.length < 2) return null;
    const gaps = this.taps.slice(1).map((x, i) => x - this.taps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    this.setBpm(60000 / avg);
    return this.bpm;
  }
}

/** @param {number} [ms] */
export function haptic(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ }
}
