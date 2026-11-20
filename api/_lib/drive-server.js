// Server-side Google Drive sync helper for Sonata's Remote MCP endpoint.
// Uses the caller's Google OAuth token (drive.file scope) to read sonata_library.json,
// merge into an in-memory Store, run a tool operation, and upload back with 3-round
// optimistic concurrency control (matching js/drive.js).
import { Store, memoryStorage, mergeLibraries, libraryFingerprint } from "../../js/core/store.js";

const FILE_NAME = "sonata_library.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** @param {typeof fetch} fetchImpl @param {string} accessToken @param {string} url @param {RequestInit} [init] */
async function driveApi(fetchImpl, accessToken, url, init = {}) {
  const r = await fetchImpl(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (r.status === 401) {
    throw Object.assign(new Error("Google Drive authorization expired or invalid"), { status: 401, expired: true });
  }
  if (!r.ok) {
    throw Object.assign(new Error(`Google Drive request failed (${r.status})`), { status: r.status >= 500 ? 502 : r.status });
  }
  return r;
}

/** Find oldest non-trashed sonata_library.json in Drive (matching js/drive.js). */
async function findLibraryFile(fetchImpl, accessToken) {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await driveApi(fetchImpl, accessToken, `${DRIVE_API}?q=${q}&orderBy=createdTime&fields=files(id)&spaces=drive`);
  const d = await r.json();
  return d?.files?.[0]?.id || null;
}

/** @param {typeof fetch} fetchImpl @param {string} accessToken @param {string} id */
async function remoteVersion(fetchImpl, accessToken, id) {
  const r = await driveApi(fetchImpl, accessToken, `${DRIVE_API}/${id}?fields=md5Checksum,modifiedTime`);
  const d = await r.json();
  return `${d?.md5Checksum || ""}|${d?.modifiedTime || ""}`;
}

/** @param {typeof fetch} fetchImpl @param {string} accessToken @param {string|null} id @param {string} body */
async function uploadLibrary(fetchImpl, accessToken, id, body) {
  const boundary = "sonata" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify(id ? {} : { name: FILE_NAME, mimeType: "application/json" });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const url = id
    ? `${DRIVE_UPLOAD}/${id}?uploadType=multipart&fields=id`
    : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`;
  const r = await driveApi(fetchImpl, accessToken, url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  const d = await r.json().catch(() => ({}));
  return d?.id || id || "";
}

/**
 * Load sonata_library.json into a fresh in-memory Store, execute `fn(store)`,
 * and persist changes back to Google Drive with 3-round optimistic concurrency.
 *
 * @template T
 * @param {string} accessToken
 * @param {(store: Store) => Promise<T> | T} fn
 * @param {{ fetch?: typeof fetch, readOnly?: boolean }} [io]
 * @returns {Promise<{ result: T, fileId: string|null, uploaded: boolean }>}
 */
export async function runWithDriveLibrary(accessToken, fn, io = {}) {
  if (!accessToken || typeof accessToken !== "string") {
    throw Object.assign(new Error("Missing Google Drive access token"), { status: 401, expired: true });
  }
  const fetchImpl = io.fetch || fetch;
  const readOnly = Boolean(io.readOnly);
  let id = await findLibraryFile(fetchImpl, accessToken);
  let result;
  let pendingSnap = null;
  let uploaded = false;

  for (let round = 0; round < 3; round++) {
    let remote = null;
    let version = "";
    if (id) {
      version = await remoteVersion(fetchImpl, accessToken, id);
      const r = await driveApi(fetchImpl, accessToken, `${DRIVE_API}/${id}?alt=media`);
      const parsed = await r.json().catch(() => null);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) remote = parsed;
    }

    const store = new Store(memoryStorage()).load();
    try {
      if (remote) {
        store.applyMerged(mergeLibraries(store.snapshot(), remote));
      }
      const initialFp = libraryFingerprint(remote || {});
      if (round === 0) {
        result = await fn(store);
        const snap = store.snapshot();
        const changed = libraryFingerprint(snap) !== initialFp;
        if (readOnly || !changed) {
          return { result, fileId: id, uploaded: false };
        }
        pendingSnap = snap;
      } else if (pendingSnap) {
        store.applyMerged(mergeLibraries(store.snapshot(), pendingSnap));
      }

      const snap = store.snapshot();
      if (id && remote && libraryFingerprint(remote) === libraryFingerprint(snap)) {
        break;
      }
      if (id && round < 2 && (await remoteVersion(fetchImpl, accessToken, id)) !== version) {
        continue;
      }

      id = await uploadLibrary(fetchImpl, accessToken, id, JSON.stringify(snap));
      uploaded = true;

      // Guard against two writers creating sonata_library.json concurrently: keep the oldest.
      const canon = await findLibraryFile(fetchImpl, accessToken);
      if (canon && canon !== id) {
        const extra = id;
        id = canon;
        await driveApi(fetchImpl, accessToken, `${DRIVE_API}/${extra}`, { method: "DELETE" }).catch(() => {});
        continue;
      }
      break;
    } finally {
      clearTimeout(store.saveTimer);
    }
  }

  return { result: /** @type {T} */ (result), fileId: id, uploaded };
}
