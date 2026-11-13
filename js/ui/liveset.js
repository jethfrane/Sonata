// @ts-check
// Live setlists: no accounts and no Sonata database. The leader publishes a setlist as one
// file in their own Google Drive (shared "anyone with the link can view"); the band's link
// (/set/<file id>/<name>) always reads the latest version of that file. A band member's copy
// is brought up to date, never duplicated, and their own key and capo are kept.
import { toast } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, adoptShared } from "./ctx.js";
import { buildSetFile, parseSetFile, unpackSong } from "../core/share.js";
import { bankSlug, validBankId } from "../core/bank.js";
import { openImportSet } from "./sheets-lazy.js";

/** @param {string} id @param {string} [title] */
export const liveSetUrl = (id, title = "") => `${location.origin}/set/${id}${bankSlug(title) ? `/${bankSlug(title)}` : ""}`;

/** What was last published for each setlist, to skip uploads when nothing changed. @type {Map<string, string>} */
const published = new Map();
/** @param {import("../core/store.js").Setlist} set */
const fileText = (set) => { const f = buildSetFile(set, store.setlistSongs(set)); return JSON.stringify({ ...f, updatedAt: "" }); };

/**
 * Publish a setlist (or update its file). @param {string} setId @param {{ quiet?: boolean }} [o]
 * @returns {Promise<boolean>}
 */
export async function publishLiveSet(setId, o = {}) {
  const set = store.setlists.find((s) => s.id === setId);
  if (!set) return false;
  const d = o.quiet ? app.drive : await app.loadDrive();
  if (!d || !d.token) {
    if (!o.quiet) toast(t("liveNeedsDrive", "Sign in with Google first. A live link is shared from your own Drive."), "info", { ms: 6000, action: t("signIn", "Sign in"), onAction: () => d?.signIn() });
    return false;
  }
  if (!store.setlistSongs(set).length) { if (!o.quiet) toast(t("liveEmpty", "Add a song to this setlist first."), "error"); return false; }
  const text = fileText(set);
  const r = await d.publishBank(buildSetFile(set, store.setlistSongs(set)), set.liveId || "", `sonata_setlist_${bankSlug(set.title) || "live"}.json`);
  if (!r.ok) {
    if (!o.quiet) toast(r.reason === "signin" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : r.reason === "offline" ? t("offlineNote", "You're offline. Songs still save on this device.") : t("livePublishFailed", "Couldn't publish the live link. Please try again."), "error", { ms: 5000 });
    return false;
  }
  published.set(set.id, text);
  if (set.liveId !== r.id) store.saveSetlist({ id: set.id, liveId: r.id });
  return true;
}

/** Stop sharing (the file stays in the leader's Drive, private again). @param {string} setId */
export async function stopLiveSet(setId) {
  const set = store.setlists.find((s) => s.id === setId);
  if (!set?.liveId) return false;
  if (!(await app.drive?.unpublishBank(set.liveId))) return false;
  const { liveId, ...rest } = set;
  Object.assign(set, rest); delete set.liveId;
  published.delete(set.id);
  store.changed();
  return true;
}

/** Keep published setlists current after edits (quietly, a little later). */
let timer = /** @type {any} */ (0);
let watching = false;
export function watchLiveSets() {
  if (watching) return;
  watching = true;
  store.on("library-change", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!app.drive?.token || !navigator.onLine) return;
      for (const set of store.setlists) if (set.liveId && published.get(set.id) !== fileText(set)) publishLiveSet(set.id, { quiet: true });
    }, 15000);
  });
  // What is in Drive now counts as published, so opening the app does not upload again.
  for (const set of store.setlists) if (set.liveId && !published.has(set.id)) published.set(set.id, fileText(set));
}

const CACHE = (/** @type {string} */ id) => `sonata_set_${id}`;

/** Fetch a live setlist (falling back to the copy kept on this device). @param {string} id */
async function fetchSet(id) {
  try {
    const r = await fetch(`/api/set?id=${encodeURIComponent(id)}`, { cache: "no-cache", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { data: null, gone: r.status === 404 };
    const data = parseSetFile(await r.json());
    if (data) { try { localStorage.setItem(CACHE(id), JSON.stringify({ ...data, type: "sonata-set" })); } catch { /* full */ } }
    return { data, gone: !data };
  } catch {
    try { return { data: parseSetFile(JSON.parse(localStorage.getItem(CACHE(id)) || "null")), gone: false }; } catch { return { data: null, gone: false }; }
  }
}

/**
 * Bring a followed setlist up to date from the file. Songs are updated in place.
 * @param {import("../core/store.js").Setlist} set @param {NonNullable<ReturnType<typeof parseSetFile>>} data
 * @returns {boolean} whether anything changed
 */
function applySet(set, data) {
  let changed = false;
  const ids = data.s.map((sd) => { const r = adoptShared(unpackSong(sd)); if (r.status !== "same") changed = true; return r.song.id; });
  const before = set.items.map((i) => i.songId).join(",");
  if (before !== ids.join(",") || set.title !== data.t || set.description !== data.d) changed = true;
  if (changed) store.saveSetlist({ id: set.id, title: data.t, description: data.d, links: data.l, items: ids.map((songId) => ({ songId })) });
  return changed;
}

/** Someone opened a live setlist link. @param {string} id */
export async function openLiveSet(id) {
  if (!validBankId(id)) { toast(t("badLink", "This link couldn't be opened. It may be cut off."), "error", { ms: 5000 }); return; }
  const mine = store.setlists.find((s) => s.liveId === id);
  if (mine) { store.playSetlist(mine.id); app.show("editor"); return; }
  const { data, gone } = await fetchSet(id);
  if (!data) {
    toast(gone ? t("liveGone", "This setlist isn't shared any more. Ask its owner for a new link.") : t("liveOffline", "You're offline, and this setlist hasn't been opened on this device before."), "error", { ms: 6000 });
    return;
  }
  const following = store.setlists.find((s) => s.source === id);
  if (!following) { openImportSet(data, id); return; }
  const changed = applySet(following, data);
  store.playSetlist(following.id); app.show("editor");
  toast(changed ? t("liveUpdated", "“{t}” is up to date. Your keys and capos were kept.", { t: data.t }) : t("liveSame", "“{t}” is already up to date.", { t: data.t }), "success", { ms: 4500 });
}

/** Check the setlists this device follows (at most every ten minutes each). */
export async function refreshFollowed() {
  if (!navigator.onLine) return;
  for (const set of store.setlists.filter((s) => s.source)) {
    const key = `sonata_set_checked_${set.source}`;
    try { if (Date.now() - Number(localStorage.getItem(key) || 0) < 10 * 60 * 1000) continue; localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
    const { data } = await fetchSet(/** @type {string} */ (set.source));
    if (data && applySet(set, data)) toast(t("liveUpdatedBy", "“{t}” was updated by its owner.", { t: data.t }), "info", { ms: 5000 });
  }
}
