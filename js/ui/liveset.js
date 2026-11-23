// @ts-check
// Live setlists: no accounts and no Sonata database. The leader publishes a setlist as one
// file in their own Google Drive (shared "anyone with the link can view"); the band's link
// (/set/<file id>/<name>) always reads the latest version of that file. A band member's copy
// is brought up to date, never duplicated, and their own key and capo are kept.
import { $, toast } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, adoptShared, findCopy, setlistSongsEffective } from "./ctx.js";
import { buildSetFile, parseSetFile, unpackSong } from "../core/share.js";
import { bankSlug, validBankId } from "../core/bank.js";
import { openImportSet } from "./sheets-lazy.js";

/** @param {string} id @param {string} [title] */
export const liveSetUrl = (id, title = "") => `${location.origin}/set/${id}${bankSlug(title) ? `/${bankSlug(title)}` : ""}`;

/** What was last published for each setlist, to skip uploads when nothing changed. @type {Map<string, string>} */
const published = new Map();
/** @param {import("../core/store.js").Setlist} set */
const fileText = (set) => { const f = buildSetFile(set, setlistSongsEffective(set)); return JSON.stringify({ ...f, updatedAt: "" }); };

/** Last time each followed source was checked during this session. @type {Map<string, number>} */
const checkedAt = new Map();
/** Digest of remote content last notified, so we don't spam identical update toasts. @type {Map<string, string>} */
const notifiedDigest = new Map();

/** Compare remote setlist payload against current local copy without mutating anything.
 * @param {import("../core/store.js").Setlist} set
 * @param {NonNullable<ReturnType<typeof parseSetFile>>} data
 */
export function hasRemoteSetChanges(set, data) {
  if (set.title !== data.t || (set.description || "") !== (data.d || "")) return true;
  if (set.items.length !== data.s.length) return true;
  const localSongs = store.setlistSongs(set);
  if (localSongs.length !== data.s.length) return true;
  for (let i = 0; i < data.s.length; i++) {
    const u = unpackSong(data.s[i]);
    const hit = findCopy(u);
    if (!hit || hit.song.id !== localSongs[i]?.id || (!hit.own && !hit.same)) return true;
  }
  return false;
}

/** @param {string} setId @param {boolean} hasUpdate @param {string} [syncedIso] */
function syncBadgeState(setId, hasUpdate, syncedIso) {
  const cur = store.currentSetlist()?.set;
  if (!cur || cur.id !== setId) return;
  const btn = $("setSyncBtn");
  if (btn) btn.classList.toggle("has-update", hasUpdate);
  const badge = $("setlistSyncBadge");
  if (badge && syncedIso) badge.title = t("lastSynced", "Last checked: {t}", { t: new Date(syncedIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
}

/**
 * Publish a setlist (or update its file). @param {string} setId @param {{ quiet?: boolean }} [o]
 * @returns {Promise<boolean>}
 */
export async function publishLiveSet(setId, o = {}) {
  const set = store.setlists.find((s) => s.id === setId);
  if (!set) return false;
  const d = o.quiet ? app.drive : await app.loadDrive();
  if (d && (!d.token || !d.tokenValid()) && !o.quiet) await d.signIn();
  const curSet = store.setlists.find((s) => s.id === setId);
  if (!curSet) return false;
  if (!d || !d.token || !d.tokenValid()) {
    if (!o.quiet) {
      const msg = d?.error || t("liveNeedsDrive", "Sign in with Google first. A live link is shared from your own Drive.");
      toast(msg, d?.error ? "error" : "info", d?.error ? { ms: 6000 } : { ms: 6000, action: t("signIn", "Sign in"), onAction: () => d?.signIn() });
    }
    return false;
  }
  const songs = setlistSongsEffective(curSet);
  if (!songs.length) { if (!o.quiet) toast(t("liveEmpty", "Add a song to this setlist first."), "error"); return false; }
  const text = fileText(curSet);
  const r = await d.publishBank(buildSetFile(curSet, songs), curSet.liveId || "", `sonata_setlist_${bankSlug(curSet.title) || "live"}.json`);
  if (!r.ok) {
    if (!o.quiet) toast(r.reason === "signin" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : r.reason === "offline" ? t("offlineNote", "You're offline. Songs still save on this device.") : t("livePublishFailed", "Couldn't publish the live link. Please try again."), "error", { ms: 5000 });
    return false;
  }
  published.set(curSet.id, text);
  if (curSet.liveId !== r.id) store.saveSetlist({ id: curSet.id, liveId: r.id });
  return true;
}

/** Stop sharing (the file stays in the leader's Drive, private again). @param {string} setId */
export async function stopLiveSet(setId) {
  let set = store.setlists.find((s) => s.id === setId);
  if (!set?.liveId) return false;
  const d = await app.loadDrive();
  if (d && (!d.token || !d.tokenValid())) await d.signIn();
  set = store.setlists.find((s) => s.id === setId);
  if (!set?.liveId || !d || !d.token || !d.tokenValid()) return false;
  if (!(await d.unpublishBank(set.liveId))) return false;
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
      if (!app.drive?.token || !app.drive.tokenValid() || !navigator.onLine) return;
      for (const set of store.setlists) if (set.liveId && published.get(set.id) !== fileText(set)) publishLiveSet(set.id, { quiet: true });
    }, 4000);
  });
  // What is in Drive now counts as published, so opening the app does not upload again.
  for (const set of store.setlists) if (set.liveId && !published.has(set.id)) published.set(set.id, fileText(set));
  const check = () => { if (!document.hidden) checkActiveLiveSet({ prompt: true }); };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
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
  const prevBySong = new Map();
  for (const it of set.items) {
    if (it.key === undefined && it.capo === undefined) continue;
    if (!prevBySong.has(it.songId)) prevBySong.set(it.songId, []);
    prevBySong.get(it.songId).push(it);
  }
  const nextItems = ids.map((songId) => {
    const ov = prevBySong.get(songId)?.shift();
    /** @type {import("../core/store.js").SetlistItem} */
    const item = { songId };
    if (ov?.key) item.key = ov.key;
    if (ov?.capo !== undefined) item.capo = ov.capo;
    return item;
  });
  const before = set.items.map((i) => i.songId).join(",");
  if (before !== ids.join(",") || set.title !== data.t || set.description !== data.d) changed = true;
  if (changed) store.saveSetlist({ id: set.id, title: data.t, description: data.d, links: data.l, items: nextItems });
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

/** Sync a published (leader) or followed (band member) setlist with Google Drive immediately. @param {string} setId */
export async function syncLiveSetNow(setId) {
  const set = store.setlists.find((s) => s.id === setId);
  if (!set) return false;
  if (set.liveId) {
    const ok = await publishLiveSet(set.id);
    if (ok) toast(t("livePublished", "The live link is up to date."), "success");
    return ok;
  }
  if (set.source) {
    const { data, gone } = await fetchSet(set.source);
    if (!data) {
      toast(gone ? t("liveGone", "This setlist isn't shared any more. Ask its owner for a new link.") : t("liveOffline", "You're offline, and this setlist hasn't been opened on this device before."), "error", { ms: 5000 });
      return false;
    }
    const changed = applySet(set, data);
    syncBadgeState(set.id, false, new Date().toISOString());
    toast(changed ? t("liveUpdated", "“{t}” is up to date. Your keys and capos were kept.", { t: data.t }) : t("liveSame", "“{t}” is already up to date.", { t: data.t }), "success", { ms: 3500 });
    return true;
  }
  return false;
}

/** Check the active followed setlist cleanly (30s cooldown) and notify instead of overwriting mid-song. @param {{ prompt?: boolean, force?: boolean }} [o] */
export async function checkActiveLiveSet(o = {}) {
  if (!navigator.onLine) return false;
  const set = store.currentSetlist()?.set;
  if (!set?.source) return false;
  const last = checkedAt.get(set.source) || 0;
  if (!o.force && Date.now() - last < 30_000) return false;
  checkedAt.set(set.source, Date.now());
  const { data } = await fetchSet(set.source);
  if (!data) return false;
  const stamp = new Date().toISOString();
  if (!hasRemoteSetChanges(set, data)) { syncBadgeState(set.id, false, stamp); return false; }
  syncBadgeState(set.id, true, stamp);
  if (!o.prompt) return true;
  const digest = JSON.stringify({ t: data.t, d: data.d, s: data.s.length, u: data.updatedAt || "" });
  if (notifiedDigest.get(set.id) === digest) return true;
  notifiedDigest.set(set.id, digest);
  toast(t("liveUpdateAvailable", "“{t}” has a newer version.", { t: data.t }), "info", {
    ms: 8000,
    action: t("updateNow", "Update"),
    onAction: () => {
      applySet(set, data);
      syncBadgeState(set.id, false, new Date().toISOString());
      toast(t("liveUpdated", "“{t}” is up to date. Your keys and capos were kept.", { t: data.t }), "success", { ms: 3500 });
    }
  });
  return true;
}

/** Check the setlists this device follows (at most every 2 minutes each). */
export async function refreshFollowed() {
  if (!navigator.onLine) return;
  for (const set of store.setlists.filter((s) => s.source)) {
    const key = `sonata_set_checked_${set.source}`;
    try { if (Date.now() - Number(localStorage.getItem(key) || 0) < 2 * 60 * 1000) continue; localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
    checkedAt.set(/** @type {string} */ (set.source), Date.now());
    const { data } = await fetchSet(/** @type {string} */ (set.source));
    if (data && applySet(set, data)) toast(t("liveUpdatedBy", "“{t}” was updated by its owner.", { t: data.t }), "info", { ms: 5000 });
  }
}
