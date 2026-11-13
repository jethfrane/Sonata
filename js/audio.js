// @ts-check
// Web Audio studio engine: real multi-sampled instruments (Salamander Grand Piano,
// Acoustic Guitar, Concert Ukulele, and Fingered Bass) with onset-trimmed zero-lag
// playback, velocity tone shaping, stereo studio room reverb, physical-modeling
// instant fallback, and a sample-accurate woodblock metronome.
import { midiToFreq } from "./core/music.js";

/** @typedef {{ stop: (release?: number) => void }} Voice */
/** @typedef {"piano"|"guitar"|"bass"|"uke"} InstrumentKind */
/** @typedef {{ buffer: AudioBuffer, offset: number }} SampleEntry */

const SILENT = /** @type {Voice} */ ({ stop() {} });

/** @type {AudioContext|null} */
let ctx = null;
/** @type {BaseAudioContext|null} */
let decoder = null;
/** @type {GainNode|null} */
let master = null;
/** @type {GainNode|null} */
let reverbIn = null;

/** Get a decoding context that works even before the first user gesture without autoplay warnings. */
function getDecoder() {
  if (ctx) return ctx;
  if (!decoder && typeof window !== "undefined") {
    const OAC = window.OfflineAudioContext || /** @type {any} */ (window).webkitOfflineAudioContext;
    if (OAC) {
      try { decoder = new OAC(2, 1, 44100); } catch { decoder = null; }
    }
  }
  return decoder;
}

/**
 * Real recorded multi-sample anchors (every minor 3rd across each instrument's range).
 * Every playable note is within 1-2 semitones of a real studio recording.
 * @type {Record<InstrumentKind, Array<[number, string]>>}
 */
export const SAMPLE_ANCHORS = {
  piano: [
    [36, "C2.mp3"], [39, "Ds2.mp3"], [42, "Fs2.mp3"], [45, "A2.mp3"],
    [48, "C3.mp3"], [51, "Ds3.mp3"], [54, "Fs3.mp3"], [57, "A3.mp3"],
    [60, "C4.mp3"], [63, "Ds4.mp3"], [66, "Fs4.mp3"], [69, "A4.mp3"],
    [72, "C5.mp3"], [75, "Ds5.mp3"], [78, "Fs5.mp3"], [81, "A5.mp3"],
    [84, "C6.mp3"]
  ],
  guitar: [
    [38, "D2.mp3"], [41, "F2.mp3"], [44, "Gs2.mp3"], [47, "B2.mp3"],
    [50, "D3.mp3"], [53, "F3.mp3"], [56, "Gs3.mp3"], [59, "B3.mp3"],
    [62, "D4.mp3"], [65, "F4.mp3"], [68, "Gs4.mp3"], [71, "B4.mp3"],
    [74, "D5.mp3"]
  ],
  bass: [
    [28, "E1.mp3"], [31, "G1.mp3"], [34, "As1.mp3"], [37, "Cs2.mp3"],
    [40, "E2.mp3"], [43, "G2.mp3"], [46, "As2.mp3"], [49, "Cs3.mp3"],
    [52, "E3.mp3"], [55, "G3.mp3"], [58, "As3.mp3"]
  ],
  uke: [
    [60, "C4.wav"], [63, "Ds4.wav"], [66, "Fs4.wav"], [69, "A4.wav"],
    [72, "C5.wav"], [75, "Ds5.wav"], [78, "Fs5.wav"], [81, "A5.wav"],
    [84, "C6.wav"]
  ]
};

/** @type {Map<string, SampleEntry>} key: `${kind}:${midi}` */
const sampleCache = new Map();
/** @type {Map<string, Promise<SampleEntry|null>>} */
const inflight = new Map();
/** @type {Set<InstrumentKind>} */
const preloading = new Set();

/**
 * Build a warm stereo studio room impulse response (early reflections + damped tail).
 * @param {AudioContext} ac
 */
function createRoomImpulse(ac) {
  const sr = ac.sampleRate;
  const seconds = 1.35;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  // Early studio room reflections (ms, gainL, gainR)
  const early = [
    [0.011, 0.32, 0.18],
    [0.018, 0.16, 0.30],
    [0.027, 0.24, 0.21],
    [0.039, 0.14, 0.23],
    [0.053, 0.18, 0.12]
  ];
  for (const [sec, gl, gr] of early) {
    const idx = Math.floor(sec * sr);
    if (idx < len) { L[idx] += gl; R[idx] += gr; }
  }
  // Diffuse exponentially decaying room tail with warm lowpass damping
  let lpL = 0, lpR = 0;
  for (let i = Math.floor(0.01 * sr); i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 4.2) * (1 - Math.exp(-t * 45));
    const damp = Math.max(0.18, 0.58 - t * 0.28);
    lpL += damp * ((Math.random() * 2 - 1) - lpL);
    lpR += damp * ((Math.random() * 2 - 1) - lpR);
    L[i] += lpL * env * 0.22;
    R[i] += lpR * env * 0.22;
  }
  return buf;
}

/** Create (or resume) the audio context and studio master/reverb bus. Must follow a user gesture. */
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    ctx = /** @type {AudioContext} */ (new AC({ latencyHint: "interactive" }));
    master = ctx.createGain();
    master.gain.value = 0.82;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -11;
    limiter.knee.value = 12;
    limiter.ratio.value = 3.5;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.18;
    master.connect(limiter).connect(ctx.destination);

    try {
      const conv = ctx.createConvolver();
      conv.buffer = createRoomImpulse(ctx);
      const revTone = ctx.createBiquadFilter();
      revTone.type = "lowpass";
      revTone.frequency.value = 3400;
      const revOut = ctx.createGain();
      revOut.gain.value = 0.18;
      reverbIn = ctx.createGain();
      reverbIn.gain.value = 1;
      reverbIn.connect(conv).connect(revTone).connect(revOut).connect(master);
    } catch {
      reverbIn = null;
    }
  }
  if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Find the onset of a decoded sample (skipping MP3 priming / pre-roll silence)
 * and smooth the tail so trimmed buffers never click.
 * @param {AudioBuffer} buf
 * @returns {SampleEntry}
 */
function prepareBuffer(buf) {
  const sr = buf.sampleRate;
  const len = buf.length;
  const ch0 = buf.getChannelData(0);
  let peak = 0;
  const scanLen = Math.min(len, sr * 2);
  for (let i = 0; i < scanLen; i++) {
    const a = Math.abs(ch0[i]);
    if (a > peak) peak = a;
  }
  let onset = 0;
  const thresh = Math.max(0.002, peak * 0.03);
  const preRoll = Math.floor(sr * 0.0015);
  for (let i = 0; i < scanLen; i++) {
    if (Math.abs(ch0[i]) >= thresh) {
      onset = Math.max(0, i - preRoll);
      break;
    }
  }
  // Smooth the last 120ms of every channel so sample tails never click
  const fade = Math.min(Math.floor(sr * 0.12), Math.floor(len * 0.25));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < fade; i++) {
      data[len - 1 - i] *= i / fade;
    }
  }
  return { buffer: buf, offset: onset / sr };
}

/**
 * Fetch and decode a single anchor sample.
 * @param {InstrumentKind} kind @param {number} anchorMidi @param {string} file
 * @returns {Promise<SampleEntry|null>}
 */
function loadAnchor(kind, anchorMidi, file) {
  const key = `${kind}:${anchorMidi}`;
  const hit = sampleCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const dec = getDecoder();
  if (!dec || typeof fetch !== "function") return Promise.resolve(null);
  const p = fetch(`/samples/${kind}/${file}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((ab) => dec.decodeAudioData(ab))
    .then((buf) => {
      const entry = prepareBuffer(buf);
      sampleCache.set(key, entry);
      inflight.delete(key);
      return entry;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, p);
  return p;
}

/**
 * Find the closest anchor definition for an instrument and target MIDI note.
 * @param {InstrumentKind} kind @param {number} midi
 */
function closestAnchorDef(kind, midi) {
  const list = SAMPLE_ANCHORS[kind];
  let best = list[0];
  let minDiff = Math.abs(midi - best[0]);
  for (let i = 1; i < list.length; i++) {
    const d = Math.abs(midi - list[i][0]);
    if (d < minDiff) { minDiff = d; best = list[i]; }
  }
  return best;
}

/**
 * Pick the closest already-decoded sample for `kind` and `midi` (within ±7 semitones),
 * while kicking off loading for the exact anchor and instrument bank.
 * @param {InstrumentKind} kind @param {number} midi
 * @returns {{ anchorMidi: number, entry: SampleEntry } | null}
 */
function getReadySample(kind, midi) {
  // The instrument is being played: load the rest of its bank in the background.
  if (!savingData()) preloadSamples(kind, true);
  const exact = closestAnchorDef(kind, midi);
  const exactKey = `${kind}:${exact[0]}`;
  const exactHit = sampleCache.get(exactKey);
  if (exactHit) return { anchorMidi: exact[0], entry: exactHit };
  // Fetch the exact anchor first
  loadAnchor(kind, exact[0], exact[1]);
  // If a nearby anchor (within 6 semitones) is already decoded, use it right away
  let bestMidi = -1;
  let bestDist = 7;
  /** @type {SampleEntry|null} */
  let bestEntry = null;
  for (const [m] of SAMPLE_ANCHORS[kind]) {
    const e = sampleCache.get(`${kind}:${m}`);
    const d = Math.abs(midi - m);
    if (e && d < bestDist) {
      bestDist = d;
      bestMidi = m;
      bestEntry = e;
    }
  }
  return bestEntry ? { anchorMidi: bestMidi, entry: bestEntry } : null;
}

/** Data saver is on: fetch only the samples that are actually played. */
const savingData = () => Boolean(/** @type {any} */ (navigator).connection?.saveData);
/** Instruments whose starter samples were requested. @type {Set<string>} */
const started = new Set();

/**
 * Get an instrument's samples ready, middle register first.
 * Opening a view asks for a starter set only (the three middle samples, about 200 kB for the
 * piano), so nothing large downloads for someone who never plays a note. The whole bank loads
 * once the instrument is actually played (`full`), and never on its own when data saver is on.
 * @param {InstrumentKind} [kind] @param {boolean} [full]
 */
export function preloadSamples(kind = "piano", full = false) {
  const list = SAMPLE_ANCHORS[kind];
  if (!list || !getDecoder()) return;
  if (full ? preloading.has(kind) : started.has(kind) || preloading.has(kind)) return;
  (full ? preloading : started).add(kind);
  const mid = list[Math.floor(list.length / 2)][0];
  const ordered = [...list].sort((a, b) => Math.abs(a[0] - mid) - Math.abs(b[0] - mid));
  (async () => {
    for (const [m, file] of full ? ordered : ordered.slice(0, 3)) {
      await loadAnchor(kind, m, file);
    }
  })();
}

/** Every sample file, for "keep sounds on this device". */
export const sampleUrls = () => Object.entries(SAMPLE_ANCHORS).flatMap(([kind, list]) => list.map(([, file]) => `/samples/${kind}/${file}`));

/**
 * Connect a voice node to master + stereo pan + studio room reverb send.
 * @param {AudioContext} ac @param {AudioNode} input @param {number} pan @param {number} reverbSend
 */
function routeToStudioBus(ac, input, pan, reverbSend) {
  if (!master) return;
  let last = input;
  if (typeof ac.createStereoPanner === "function" && pan !== 0) {
    try {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-0.6, Math.min(0.6, pan));
      last.connect(p);
      last = p;
    } catch { /* ignore */ }
  }
  last.connect(master);
  if (reverbIn && reverbSend > 0) {
    const send = ac.createGain();
    send.gain.value = reverbSend;
    last.connect(send).connect(reverbIn);
  }
}

/**
 * Play a decoded real instrument sample with velocity tone shaping, body EQ, stereo spread, and damper release.
 * @param {AudioContext} ac
 * @param {InstrumentKind} kind
 * @param {number} midi
 * @param {{ anchorMidi: number, entry: SampleEntry }} sample
 * @param {number} vel
 * @param {number} t
 * @returns {Voice}
 */
function playSampleVoice(ac, kind, midi, sample, vel, t) {
  const src = ac.createBufferSource();
  src.buffer = sample.entry.buffer;
  src.playbackRate.value = Math.pow(2, (midi - sample.anchorMidi) / 12);

  // Velocity-sensitive lowpass filter (soft touches sound warmer, harder hits open harmonics)
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  const maxCut = kind === "bass" ? 1100 + vel * 3400 : kind === "piano" ? 7500 + vel * 12500 : 2500 + vel * 11000;
  lp.frequency.setValueAtTime(Math.min(20000, maxCut), t);

  // Instrument body resonance & studio presence EQ
  const body = ac.createBiquadFilter();
  /** @type {BiquadFilterNode|null} */
  let presence = null;
  /** @type {BiquadFilterNode|null} */
  let air = null;
  if (kind === "piano") {
    // Tight low-end + bright studio grand presence (2.6 kHz) + sparkling air shelf (5.8 kHz)
    body.type = "highpass"; body.frequency.value = 78; body.Q.value = 0.7;
    presence = ac.createBiquadFilter();
    presence.type = "peaking"; presence.frequency.value = 2600; presence.Q.value = 0.85; presence.gain.value = 4.2;
    air = ac.createBiquadFilter();
    air.type = "highshelf"; air.frequency.value = 5800; air.gain.value = 5.2;
  } else if (kind === "guitar") {
    body.type = "peaking"; body.frequency.value = 120; body.Q.value = 1.1; body.gain.value = 2.4;
  } else if (kind === "uke") {
    body.type = "peaking"; body.frequency.value = 340; body.Q.value = 1.2; body.gain.value = 2.2;
  } else {
    body.type = "peaking"; body.frequency.value = 88; body.Q.value = 1.0; body.gain.value = 3.0;
  }

  const out = ac.createGain();
  const baseGain = kind === "piano" ? 0.88 : kind === "bass" ? 0.84 : kind === "uke" ? 0.72 : 0.76;
  const peakGain = Math.max(0.05, baseGain * (0.38 + 0.62 * vel));
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(peakGain, t + 0.0025);

  if (presence && air) {
    src.connect(body).connect(presence).connect(air).connect(lp).connect(out);
    // Crisp hammer-strike attack transient so piano notes have immediate studio definition
    const f = midiToFreq(midi);
    const click = ac.createBufferSource();
    click.buffer = noiseBuffer(ac, 0.024);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = Math.min(5600, Math.max(1400, f * 4.2)); bp.Q.value = 1.4;
    const cg = ac.createGain();
    cg.gain.setValueAtTime(0.085 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    click.connect(bp).connect(cg).connect(out);
    click.start(t);
  } else {
    src.connect(body).connect(lp).connect(out);
  }
  const pan = kind === "piano" ? (midi - 60) * 0.012 : kind === "bass" ? 0 : (midi - 58) * 0.008;
  const rev = kind === "piano" ? 0.16 : kind === "bass" ? 0.06 : 0.18;
  routeToStudioBus(ac, out, pan, rev);

  src.start(t, sample.entry.offset);
  let stopped = false;
  const defaultRel = kind === "piano" ? 0.55 : 0.65;
  return {
    stop(release = defaultRel) {
      if (stopped || !ctx) return;
      stopped = true;
      const now = Math.max(t + 0.015, ctx.currentTime);
      const rel = Math.max(0.08, Math.min(release, 2.4));
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + rel);
      try { src.stop(now + rel + 0.04); } catch { /* already stopped */ }
    }
  };
}

/**
 * Keep sound alive when the phone locks or the user switches apps and comes back.
 * iOS suspends or "interrupts" audio; we resume on every sign of the page returning.
 */
export function keepAlive() {
  // Play through the silent switch and keep the session alive (Safari 16.4+).
  try { const as = /** @type {any} */ (navigator).audioSession; if (as) as.type = "playback"; } catch { /* unsupported */ }
  const wake = () => {
    if (ctx && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });
  window.addEventListener("pageshow", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("pointerdown", wake, { passive: true });
  document.addEventListener("touchend", wake, { passive: true });
  setInterval(() => { if (document.visibilityState === "visible") wake(); }, 4000);
}

/**
 * Grand Piano voice: uses real Salamander Grand Piano studio recordings when loaded,
 * with instant physical-modeling fallback (stretch-tuned unison partials + hammer felt + soundboard)
 * while samples decode or when offline on a cold cache.
 * @param {number} midi @param {number} [vel] 0..1 @param {number} [when] seconds from now
 * @returns {Voice}
 */
export function piano(midi, vel = 0.72, when = 0) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const t = ac.currentTime + Math.max(0, when);
  const sample = getReadySample("piano", midi);
  if (sample) return playSampleVoice(ac, "piano", midi, sample, vel, t);

  // Instant studio physical-modeling fallback
  const f = midiToFreq(midi);
  const decay = Math.max(1.8, Math.min(7.5, 8.0 - (midi - 36) * 0.09));
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004);
  out.gain.exponentialRampToValueAtTime(0.18 * vel, t + 0.32);
  out.gain.exponentialRampToValueAtTime(0.0001, t + decay);

  const body = ac.createBiquadFilter();
  body.type = "peaking"; body.frequency.value = 2600; body.Q.value = 0.85; body.gain.value = 3.6;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(18000, f * (9 + vel * 9)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(900, f * 3.4), t + decay * 0.78);
  body.connect(lp).connect(out);
  routeToStudioBus(ac, out, (midi - 60) * 0.012, 0.16);

  const partials = [
    [1, 0.56, -1.5], [1, 0.28, 2.2], [2, 0.34, -2.5], [2, 0.14, 3.0],
    [3, 0.15, 1.5], [4, 0.08, 0], [5, 0.04, -2], [6, 0.02, 2]
  ];
  /** @type {OscillatorNode[]} */
  const oscs = [];
  for (const [mult, g, cents] of partials) {
    const pf = f * mult * Math.sqrt(1 + 0.00012 * mult * mult);
    if (pf > 16000) continue;
    const o = ac.createOscillator();
    o.type = mult === 1 ? "triangle" : "sine";
    o.frequency.value = pf;
    o.detune.value = cents;
    const pg = ac.createGain();
    pg.gain.setValueAtTime(g, t);
    if (mult > 1) pg.gain.exponentialRampToValueAtTime(0.0004, t + decay / Math.pow(mult, 0.85));
    o.connect(pg).connect(body);
    o.start(t);
    o.stop(t + decay + 0.2);
    oscs.push(o);
  }
  // Felt hammer attack transient
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.035);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = Math.min(4200, f * 3.2); bp.Q.value = 1.2;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.095 * vel, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
  n.connect(bp).connect(ng).connect(body);
  n.start(t);

  let stopped = false;
  return {
    stop(release = 0.65) {
      if (stopped || !ctx) return;
      stopped = true;
      const now = Math.max(t + 0.015, ctx.currentTime);
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
 * Dispersive Karplus-Strong plucked string with pick-position comb filtering,
 * rendered once per pitch as an instant fallback while real samples decode.
 * @param {AudioContext} ac @param {number} midi @param {"guitar"|"bass"|"uke"} kind
 */
function pluckBuffer(ac, midi, kind) {
  const key = `${kind}:${midi}:${ac.sampleRate}`;
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const sr = ac.sampleRate;
  const f = midiToFreq(midi);
  const seconds = kind === "bass" ? 3.2 : kind === "uke" ? 1.8 : 2.9;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const period = sr / f;
  let N = Math.floor(period + 0.5);
  let d = period + 0.5 - N;
  if (d < 0.1) { N -= 1; d += 1; }
  const C = (1 - d) / (1 + d);
  const ring = new Float32Array(N);
  // Pick-position comb filter + warm velocity-shaped excitation burst
  const raw = new Float32Array(N);
  let prev = 0;
  const bright = kind === "bass" ? 0.34 : kind === "uke" ? 0.68 : 0.56;
  for (let i = 0; i < N; i++) {
    prev += bright * (Math.random() * 2 - 1 - prev);
    raw[i] = prev;
  }
  const pickDelay = Math.max(1, Math.floor(N * (kind === "bass" ? 0.22 : kind === "uke" ? 0.28 : 0.17)));
  for (let i = 0; i < N; i++) {
    ring[i] = raw[i] - 0.65 * raw[(i - pickDelay + N) % N];
  }
  const damp = kind === "bass" ? 0.9975 : kind === "uke" ? 0.9935 : 0.9965;
  const blend = kind === "uke" ? 0.38 : 0.46;
  let idx = 0, x1 = 0, y1 = 0;
  for (let i = 0; i < len; i++) {
    const y = ring[idx];
    const next = ring[(idx + 1) % N];
    const avg = damp * ((1 - blend) * y + blend * next);
    const ap = C * avg + x1 - C * y1;
    x1 = avg; y1 = ap;
    ring[idx] = ap;
    out[i] = y;
    idx = (idx + 1) % N;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= g * (i > len - 2400 ? (len - i) / 2400 : 1);
  pluckCache.set(key, buf);
  if (pluckCache.size > 40) pluckCache.delete(/** @type {string} */ (pluckCache.keys().next().value));
  return buf;
}

/**
 * Plucked string voice (Acoustic Guitar, Concert Ukulele, or Fingered Bass).
 * Plays real studio recordings when loaded, with instant physical-modeling fallback.
 * @param {number} midi @param {"guitar"|"bass"|"uke"} [kind] @param {number} [vel]
 * @param {number} [when] seconds from now
 * @returns {Voice}
 */
export function pluck(midi, kind = "guitar", vel = 0.8, when = 0) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const t = ac.currentTime + Math.max(0, when);
  const sample = getReadySample(kind, midi);
  if (sample) return playSampleVoice(ac, kind, midi, sample, vel, t);

  // Instant physical-modeling fallback
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(ac, midi, kind);
  const body = ac.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = kind === "bass" ? 92 : kind === "uke" ? 330 : 115;
  body.Q.value = 1.1;
  body.gain.value = 4.2;
  const topPlate = ac.createBiquadFilter();
  topPlate.type = "peaking";
  topPlate.frequency.value = kind === "bass" ? 720 : kind === "uke" ? 1150 : 420;
  topPlate.Q.value = 1.3;
  topPlate.gain.value = 2.4;
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = kind === "bass" ? 2400 : kind === "uke" ? 7200 : 6800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.56 * vel, t);
  src.connect(body).connect(topPlate).connect(tone).connect(g);
  routeToStudioBus(ac, g, kind === "bass" ? 0 : (midi - 58) * 0.008, kind === "bass" ? 0.06 : 0.18);
  src.start(t);
  let stopped = false;
  return {
    stop(release = 0.8) {
      if (stopped || !ctx) return;
      stopped = true;
      const now = Math.max(t + 0.015, ctx.currentTime);
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + release);
      try { src.stop(now + release + 0.05); } catch { /* not started */ }
    }
  };
}

/**
 * Play a chord from pitch classes, voiced around middle C with the root below
 * and natural human voicing/strum timing.
 * @param {number[]} pcs root first
 * @param {"piano"|"guitar"} [voice]
 * @param {number|null} [bassPc] note under the chord for slash chords (G/B -> 11)
 * @returns {Voice}
 */
export function playChord(pcs, voice = "piano", bassPc = null) {
  if (!pcs.length) return SILENT;
  const baseOct = voice === "piano" ? 60 : 48;
  const root = baseOct + pcs[0];
  /** @type {number[]} */
  let notes;
  if (bassPc !== null && bassPc !== pcs[0]) {
    // Slash chord: the named bass note goes clearly underneath, the chord sits above it.
    const low = voice === "guitar" ? 40 : 48;
    const bassMidi = low + ((((bassPc - low) % 12) + 12) % 12);
    notes = [bassMidi];
    let last = baseOct - 1;
    for (const pc of pcs) {
      if (pc === bassPc) continue;
      let m = baseOct + pc;
      while (m <= last) m += 12;
      notes.push(m);
      last = m;
    }
  } else {
    const lowBass = voice === "piano" ? (root - 12 >= 48 ? root - 12 : root) : (root - 12 >= 36 ? root - 12 : root);
    notes = [lowBass];
    let last = root;
    for (const pc of pcs) {
      let m = baseOct + pc;
      while (m <= last) m += 12;
      if (pc === pcs[0]) m = root;
      notes.push(m);
      last = Math.max(last, m);
    }
  }
  const uniq = [...new Set(notes)].sort((a, b) => a - b).slice(0, 6);
  const topIdx = uniq.length - 1;
  const voices = uniq.map((m, i) => {
    if (voice === "guitar") {
      const vel = i === 0 ? 0.84 : i === topIdx ? 0.76 : 0.68;
      return pluck(m, "guitar", vel, i * 0.026);
    }
    const vel = i === 0 ? 0.8 : i === topIdx ? 0.78 : 0.66;
    return piano(m, vel, i * 0.012);
  });
  return { stop: (r) => voices.forEach((v) => v.stop(r)) };
}

/** A warm harmonic reference tone (tuner). @param {number} freq @param {number} [seconds] */
export function tone(freq, seconds = 2.5) {
  const ac = audio();
  if (!ac || !master) return SILENT;
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.3, t + 0.045);
  out.gain.setValueAtTime(0.3, t + Math.max(0.06, seconds - 0.35));
  out.gain.exponentialRampToValueAtTime(0.0001, t + seconds);

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(4800, freq * 4.5);
  lp.connect(out);
  routeToStudioBus(ac, out, 0, 0.12);

  /** @type {OscillatorNode[]} */
  const oscs = [];
  for (const [mult, amp, type] of /** @type {const} */ ([[1, 0.72, "triangle"], [2, 0.2, "sine"], [3, 0.07, "sine"]])) {
    if (freq * mult > 12000) continue;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    const og = ac.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + seconds + 0.05);
    oscs.push(o);
  }
  return {
    stop() {
      try {
        if (!ctx) return;
        const n = ctx.currentTime;
        out.gain.cancelScheduledValues(n);
        out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n);
        out.gain.exponentialRampToValueAtTime(0.0001, n + 0.08);
        oscs.forEach((o) => { try { o.stop(n + 0.1); } catch { /* done */ } });
      } catch { /* done */ }
    }
  };
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
    /** @type {Set<ReturnType<typeof setTimeout>>} */ this.flashes = new Set();
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
    // Beat flashes already booked would otherwise light a dot after Stop.
    this.flashes.forEach((id) => clearTimeout(id));
    this.flashes.clear();
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
      const id = setTimeout(() => { this.flashes.delete(id); this.listeners.forEach((fn) => fn(b, accent)); }, delay);
      this.flashes.add(id);
      this.nextTime += per;
      this.beat++;
    }
  }

  /**
   * Crisp studio woodblock click (pitched wood resonator + transient rim click).
   * @param {number} t @param {"strong"|"medium"|"weak"} accent
   */
  click(t, accent) {
    if (!ctx || !master) return;
    const f0 = accent === "strong" ? 1620 : accent === "medium" ? 1240 : 940;
    const peak = this.volume * (accent === "strong" ? 0.92 : accent === "medium" ? 0.68 : 0.48);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(f0 * 1.18, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.008);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.05);

    // Subtle wood transient
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.015);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f0 * 1.8;
    bp.Q.value = 2.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(Math.max(0.0001, peak * 0.28), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
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

/**
 * 8-pad studio drum kit definitions with default laptop keyboard shortcuts (MacBook / Windows).
 */
export const DRUM_PADS = [
  { id: "kick", label: "Kick", defaultKey: "q" },
  { id: "snare", label: "Snare", defaultKey: "w" },
  { id: "clap", label: "Rim / Clap", defaultKey: "e" },
  { id: "ch", label: "Closed Hat", defaultKey: "r" },
  { id: "oh", label: "Open Hat", defaultKey: "a" },
  { id: "ltom", label: "Low Tom", defaultKey: "s" },
  { id: "htom", label: "High Tom", defaultKey: "d" },
  { id: "crash", label: "Cymbal", defaultKey: "f" }
];

/**
 * High-quality studio drum beat loops in 4/4, 3/4, and 6/8 time signatures for practice.
 * @type {Record<string, { label: string, sig: "4/4"|"3/4"|"6/8", sub: number, length: number, steps: Record<string, number[]> }>}
 */
export const DRUM_PRESETS = {
  "4/4-worship": {
    label: "4/4 · Steady Groove",
    sig: "4/4",
    sub: 4,
    length: 16,
    steps: {
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ch:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      ltom:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]
    }
  },
  "4/4-pop": {
    label: "4/4 · Pop / Rock",
    sig: "4/4",
    sub: 4,
    length: 16,
    steps: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ch:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      oh:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]
    }
  },
  "4/4-acoustic": {
    label: "4/4 · Acoustic Cajón",
    sig: "4/4",
    sub: 4,
    length: 16,
    steps: {
      kick:  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      clap:  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      ch:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    }
  },
  "3/4-waltz": {
    label: "3/4 · Waltz",
    sig: "3/4",
    sub: 4,
    length: 12,
    steps: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      ch:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    }
  },
  "6/8-ballad": {
    label: "6/8 · Ballad",
    sig: "6/8",
    sub: 6,
    length: 12,
    steps: {
      kick:  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      snare: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      clap:  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      ch:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    }
  }
};

/** @type {GainNode|null} */
let openHatGain = null;

/**
 * Synthesize a realistic studio drum kit hit at time `when` (seconds from now).
 * @param {string} padId
 * @param {number} [vel] 0..1
 * @param {number} [when] offset in seconds from `ac.currentTime`
 */
export function playDrum(padId, vel = 0.85, when = 0) {
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime + Math.max(0, when);

  if (padId === "kick") {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.045);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.95 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.36);
    // Beater punch click
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac, 0.02);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 2800; bp.Q.value = 1.4;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.26 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    return;
  }

  if (padId === "snare") {
    // Dual shell fundamental (185 Hz + 330 Hz)
    for (const [f0, f1, amp, dur] of /** @type {const} */ ([[210, 165, 0.52, 0.14], [340, 260, 0.28, 0.1]])) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(amp * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      routeToStudioBus(ac, g, -0.05, 0.16);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    // Crisp snare wires
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac, 0.24);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1350;
    const pk = ac.createBiquadFilter();
    pk.type = "peaking"; pk.frequency.value = 4200; pk.gain.value = 3.5;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.58 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    n.connect(hp).connect(pk).connect(ng);
    routeToStudioBus(ac, ng, -0.05, 0.22);
    n.start(t);
    return;
  }

  if (padId === "clap") {
    // Layered studio handclap / rimshot
    for (const dt of [0, 0.009, 0.019]) {
      const n = ac.createBufferSource();
      n.buffer = noiseBuffer(ac, 0.14);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1450; bp.Q.value = 1.6;
      const g = ac.createGain();
      const st = t + dt;
      g.gain.setValueAtTime(0.42 * vel, st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + (dt === 0.019 ? 0.14 : 0.025));
      n.connect(bp).connect(g);
      routeToStudioBus(ac, g, 0.08, 0.24);
      n.start(st);
    }
    return;
  }

  if (padId === "ch" || padId === "oh") {
    // Closed hat chokes any ringing open hat
    if (padId === "ch" && openHatGain && ctx) {
      try {
        openHatGain.gain.cancelScheduledValues(t);
        openHatGain.gain.setValueAtTime(Math.max(0.0001, openHatGain.gain.value), t);
        openHatGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      } catch { /* ignore */ }
    }
    const dur = padId === "oh" ? 0.36 : 0.055;
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac, dur + 0.04);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 6800;
    const bp = ac.createBiquadFilter();
    bp.type = "peaking"; bp.frequency.value = 9800; bp.gain.value = 4.0;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.44 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (padId === "oh") openHatGain = g;
    n.connect(hp).connect(bp).connect(g);
    routeToStudioBus(ac, g, 0.14, 0.1);
    n.start(t);
    return;
  }

  if (padId === "ltom" || padId === "htom") {
    const fStart = padId === "htom" ? 175 : 118;
    const fEnd = padId === "htom" ? 98 : 64;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(fStart, t);
    o.frequency.exponentialRampToValueAtTime(fEnd, t + 0.24);
    g.gain.setValueAtTime(0.75 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    routeToStudioBus(ac, g, padId === "htom" ? -0.15 : 0.18, 0.2);
    o.start(t);
    o.stop(t + 0.3);
    return;
  }

  if (padId === "crash") {
    const dur = 0.95;
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac, dur);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 4400;
    const hs = ac.createBiquadFilter();
    hs.type = "highshelf"; hs.frequency.value = 7500; hs.gain.value = 4.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.48 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp).connect(hs).connect(g);
    routeToStudioBus(ac, g, -0.2, 0.28);
    n.start(t);
  }
}

/**
 * Simple studio Drum Beat Loop player in 4/4, 3/4, and 6/8 time signatures with look-ahead scheduling.
 */
export class DrumLooper {
  constructor() {
    this.bpm = 90;
    this.running = false;
    this.step = 0;
    this.preset = "4/4-worship";
    this.sig = /** @type {"4/4"|"3/4"|"6/8"} */ ("4/4");
    this.sub = 4;
    this.length = 16;
    this.nextTime = 0;
    /** @type {ReturnType<typeof setInterval>|undefined} */
    this.timer = undefined;
    /** @type {Set<(beat: number, pads: string[]) => void>} */
    this.listeners = new Set();
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    this.flashes = new Set();
    /** @type {Record<string, number[]>} */
    this.grid = {};
    this.loadPreset("4/4-worship");
  }

  /** @param {string} id */
  loadPreset(id) {
    const p = DRUM_PRESETS[id] || DRUM_PRESETS["4/4-worship"];
    this.preset = DRUM_PRESETS[id] ? id : "4/4-worship";
    this.sig = p.sig;
    this.sub = p.sub;
    this.length = p.length;
    this.step = 0;
    for (const pad of DRUM_PADS) {
      this.grid[pad.id] = p.steps[pad.id] ? [...p.steps[pad.id]] : Array(this.length).fill(0);
    }
  }

  /** Switch to the default drum beat loop for a given time signature ("3/4", "4/4", "6/8"). @param {string} sigId */
  syncSignature(sigId) {
    if (this.sig === sigId) return;
    const match = Object.entries(DRUM_PRESETS).find(([, p]) => p.sig === sigId);
    if (match) this.loadPreset(match[0]);
  }

  /** @param {(beat: number, pads: string[]) => void} fn */
  onStep(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** @param {number} bpm */
  setBpm(bpm) { this.bpm = Math.min(300, Math.max(30, Math.round(Number(bpm) || 90))); }

  start() {
    const ac = audio();
    if (!ac || this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = ac.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.flashes.forEach((id) => clearTimeout(id));
    this.flashes.clear();
    this.step = 0;
  }

  toggle() { this.running ? this.stop() : this.start(); return this.running; }

  schedule() {
    if (!ctx || !master || !this.running) return;
    const stepDur = 60 / this.bpm / this.sub;
    while (this.nextTime < ctx.currentTime + 0.11) {
      const s = this.step % this.length;
      const offset = Math.max(0, this.nextTime - ctx.currentTime);
      const isDownbeat = s === 0;
      const isMainBeat = this.sig === "6/8" ? s % 2 === 0 : s % 4 === 0;
      const accent = isDownbeat ? 0.94 : isMainBeat ? 0.82 : s % 2 === 0 ? 0.72 : 0.62;
      const activePads = [];
      for (const pad of DRUM_PADS) {
        if (this.grid[pad.id]?.[s]) {
          playDrum(pad.id, accent, offset);
          activePads.push(pad.id);
        }
      }
      const beatIdx = this.sig === "6/8" ? Math.floor(s / 2) : Math.floor(s / 4);
      const delay = Math.max(0, offset * 1000);
      const id = setTimeout(() => {
        this.flashes.delete(id);
        this.listeners.forEach((fn) => fn(beatIdx, activePads));
      }, delay);
      this.flashes.add(id);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % this.length;
    }
  }
}

// The engine loads the first time a screen needs sound; from then on keep the audio session awake.
if (typeof document !== "undefined") keepAlive();
