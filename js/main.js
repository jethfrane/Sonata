// @ts-check
// Boot: load the library, wire the views, handle shared links and offline.
import { $, $$, paintIcons, setIcon, toast, esc } from "./ui/dom.js";
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
import { initStage, openStage } from "./ui/stage.js";
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
  root.style.setProperty("--chart-size", `${s.previewFontSize}px`);
  root.style.setProperty("--chart-line", String(s.editorLineHeight));
  setIcon(/** @type {HTMLElement} */ ($("themeBtn").firstElementChild), theme === "dark" ? "sun" : "moon");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", theme === "dark" ? "#0b0f17" : "#f4f6fa"));
}

/** @param {View} view */
function show(view) {
  if (!VIEWS.includes(view)) view = "editor";
  if (app.view === "play" && view !== "play") stopTuner();
  app.view = view;
  $("app").dataset.view = view;
  $$("[data-view]").forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle("active", on);
    if (b.getAttribute("role") === "tab") b.setAttribute("aria-selected", String(on));
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  try { localStorage.setItem("sonata_active_view", view); } catch { /* ignore */ }
  renderView(view);
  window.scrollTo({ top: 0 });
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

  $$("[data-view]").forEach((b) => b.addEventListener("click", () => show(/** @type {View} */ (b.dataset.view))));
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
  if (!store.songs.length && !opened) {
    store.createSong({});
  }
  if (!opened) {
    let saved = /** @type {View} */ ("editor");
    try { saved = /** @type {View} */ (localStorage.getItem("sonata_active_view") || "editor"); } catch { /* ignore */ }
    if (/** @type {string} */ (saved) === "library") saved = "songs";
    if (/** @type {string} */ (saved) === "instruments") saved = "play";
    show(saved);
  }
  store.emit("song-open", store.active());

  fetch("version.json", { cache: "no-cache" }).then((r) => r.json()).then((v) => { /** @type {any} */ (app).version = v.version; }).catch(() => {});
  initMascot();
  registerServiceWorker();
  // Old builds unregistered every service worker; clear their leftover caches once.
  if ("caches" in window) caches.keys().then((keys) => keys.filter((k) => k.startsWith("sonata-cache-")).forEach((k) => caches.delete(k))).catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", `<p class="boot-error">Sonata couldn't start. Please reload the page.</p>`);
});
