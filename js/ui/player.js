// @ts-check
// The reference-video player. It floats above every screen, so a video keeps playing while you
// move between songs, the chart, chords and tools. Two sizes: full (video with every control) and
// mini (a small video beside back, play, forward, expand and close). The video is YouTube's privacy-enhanced
// player in a frame; it is driven with the frame's own message protocol, so no YouTube script
// runs in Sonata. The picture always stays visible: YouTube does not allow sound-only playback.
import "../../css/player.css";
import { esc, icon } from "./dom.js";
import { t } from "./i18n.js";
import { app } from "./ctx.js";

const YT = "https://www.youtube-nocookie.com";
const RATES = [1, 0.75, 0.5];
/** Seconds the back and forward buttons move: short enough to replay one line or chord change. */
const SKIP = 5;
const MODE_KEY = "sonata:v12:player-mode";

/** @type {HTMLElement|null} */
let box = null;
/** @type {HTMLIFrameElement|null} */
let frame = null;
/** What is loaded, and what the player last told us about it. */
const now = { id: "", name: "", playing: false, time: 0, duration: 0, rate: 1, heard: false };
/** True while the person drags the position slider (so incoming time doesn't fight the thumb). */
let seeking = false;
let hello = 0;
/** @type {ResizeObserver|null} */
let sizer = null;

/** The shared, readable state other screens paint from (the link chip under a chart). */
const media = () => /** @type {any} */ (app).media || (/** @type {any} */ (app).media = { id: "", playing: false });
function announce() {
  const m = media();
  m.id = now.id; m.playing = now.playing;
  document.dispatchEvent(new CustomEvent("sonata:media"));
}

/** @param {string} func @param {any[]} [args] */
function send(func, args = []) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT);
}

/** @param {number} s */
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return `${m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`; };

/** The size last chosen. Until someone chooses, phones start with the mini player so the chart stays in view. */
function getMode() {
  let saved = null;
  try { saved = localStorage.getItem(MODE_KEY); } catch { /* storage blocked */ }
  return saved === "mini" || saved === "full" ? saved : innerWidth < 760 ? "mini" : "full";
}
/** @param {"mini"|"full"} m */
function setMode(m) {
  if (!box) return;
  box.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ }
  paint();
}

/** The player's own controls, looked up once per build. @type {Record<string, any>} */
let ui = {};
/** What each control last showed. The video reports its position several times a second; only a change is drawn. */
/** @type {{ playing: boolean|null, mini: boolean|null, rate: number, clock: string, max: number, sec: number, can: boolean|null }} */
let drawn = { playing: null, mini: null, rate: 0, clock: "", max: -1, sec: -1, can: null };

/** Refresh the labels and buttons from `now` without touching the video. */
function paint() {
  if (!box || !ui.play) return;
  const mini = box.dataset.mode === "mini";
  if (drawn.playing !== now.playing) {
    drawn.playing = now.playing;
    ui.play.innerHTML = icon(now.playing ? "pause" : "play");
    ui.play.title = now.playing ? t("pause", "Pause") : t("play", "Play");
    ui.play.setAttribute("aria-label", ui.play.title);
  }
  const sec = Math.floor(now.time), dur = Math.floor(now.duration);
  if (drawn.sec !== sec || drawn.max !== dur) {
    const text = now.duration ? `${clock(now.time)} / ${clock(now.duration)}` : "";
    if (drawn.clock !== text) { drawn.clock = text; ui.time.textContent = text; }
    if (drawn.can !== Boolean(dur)) { drawn.can = Boolean(dur); ui.seek.disabled = !dur; }
    if (drawn.max !== dur) { drawn.max = dur; ui.seek.max = String(Math.max(1, dur)); }
    drawn.sec = sec;
    if (!seeking) ui.seek.value = String(sec);
    ui.seek.setAttribute("aria-valuetext", clock(Number(ui.seek.value)));
    ui.seek.style.setProperty("--done", dur ? `${(Number(ui.seek.value) / dur) * 100}%` : "0%");
  } else if (seeking) {
    ui.seek.setAttribute("aria-valuetext", clock(Number(ui.seek.value)));
    ui.seek.style.setProperty("--done", dur ? `${(Number(ui.seek.value) / dur) * 100}%` : "0%");
  }
  if (drawn.rate !== now.rate) {
    drawn.rate = now.rate;
    ui.rate.textContent = `${now.rate}×`;
    ui.rate.classList.toggle("on", now.rate !== 1);
    ui.rate.setAttribute("aria-label", t("mpSpeed", "Speed {n}×. Tap to change.", { n: now.rate }));
  }
  if (drawn.mini !== mini) {
    drawn.mini = mini;
    ui.size.innerHTML = icon(mini ? "grow" : "shrink");
    ui.size.title = mini ? t("mpExpand", "Bigger player") : t("mpMini", "Mini player");
    ui.size.setAttribute("aria-label", ui.size.title);
  }
}

/** Messages from the video frame: where it is, whether it is playing. @param {MessageEvent} e */
function onMessage(e) {
  if (e.origin !== YT || !frame || e.source !== frame.contentWindow) return;
  let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
  const info = d?.info;
  if (!info || typeof info !== "object") return;
  if (!now.heard) { now.heard = true; clearInterval(hello); }
  const was = now.playing;
  if (typeof info.currentTime === "number") now.time = info.currentTime;
  if (typeof info.duration === "number" && info.duration > 0) now.duration = info.duration;
  if (typeof info.playbackRate === "number") now.rate = info.playbackRate;
  // 1 playing, 3 buffering; everything else (paused, ended, not started) shows Play.
  if (typeof info.playerState === "number") now.playing = info.playerState === 1 || info.playerState === 3;
  // A hidden tab has nothing to draw; the next message after it comes back catches up.
  if (!document.hidden) paint();
  if (was !== now.playing) announce();
}

function build() {
  box = document.createElement("aside");
  box.className = "mp";
  box.id = "mediaPlayer";
  box.dataset.mode = getMode();
  box.setAttribute("aria-label", t("refVideo", "Reference video"));
  box.innerHTML = `<div class="mp-video" id="mpVideo"></div>
    <div class="mp-body">
      <div class="mp-head"><strong class="mp-name" id="mpName"></strong><span class="mp-time" id="mpTime" aria-live="off"></span></div>
      <input class="mp-seek" id="mpSeek" type="range" min="0" max="1" step="1" value="0" disabled aria-label="${esc(t("mpPosition", "Position in the video"))}">
      <div class="mp-ctrl">
        <button type="button" class="mp-btn mp-skip" id="mpBack" aria-label="${esc(t("mpBack", "Back 5 seconds"))}" title="${esc(t("mpBack", "Back 5 seconds"))}">${icon("back5")}</button>
        <button type="button" class="mp-btn mp-play" id="mpPlay"></button>
        <button type="button" class="mp-btn mp-skip" id="mpFwd" aria-label="${esc(t("mpFwd", "Forward 5 seconds"))}" title="${esc(t("mpFwd", "Forward 5 seconds"))}">${icon("fwd5")}</button>
        <button type="button" class="mp-btn mp-rate" id="mpRate" title="${esc(t("mpSpeedTitle", "Playback speed"))}"></button>
        <span class="mp-gap"></span>
        <a class="mp-btn mp-out" id="mpOut" target="_blank" rel="noopener noreferrer" aria-label="${esc(t("openYoutube", "Open in YouTube"))}" title="${esc(t("openYoutube", "Open in YouTube"))}">${icon("external")}</a>
        <button type="button" class="mp-btn" id="mpSize"></button>
        <button type="button" class="mp-btn" id="mpClose" aria-label="${esc(t("mpClose", "Close player"))}" title="${esc(t("mpClose", "Close player"))}">${icon("x")}</button>
      </div>
    </div>`;
  document.body.append(box);
  const q = (/** @type {string} */ id) => /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (box).querySelector(id));
  ui = { play: q("#mpPlay"), time: q("#mpTime"), seek: q("#mpSeek"), rate: q("#mpRate"), size: q("#mpSize"), name: q("#mpName"), out: q("#mpOut"), video: q("#mpVideo") };
  drawn = { playing: null, mini: null, rate: 0, clock: "", max: -1, sec: -1, can: null };
  box.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.id === "mpPlay") { send(now.playing ? "pauseVideo" : "playVideo"); now.playing = !now.playing; paint(); announce(); }
    if (b.id === "mpBack" || b.id === "mpFwd") { now.time = Math.max(0, Math.min(now.duration || Infinity, now.time + (b.id === "mpBack" ? -SKIP : SKIP))); send("seekTo", [now.time, true]); paint(); }
    if (b.id === "mpRate") { now.rate = RATES[(RATES.indexOf(now.rate) + 1) % RATES.length] || 1; send("setPlaybackRate", [now.rate]); paint(); }
    if (b.id === "mpSize") setMode(box?.dataset.mode === "mini" ? "full" : "mini");
    if (b.id === "mpClose") closePlayer();
  });
  const seek = /** @type {HTMLInputElement} */ (box.querySelector("#mpSeek"));
  seek.addEventListener("input", () => { seeking = true; now.time = Number(seek.value); paint(); });
  seek.addEventListener("change", () => { send("seekTo", [Number(seek.value), true]); seeking = false; });
  window.addEventListener("message", onMessage);
  // Leave room under the page for the player, so the last lines of a chart can scroll clear of it.
  sizer = new ResizeObserver(() => { if (box) document.documentElement.style.setProperty("--mp-h", `${box.offsetHeight}px`); });
  sizer.observe(box);
  document.documentElement.classList.add("mp-open");
}

/**
 * Play a video. The same video that is already loaded toggles play and pause instead.
 * @param {string} id YouTube video id @param {string} [name] what the link is called
 */
export function playVideo(id, name = "") {
  if (!/^[\w-]{11}$/.test(id)) return;
  if (now.id === id && box) { send(now.playing ? "pauseVideo" : "playVideo"); now.playing = !now.playing; paint(); announce(); return; }
  if (!box) build();
  const b = /** @type {HTMLElement} */ (box);
  Object.assign(now, { id, name, playing: true, time: 0, duration: 0, rate: 1, heard: false });
  /** @type {HTMLElement} */ (b.querySelector("#mpName")).textContent = name || t("refVideo", "Reference video");
  /** @type {HTMLAnchorElement} */ (b.querySelector("#mpOut")).href = `https://www.youtube.com/watch?v=${id}`;
  frame = document.createElement("iframe");
  frame.src = `${YT}/embed/${id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  frame.title = name || t("refVideo", "Reference video");
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  /** @type {HTMLElement} */ (b.querySelector("#mpVideo")).replaceChildren(frame);
  // Ask the frame to report its state. It only answers once its own player is up, so ask until it does.
  clearInterval(hello);
  let tries = 0;
  const f = frame;
  hello = window.setInterval(() => {
    if (now.heard || f !== frame || ++tries > 40) { clearInterval(hello); return; }
    f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "sonata", channel: "widget" }), YT);
  }, 500);
  paint();
  announce();
}

export function closePlayer() {
  if (!box) return;
  clearInterval(hello);
  window.removeEventListener("message", onMessage);
  sizer?.disconnect(); sizer = null;
  box.remove(); box = null; frame = null; ui = {};
  Object.assign(now, { id: "", name: "", playing: false });
  document.documentElement.classList.remove("mp-open");
  document.documentElement.style.removeProperty("--mp-h");
  announce();
}
