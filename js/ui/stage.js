// @ts-check
import { $, esc, setIcon, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, metronome, soundingKey, shapeKey, renderOptions, nudgeTranspose, tick } from "./ctx.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { keyShort, pretty } from "../core/music.js";
import { syncMetroButton } from "./tools.js";
import { stepSetlist } from "./editor.js";

const THEMES = ["stage", "dark", "light"];
let open = false;
let scrolling = false;
let raf = 0;
let last = 0;
let pausedUntil = 0;
/** @type {ReturnType<typeof setTimeout>|undefined} */
let hideTimer;
/** @type {any} */
let wakeLock = null;
/** @type {string} */
let mode = "chords";

const stage = () => $("stage");
const scroller = () => $("stageScroll");

export function initStage() {
  $("stageExit").addEventListener("click", closeStage);
  $("stagePrev").addEventListener("click", () => stepSetlist(-1));
  $("stageNext").addEventListener("click", () => stepSetlist(1));
  $("stageKeyDown").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), -1); });
  $("stageKeyUp").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), 1); });
  $("stageFontDown").addEventListener("click", () => font(-4));
  $("stageFontUp").addEventListener("click", () => font(4));
  $("stageMode").addEventListener("change", (e) => { mode = /** @type {HTMLSelectElement} */ (e.target).value; renderStage(); });
  $("stageScrollBtn").addEventListener("click", () => toggleScroll());
  $("stageSpeed").addEventListener("input", (e) => { store.settings.autoScrollSpeed = Number(/** @type {HTMLInputElement} */ (e.target).value); store.changed("settings"); });
  $("stageMetroBtn").addEventListener("click", () => { metronome.toggle(); syncMetroButton(); });
  $("stageThemeBtn").addEventListener("click", () => {
    const i = (THEMES.indexOf(store.settings.presTheme) + 1) % THEMES.length;
    store.settings.presTheme = THEMES[i];
    stage().dataset.theme = THEMES[i];
    store.changed("settings");
  });
  // Tap the chart to show or hide the controls; scrolling by hand pauses auto-scroll.
  let downY = 0, moved = false;
  scroller().addEventListener("pointerdown", (e) => { downY = e.clientY; moved = false; pausedUntil = performance.now() + 1500; });
  scroller().addEventListener("pointermove", (e) => { if (Math.abs(e.clientY - downY) > 8) moved = true; });
  scroller().addEventListener("pointerup", (e) => {
    if (moved || /** @type {HTMLElement} */ (e.target).closest("button,select,input,a")) return;
    stage().classList.toggle("chrome-hidden");
  });
  scroller().addEventListener("wheel", () => { pausedUntil = performance.now() + 1500; }, { passive: true });
  stage().addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") wake(); });
  document.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && open && stage().dataset.fs === "1") { stage().dataset.fs = ""; } });
  document.addEventListener("visibilitychange", () => { if (open && document.visibilityState === "visible") lockScreen(); });
  app.beatListeners.add((b) => {
    const el = $("stageBeat");
    el.classList.remove("on", "down");
    void el.offsetWidth;
    el.classList.add("on");
    if (b === 0) el.classList.add("down");
  });
  store.on("change", () => { if (open) renderStage(); });
  store.on("song-open", () => { if (open) { scroller().scrollTop = 0; renderStage(); } });
  store.on("setlist", () => { if (open) renderStage(); });
}

/** @param {KeyboardEvent} e */
function onKey(e) {
  if (!open) return;
  const tag = /** @type {HTMLElement} */ (e.target).tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (e.key === "Escape") { e.preventDefault(); closeStage(); }
  else if (e.key === " ") { e.preventDefault(); toggleScroll(); }
  else if (e.key === "ArrowRight" || e.key === "PageDown" && !scrolling) { if (store.currentSetlist()) { e.preventDefault(); stepSetlist(1); } }
  else if (e.key === "ArrowLeft") { if (store.currentSetlist()) { e.preventDefault(); stepSetlist(-1); } }
  else if (e.key === "ArrowUp" && scrolling) { e.preventDefault(); speed(5); }
  else if (e.key === "ArrowDown" && scrolling) { e.preventDefault(); speed(-5); }
  else if (e.key === "]" || e.key === "=") font(4);
  else if (e.key === "[" || e.key === "-") font(-4);
}

/** @param {number} d */
function speed(d) {
  store.settings.autoScrollSpeed = Math.max(5, Math.min(180, store.settings.autoScrollSpeed + d));
  /** @type {HTMLInputElement} */ ($("stageSpeed")).value = String(store.settings.autoScrollSpeed);
  store.changed("settings");
}

/** @param {number} d */
function font(d) {
  store.settings.presentationFontSize = Math.max(18, Math.min(120, store.settings.presentationFontSize + d));
  stage().style.setProperty("--stage-font", `${store.settings.presentationFontSize}px`);
  store.changed("settings");
}

function wake() {
  stage().classList.remove("chrome-hidden");
  clearTimeout(hideTimer);
  if (scrolling) hideTimer = setTimeout(() => stage().classList.add("chrome-hidden"), 3500);
}

async function lockScreen() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await /** @type {any} */ (navigator).wakeLock.request("screen"); wakeLock.addEventListener?.("release", () => { wakeLock = null; }); } } catch { wakeLock = null; }
}

/** @type {((on: boolean) => void)|null} */
let stageListener = null;
export const isStageOpen = () => open;
/** @param {(on: boolean) => void} fn */
export function onStageChange(fn) { stageListener = fn; }

export function openStage() {
  const s = store.active();
  if (!s) return;
  open = true;
  mode = store.settings.viewMode;
  /** @type {HTMLSelectElement} */ ($("stageMode")).value = mode;
  /** @type {HTMLInputElement} */ ($("stageSpeed")).value = String(store.settings.autoScrollSpeed);
  stage().dataset.theme = store.settings.presTheme;
  stage().style.setProperty("--stage-font", `${store.settings.presentationFontSize}px`);
  stage().hidden = false;
  stage().classList.remove("chrome-hidden");
  document.body.classList.add("stage-open");
  scroller().scrollTop = 0;
  if (s.bpm && !metronome.running) metronome.setBpm(s.bpm);
  renderStage();
  paintIcons(stage());
  const el = /** @type {any} */ (stage());
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && matchMedia("(pointer: coarse)").matches === false) {
    try { const p = req.call(el); stage().dataset.fs = "1"; if (p?.catch) p.catch(() => {}); } catch { /* not allowed */ }
  }
  lockScreen();
  scroller().focus({ preventScroll: true });
  stageListener?.(true);
}

export function closeStage() {
  if (!open) return;
  open = false;
  stopScroll();
  stage().hidden = true;
  document.body.classList.remove("stage-open");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
  stageListener?.(false);
}

function renderStage() {
  const s = store.active();
  if (!s) return;
  $("stageTitle").textContent = s.title;
  const k = soundingKey(s);
  const meta = [s.artist, s.capo ? t("capoShapes", "Capo {n} · {key} shapes", { n: s.capo, key: pretty(keyShort(shapeKey(s))) }) : ""].filter(Boolean).join(" · ");
  $("stageMeta").textContent = meta;
  $("stageKey").textContent = pretty(keyShort(k));
  $("stageBpm").textContent = String(metronome.bpm);
  const cur = store.currentSetlist();
  $("stageSetNav").hidden = !cur;
  if (cur) {
    $("stageCount").textContent = `${cur.index + 1}/${cur.songs.length}`;
    /** @type {HTMLButtonElement} */ ($("stagePrev")).disabled = cur.index <= 0;
    /** @type {HTMLButtonElement} */ ($("stageNext")).disabled = cur.index >= cur.songs.length - 1;
  }
  $("stageChart").innerHTML = s.body.trim()
    ? linesToHtml(buildLines(s.body, renderOptions(s, /** @type {any} */ (mode))))
    : `<p class="chart-empty">${esc(t("stageEmpty", "This song has no chart yet."))}</p>`;
}

function toggleScroll() { scrolling ? stopScroll() : startScroll(); }

function startScroll() {
  scrolling = true;
  setIcon($("stageScrollBtn"), "pause");
  $("stageScrollBtn").classList.add("on");
  last = performance.now();
  let carry = 0;
  const step = (/** @type {number} */ now) => {
    if (!scrolling) return;
    const dt = Math.min(100, now - last) / 1000;
    last = now;
    const el = scroller();
    if (now > pausedUntil) {
      carry += store.settings.autoScrollSpeed * dt;
      const px = Math.floor(carry);
      if (px) { el.scrollTop += px; carry -= px; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { stopScroll(); return; }
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  wake();
}

function stopScroll() {
  scrolling = false;
  cancelAnimationFrame(raf);
  setIcon($("stageScrollBtn"), "play");
  $("stageScrollBtn").classList.remove("on");
  wake();
}
