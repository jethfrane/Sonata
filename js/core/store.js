// @ts-check
// Library state and persistence. Storage keys are unchanged from v1 so
// existing libraries load as-is.

export const KEYS = {
  songs: "sonata:v12:songs",
  setlists: "sonata:v12:setlists",
  settings: "sonata:v12:settings",
  active: "sonata:v12:active",
  deleted: "sonata:v12:deleted",
  lastSynced: "sonata:v12:last_synced"
};

/**
 * @typedef {{ name: string, url: string }} Link
 * @typedef {{ id: string, title: string, artist: string, creator: string, description: string,
 *   links: Link[], body: string, manualKey: string, isFavorite: boolean, transpose: number,
 *   capo: number, bpm: number|null, createdAt: string, updatedAt: string, lastOpenedAt: string,
 *   readonly?: boolean }} Song
 * @typedef {{ id: string, title: string, description: string, links: Link[],
 *   items: { songId: string }[], date: string, updatedAt: string }} Setlist
 * @typedef {typeof DEFAULT_SETTINGS} Settings
 */

export const DEFAULT_SETTINGS = {
  theme: "system",
  accentTheme: "blue",
  language: "en",
  chartFontFamily: "mono",
  editorFontSize: 15,
  previewFontSize: 16,
  editorLineHeight: 1.55,
  presentationFontSize: 40,
  presTheme: "stage",
  autoScrollSpeed: 30,
  metronomeBpm: 90,
  metronomeBeats: 4,
  metronomeVolume: 0.6,
  haptics: true,
  enharmonicPref: "auto",
  viewMode: "chords",
  buddy: true,
  a4: 440,
  autoFillArranger: true
};

export const now = () => new Date().toISOString();
export const uid = (prefix = "song") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
/** @param {unknown} v @param {string} fallback */
const time = (v, fallback) => (typeof v === "string" && v.trim()) || (typeof v === "number" && !isNaN(v)) ? String(v) : fallback;
/** @param {unknown} v @param {number} lo @param {number} hi @param {number} d */
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** @param {unknown} links @returns {Link[]} */
export function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && typeof l === "object" && !Array.isArray(l))
    .map((l) => ({ name: str(l.name).trim(), url: str(l.url).trim() }))
    .filter((l) => l.name || l.url);
}

/**
 * Clean one stored song. Returns null for anything that is not a song object,
 * so one bad record never breaks the whole library.
 * @param {any} s
 * @returns {Song|null}
 */
export function normalizeSong(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const t = now();
  const updatedAt = time(s.updatedAt, t);
  const bpm = Number(s.bpm);
  /** @type {Song} */
  const song = {
    id: str(s.id).trim() || uid(),
    title: str(s.title).trim() || "Untitled",
    artist: str(s.artist),
    creator: str(s.creator),
    description: str(s.description),
    links: normalizeLinks(s.links),
    body: str(s.body),
    manualKey: str(s.manualKey).trim() || "auto",
    isFavorite: Boolean(s.isFavorite),
    transpose: int(s.transpose, -11, 11, 0),
    capo: int(s.capo, 0, 11, 0),
    bpm: Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 ? Math.round(bpm) : null,
    createdAt: time(s.createdAt, t),
    updatedAt,
    lastOpenedAt: time(s.lastOpenedAt, updatedAt)
  };
  if (s.readonly) song.readonly = true;
  return song;
}

/** @param {any} s @returns {Setlist|null} */
export function normalizeSetlist(s) {
  if (!s || typeof s !== "object" || Array.isArray(s) || !s.id) return null;
  const items = Array.isArray(s.items) ? s.items.filter((i) => i && typeof i.songId === "string").map((i) => ({ songId: i.songId })) : [];
  return {
    id: str(s.id),
    title: str(s.title).trim() || "Untitled Setlist",
    description: str(s.description),
    links: normalizeLinks(s.links),
    items,
    date: time(s.date, now()),
    updatedAt: time(s.updatedAt, time(s.date, now()))
  };
}

/** @param {any} raw @returns {Settings} */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) };
  if (!["light", "dark", "system"].includes(s.theme)) s.theme = "system";
  if (!["en", "fil"].includes(s.language)) s.language = "en";
  if (!["auto", "sharp", "flat"].includes(s.enharmonicPref)) s.enharmonicPref = "auto";
  if (!["chords", "nashville", "roman", "lyrics"].includes(s.viewMode)) s.viewMode = "chords";
  if (!["stage", "dark", "light"].includes(s.presTheme)) s.presTheme = "stage";
  s.metronomeBpm = int(s.metronomeBpm, 30, 300, 90);
  s.metronomeBeats = int(s.metronomeBeats, 1, 12, 4);
  s.metronomeVolume = Math.min(1, Math.max(0, Number(s.metronomeVolume) || 0));
  s.editorFontSize = int(s.editorFontSize, 11, 28, 15);
  s.previewFontSize = int(s.previewFontSize, 11, 32, 16);
  s.presentationFontSize = int(s.presentationFontSize, 18, 120, 40);
  s.autoScrollSpeed = int(s.autoScrollSpeed, 5, 180, 30);
  s.a4 = int(s.a4, 415, 466, 440);
  s.editorLineHeight = Math.min(2.4, Math.max(1.2, Number(s.editorLineHeight) || 1.55));
  s.buddy = s.buddy !== false;
  s.haptics = s.haptics !== false;
  return s;
}

/**
 * Check a backup file before touching storage.
 * @param {any} d
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateBackup(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "This file is not a Sonata backup." };
  if (d.songs === undefined && d.setlists === undefined) return { ok: false, error: "No songs or setlists found in this file." };
  if (d.songs !== undefined && !Array.isArray(d.songs)) return { ok: false, error: "Songs in this backup are damaged." };
  if (d.setlists !== undefined && !Array.isArray(d.setlists)) return { ok: false, error: "Setlists in this backup are damaged." };
  return { ok: true };
}

/**
 * Merge two libraries. Newest edit wins per item; deletions win over edits.
 * Used by Drive sync and by backup import (import merges instead of wiping).
 * @param {{ songs?: any[], setlists?: any[], deletedIds?: string[] }} local
 * @param {{ songs?: any[], setlists?: any[], deletedIds?: string[] }} remote
 */
export function mergeLibraries(local, remote) {
  const deleted = [...new Set([...(local.deletedIds || []), ...(remote.deletedIds || [])].filter((x) => typeof x === "string"))];
  const gone = new Set(deleted);
  /**
   * @template T
   * @param {any[]} a @param {any[]} b @param {(x: any) => T|null} norm
   * @returns {T[]}
   */
  const merge = (a, b, norm) => {
    /** @type {Map<string, any>} */
    const map = new Map();
    for (const raw of [...(b || []), ...(a || [])]) {
      const item = norm(raw);
      if (!item || gone.has(/** @type {any} */ (item).id)) continue;
      const prev = map.get(/** @type {any} */ (item).id);
      const ts = (/** @type {any} */ x) => new Date(x.updatedAt || x.date || 0).getTime() || 0;
      if (!prev || ts(item) >= ts(prev)) map.set(/** @type {any} */ (item).id, item);
    }
    return [...map.values()];
  };
  return {
    songs: /** @type {Song[]} */ (merge(local.songs || [], remote.songs || [], normalizeSong)),
    setlists: /** @type {Setlist[]} */ (merge(local.setlists || [], remote.setlists || [], normalizeSetlist)),
    deletedIds: deleted.slice(-2000)
  };
}

/** @param {Storage} storage @param {string} key @param {any} fallback */
function readJson(storage, key, fallback) {
  try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

/**
 * The app's single source of truth. Mutate through the methods so every
 * change is saved and announced.
 */
export class Store {
  /** @param {Storage} storage */
  constructor(storage) {
    this.storage = storage;
    /** @type {Song[]} */ this.songs = [];
    /** @type {Setlist[]} */ this.setlists = [];
    /** @type {string[]} */ this.deletedIds = [];
    /** @type {Settings} */ this.settings = normalizeSettings({});
    /** @type {string|null} */ this.activeId = null;
    /** @type {Song|null} */ this.shared = null;
    /** @type {{ id: string|null, index: number }} */ this.setlist = { id: null, index: 0 };
    /** @type {Map<string, Set<Function>>} */ this.listeners = new Map();
    /** @type {ReturnType<typeof setTimeout>|undefined} */ this.saveTimer = undefined;
    this.savedAt = 0;
    this.dirty = false;
  }

  load() {
    const st = this.storage;
    const songs = readJson(st, KEYS.songs, []);
    this.songs = Array.isArray(songs) ? songs.map(normalizeSong).filter(/** @returns {s is Song} */ (s) => Boolean(s)) : [];
    const sets = readJson(st, KEYS.setlists, []);
    this.setlists = Array.isArray(sets) ? sets.map(normalizeSetlist).filter(/** @returns {s is Setlist} */ (s) => Boolean(s)) : [];
    const del = readJson(st, KEYS.deleted, []);
    this.deletedIds = Array.isArray(del) ? del.filter((x) => typeof x === "string") : [];
    this.settings = normalizeSettings(readJson(st, KEYS.settings, {}));
    let active = null;
    try { active = st.getItem(KEYS.active); } catch { /* private mode */ }
    this.activeId = this.songs.some((s) => s.id === active) ? active : this.songs[0]?.id || null;
    return this;
  }

  /** @param {string} evt @param {Function} fn */
  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt)?.add(fn);
    return () => this.listeners.get(evt)?.delete(fn);
  }

  /** @param {string} evt @param {any} [data] */
  emit(evt, data) { this.listeners.get(evt)?.forEach((fn) => fn(data)); }

  /** Save only if something changed (used on page hide, so an idle tab never overwrites newer data). */
  flush() { return this.dirty ? this.persist() : true; }

  /** Write everything now. Returns false when the browser refused (storage full). */
  persist() {
    clearTimeout(this.saveTimer);
    try {
      const st = this.storage;
      st.setItem(KEYS.songs, JSON.stringify(this.songs));
      st.setItem(KEYS.setlists, JSON.stringify(this.setlists));
      st.setItem(KEYS.settings, JSON.stringify(this.settings));
      st.setItem(KEYS.deleted, JSON.stringify(this.deletedIds));
      if (this.activeId && this.activeId !== "shared") st.setItem(KEYS.active, this.activeId);
      this.savedAt = Date.now();
      this.dirty = false;
      this.emit("saved");
      return true;
    } catch (e) {
      this.emit("save-error", e);
      return false;
    }
  }

  /**
   * Note a change. `library` changes (songs, setlists) are also synced.
   * @param {"library"|"settings"|"view"} [kind]
   */
  changed(kind = "library") {
    this.dirty = true;
    this.emit("change", kind);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 400);
    if (kind === "library") this.emit("library-change");
  }

  /** @returns {Song|null} */
  active() {
    if (this.activeId === "shared" && this.shared) return this.shared;
    return this.songs.find((s) => s.id === this.activeId) || this.songs[0] || null;
  }

  /** @param {string} id */
  song(id) { return this.songs.find((s) => s.id === id) || null; }

  /** @param {string} id */
  open(id) {
    const s = this.song(id);
    if (!s) return null;
    this.activeId = id;
    this.shared = null;
    s.lastOpenedAt = now();
    this.changed("view");
    this.emit("song-open", s);
    return s;
  }

  /** @param {Partial<Song>} [data] @param {string} [arranger] */
  createSong(data = {}, arranger = "") {
    const t = now();
    const song = /** @type {Song} */ (normalizeSong({ creator: this.settings.autoFillArranger ? arranger : "", ...data, id: uid(), createdAt: t, updatedAt: t, lastOpenedAt: t }));
    if (!data.title) song.title = "Untitled";
    // Blank starter songs carry nothing; drop them so the library stays tidy.
    this.songs = this.songs.filter((s) => s.body.trim() || s.title !== "Untitled" || this.setlists.some((l) => l.items.some((i) => i.songId === s.id)));
    this.songs.unshift(song);
    this.activeId = song.id;
    this.shared = null;
    this.changed();
    this.emit("song-open", song);
    return song;
  }

  /** @param {Song} song @param {Partial<Song>} patch */
  update(song, patch) {
    if (!song || song.readonly) return;
    Object.assign(song, patch, { updatedAt: now() });
    this.changed();
  }

  /** @param {string[]} ids */
  deleteSongs(ids) {
    const set = new Set(ids);
    this.songs = this.songs.filter((s) => !set.has(s.id));
    this.deletedIds = [...new Set([...this.deletedIds, ...ids])];
    for (const sl of this.setlists) {
      const before = sl.items.length;
      sl.items = sl.items.filter((i) => !set.has(i.songId));
      if (sl.items.length !== before) sl.updatedAt = now();
    }
    if (this.activeId && set.has(this.activeId)) this.activeId = this.songs[0]?.id || null;
    this.changed();
    this.emit("song-open", this.active());
  }

  /** @param {Song} song */
  duplicate(song) {
    return this.createSong({ ...song, title: `${song.title} (copy)`, isFavorite: false });
  }

  /** @param {Partial<Setlist>} data */
  saveSetlist(data) {
    const t = now();
    const existing = data.id ? this.setlists.find((s) => s.id === data.id) : null;
    if (existing) {
      Object.assign(existing, data, { updatedAt: t });
      this.changed();
      return existing;
    }
    const set = /** @type {Setlist} */ (normalizeSetlist({ ...data, id: uid("set"), date: t, updatedAt: t }));
    this.setlists.unshift(set);
    this.changed();
    return set;
  }

  /** @param {string} id */
  deleteSetlist(id) {
    this.setlists = this.setlists.filter((s) => s.id !== id);
    this.deletedIds = [...new Set([...this.deletedIds, id])];
    if (this.setlist.id === id) this.setlist = { id: null, index: 0 };
    this.changed();
  }

  /** Songs of a setlist that still exist. @param {Setlist} set */
  setlistSongs(set) {
    return set.items.map((i) => this.song(i.songId)).filter(/** @returns {s is Song} */ (s) => Boolean(s));
  }

  /** @param {string} id @param {number} [index] */
  playSetlist(id, index = 0) {
    const set = this.setlists.find((s) => s.id === id);
    if (!set) return null;
    const songs = this.setlistSongs(set);
    if (!songs.length) return null;
    const i = Math.min(songs.length - 1, Math.max(0, index));
    this.setlist = { id, index: i };
    this.open(songs[i].id);
    this.emit("setlist", this.setlist);
    return songs[i];
  }

  exitSetlist() {
    this.setlist = { id: null, index: 0 };
    this.emit("setlist", this.setlist);
  }

  /** Current setlist and its playable songs, or null. */
  currentSetlist() {
    if (!this.setlist.id) return null;
    const set = this.setlists.find((s) => s.id === this.setlist.id);
    if (!set) return null;
    return { set, songs: this.setlistSongs(set), index: this.setlist.index };
  }

  /** @param {Song} song */
  showShared(song) {
    this.shared = { ...song, id: "shared", readonly: true };
    this.activeId = "shared";
    this.emit("song-open", this.shared);
  }

  saveShared() {
    if (!this.shared) return null;
    const { readonly, id, ...rest } = this.shared;
    return this.createSong(rest);
  }

  closeShared() {
    this.shared = null;
    this.activeId = this.songs[0]?.id || null;
    this.emit("song-open", this.active());
  }

  /** Data written to Drive and to backup files. */
  snapshot() {
    return { app: "sonata", version: 2, songs: this.songs, setlists: this.setlists, deletedIds: this.deletedIds, exportedAt: now() };
  }

  /**
   * Restore from a backup file: brings back songs even if they were deleted
   * here later, and keeps anything newer on this device.
   * @param {{ songs?: any[], setlists?: any[] }} data
   */
  importBackup(data) {
    const ids = new Set([...(data.songs || []), ...(data.setlists || [])].map((x) => x && x.id).filter(Boolean));
    this.deletedIds = this.deletedIds.filter((id) => !ids.has(id));
    return this.mergeIn({ songs: data.songs || [], setlists: data.setlists || [] });
  }

  /**
   * Merge another library into this one (backup import or Drive).
   * @param {{ songs?: any[], setlists?: any[], deletedIds?: string[] }} data
   */
  mergeIn(data) {
    const merged = mergeLibraries(this.snapshot(), data);
    const before = this.songs.length;
    this.songs = merged.songs;
    this.setlists = merged.setlists;
    this.deletedIds = merged.deletedIds;
    if (!this.songs.some((s) => s.id === this.activeId) && this.activeId !== "shared") this.activeId = this.songs[0]?.id || null;
    this.persist();
    this.emit("change", "library");
    this.emit("song-open", this.active());
    return { added: Math.max(0, this.songs.length - before) };
  }
}
