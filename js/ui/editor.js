// @ts-check
import { $, $$, esc, icon, toast, copyText, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, writtenKey, soundingKey, shapeKey, renderOptions, nudgeTranspose, signed, tick, findCopy, adoptShared } from "./ctx.js";
import { buildLines, linesToHtml, linesToText, uniqueChords } from "../core/chart.js";
import { keyShort, pretty, isChordLine, CHORD_TYPES, chordsForKey, parseChord, transposeChord, prefersFlats } from "../core/music.js";
import { openKeySheet, openDetails, openShare, openChordSheet } from "./sheets-lazy.js";
import { safeHref } from "../core/share.js";

export const DEMO_SONG = {
  title: "Auld Lang Syne",
  artist: "Traditional (Robert Burns, 1788)",
  creator: "",
  manualKey: "G:major",
  bpm: 84,
  description: "Demo song. Change the key, open Present, then make it yours or delete it.",
  links: [],
  body: `## Verse 1
G                 D
Should old acquaintance be forgot
    G              C
And never brought to mind
G                 D
Should old acquaintance be forgot
    Em    C     G
And auld lang syne

## Chorus
> Everyone in, full band
For [G]auld lang [D]syne, my dear
For [G]auld lang [C]syne
We'll [G]take a cup of [D]kindness yet
For [Em]auld [C]lang [G]syne

## Outro
G///  D///  Em///  C///
G  D  G
`
};

/** @type {Map<string, { undo: string[], redo: string[], last: string }>} */
const history = new Map();
/** @type {ReturnType<typeof setTimeout>|undefined} */
let historyTimer;
let renderQueued = false;

/** @param {string} id */
function hist(id) {
  let h = history.get(id);
  if (!h) { h = { undo: [], redo: [], last: store.song(id)?.body ?? "" }; history.set(id, h); }
  return h;
}

const body = () => /** @type {HTMLTextAreaElement} */ ($("songBody"));
const title = () => /** @type {HTMLInputElement} */ ($("songTitle"));

let barType = "triad";

/** The YouTube video id in a link, or "". @param {string} url */
export function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1] || "";
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}

/** The floating player loads the first time a video is opened, and outlives the song that started it. */
const player = () => import("./player.js");

export function initEditor() {
  // Show a fade on the right edge while a long line has more to scroll to.
  // Layout reads are batched to one per frame, so typing and scrolling don't force a layout each time.
  let edgeQueued = false;
  const edgeNow = () => { edgeQueued = false; const ta = body(); ta.closest(".pane-edit")?.classList.toggle("more-right", ta.scrollWidth - ta.clientWidth - ta.scrollLeft > 4); };
  const edge = () => { if (!edgeQueued) { edgeQueued = true; requestAnimationFrame(edgeNow); } };
  for (const ev of ["input", "scroll"]) body().addEventListener(ev, edge, { passive: true });
  window.addEventListener("resize", edge, { passive: true });
  store.on("song-open", edge);
  requestAnimationFrame(edge);
  // Start fetching the player (and its video host connection) as soon as a finger or pointer reaches a video chip.
  let warmed = false;
  $("songLinks").addEventListener("pointerover", (e) => {
    if (warmed || !/** @type {HTMLElement} */ (e.target).closest("[data-yt]")) return;
    warmed = true;
    player().catch(() => { warmed = false; });
    const l = document.createElement("link"); l.rel = "preconnect"; l.href = "https://www.youtube-nocookie.com"; document.head.append(l);
  }, { passive: true });
  $("songLinks").addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-yt]"));
    if (!b) return;
    try { (await player()).playVideo(b.dataset.yt || "", b.dataset.name || ""); }
    catch { toast(t("loadFailed", "Couldn't load this screen. Check your connection, or reload to get the latest version."), "error", { ms: 6000 }); }
  });
  // The player says when its video starts, pauses or closes; the link chip follows.
  document.addEventListener("sonata:media", () => paintLinkChips());
  // Tap a chord in the chart view to see its shapes and hear it.
  $("preview").addEventListener("click", (e) => {
    const c = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(".ch"));
    if (!c || store.settings.viewMode !== "chords") return;
    openChordSheet(c.textContent?.trim() || "");
  });
  title().addEventListener("input", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    store.update(s, { title: title().value });
    updateMeta();
  });
  title().addEventListener("blur", () => {
    const s = store.active();
    if (s && !s.readonly && !s.title.trim()) { store.update(s, { title: "Untitled" }); title().value = "Untitled"; }
  });
  body().addEventListener("input", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    const h = hist(s.id);
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => pushHistory(s.id, body().value), 500);
    h.redo = [];
    store.update(s, { body: body().value });
    autosize();
    followCaret();
    queueRender(true);
  });
  let sizeQueued = false;
  window.addEventListener("resize", () => { if (!sizeQueued) { sizeQueued = true; requestAnimationFrame(() => { sizeQueued = false; autosize(); }); } }, { passive: true });
  body().addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  });
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("keyDownBtn").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), -1); });
  $("keyUpBtn").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), 1); });
  $("keyPill").addEventListener("click", () => openKeySheet());
  $("detailsBtn").addEventListener("click", () => openDetails());
  $("shareSongBtn").addEventListener("click", () => openShare());
  $$("button[data-mode]").forEach((b) => b.addEventListener("click", () => {
    store.settings.viewMode = /** @type {any} */ (b.dataset.mode);
    store.changed("settings");
    refreshEditor();
  }));
  $$("button[data-pane]").forEach((b) => b.addEventListener("click", () => setPane(/** @type {string} */ (b.dataset.pane))));
  $$("#quickstart [data-insert]").forEach((b) => b.addEventListener("click", () => insertAtCursor(b.dataset.insert || "", true)));
  $("demoBtn").addEventListener("click", addDemo);
  $("copyChartBtn").addEventListener("click", async () => {
    const s = store.active();
    if (!s) return;
    const text = `${s.title}\n\n${linesToText(buildLines(s.body, renderOptions(s)))}`;
    if (await copyText(text)) toast(t("copied", "Copied"), "success");
  });
  $("saveSharedBtn").addEventListener("click", () => {
    const shared = store.shared;
    if (!shared) return;
    // A copy saved from this song before is brought up to date; the reader's key and capo stay.
    if (findCopy(shared)) {
      const { song } = adoptShared(/** @type {any} */ (shared));
      store.closeShared(); store.open(song.id);
      toast(t("copyUpdated", "Your copy is up to date. Your key and capo were kept."), "success", { ms: 4500 });
      return;
    }
    if (store.saveShared()) toast(t("savedNow", "Saved"), "success");
  });
  // The button says what it will do: save a new song, or update the copy already here.
  store.on("song-open", (/** @type {any} */ s) => {
    if (s?.readonly) $("saveSharedBtn").textContent = findCopy(s) ? t("updateCopy", "Update my copy") : t("saveToSongs", "Save to my songs");
  });
  $("closeSharedBtn").addEventListener("click", () => store.closeShared());
  $("setPrevBtn").addEventListener("click", () => stepSetlist(-1));
  $("setNextBtn").addEventListener("click", () => stepSetlist(1));
  $("setExitBtn").addEventListener("click", () => store.exitSetlist());
  try { barType = localStorage.getItem("sonata_bar_type") || "triad"; } catch { /* ignore */ }
  $("chordBar").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-chord]"));
    if (b) insertChord(toWritten(b.dataset.chord || ""));
  });
  $("chordBar").addEventListener("change", (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.id !== "barType") return;
    barType = el.value;
    try { localStorage.setItem("sonata_bar_type", barType); } catch { /* ignore */ }
    renderChordBar();
  });

  store.on("song-open", () => loadSong());
  store.on("setlist", () => updateSetlistBar());
  store.on("change", (/** @type {string} */ kind) => {
    if (kind === "library") { if (!store.active()?.readonly) setSaveState("saving"); queueRender(); }
    else refreshEditor();
  });
  store.on("saved", () => setSaveState("saved"));
  store.on("save-error", () => { setSaveState("error"); toast(t("saveFailed", "Couldn't save. This browser's storage is full."), "error", { ms: 6000 }); });
  let savedPane = "edit";
  try { savedPane = localStorage.getItem("sonata_mobile_editor_pane") === "preview" ? "preview" : "edit"; } catch { /* storage blocked */ }
  setPane(savedPane);
  loadSong();
}

const compact = matchMedia("(max-width: 960px)");

/** On phones and tablets the chart box grows with the text, so only the page scrolls. */
function autosize() {
  const ta = body();
  if (!compact.matches) { ta.style.height = ""; return; }
  // Measuring needs the box collapsed for a moment. That makes the page shorter, and the browser
  // answers by scrolling up; without putting the scroll back, typing near the bottom of a long
  // chart threw the page to the top on every key.
  const y = window.scrollY;
  ta.style.height = "auto";
  ta.style.height = `${Math.max(ta.scrollHeight + 2, 320)}px`;
  if (window.scrollY !== y) window.scrollTo({ top: y, behavior: "instant" });
}

/**
 * On phones and tablets the chart box does not scroll, the page does. So after typing, keep the
 * line being typed on screen: above the bottom tabs or the on-screen keyboard, below the toolbar.
 */
function followCaret() {
  const ta = body();
  if (!compact.matches || document.activeElement !== ta) return;
  const cs = getComputedStyle(ta);
  const lineH = parseFloat(cs.lineHeight) || 24;
  let line = 0;
  for (let i = ta.value.indexOf("\n"); i !== -1 && i < ta.selectionStart; i = ta.value.indexOf("\n", i + 1)) line++;
  const top = ta.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) + line * lineH;
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const nav = /** @type {HTMLElement|null} */ (document.querySelector(".bottom-nav"))?.getBoundingClientRect();
  const floor = Math.min(viewBottom, nav && nav.height ? nav.top : viewBottom) - 12;
  const bar = /** @type {HTMLElement|null} */ (document.querySelector(".editor-toolbar"))?.getBoundingClientRect();
  const ceiling = Math.max(viewTop, bar ? bar.bottom : 0) + 8;
  if (top + lineH > floor) window.scrollBy({ top: top + lineH - floor, behavior: "instant" });
  else if (top < ceiling) window.scrollBy({ top: top - ceiling, behavior: "instant" });
}

/** @param {string} pane */
function setPane(pane) {
  $("editorPanes").dataset.pane = pane;
  $("view-editor").dataset.pane = pane;
  // Only the Edit/View buttons; the section and pane box also carry data-pane for CSS.
  $$("button[data-pane]").forEach((b) => { const on = b.dataset.pane === pane; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  try { localStorage.setItem("sonata_mobile_editor_pane", pane); } catch { /* ignore */ }
  if (pane === "preview") renderPreview(); else requestAnimationFrame(autosize);
}

/** @param {string} id @param {string} value */
function pushHistory(id, value) {
  const h = hist(id);
  if (value === h.last) return;
  h.undo.push(h.last);
  if (h.undo.length > 100) h.undo.shift();
  h.last = value;
  updateHistoryButtons();
}

/** @param {"undo"|"redo"} dir */
function step(dir) {
  const s = store.active();
  if (!s || s.readonly) return;
  clearTimeout(historyTimer);
  pushHistory(s.id, body().value);
  const h = hist(s.id);
  const from = dir === "undo" ? h.undo : h.redo;
  const to = dir === "undo" ? h.redo : h.undo;
  const value = from.pop();
  if (value === undefined) return;
  to.push(h.last);
  h.last = value;
  body().value = value;
  store.update(s, { body: value });
  autosize();
  followCaret();
  updateHistoryButtons();
  queueRender();
}
const undo = () => step("undo");
const redo = () => step("redo");

function updateHistoryButtons() {
  const s = store.active();
  const h = s ? history.get(s.id) : null;
  /** @type {HTMLButtonElement} */ ($("undoBtn")).disabled = !h || !h.undo.length;
  /** @type {HTMLButtonElement} */ ($("redoBtn")).disabled = !h || !h.redo.length;
}

/** @param {"saving"|"saved"|"error"|"readonly"} state */
function setSaveState(state) {
  const el = $("saveState");
  el.dataset.state = state;
  el.textContent = state === "saving" ? t("saving", "Saving…") : state === "error" ? "!" : state === "readonly" ? t("readOnly", "Read only") : t("savedNow", "Saved");
}

/** Insert text at the cursor (or the end). @param {string} text @param {boolean} [onNewLine] */
export function insertAtCursor(text, onNewLine = false) {
  const ta = body();
  const s = store.active();
  if (!s || s.readonly) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  let before = ta.value.slice(0, start);
  if (onNewLine && before && !before.endsWith("\n")) before += "\n";
  ta.value = before + text + ta.value.slice(end);
  const pos = before.length + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event("input"));
}

/** On a lyric line insert [G]; on a chord line or blank line insert "G ". @param {string} chord */
function insertChord(chord) {
  const ta = body();
  const pos = ta.selectionStart ?? ta.value.length;
  const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
  const lineEnd = ta.value.indexOf("\n", pos);
  const line = ta.value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  tick();
  if (!line.trim() || isChordLine(line)) {
    const prev = ta.value.slice(lineStart, pos);
    insertAtCursor((prev && !/\s$/.test(prev) ? " " : "") + chord + " ");
  } else {
    insertAtCursor(`[${chord}]`);
  }
}

/** Add the demo, replacing a blank starter song so the library stays clean. */
export function addDemoSong() {
  // createSong drops any blank starter song (and remembers it as deleted).
  return store.createSong({ ...DEMO_SONG });
}

function addDemo() {
  const existing = store.songs.find((s) => s.title === DEMO_SONG.title && s.body === DEMO_SONG.body);
  if (existing) { store.open(existing.id); app.show("editor"); return; }
  addDemoSong();
  toast(t("demoAdded", "Demo song added"), "success");
  app.show("editor");
}

/** On a phone the chart and the box are separate panes; the hidden one is not drawn until it is shown. */
const previewHidden = () => compact.matches && $("editorPanes").dataset.pane === "edit";
/** What each box last showed, kept here (not in an attribute) so a long chart isn't copied into the page twice. */
const shown = new WeakMap();
/** Replace a box's markup only when it changed. @param {HTMLElement} el @param {string} html */
function setHtml(el, html) { if (shown.get(el) !== html) { el.innerHTML = html; shown.set(el, html); } }

/** Draw the preview, chips and chord bar once per frame. Typing waits a moment, so a burst of keys draws once. @param {boolean} [typing] */
function queueRender(typing = false) {
  if (renderQueued) return;
  renderQueued = true;
  const go = () => requestAnimationFrame(() => { renderQueued = false; if (!previewHidden()) renderPreview(); updateMeta(); updateQuickstart(); renderChordBar(); });
  if (typing) setTimeout(go, 80); else go();
}

export function renderPreview() {
  const s = store.active();
  const out = $("preview");
  if (!s) { setHtml(out, ""); return; }
  const mode = /** @type {any} */ (store.settings.viewMode);
  const html = s.body.trim() ? linesToHtml(buildLines(s.body, renderOptions(s, mode))) : `<div class="chart-empty">${esc(t("preview", "Preview"))}</div>`;
  // Replacing identical markup would restart the page's layout and drop a tapped chord's highlight.
  setHtml(out, html);
  const k = soundingKey(s);
  const labels = { chords: t("chordsMode", "Chords"), nashville: t("numbersMode", "Nashville numbers"), roman: t("romanMode", "Roman numerals"), lyrics: t("lyricsMode", "Lyrics only") };
  let label = `${labels[/** @type {"chords"} */ (mode)] || ""}`;
  if (mode === "chords") label += ` · ${t("keyOf", "Key of {key}", { key: pretty(keyShort(k)) })}`;
  if (mode === "chords" && s.capo) label += ` · ${t("capoShapes", "Capo {n} · {key} shapes", { n: s.capo, key: pretty(keyShort(shapeKey(s))) })}`;
  if (mode === "nashville" || mode === "roman") label += ` · ${pretty(keyShort(writtenKey(s)))}`;
  $("previewLabel").textContent = label;
}

function updateQuickstart() {
  const s = store.active();
  $("quickstart").hidden = Boolean(s && (s.body.trim() || s.readonly));
}

function updateMeta() {
  const s = store.active();
  const chips = $("metaChips");
  if (!s) { setHtml(chips, ""); return; }
  const k = soundingKey(s);
  const parts = [];
  if (s.artist) parts.push(`<span class="chip static">${esc(s.artist)}</span>`);
  parts.push(`<span class="chip static key">${esc(t("key", "Key"))} ${esc(pretty(keyShort(k)))}${s.transpose ? ` <small>${esc(signed(s.transpose))}</small>` : ""}</span>`);
  if (s.capo) parts.push(`<span class="chip static">${esc(t("capoN", "Capo {n}", { n: s.capo }))}</span>`);
  if (s.bpm) parts.push(`<span class="chip static">${s.bpm} BPM</span>`);
  if (s.creator) parts.push(`<span class="chip static muted">arr. ${esc(s.creator)}</span>`);
  const chipsHtml = parts.join("");
  setHtml(chips, chipsHtml);
  const links = (s.links || []).map((l) => ({ name: l.name || l.url, href: safeHref(l.url) })).filter((l) => l.href);
  const box = $("songLinks");
  box.hidden = !links.length;
  const linksHtml = links.length ? `<span class="mini-label">${esc(t("links", "Links"))}</span>` + links.map((l) => {
    const yt = youtubeId(l.href);
    // YouTube plays in the floating player (loaded only when tapped); other links open in a new tab.
    return yt ? `<button type="button" class="chip link-chip yt-chip" data-yt="${esc(yt)}" data-name="${esc(l.name)}">${icon("youtube")}${esc(l.name)}</button>`
      : `<a class="chip link-chip" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.name)}<span aria-hidden="true">↗</span></a>`;
  }).join("") : "";
  // Rebuilding unchanged links on every key would drop focus from a video chip and reset its play state.
  setHtml(box, linksHtml);
  paintLinkChips();
  $("editorHeading").textContent = s.title || t("untitled", "Untitled");
  $("keyPillValue").textContent = pretty(keyShort(k));
  $("keyPill").title = `${t("keyAndCapo", "Key & capo")}: ${pretty(k.name)}`;
}

function renderChordBar() {
  const s = store.active();
  const bar = $("chordBar");
  if (!s || s.readonly) { bar.hidden = true; return; }
  bar.hidden = false;
  // Chips follow the key you see on the chart, so they change when you transpose or pick a key.
  const key = shapeKey(s);
  const used = uniqueChords(s.body, renderOptions(s, "chords")).slice(0, 8);
  const type = CHORD_TYPES.some((x) => x.id === barType) ? barType : "triad";
  const list = [...new Set([...chordsForKey(key, type).map((c) => c.name), ...used])];
  const select = `<select class="select cp-type" id="barType" aria-label="${esc(t("chordType", "Chord type"))}">${CHORD_TYPES.map((x) => `<option value="${x.id}"${/** @type {any} */ (x).more ? " data-more" : ""}${x.id === type ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`;
  const html = select + list.map((c) => `<button type="button" class="chip chord-chip" data-chord="${esc(c)}">${esc(pretty(c))}</button>`).join("");
  if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
}

/** The chord as it must be typed into the chart (the chart is stored in its written key). @param {string} chord */
function toWritten(chord) {
  const s = store.active();
  const c = parseChord(chord);
  if (!s || !c) return chord;
  const steps = (s.transpose || 0) - (s.capo || 0);
  if (!steps) return chord;
  const written = writtenKey(s);
  return transposeChord(c, -steps, prefersFlats(written, /** @type {any} */ (store.settings.enharmonicPref)));
}

function updateSetlistBar() {
  const cur = store.currentSetlist();
  const bar = $("setlistBar");
  bar.hidden = !cur;
  if (!cur) return;
  $("setlistBarTitle").textContent = t("setlistOf", "{title} · {i} of {n}", { title: cur.set.title, i: cur.index + 1, n: cur.songs.length });
  /** @type {HTMLButtonElement} */ ($("setPrevBtn")).disabled = cur.index <= 0;
  /** @type {HTMLButtonElement} */ ($("setNextBtn")).disabled = cur.index >= cur.songs.length - 1;
}

/** Show which video link is loaded in the player, and whether tapping it will pause or play. */
function paintLinkChips() {
  const m = app.media;
  for (const b of $$("#songLinks [data-yt]")) {
    const on = b.dataset.yt === m.id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on && m.playing));
    const want = on && m.playing ? "pause" : on ? "play" : "youtube";
    if (b.dataset.ic !== want) { b.dataset.ic = want; b.querySelector("svg")?.replaceWith(document.createRange().createContextualFragment(icon(want))); }
    b.title = on && m.playing ? t("pause", "Pause") : t("playHere", "Play here");
  }
}

/** @param {number} d */
export function stepSetlist(d) {
  const cur = store.currentSetlist();
  if (!cur) return;
  store.playSetlist(cur.set.id, cur.index + d);
}

/** Load the active song into the editor. */
export function loadSong() {
  const s = store.active();
  const ro = Boolean(s?.readonly);
  title().value = s ? (s.title === "Untitled" && !s.body ? "" : s.title) : "";
  title().readOnly = ro;
  body().value = s?.body || "";
  body().readOnly = ro;
  $("sharedBanner").hidden = !ro;
  if (s) hist(s.id);
  setSaveState(ro ? "readonly" : "saved");
  updateHistoryButtons();
  updateSetlistBar();
  refreshEditor();
  requestAnimationFrame(autosize);
}

/** Re-render everything that depends on settings or key. */
export function refreshEditor() {
  const mode = store.settings.viewMode;
  $$("button[data-mode]").forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  updateMeta();
  updateQuickstart();
  renderChordBar();
  renderPreview();
  paintIcons($("view-editor"));
  requestAnimationFrame(autosize);
}
