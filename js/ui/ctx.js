// @ts-check
// Shared app context: the store, Drive, metronome, and key helpers every view uses.
import { Store } from "../core/store.js";
import { detectKey, parseKey, keyFromTonic, keyShort, mod12 } from "../core/music.js";
import { Metronome } from "../audio.js";

/**
 * @typedef {import("../core/store.js").Song} Song
 * @typedef {import("../core/music.js").Key} Key
 * @typedef {"songs"|"editor"|"tools"|"theory"|"play"} View
 */

export const store = new Store(window.localStorage);
export const metronome = new Metronome();

/** Late-bound references (avoid import cycles between views). */
export const app = {
  /** @type {View} */ view: "editor",
  /** @type {import("../drive.js").Drive|null} */ drive: null,
  /** @type {(view: View) => void} */ show: () => {},
  /** @type {() => void} */ openStage: () => {},
  /** @type {() => void} */ refresh: () => {},
  /** @type {Set<(beat: number, accent: string) => void>} */ beatListeners: new Set()
};

/** @type {Map<string, ReturnType<typeof detectKey>>} */
const detectCache = new Map();

/** Key guessed from the chords (cached per chart text). @param {Song|null} song */
export function detectedKey(song) {
  if (!song || !song.body.trim()) return null;
  const hit = detectCache.get(song.body);
  if (hit !== undefined) return hit;
  const k = detectKey(song.body);
  if (detectCache.size > 50) detectCache.clear();
  detectCache.set(song.body, k);
  return k;
}

/** The chart's written key: the one set in Details, else detected, else C. @param {Song|null} song @returns {Key} */
export function writtenKey(song) {
  return parseKey(song?.manualKey) || detectedKey(song) || keyFromTonic(0, "major");
}

/** Key the band hears after transposing. @param {Song|null} song */
export function soundingKey(song) {
  const k = writtenKey(song);
  return keyFromTonic(k.tonic + (song?.transpose || 0), k.mode, /** @type {any} */ (store.settings.enharmonicPref));
}

/** Key of the chord shapes when a capo is used. @param {Song|null} song */
export function shapeKey(song) {
  const k = writtenKey(song);
  return keyFromTonic(k.tonic + (song?.transpose || 0) - (song?.capo || 0), k.mode, /** @type {any} */ (store.settings.enharmonicPref));
}

/**
 * Options for rendering a chart.
 * @param {Song} song
 * @param {import("../core/chart.js").ViewMode} [mode]
 */
export function renderOptions(song, mode) {
  return {
    mode: mode || /** @type {any} */ (store.settings.viewMode),
    key: writtenKey(song),
    transpose: song.transpose || 0,
    capo: song.capo || 0,
    spelling: /** @type {import("../core/music.js").Spelling} */ (store.settings.enharmonicPref),
    title: song.title
  };
}

/** Short label like "G" or "A (capo 2: G)". @param {Song|null} song */
export function keyLabel(song) {
  const s = soundingKey(song);
  return keyShort(s);
}

/** @param {number} n */
export const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** Transpose the active song by a half step, keeping it within an octave. @param {Song|null} song @param {number} delta */
export function nudgeTranspose(song, delta) {
  if (!song) return;
  let next = (song.transpose || 0) + delta;
  if (next > 11 || next < -11) next = mod12(next) > 6 ? mod12(next) - 12 : mod12(next);
  if (song.readonly) { song.transpose = next; store.emit("change", "view"); return; }
  store.update(song, { transpose: next });
}

/** Light vibration on tap, when enabled. */
export function tick() {
  if (store.settings.haptics && navigator.vibrate) { try { navigator.vibrate(6); } catch { /* unsupported */ } }
}
