// @ts-check
// Shared app context: the store, Drive, metronome, and key helpers every view uses.
import { Store, memoryStorage } from "../core/store.js";
import { detectKey, parseKey, keyFromTonic, keyShort, keyValue, mod12 } from "../core/music.js";

/**
 * @typedef {import("../core/store.js").Song} Song
 * @typedef {import("../core/store.js").Setlist} Setlist
 * @typedef {import("../core/store.js").SetlistItem} SetlistItem
 * @typedef {import("../core/music.js").Key} Key
 * @typedef {"songs"|"editor"|"tools"|"chords"|"theory"|"play"|"bank"} View
 */

/** The browser's storage, or memory-only storage when the browser blocks it (private or strict modes). */
function pickStorage() {
  try {
    const s = window.localStorage;
    s.setItem("sonata:probe", "1");
    s.removeItem("sonata:probe");
    return { storage: s, blocked: false };
  } catch {
    return { storage: memoryStorage(), blocked: true };
  }
}
const picked = pickStorage();
/** True when songs can't be saved on this device (the app still works until the tab closes). */
export const storageBlocked = picked.blocked;
export const store = new Store(picked.storage);

/** Late-bound references (avoid import cycles between views). */
export const app = {
  /** @type {View} */ view: "editor",
  /** Google Drive, once loaded (only for people who use it). @type {import("../drive.js").Drive|null} */ drive: null,
  /** Load Drive on demand. @type {() => Promise<import("../drive.js").Drive|null>} */ loadDrive: async () => null,
  /** @type {(view: View, opts?: { sub?: string, replace?: boolean }) => void} */ show: () => {},
  /** @type {() => void} */ openStage: () => {},
  /** @type {() => void} */ refresh: () => {},
  /** @type {Set<(beat: number, accent: string) => void>} */ beatListeners: new Set(),
  /** @type {((chord: string) => void)|null} */ onChordChange: null,
  /** The reference video in the floating player (js/ui/player.js): its id and whether it is playing. */ media: { id: "", playing: false }
};

/** The signed-in person's name for "arranged by", without loading Drive. */
export function profileName() {
  if (app.drive) return app.drive.profile.name || "";
  try { return String(JSON.parse(localStorage.getItem("sonata_user_profile") || "{}")?.name || ""); } catch { return ""; }
}

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

/** Apply optional per-setlist slot key/capo override without mutating the base song. @param {Song|null} song @param {SetlistItem|null} [item] @returns {Song|null} */
export function effectiveSong(song, item) {
  if (!song) return null;
  const slot = item !== undefined ? item : (store.setlist.id && song.id === store.activeId ? store.activeSetlistEntry()?.item : null);
  if (!slot || (slot.key === undefined && slot.capo === undefined)) return song;
  const wk = writtenKey(song);
  let tr = song.transpose || 0;
  if (slot.key) {
    const target = parseKey(slot.key);
    if (target) {
      tr = mod12(target.tonic - wk.tonic);
      if (tr > 6) tr -= 12;
    }
  }
  const capo = slot.capo !== undefined ? slot.capo : song.capo || 0;
  return {
    ...song,
    transpose: tr,
    capo,
    ...(slot.key ? { setlistKey: slot.key } : {}),
    ...(slot.capo !== undefined ? { setlistCapo: slot.capo } : {})
  };
}

/** Resolve all songs in a setlist with any per-slot key/capo overrides applied. @param {Setlist} set */
export function setlistSongsEffective(set) {
  return store.setlistSlots(set).map(({ song, item }) => /** @type {Song} */ (effectiveSong(song, item)));
}

/** @param {Song|null} song @param {SetlistItem|null} [item] */
export const effectiveCapo = (song, item) => effectiveSong(song, item)?.capo || 0;

/** @param {Song|null} song @param {SetlistItem|null} [item] */
export const effectiveTranspose = (song, item) => effectiveSong(song, item)?.transpose || 0;

/** Key the band hears after transposing (including any active setlist slot override). @param {Song|null} song @param {SetlistItem|null} [item] */
export function soundingKey(song, item) {
  const eff = effectiveSong(song, item);
  const pref = /** @type {any} */ (store.settings.enharmonicPref);
  if (eff?.setlistKey) {
    const ov = parseKey(eff.setlistKey);
    if (ov) return pref === "auto" ? ov : keyFromTonic(ov.tonic, ov.mode, pref);
  }
  const k = writtenKey(song);
  return keyFromTonic(k.tonic + (eff?.transpose || 0), k.mode, pref);
}

/** Key of the chord shapes when a capo is used. @param {Song|null} song @param {SetlistItem|null} [item] */
export function shapeKey(song, item) {
  const eff = effectiveSong(song, item);
  const s = soundingKey(song, item);
  return keyFromTonic(s.tonic - (eff?.capo || 0), s.mode, /** @type {any} */ (store.settings.enharmonicPref));
}

/**
 * Options for rendering a chart.
 * @param {Song} song
 * @param {import("../core/chart.js").ViewMode} [mode]
 * @param {SetlistItem|null} [item]
 */
export function renderOptions(song, mode, item) {
  const eff = /** @type {Song} */ (effectiveSong(song, item));
  return {
    mode: mode || /** @type {any} */ (store.settings.viewMode),
    key: writtenKey(song),
    transpose: eff.transpose || 0,
    capo: eff.capo || 0,
    spelling: /** @type {import("../core/music.js").Spelling} */ (store.settings.enharmonicPref),
    title: song.title
  };
}

/** Short label like "G" or "A (capo 2: G)". @param {Song|null} song @param {SetlistItem|null} [item] */
export function keyLabel(song, item) {
  const s = soundingKey(song, item);
  return keyShort(s);
}

/** @param {number} n */
export const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** Transpose the active song (or active setlist slot override) by a half step, keeping it within an octave. @param {Song|null} song @param {number} delta */
export function nudgeTranspose(song, delta) {
  if (!song) return;
  const entry = !song.readonly && store.setlist.id && song.id === store.activeId ? store.activeSetlistEntry() : null;
  if (entry) {
    const cur = soundingKey(song, entry.item);
    const nextKey = keyFromTonic(cur.tonic + delta, cur.mode, /** @type {any} */ (store.settings.enharmonicPref));
    store.updateSetlistItem(entry.set.id, entry.itemIndex, { key: keyValue(nextKey) });
    return;
  }
  let next = (song.transpose || 0) + delta;
  if (next > 11 || next < -11) next = mod12(next) > 6 ? mod12(next) - 12 : mod12(next);
  if (song.readonly) { song.transpose = next; store.emit("change", "view"); return; }
  store.update(song, { transpose: next });
}

/** Light vibration on tap, when enabled. */
export function tick() {
  if (store.settings.haptics && navigator.vibrate) { try { navigator.vibrate(6); } catch { /* unsupported */ } }
}

/**
 * A copy of a shared song already in the library, if any: one saved from the same song before
 * (same share id), the song itself when the reader wrote it, or one with the same title and chart.
 * @param {{ title: string, body: string, origin?: string }} u from unpackSong
 * @returns {{ song: Song, own: boolean, same: boolean }|null}
 */
export function findCopy(u) {
  const tail = (/** @type {string} */ id) => String(id).replace(/[^a-z0-9]/gi, "").slice(-10);
  const mine = u.origin ? store.songs.find((s) => s.origin === u.origin) : null;
  const own = !mine && u.origin ? store.songs.find((s) => !s.origin && tail(s.id) === u.origin) : null;
  const song = mine || own || store.songs.find((s) => s.title === u.title && s.body === u.body);
  return song ? { song, own: Boolean(own), same: song.title === u.title && song.body === u.body } : null;
}

/**
 * Add a shared song to the library, or bring the copy already there up to date. An update
 * replaces the chart and its details but keeps the reader's own key and capo: if the leader
 * rewrote the chart in another key, the reader still hears it in the key they chose.
 * A song the reader wrote is never overwritten by a link to it.
 * @param {ReturnType<typeof import("../core/share.js").unpackSong>} u
 * @returns {{ song: Song, status: "new"|"same"|"updated" }}
 */
export function adoptShared(u) {
  const found = findCopy(u);
  if (!found) return { song: store.createSong(/** @type {any} */ (u)), status: "new" };
  const { song } = found;
  if (found.own || found.same) return { song, status: "same" };
  const before = soundingKey(song).tonic;
  store.update(song, { title: u.title, body: u.body, manualKey: u.manualKey, artist: u.artist, creator: u.creator, description: u.description, links: u.links, bpm: u.bpm, genre: u.genre || song.genre, mood: u.mood || song.mood });
  const shift = mod12(before - soundingKey(song).tonic);
  if (shift) store.update(song, { transpose: mod12(song.transpose + shift + 5) - 5 });
  return { song, status: "updated" };
}
