// @ts-check
// Boot: load the library, wire the views, handle shared links and offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { registerSW } from "virtual:pwa-register";
import { $, paintIcons, setIcon, toast, esc, initSelectMenus } from "./ui/dom.js";
import { t, setLang, applyI18n } from "./ui/i18n.js";
import { store, app, storageBlocked, findCopy, profileName } from "./ui/ctx.js";
import { decodeShare, decodeQr, unpackSong } from "./core/share.js";
import { normalizeProfile, parseBankFile } from "./core/bank.js";
import { initEditor, refreshEditor } from "./ui/editor.js";
import { initLibrary, renderLibrary, renderRecent, newSong } from "./ui/library.js";
import { parsePath, buildPath, findSong, PAGE_META, SECTIONS } from "./router.js";
import { openSettings, openImportSet, chordsModule, bankModule, openLinksImport, playModule, theoryModule, stageModule, driveModule, openBackup, openHelp, startTour } from "./ui/sheets-lazy.js";

/** @typedef {import("./ui/ctx.js").View} View */
const VIEWS = /** @type {View[]} */ (["songs", "editor", "chords", "theory", "play", "bank"]);
/**
 * Lazy screens: loaded the first time they open. Songs and Chart start with the app; Chords, Theory,
 * Play (with the audio engine), Stage, the Song Bank and Google Drive each arrive when first needed.
 */
const lazy = { chords: /** @type {any} */ (null), bank: /** @type {any} */ (null), bankId: "", play: /** @type {any} */ (null), theory: /** @type {any} */ (null), stage: /** @type {any} */ (null) };
/** The instrument tab to show on Play before that screen has loaded. */
let playSub = "";
try { playSub = localStorage.getItem("sonata_play_inst") || ""; } catch { /* ignore */ }
const currentInstrument = () => (lazy.play ? lazy.play.currentInstrument() : playSub || "piano");
const isStageOpen = () => Boolean(lazy.stage?.isStageOpen());

/** Load and wire the Play screen once. */
async function loadPlay() {
  if (!lazy.play) {
    const m = await playModule();
    if (!m) return null;
    if (!lazy.play) { m.initMetronome(); m.initPlay(); lazy.play = m; }
  }
  return lazy.play;
}

/** Load and wire the Theory screen once. */
async function loadTheory() {
  if (!lazy.theory) {
    const m = await theoryModule();
    if (!m) return null;
    if (!lazy.theory) { m.initTheory(); lazy.theory = m; }
  }
  return lazy.theory;
}

/** Load and wire the stage once. */
async function loadStage() {
  if (!lazy.stage) {
    const m = await stageModule();
    if (!m) return null;
    if (!lazy.stage) {
      m.initStage();
      m.onStageChange((/** @type {boolean} */ on) => {
        // Keyboard and screen readers stay on the stage, not the page behind it.
        /** @type {any} */ ($("app")).inert = on;
        if (on) syncUrl("push", true);
        else if (/\/stage$/.test(location.pathname)) {
          if (history.state && history.state.stage) history.back(); else syncUrl("replace", false);
        }
        setTitle();
      });
      lazy.stage = m;
    }
  }
  return lazy.stage;
}
async function openStage() { (await loadStage())?.openStage(); }
function closeStage() { lazy.stage?.closeStage(); }

/** Load Google Drive (only people who use it pay for it) and start it. */
let driveLoading = /** @type {Promise<any>|null} */ (null);
function loadDrive() {
  if (app.drive) return Promise.resolve(app.drive);
  driveLoading ||= driveModule().then((m) => {
    if (!m) { driveLoading = null; return null; }
    const drive = new m.Drive(store, onDriveStatus);
    app.drive = drive;
    drive.init();
    return drive;
  });
  return driveLoading;
}
const dark = matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const s = store.settings;
  const theme = s.theme === "system" ? (dark.matches ? "dark" : "light") : s.theme;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = ["blue", "teal", "violet", "rose", "amber"].includes(s.accentTheme) ? s.accentTheme : "blue";
  root.dataset.text = s.uiText;
  root.style.setProperty("--chart-size", `${s.previewFontSize}px`);
  root.style.setProperty("--chart-line", String(s.editorLineHeight));
  setIcon(/** @type {HTMLElement} */ ($("themeBtn").firstElementChild), theme === "dark" ? "sun" : "moon");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", theme === "dark" ? "#0b0f17" : "#f4f6fa"));
}

/** The song a link should point at (shared previews have no stable link). */
function linkSong() {
  const a = store.active();
  return a && !a.readonly ? a : null;
}

/** Path for the current screen. @param {boolean} [stage] */
function currentPath(stage = isStageOpen()) {
  const sub = app.view === "play" ? currentInstrument() : app.view === "chords" ? (lazy.chords?.currentChord() || "") : app.view === "bank" ? lazy.bankId : "";
  return buildPath({ view: app.view, song: linkSong(), sub, stage });
}

let titleTimer = /** @type {any} */ (0);
function setTitle() {
  const song = linkSong();
  const meta = /** @type {any} */ (PAGE_META)[app.view] || PAGE_META.songs;
  const base = app.view === "editor" && song ? song.title || "Untitled" : app.view === "chords" && lazy.chords ? `${lazy.chords.currentChord()} chord` : meta[0];
  document.title = isStageOpen() && song ? `${song.title} · Stage · Sonata` : `${base} · Sonata`;
  const url = location.origin + location.pathname;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
}

/** Keep the address bar in step with the screen. @param {"push"|"replace"} how @param {boolean} [stage] */
function syncUrl(how, stage = isStageOpen()) {
  const path = currentPath(stage);
  if (path !== location.pathname) {
    try { history[how === "push" ? "pushState" : "replaceState"]({ sonata: 1, stage }, "", path); } catch { /* sandboxed */ }
  }
  setTitle();
}

/**
 * @param {View} view
 * @param {{ sub?: string, replace?: boolean }} [opts]
 */
function show(view, opts = {}) {
  if (!VIEWS.includes(view)) view = "editor";
  const first = !$("app").dataset.ready;
  const changed = app.view !== view || first;
  if (app.view === "play" && view !== "play") lazy.play?.stopTuner();
  // The chart always has a song to show: a new, empty one if the library is empty.
  if (view === "editor" && !store.active()) store.createSong({}, profileName());
  app.view = view;
  $("app").dataset.view = view;
  if (view === "songs" && changed && !first) afterFirstSong();
  $("app").dataset.ready = "1";
  document.querySelectorAll("button[data-view]").forEach((b) => {
    const el = /** @type {HTMLElement} */ (b);
    const on = el.dataset.view === view;
    el.classList.toggle("active", on);
    if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  try { localStorage.setItem("sonata_active_view", view); } catch { /* ignore */ }
  const subChanged = view === "play" && Boolean(opts.sub) && opts.sub !== currentInstrument();
  if (view === "play" && opts.sub) { playSub = opts.sub === "fretboard" ? "guitar" : opts.sub; lazy.play?.setInstrument(opts.sub); }
  renderView(view);
  if (view === "chords") showChords(opts.sub);
  if (view === "bank" && opts.sub) showBank(opts.sub);
  syncUrl(opts.replace || first || (!changed && !subChanged) ? "replace" : "push");
  // Only a real change of screen goes back to the top, never a tap inside one.
  if (changed) window.scrollTo({ top: 0 });
}

/** @param {View} view */
function renderView(view) {
  if (view === "songs") renderLibrary();
  if (view === "editor") refreshEditor();
  if (view === "theory") loadTheory().then((m) => { if (m && app.view === "theory") m.renderTheory(); });
  if (view === "play") loadPlay().then((m) => {
    if (!m || app.view !== "play") return;
    if (playSub && playSub !== m.currentInstrument()) m.setInstrument(playSub);
    m.renderPlay(); m.renderMetronome();
    syncUrl("replace");
  });
  if (view === "chords") lazy.chords?.renderChords();
}

/** Load and open the Chords screen. @param {string} [chord] */
async function showChords(chord) {
  if (!lazy.chords) { lazy.chords = await chordsModule(); if (!lazy.chords) return; lazy.chords.initChords(); }
  if (chord && lazy.chords.isChord(chord)) lazy.chords.select(chord, { silent: true });
  else lazy.chords.renderChords();
  syncUrl("replace");
}

/** Load and open a public Song Bank. @param {string} id */
async function showBank(id) {
  lazy.bankId = id;
  if (!lazy.bank) { lazy.bank = await bankModule(); if (!lazy.bank) return; lazy.bank.initBank(); }
  lazy.bank.openBank(id);
}

/** @param {import("./drive.js").DriveStatus} status */
function onDriveStatus(status) {
  const d = app.drive;
  const label = $("accountLabel");
  const avatar = $("accountAvatar");
  const dot = $("syncDot");
  const btn = $("accountBtn");
  btn.dataset.status = status;
  const p = d?.profile || {};
  if (p.picture && status !== "signed-out") {
    avatar.removeAttribute("data-icon");
    avatar.removeAttribute("data-icon-painted");
    avatar.innerHTML = `<img src="${esc(p.picture)}" alt="" referrerpolicy="no-referrer">`;
  } else {
    setIcon(avatar, status === "synced" ? "cloud-check" : "cloud");
  }
  const text = {
    "signed-out": t("backup", "Back up"),
    connecting: t("syncing", "Syncing…"),
    syncing: t("syncing", "Syncing…"),
    synced: t("synced", "Synced"),
    expired: t("reconnect", "Reconnect"),
    error: t("syncIssue", "Sync issue"),
    offline: t("offline", "Offline")
  }[status];
  label.textContent = text;
  btn.setAttribute("aria-label", `${t("backupTitle", "Backup & restore")}: ${text}`);
  dot.hidden = status === "signed-out" || status === "synced";
  dot.dataset.status = status;
  // The Google session ends after an hour. Say so once, with a one-tap Reconnect (a tap is needed for the popup).
  if (status === "expired" && lastDriveStatus && !["expired", "signed-out"].includes(lastDriveStatus)) {
    toast(t("reconnectText", "Your Google session expired. Reconnect to keep syncing."), "info", { ms: 12000, action: t("reconnect", "Reconnect"), onAction: () => { app.drive?.signIn(); } });
  }
  markUnprotected();
  lastDriveStatus = status;
  store.emit("drive-status", status);
  if (status === "synced") restoreBank();
}

/** New device, same Google account: bring back the song bank profile from Drive. */
let bankChecked = false;
async function restoreBank() {
  if (bankChecked || store.bank.fileId || !app.drive) return;
  bankChecked = true;
  const found = await app.drive.findBank();
  const file = found && parseBankFile(found.body);
  if (!found || !file) return;
  store.bank = normalizeProfile({ ...store.bank, title: file.title, name: file.name, bio: file.bio, theme: file.theme, gigs: file.gigs, charts: file.songs.some((x) => x.b), fileId: found.id, publishedAt: file.updatedAt });
  store.changed("settings");
  (await bankModule())?.watchBank();
}
/** @type {string} */
let lastDriveStatus = "";

async function handleShareLink() {
  // A live setlist link: /set/<drive file id>/<name>.
  const live = location.pathname.match(/^\/set\/([\w-]{20,80})/i);
  if (live) { history.replaceState(null, "", "/songs"); show("songs"); (await import("./ui/liveset.js")).openLiveSet(live[1]); return true; }
  const params = new URLSearchParams(location.search);
  const raw = params.get("s") || params.get("share");
  // QR codes use /Q/<CODE> (upper case, so the code is smaller); links use ?s=.
  const qr = location.pathname.match(/^\/q\/([A-Za-z2-7]+)/i);
  if (!raw && !qr) return false;
  history.replaceState(null, "", qr ? "/" : location.pathname);
  const data = qr ? await decodeQr(qr[1]) : await decodeShare(raw || "");
  // A link must hold a song ({ t, b }) or a setlist ({ type: "set", s: [...] }); anything else is damaged.
  const isObj = Boolean(data) && typeof data === "object" && !Array.isArray(data);
  const valid = isObj && (data.type === "set" ? Array.isArray(data.s) : typeof data.t === "string" || typeof data.b === "string");
  if (!valid) { toast(t("badLink", "This link couldn't be opened. It may be cut off."), "error", { ms: 5000 }); return false; }
  if (data.type === "set") { show("songs"); openImportSet(data); return true; }
  // Already saved? open it; otherwise preview read-only with a Save button.
  const u = unpackSong(data);
  // My own song, or a copy that is already the same: open it. A copy that is behind: show the
  // new version with "Update my copy".
  const copy = findCopy(u);
  if (copy && (copy.own || copy.same)) store.open(copy.song.id);
  else store.showShared(/** @type {any} */ ({ ...u, id: "shared", isFavorite: false, createdAt: "", updatedAt: "", lastOpenedAt: "" }));
  show("editor");
  return true;
}

/**
 * Once there is a real song: ask the browser to keep Sonata's storage (so it is never cleared to
 * free space), and offer to install, once. Asking on arrival would be noise; now there is something to keep.
 */
function afterFirstSong() {
  if (!store.songs.some((s) => !s.readonly && String(s.body || "").trim().length >= 20)) return;
  try {
    if (!localStorage.getItem("sonata_persist_asked") && navigator.storage?.persist) {
      localStorage.setItem("sonata_persist_asked", "1");
      navigator.storage.persist().catch(() => {});
    }
    const p = /** @type {any} */ (app).installPrompt;
    if (p && !localStorage.getItem("sonata_install_offered")) {
      localStorage.setItem("sonata_install_offered", "1");
      toast(t("installOffer", "Install Sonata to open it like an app, even offline."), "info", { ms: 12000, action: t("install", "Install Sonata"), onAction: () => { p.prompt(); p.userChoice.finally(() => { /** @type {any} */ (app).installPrompt = null; }); } });
    }
  } catch { /* storage blocked */ }
}

/** A small dot on the Back up button while songs exist only on this device. */
function markUnprotected() {
  const real = store.songs.filter((s) => !s.readonly && String(s.body || "").trim().length >= 20).length;
  let fileAt = "";
  try { fileAt = localStorage.getItem("sonata_backup_at") || ""; } catch { /* ignore */ }
  const safe = Boolean(app.drive?.signedIn) || Boolean(fileAt);
  $("accountBtn").toggleAttribute("data-unprotected", real >= 3 && !safe);
}

/**
 * Work that can wait until the first screen is up: a restore point of the library as it was when
 * the app opened, a gentle backup reminder, and the first-visit tour.
 */
function afterBoot() {
  const idle = /** @type {any} */ (window).requestIdleCallback || ((/** @type {() => void} */ fn) => setTimeout(fn, 1200));
  idle(async () => {
    markUnprotected();
    const real = store.songs.filter((s) => !s.readonly && String(s.body || "").trim().length >= 20).length;
    if (real && !storageBlocked) {
      try { (await import("./core/snapshots.js")).autoSnapshot(store.snapshot()); } catch { /* no IndexedDB */ }
    }
    try {
      // Reminder: three or more songs, no Drive, and no backup file in the last two weeks. At most once a week.
      const day = 86400000;
      const last = Date.parse(localStorage.getItem("sonata_backup_at") || "") || 0;
      const nudged = Number(localStorage.getItem("sonata_backup_nudged") || 0);
      if (real >= 3 && !app.drive?.signedIn && Date.now() - last > 14 * day && Date.now() - nudged > 7 * day) {
        localStorage.setItem("sonata_backup_nudged", String(Date.now()));
        toast(t("backupNudge", "Your {n} songs are saved on this device only. Back them up so you never lose them.", { n: real }), "info", { ms: 12000, action: t("backup", "Back up"), onAction: () => openBackup() });
      }
      // First visit: offer the one-minute tour (never during automated tests, and never twice).
      const first = !localStorage.getItem("sonata_tour_seen") && !store.songs.length;
      const forced = new URLSearchParams(location.search).has("tour");
      if (forced || (first && !navigator.webdriver && !isStageOpen() && !/** @type {HTMLDialogElement} */ ($("sheet")).open)) {
        if (forced) history.replaceState(history.state, "", location.pathname);
        startTour();
      }
    } catch { /* storage blocked */ }
  }, { timeout: 2500 });
}

function registerServiceWorker() {
  // Local tests can opt in with ?sw to check offline use; normal local runs stay without a worker.
  const localTest = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("sw");
  if (!("serviceWorker" in navigator) || (location.protocol !== "https:" && !localTest)) return;
  const update = registerSW({
    onNeedRefresh() {
      toast(t("updateReady", "A new version of Sonata is ready."), "info", { ms: 15000, action: t("reload", "Reload"), onAction: () => { store.flush(); update(true); } });
    },
    onOfflineReady() {
      toast(t("offlineReady", "Sonata now works offline on this device."), "success", { ms: 3500 });
    },
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while the app stays open (stage tablets).
      if (reg) setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}); }, 60 * 60 * 1000);
    }
  });
}

/** Open whatever the address bar says. */
function route() {
  const r = parsePath(location.pathname);
  if (r.view === "set") { history.replaceState(null, "", "/songs"); show("songs"); import("./ui/liveset.js").then((m) => m.openLiveSet(r.raw)); return; }
  if (r.view === "bank") { show("bank", { sub: r.raw, replace: true }); return; }
  if (r.view === "chords") { show("chords", { sub: r.raw, replace: true }); return; }
  let view = /** @type {View} */ (SECTIONS.includes(r.view) ? r.view : "");
  if (!view) {
    // First visit: the song list with a welcome. Later: wherever you left off.
    const fallback = store.songs.length ? "editor" : "songs";
    try { view = /** @type {View} */ (localStorage.getItem("sonata_active_view") || fallback); } catch { view = fallback; }
    if (/** @type {string} */ (view) === "library") view = "songs";
    if (/** @type {string} */ (view) === "tools") view = "editor";
    if (!SECTIONS.includes(view)) view = fallback;
  }
  if (r.slug) {
    const song = findSong(store.songs, r.slug);
    if (song) { if (store.activeId !== song.id) store.open(song.id); }
    else { toast(t("songNotHere", "That song isn't saved on this device."), "info", { ms: 5000 }); view = "songs"; r.stage = false; }
  }
  if (r.stage && !linkSong()) r.stage = false;
  show(view, { sub: r.sub, replace: true });
  if (r.stage) { if (!isStageOpen()) openStage(); }
  else if (isStageOpen()) closeStage();
  syncUrl("replace");
}

async function boot() {
  store.load();
  setLang(store.settings.language);
  applyI18n();
  paintIcons();
  applyTheme();
  initSelectMenus();

  app.show = show;
  app.openStage = openStage;
  app.loadDrive = loadDrive;
  app.refresh = () => renderView(app.view);
  initEditor();
  initLibrary();

  document.querySelectorAll("button[data-view]").forEach((b) => {
    const view = /** @type {View} */ (/** @type {HTMLElement} */ (b).dataset.view);
    b.addEventListener("click", () => show(view));
    // Start fetching a screen as the finger or pointer reaches its tab, so it is there by the tap.
    const warm = () => { if (view === "play") loadPlay(); else if (view === "theory") loadTheory(); else if (view === "chords" && !lazy.chords) chordsModule(); };
    b.addEventListener("pointerenter", warm, { passive: true });
    b.addEventListener("touchstart", warm, { passive: true });
    b.addEventListener("focus", warm);
  });
  document.querySelector(".brand")?.addEventListener("click", (e) => { e.preventDefault(); show("songs"); });
  window.addEventListener("popstate", () => route());
  store.on("song-open", () => { if (app.view === "editor" || isStageOpen()) syncUrl("replace"); });
  store.on("change", (/** @type {string} */ kind) => {
    if (kind !== "library" || app.view !== "editor") return;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => syncUrl("replace"), 700);
  });
  $("presentBtn").addEventListener("click", () => openStage());
  $("presentBtn").addEventListener("pointerenter", () => { loadStage(); }, { passive: true });
  $("addLinksBtn").addEventListener("click", () => openLinksImport());
  // Pasting Sonata links into the song search offers to add them.
  $("librarySearch").addEventListener("paste", (e) => {
    const text = /** @type {ClipboardEvent} */ (e).clipboardData?.getData("text") || "";
    if (/^\s*https?:\/\/\S+\s*$/i.test(text) || /https?:\/\/\S+(\?s=|\/q\/)/i.test(text)) { e.preventDefault(); openLinksImport(text.trim()); }
  });
  app.onChordChange = () => { if (app.view === "chords") syncUrl("replace"); };
  if (store.bank.fileId) bankModule().then((m) => m?.watchBank());
  $("settingsBtn").addEventListener("click", () => openSettings());
  $("accountBtn").addEventListener("click", () => openBackup());
  $("helpBtn").addEventListener("click", () => openHelp());
  $("themeBtn").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    store.settings.theme = now;
    store.changed("settings");
  });
  store.on("change", (/** @type {string} */ kind) => {
    if (kind !== "settings") return;
    applyTheme();
  });
  dark.addEventListener("change", () => { if (store.settings.theme === "system") applyTheme(); });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); store.persist(); toast(t("savedNow", "Saved"), "success", { ms: 1400 }); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && app.view === "editor") { e.preventDefault(); openStage(); }
    // "?" opens Help anywhere except while typing.
    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !isStageOpen() && !/** @type {HTMLDialogElement} */ ($("sheet")).open) {
      const el = /** @type {HTMLElement} */ (e.target);
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); openHelp(); }
    }
  });
  window.addEventListener("pagehide", () => store.flush());
  // Offline is fine for Sonata; say it once so nobody wonders why a link or sync waits.
  window.addEventListener("offline", () => toast(t("offlineNote", "You're offline. Songs still save on this device."), "info", { ms: 4000 }));
  window.addEventListener("online", () => { if (app.drive?.token) toast(t("onlineNote", "Back online. Syncing…"), "info", { ms: 2500 }); });
  // Another tab saved: pick up its changes when this tab has nothing unsaved.
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith("sonata:v12:") || store.dirty) return;
    const active = store.activeId;
    store.load();
    if (active && store.song(active)) store.activeId = active;
    store.emit("change", "library");
    store.emit("song-open", store.active());
  });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); /** @type {any} */ (app).installPrompt = e; });

  onDriveStatus("signed-out");
  // Earlier versions kept the Google access token in localStorage; make sure none is left behind.
  try { localStorage.removeItem("sonata_google_token"); localStorage.removeItem("sonata_google_token_expiry"); } catch { /* ignore */ }
  // Drive loads now only for someone who has signed in before; everyone else gets it when they open Backup.
  let usesDrive = false;
  try { usesDrive = Boolean(localStorage.getItem("sonata_user_profile") || localStorage.getItem("sonata_drive_file_id") || sessionStorage.getItem("sonata_google_token")); } catch { /* ignore */ }
  if (usesDrive) loadDrive();

  const opened = await handleShareLink();
  if (!opened) route();
  if (storageBlocked) toast(t("storageBlocked", "This browser blocks storage, so songs are kept only until you close this tab. Export a backup in Settings to keep them."), "error", { ms: 9000 });
  renderRecent();
  // Live setlists: keep the ones this device publishes current, and check the ones it follows.
  if (store.setlists.some((s) => s.liveId || s.source)) import("./ui/liveset.js").then((m) => { m.watchLiveSets(); setTimeout(() => m.refreshFollowed(), 3000); });
  // Shared into Sonata from another app (manifest share_target): a link or some text arrives in the address.
  const sharedIn = new URLSearchParams(location.search);
  const sharedText = [sharedIn.get("url"), sharedIn.get("text")].filter(Boolean).join("\n").trim();
  if (!opened && sharedText) { history.replaceState(history.state, "", location.pathname); show("songs"); openLinksImport(sharedText.slice(0, 60000)); }
  // A chart file opened with Sonata (manifest file_handlers).
  /** @type {any} */ (window).launchQueue?.setConsumer(async (/** @type {any} */ launch) => {
    const handle = launch?.files?.[0];
    if (!handle) return;
    try { const f = await handle.getFile(); if (f.size <= 512 * 1024) { show("songs"); openLinksImport(await f.text()); } } catch { /* unreadable file */ }
  });
  // Home-screen shortcut "New song" (manifest shortcuts) opens /songs?new=1.
  if (!opened && new URLSearchParams(location.search).has("new")) { history.replaceState(history.state, "", location.pathname); newSong(); }
  store.emit("song-open", store.active());

  fetch("/version.json", { cache: "no-cache" }).then((r) => r.json()).then((v) => { /** @type {any} */ (app).version = v.version; }).catch(() => {});
  registerServiceWorker();
  // Test hook for the local browser tests only; never on the published site.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) /** @type {any} */ (window).__sonata = { store, app, renderPlay: () => lazy.play?.renderPlay(), loadPlay, loadTheory, loadStage, loadDrive, startTour };
  afterBoot();
  // Caches from the hand-written service worker (v2 and older) are replaced by Workbox's.
  if ("caches" in window) caches.keys().then((keys) => keys.filter((k) => /^sonata-(cache-|v\d|fonts$)/.test(k)).forEach((k) => caches.delete(k))).catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", `<p class="boot-error">Sonata couldn't start. Please reload the page.</p>`);
});
