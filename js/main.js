// @ts-check
// Boot: load the library, wire the views, handle shared links and offline.
import { $, paintIcons, setIcon, toast, esc } from "./ui/dom.js";
import { t, setLang, applyI18n } from "./ui/i18n.js";
import { store, app, metronome } from "./ui/ctx.js";
import { keepAlive } from "./audio.js";
import { Drive } from "./drive.js";
import { decodeShare, unpackSong } from "./core/share.js";
import { initEditor, refreshEditor } from "./ui/editor.js";
import { initLibrary, renderLibrary } from "./ui/library.js";
import { initTools, renderTools } from "./ui/tools.js";
import { initTheory, renderTheory } from "./ui/theory.js";
import { initPlay, renderPlay } from "./ui/play.js";
import { stopTuner } from "./ui/tuner.js";
import { initStage, openStage, closeStage, isStageOpen, onStageChange } from "./ui/stage.js";
import { parsePath, buildPath, findSong, PAGE_META, SECTIONS } from "./router.js";
import { setInstrument, currentInstrument } from "./ui/play.js";
import { initMascot } from "./ui/mascot.js";
import { openSettings, openAccount, openImportSet } from "./ui/sheets.js";

/** @typedef {import("./ui/ctx.js").View} View */
const VIEWS = /** @type {View[]} */ (["songs", "editor", "tools", "theory", "play"]);
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
  return buildPath({ view: app.view, song: linkSong(), sub: app.view === "play" ? currentInstrument() : "", stage });
}

let titleTimer = /** @type {any} */ (0);
function setTitle() {
  const song = linkSong();
  const meta = /** @type {any} */ (PAGE_META)[app.view] || PAGE_META.songs;
  const base = app.view === "editor" && song ? song.title || "Untitled" : meta[0];
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
  if (app.view === "play" && view !== "play") stopTuner();
  app.view = view;
  $("app").dataset.view = view;
  $("app").dataset.ready = "1";
  document.querySelectorAll("button[data-view]").forEach((b) => {
    const el = /** @type {HTMLElement} */ (b);
    const on = el.dataset.view === view;
    el.classList.toggle("active", on);
    if (el.getAttribute("role") === "tab") el.setAttribute("aria-selected", String(on));
    if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  try { localStorage.setItem("sonata_active_view", view); } catch { /* ignore */ }
  const subChanged = view === "play" && Boolean(opts.sub) && opts.sub !== currentInstrument();
  if (view === "play" && opts.sub) setInstrument(opts.sub);
  renderView(view);
  syncUrl(opts.replace || first || (!changed && !subChanged) ? "replace" : "push");
  // Only a real change of screen goes back to the top, never a tap inside one.
  if (changed) window.scrollTo({ top: 0 });
}

/** @param {View} view */
function renderView(view) {
  if (view === "songs") renderLibrary();
  if (view === "editor") refreshEditor();
  if (view === "tools") renderTools();
  if (view === "theory") renderTheory();
  if (view === "play") renderPlay();
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
  btn.setAttribute("aria-label", `Google Drive: ${text}`);
  dot.hidden = status === "signed-out" || status === "synced";
  dot.dataset.status = status;
  store.emit("drive-status", status);
}

async function handleShareLink() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("s") || params.get("share");
  if (!raw) return false;
  history.replaceState(null, "", location.pathname);
  const data = await decodeShare(raw);
  if (!data) { toast(t("badLink", "This link couldn't be opened. It may be cut off."), "error", { ms: 5000 }); return false; }
  if (data.type === "set") { show("songs"); openImportSet(data); return true; }
  // Already saved? open it; otherwise preview read-only with a Save button.
  const u = unpackSong(data);
  const same = store.songs.find((s) => s.title === u.title && s.body === u.body);
  if (same) store.open(same.id);
  else store.showShared(/** @type {any} */ ({ ...u, id: "shared", isFavorite: false, createdAt: "", updatedAt: "", lastOpenedAt: "" }));
  show("editor");
  return true;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) {
          toast(t("updateReady", "A new version of Sonata is ready."), "info", { ms: 12000, action: t("reload", "Reload"), onAction: () => location.reload() });
        }
      });
    });
  }).catch(() => { /* offline support is optional */ });
}

/** Open whatever the address bar says. */
function route() {
  const r = parsePath(location.pathname);
  let view = /** @type {View} */ (SECTIONS.includes(r.view) ? r.view : "");
  if (!view) {
    try { view = /** @type {View} */ (localStorage.getItem("sonata_active_view") || "editor"); } catch { view = "editor"; }
    if (/** @type {string} */ (view) === "library") view = "songs";
    if (!SECTIONS.includes(view)) view = "editor";
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
  keepAlive();

  app.show = show;
  app.openStage = openStage;
  app.refresh = () => renderView(app.view);
  initEditor();
  initLibrary();
  initTools();
  initTheory();
  initPlay();
  initStage();

  document.querySelectorAll("button[data-view]").forEach((b) => b.addEventListener("click", () => show(/** @type {View} */ (/** @type {HTMLElement} */ (b).dataset.view))));
  document.querySelector(".brand")?.addEventListener("click", (e) => { e.preventDefault(); show("songs"); });
  window.addEventListener("popstate", () => route());
  onStageChange((on) => {
    if (on) syncUrl("push", true);
    else if (/\/stage$/.test(location.pathname)) {
      if (history.state && history.state.stage) history.back(); else syncUrl("replace", false);
    }
    setTitle();
  });
  store.on("song-open", () => { if (app.view === "editor" || isStageOpen()) syncUrl("replace"); });
  store.on("change", (/** @type {string} */ kind) => {
    if (kind !== "library" || app.view !== "editor") return;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => syncUrl("replace"), 700);
  });
  $("presentBtn").addEventListener("click", () => openStage());
  $("settingsBtn").addEventListener("click", () => openSettings());
  $("accountBtn").addEventListener("click", () => openAccount());
  $("themeBtn").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    store.settings.theme = now;
    store.changed("settings");
  });
  store.on("change", (/** @type {string} */ kind) => {
    if (kind !== "settings") return;
    applyTheme();
    metronome.volume = store.settings.metronomeVolume;
  });
  dark.addEventListener("change", () => { if (store.settings.theme === "system") applyTheme(); });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); store.persist(); toast(t("savedNow", "Saved"), "success", { ms: 1400 }); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && app.view === "editor") { e.preventDefault(); openStage(); }
  });
  window.addEventListener("pagehide", () => store.flush());
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

  const drive = new Drive(store, onDriveStatus);
  app.drive = drive;
  onDriveStatus("signed-out");
  drive.init();

  const opened = await handleShareLink();
  if (!store.songs.length && !opened) store.createSong({});
  if (!opened) route();
  store.emit("song-open", store.active());

  fetch("/version.json", { cache: "no-cache" }).then((r) => r.json()).then((v) => { /** @type {any} */ (app).version = v.version; }).catch(() => {});
  initMascot();
  registerServiceWorker();
  // Old builds unregistered every service worker; clear their leftover caches once.
  if ("caches" in window) caches.keys().then((keys) => keys.filter((k) => k.startsWith("sonata-cache-")).forEach((k) => caches.delete(k))).catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", `<p class="boot-error">Sonata couldn't start. Please reload the page.</p>`);
});
