// @ts-check
// Backup files: one JSON file with every song and setlist, plus a checksum so a file that was cut
// off or changed along the way is noticed before it is restored. No DOM; unit-tested.
import { validateBackup, BACKUP_LIMITS } from "./store.js";

/** The part of a backup the checksum covers. @param {any} d */
const content = (d) => JSON.stringify({ songs: d.songs || [], setlists: d.setlists || [], deletedIds: d.deletedIds || [] });

/** SHA-256 as hex, or "" where the browser has no Web Crypto (plain http). @param {string} text */
export async function sha256(text) {
  try {
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

/**
 * The text of a backup file. @param {{ songs: any[], setlists: any[], deletedIds?: string[] }} snapshot
 * @returns {Promise<string>}
 */
export async function buildBackupFile(snapshot) {
  const body = { app: "sonata", version: 3, exportedAt: new Date().toISOString(), songs: snapshot.songs || [], setlists: snapshot.setlists || [], deletedIds: snapshot.deletedIds || [] };
  const checksum = await sha256(content(body));
  return JSON.stringify(checksum ? { ...body, checksum } : body, null, 2);
}

/**
 * Read and check a backup file before anything is restored.
 * @param {string} text
 * @returns {Promise<{ ok: true, data: any, damaged: boolean, songs: number, setlists: number, exportedAt: string } | { ok: false, error: string }>}
 *   damaged: the file has a checksum and it does not match (cut off, or edited by hand)
 */
export async function readBackupFile(text) {
  if (typeof text !== "string" || text.length > BACKUP_LIMITS.bytes) return { ok: false, error: "This backup is too large to restore." };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a Sonata backup." }; }
  const v = validateBackup(data);
  if (!v.ok) return { ok: false, error: v.error };
  let damaged = false;
  if (typeof data.checksum === "string" && data.checksum) {
    const sum = await sha256(content(data));
    damaged = Boolean(sum) && sum !== data.checksum;
  }
  return { ok: true, data, damaged, songs: (data.songs || []).length, setlists: (data.setlists || []).length, exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "" };
}
