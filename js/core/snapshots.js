// @ts-check
// Restore points: copies of the library kept on this device (IndexedDB), so a wrong restore, a bad
// merge or a mistaken delete can be undone. Nothing here leaves the device.

const DB = "sonata-backups";
const STORE = "snapshots";
/** How many restore points are kept; the oldest go first. */
export const KEEP = 15;
/** Automatic restore points are at least this far apart (reloads and extra tabs don't use them up). */
const AUTO_GAP = 60 * 60 * 1000;

/**
 * @typedef {{ songs?: any[], setlists?: any[], deletedIds?: string[] }} Library
 * @typedef {"auto"|"before-restore"|"manual"} Reason
 * @typedef {{ id: string, at: string, reason: Reason, songs: number, setlists: number, fp: string }} SnapshotInfo
 */

/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb"));
    req.onblocked = () => reject(new Error("idb-blocked"));
  });
}

/**
 * Run one request in a transaction. @template T
 * @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T>} fn @returns {Promise<T>}
 */
async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error || new Error("idb"));
      tx.onabort = () => reject(tx.error || new Error("idb"));
    });
  } finally { db.close(); }
}

/**
 * A short fingerprint of what a library holds (not when it was opened or synced), to tell whether
 * anything changed. FNV-1a over the text; collisions only cost one skipped restore point.
 * @param {Library} d
 */
export function fingerprint(d) {
  const text = JSON.stringify([
    (d.songs || []).map((s) => ({ ...s, lastOpenedAt: undefined })),
    d.setlists || []
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}-${text.length.toString(36)}`;
}

/** Restore points on this device, newest first (without their contents). @returns {Promise<SnapshotInfo[]>} */
export async function listSnapshots() {
  try {
    const all = /** @type {any[]} */ (await run("readonly", (s) => s.getAll()));
    return all.map(({ id, at, reason, songs, setlists, fp }) => ({ id, at, reason, songs, setlists, fp })).sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch { return []; }
}

/** The library held in one restore point. @param {string} id @returns {Promise<Library|null>} */
export async function getSnapshot(id) {
  try {
    const rec = /** @type {any} */ (await run("readonly", (s) => s.get(id)));
    return rec ? JSON.parse(rec.json) : null;
  } catch { return null; }
}

/**
 * Keep a restore point. @param {Library} data @param {Reason} [reason]
 * @returns {Promise<SnapshotInfo|null>} null when the device has no room or no IndexedDB
 */
export async function saveSnapshot(data, reason = "manual") {
  try {
    const at = new Date().toISOString();
    const lib = { songs: data.songs || [], setlists: data.setlists || [] };
    const info = { id: `${at}-${Math.random().toString(36).slice(2, 6)}`, at, reason, songs: lib.songs.length, setlists: lib.setlists.length, fp: fingerprint(lib) };
    await run("readwrite", (s) => s.put({ ...info, json: JSON.stringify(lib) }));
    const all = await listSnapshots();
    for (const old of all.slice(KEEP)) await run("readwrite", (s) => s.delete(old.id));
    return info;
  } catch { return null; }
}

/**
 * The automatic restore point taken when the app opens: only when the library differs from the
 * newest one, and not more than once an hour. @param {Library} data
 */
export async function autoSnapshot(data) {
  if (!(data.songs || []).length) return null;
  const [latest] = await listSnapshots();
  if (latest && latest.fp === fingerprint(data)) return null;
  if (latest && latest.reason === "auto" && Date.now() - Date.parse(latest.at) < AUTO_GAP) return null;
  return saveSnapshot(data, "auto");
}

/** @param {string} id */
export async function deleteSnapshot(id) {
  try { await run("readwrite", (s) => s.delete(id)); return true; } catch { return false; }
}
