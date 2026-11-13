// @ts-check
// Backup & restore: one place for everything that keeps a library safe. Google Drive (automatic),
// a backup file (one tap), and restore points kept on this device. Loaded when first opened.
import "../../css/backup.css";
import { esc, icon, toast, openSheet, download, relativeTime, confirmSheet } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { store, app } from "./ctx.js";
import { listSnapshots, getSnapshot, saveSnapshot, fingerprint } from "../core/snapshots.js";
import { buildBackupFile, readBackupFile } from "../core/backupfile.js";

const AT_KEY = "sonata_backup_at";
const FP_KEY = "sonata_backup_fp";
const get = (/** @type {string} */ k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const set = (/** @type {string} */ k, /** @type {string} */ v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** @param {string} iso */
const when = (iso) => {
  try { return new Date(iso).toLocaleString(getLang() === "fil" ? "fil-PH" : undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
};

/**
 * Save every song and setlist as one file. On a phone or tablet this opens the share sheet, so the
 * file can go straight to Files, Drive, email or a chat; elsewhere it downloads.
 * @returns {Promise<boolean>}
 */
export async function saveBackupFile() {
  const snap = store.snapshot();
  const text = await buildBackupFile(snap);
  const name = `sonata-backup-${new Date().toISOString().slice(0, 10)}.json`;
  let saved = false;
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare) {
    try {
      const file = new File([text], name, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        saved = true;
      }
    } catch (e) {
      if (/** @type {any} */ (e)?.name === "AbortError") return false; // the person closed the share sheet
    }
  }
  if (!saved) download(name, new Blob([text], { type: "application/json" }));
  set(AT_KEY, new Date().toISOString());
  set(FP_KEY, fingerprint(snap));
  document.getElementById("accountBtn")?.removeAttribute("data-unprotected");
  return true;
}

/**
 * Restore from the text of a backup file. Keeps a restore point first, so it can be undone.
 * @param {string} text @returns {Promise<boolean>}
 */
export async function restoreFromText(text) {
  const r = await readBackupFile(text);
  if (!r.ok) { toast(t("badBackup", r.error), "error", { ms: 5000 }); return false; }
  if (r.damaged) {
    const go = await confirmSheet({
      title: t("backupDamagedTitle", "This file may be damaged"),
      message: t("backupDamagedText", "The backup doesn't match its own checksum, so it may be cut off or was changed after it was saved. You can still restore what it holds."),
      confirm: t("restoreAnyway", "Restore anyway"), cancel: t("cancel", "Cancel"), danger: true
    });
    if (!go) return false;
  }
  await saveSnapshot(store.snapshot(), "before-restore");
  const before = store.songs.length;
  store.importBackup(r.data);
  app.refresh();
  const added = Math.max(0, store.songs.length - before);
  toast(added ? t("backupRestored", "Restored {n} songs", { n: added }) : t("backupNothingNew", "Backup merged. Nothing new to add."), "success");
  return true;
}

/** Go back to a restore point kept on this device. @param {string} id @returns {Promise<boolean>} */
async function restoreSnapshot(id) {
  const data = await getSnapshot(id);
  if (!data) { toast(t("snapMissing", "That earlier version is no longer on this device."), "error"); return false; }
  const go = await confirmSheet({
    title: t("snapRestoreTitle", "Go back to this version?"),
    message: t("snapRestoreText", "Songs and setlists return to how they were then. Songs you added since are kept, and today's version is saved first so you can undo this."),
    confirm: t("restore", "Restore"), cancel: t("cancel", "Cancel")
  });
  if (!go) return false;
  await saveSnapshot(store.snapshot(), "before-restore");
  store.importBackup(data, { prefer: true });
  app.refresh();
  toast(t("snapRestored", "Restored. Your songs are back to that version."), "success", { ms: 4000 });
  return true;
}

/** The headline: is this library safe right now? */
async function status() {
  const d = app.drive;
  const n = store.songs.length;
  const fileAt = get(AT_KEY);
  const lang = getLang();
  if (!store.songs.length) return { kind: "idle", title: t("bkNothing", "Nothing to back up yet"), sub: t("bkNothingSub", "Add a song and it is saved on this device right away.") };
  if (d?.token && ["synced", "syncing", "connecting"].includes(d.status)) {
    return { kind: "ok", title: t("bkDriveOk", "Backed up to Google Drive"), sub: d.lastSynced ? t("lastSynced", "Last synced {when}", { when: relativeTime(d.lastSynced, lang) }) : t("syncing", "Syncing…") };
  }
  if (d?.signedIn) return { kind: "warn", title: t("bkDriveExpired", "Google Drive needs you to reconnect"), sub: d.error || t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") };
  if (fileAt && get(FP_KEY) === fingerprint(store.snapshot())) return { kind: "ok", title: t("bkFileOk", "Your backup file is up to date"), sub: t("bkFileSaved", "Saved {when}", { when: relativeTime(fileAt, lang) }) };
  if (fileAt) return { kind: "warn", title: t("bkFileStale", "Changes since your last backup file"), sub: t("bkFileSaved", "Saved {when}", { when: relativeTime(fileAt, lang) }) };
  const kept = await navigator.storage?.persisted?.().catch(() => false);
  return {
    kind: "warn",
    title: n === 1 ? t("bkLocal1", "1 song is on this device only") : t("bkLocal", "{n} songs are on this device only", { n }),
    sub: kept ? t("bkLocalKept", "The browser won't clear them on its own, but a lost or reset device still loses them.") : t("bkLocalRisk", "A browser can clear saved songs when space runs low, and a lost device loses them. Back up to keep them safe.")
  };
}

function driveCard() {
  const d = app.drive;
  const head = `<h3>${icon("cloud")}<span>Google Drive</span><em class="bk-tag">${esc(t("bkAuto", "Automatic"))}</em></h3>`;
  if (!d || d.status === "signed-out" || (!d.token && !d.profile.email)) {
    return `<section class="bk-card">${head}
      <p>${esc(t("accountIntro", "Keep your songs safe and the same on all your devices. Sonata only sees the one file it creates in your Drive (sonata_library.json)."))}</p>
      ${d?.error ? `<p class="error-text">${esc(d.error)}</p>` : ""}
      <button class="btn primary wide google" type="button" id="gSignIn"><svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>${esc(t("signInGoogle", "Continue with Google"))}</button>
    </section>`;
  }
  const p = d.profile;
  const synced = d.lastSynced ? t("lastSynced", "Last synced {when}", { when: relativeTime(d.lastSynced, getLang()) }) : t("neverSynced", "Not synced yet");
  const text = d.status === "syncing" ? t("syncing", "Syncing…") : d.status === "expired" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : d.status === "offline" ? t("offline", "Offline") : d.error || synced;
  return `<section class="bk-card">${head}
    <div class="profile">${p.picture ? `<img src="${esc(p.picture)}" alt="" width="48" height="48" referrerpolicy="no-referrer">` : `<span class="avatar-fallback">${esc((p.givenName || p.email || "?").charAt(0).toUpperCase())}</span>`}
      <div><strong>${esc(p.name || p.givenName || "Google")}</strong><span class="muted">${esc(p.email || "")}</span></div></div>
    <p class="status-line ${esc(d.status)}">${esc(text)}</p>
    <div class="btn-row">
      ${d.status === "expired" ? `<button class="btn primary" type="button" id="gSignIn">${icon("refresh")}${esc(t("reconnect", "Reconnect"))}</button>` : `<button class="btn primary" type="button" id="gSync"${d.status === "syncing" ? " disabled" : ""}>${icon("refresh")}${esc(t("syncNow", "Sync now"))}</button>`}
      <button class="btn ghost" type="button" id="gOut">${icon("logout")}${esc(t("signOut", "Sign out"))}</button>
    </div>
    <p class="card-hint">${esc(t("autoSyncNote", "Changes sync automatically while you're signed in."))}</p>
  </section>`;
}

/** @param {import("../core/snapshots.js").SnapshotInfo[]} snaps @param {boolean} all */
function versionsCard(snaps, all) {
  const label = { auto: t("snapAuto", "Automatic"), "before-restore": t("snapBefore", "Before a restore"), manual: t("snapManual", "Saved by you") };
  const shown = all ? snaps : snaps.slice(0, 4);
  return `<section class="bk-card">
    <h3>${icon("undo")}<span>${esc(t("bkVersions", "Earlier versions"))}</span><em class="bk-tag">${esc(t("bkOnDevice", "On this device"))}</em></h3>
    <p>${esc(t("bkVersionsText", "Sonata keeps a copy of your library when you open it after changes (the last 15). Go back if something goes wrong."))}</p>
    ${snaps.length ? `<ul class="bk-list">${shown.map((s) => `<li><span><b>${esc(when(s.at))}</b><small>${esc(t("bkCounts", "{s} songs · {l} setlists", { s: s.songs, l: s.setlists }))} · ${esc(label[s.reason] || label.auto)}</small></span><button class="btn small" type="button" data-snap="${esc(s.id)}">${esc(t("restore", "Restore"))}</button></li>`).join("")}</ul>
      ${snaps.length > shown.length ? `<button class="btn ghost small wide" type="button" id="bkMore">${esc(t("bkShowAll", "Show all {n}", { n: snaps.length }))}</button>` : ""}`
    : `<p class="card-hint">${esc(t("bkNoVersions", "No earlier versions yet. The first one is kept the next time you open Sonata with songs in it."))}</p>`}
  </section>`;
}

/** Backup & restore sheet. */
export async function openBackup() {
  let showAll = false;
  let snaps = await listSnapshots();
  const draw = async () => {
    const st = await status();
    const fileAt = get(AT_KEY);
    return `<div class="backup">
      <div class="bk-status ${st.kind}" role="status">${icon(st.kind === "ok" ? "cloud-check" : st.kind === "warn" ? "info" : "cloud")}<div><b>${esc(st.title)}</b><span>${esc(st.sub)}</span></div></div>
      ${driveCard()}
      <section class="bk-card">
        <h3>${icon("download")}<span>${esc(t("bkFile", "Backup file"))}</span><em class="bk-tag">${esc(t("bkOneTap", "One tap"))}</em></h3>
        <p>${esc(t("bkFileText", "One file with every song and setlist. Keep it anywhere you like: Files, email, a chat with yourself."))}</p>
        ${fileAt ? `<p class="card-hint">${esc(t("bkFileLast", "Last saved {when}", { when: when(fileAt) }))}</p>` : ""}
        <div class="btn-row">
          <button class="btn primary" type="button" id="exportBackup"${store.songs.length ? "" : " disabled"}>${icon("download")}${esc(t("bkSaveFile", "Save backup file"))}</button>
          <label class="btn">${icon("upload")}${esc(t("bkRestoreFile", "Restore from a file"))}<input type="file" id="importBackup" accept="application/json,.json" hidden></label>
        </div>
      </section>
      ${versionsCard(snaps, showAll)}
    </div>`;
  };
  /** Stop redrawing once this sheet is gone (the dialog is shared with every other sheet). */
  let unsub = () => {};
  let closed = false;
  const body = openSheet({ title: t("backupTitle", "Backup & restore"), body: await draw(), onClose: () => { closed = true; unsub(); }, focus: false });
  const redraw = async () => {
    if (closed) return;
    const html = await draw();
    if (closed) return;
    body.innerHTML = html;
  };
  unsub = store.on("drive-status", () => { redraw(); });
  // Drive is loaded here, so the sign-in popup can open straight from the tap.
  if (!app.drive) app.loadDrive().then(() => redraw());

  body.addEventListener("click", async (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const btn = /** @type {HTMLElement|null} */ (el.closest("button"));
    if (!btn) return;
    const d = app.drive || (["gSignIn", "gSync", "gOut"].includes(btn.id) ? await app.loadDrive() : null);
    if (btn.id === "gSignIn" && d) { if (await d.signIn()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (btn.id === "gSync" && d) { if (await d.sync()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (btn.id === "gOut" && d) { d.signOut(); toast(t("signedOut", "Signed out of Google Drive"), "info"); }
    if (btn.id === "exportBackup") { if (await saveBackupFile()) { toast(t("bkSaved", "Backup file saved"), "success"); redraw(); } }
    if (btn.id === "bkMore") { showAll = true; redraw(); }
    if (btn.dataset.snap) {
      // The confirmation uses the same dialog, so this sheet is reopened afterwards.
      await restoreSnapshot(btn.dataset.snap);
      openBackup();
    }
  });
  body.addEventListener("change", async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.id !== "importBackup") return;
    const file = input.files?.[0];
    if (!file) return;
    let text = "";
    try { text = file.size <= 25 * 1024 * 1024 ? await file.text() : ""; } catch { /* unreadable */ }
    if (!text) { toast(t("badBackup", "That file isn't a Sonata backup."), "error"); return; }
    await restoreFromText(text);
    snaps = await listSnapshots();
    openBackup();
  });
}
