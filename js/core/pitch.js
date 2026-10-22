// @ts-check
// Pitch detection for the tuner (YIN). Pure functions so it runs in tests.
import { SHARP_NOTES, FLAT_NOTES } from "./music.js";

/**
 * Estimate the fundamental frequency of a mono buffer.
 * The buffer is halved first (2:1 decimation) to keep this cheap on phones.
 * @param {Float32Array} input
 * @param {number} sampleRate
 * @param {{ minFreq?: number, maxFreq?: number, threshold?: number, minRms?: number }} [o]
 * @returns {{ freq: number, clarity: number, rms: number } | null}
 */
export function detectPitch(input, sampleRate, o = {}) {
  const minFreq = o.minFreq ?? 28;
  const maxFreq = o.maxFreq ?? 1500;
  const threshold = o.threshold ?? 0.14;
  let rms = 0;
  for (let i = 0; i < input.length; i++) rms += input[i] * input[i];
  rms = Math.sqrt(rms / input.length);
  if (rms < (o.minRms ?? 0.008)) return null;

  const n = Math.floor(input.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * (input[2 * i] + input[2 * i + 1]);
  const sr = sampleRate / 2;
  const tauMin = Math.max(2, Math.floor(sr / maxFreq));
  const tauMax = Math.min(Math.floor(sr / minFreq), Math.floor(n / 2));
  const W = n - tauMax;
  if (W < tauMax / 2) return null;

  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const d = x[i] - x[i + tau]; sum += d * d; }
    diff[tau] = sum;
  }
  // Cumulative mean normalized difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running ? (diff[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // No confident dip: take the global minimum only if it is reasonably clear.
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    tau = best;
  }
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const den = a + c - 2 * b;
    if (den) better = tau + (a - c) / (2 * den);
  }
  return { freq: sr / better, clarity: Math.max(0, Math.min(1, 1 - cmnd[tau])), rms };
}

/**
 * Nearest note and how far off it is.
 * @param {number} freq @param {number} [a4] @param {boolean} [flats]
 */
export function noteFromFreq(freq, a4 = 440, flats = false) {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 1000) / 10;
  const pc = ((midi % 12) + 12) % 12;
  return { midi, name: (flats ? FLAT_NOTES : SHARP_NOTES)[pc], octave: Math.floor(midi / 12) - 1, cents };
}
