// @ts-check
import { $, $$, esc, toast, copyText, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, writtenKey, soundingKey, shapeKey, renderOptions, nudgeTranspose, signed, tick } from "./ctx.js";
import { buildLines, linesToHtml, linesToText, uniqueChords } from "../core/chart.js";
import { keyShort, pretty, isChordLine, CHORD_TYPES, chordsForKey, parseChord, transposeChord, prefersFlats } from "../core/music.js";
import { openKeySheet, openDetails } from "./sheets.js";

export const DEMO_SONG = {
  title: "Amazing Grace (My Chains Are Gone)",
  artist: "John Newton, Chris Tomlin",
  creator: "",
  manualKey: "G:major",
  bpm: 72,
  description: "Classic hymn with the modern chorus. Build on the second chorus.",
  links: [{ name: "Reference", url: "https://www.youtube.com/results?search_query=amazing+grace+my+chains+are+gone" }],
  body: `## Verse 1
G           G/B       C        G
Amazing grace, how sweet the sound
G                   Em      D
That saved a wretch like me
G            G/B        C          G
I once was lost, but now am found
G         Em      D         G
Was blind but now I see

## Chorus
> All in, full band
[C]My chains are [G]gone, I've been set [D]free
My [Em]God, my [C]Savior has [G]ransomed [D]me
And [C]like a flood His [G]mercy [Em]reigns
Un[C]ending [G]love, a[D]mazing [G]grace

## Bridge
C///  G/B///  Am7///  G///
// Drums build here
C  D  Em  G/D  C  D  G
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

export function initEditor() {
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
    queueRender();
  });
  window.addEventListener("resize", autosize);
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
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    store.settings.viewMode = /** @type {any} */ (b.dataset.mode);
    store.changed("settings");
    refreshEditor();
  }));
  $$("[data-pane]").forEach((b) => b.addEventListener("click", () => setPane(/** @type {string} */ (b.dataset.pane))));
  $$("#quickstart [data-insert]").forEach((b) => b.addEventListener("click", () => insertAtCursor(b.dataset.insert || "", true)));
  $("demoBtn").addEventListener("click", addDemo);
  $("copyChartBtn").addEventListener("click", async () => {
    const s = store.active();
    if (!s) return;
    const text = `${s.title}\n\n${linesToText(buildLines(s.body, renderOptions(s)))}`;
    if (await copyText(text)) toast(t("copied", "Copied"), "success");
  });
  $("saveSharedBtn").addEventListener("click", () => {
    const s = store.saveShared();
    if (s) toast(t("savedNow", "Saved"), "success");
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
  setPane(localStorage.getItem("sonata_mobile_editor_pane") === "preview" ? "preview" : "edit");
  loadSong();
}

const compact = matchMedia("(max-width: 960px)");

/** On phones and tablets the chart box grows with the text, so only the page scrolls. */
function autosize() {
  const ta = body();
  if (!compact.matches) { ta.style.height = ""; return; }
  ta.style.height = "auto";
  ta.style.height = `${Math.max(ta.scrollHeight + 2, 320)}px`;
}

/** @param {string} pane */
function setPane(pane) {
  $("editorPanes").dataset.pane = pane;
  $("view-editor").dataset.pane = pane;
  $$("[data-pane]").forEach((b) => { const on = b.dataset.pane === pane; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
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
  const cur = store.active();
  if (cur && !cur.readonly && !cur.body.trim() && (cur.title === "Untitled" || !cur.title.trim()) && store.songs.length) {
    store.songs = store.songs.filter((s) => s.id !== cur.id);
  }
  return store.createSong({ ...DEMO_SONG });
}

function addDemo() {
  const existing = store.songs.find((s) => s.title === DEMO_SONG.title && s.body === DEMO_SONG.body);
  if (existing) { store.open(existing.id); app.show("editor"); return; }
  addDemoSong();
  toast(t("demoAdded", "Demo song added"), "success");
  app.show("editor");
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderPreview(); updateMeta(); updateQuickstart(); renderChordBar(); });
}

export function renderPreview() {
  const s = store.active();
  const out = $("preview");
  if (!s) { out.innerHTML = ""; return; }
  const mode = /** @type {any} */ (store.settings.viewMode);
  if (!s.body.trim()) {
    out.innerHTML = `<div class="chart-empty">${esc(t("preview", "Preview"))}</div>`;
  } else {
    out.innerHTML = linesToHtml(buildLines(s.body, renderOptions(s, mode)));
  }
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
  if (!s) { chips.innerHTML = ""; return; }
  const k = soundingKey(s);
  const parts = [];
  if (s.artist) parts.push(`<span class="chip static">${esc(s.artist)}</span>`);
  parts.push(`<span class="chip static key">${esc(t("key", "Key"))} ${esc(pretty(keyShort(k)))}${s.transpose ? ` <small>${esc(signed(s.transpose))}</small>` : ""}</span>`);
  if (s.capo) parts.push(`<span class="chip static">${esc(t("capoN", "Capo {n}", { n: s.capo }))}</span>`);
  if (s.bpm) parts.push(`<span class="chip static">${s.bpm} BPM</span>`);
  if (s.creator) parts.push(`<span class="chip static muted">arr. ${esc(s.creator)}</span>`);
  chips.innerHTML = parts.join("");
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
  const select = `<select class="select cp-type" id="barType" aria-label="${esc(t("chordType", "Chord type"))}">${CHORD_TYPES.map((x) => `<option value="${x.id}"${x.id === type ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`;
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
  $$("[data-mode]").forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  updateMeta();
  updateQuickstart();
  renderChordBar();
  renderPreview();
  paintIcons($("view-editor"));
  requestAnimationFrame(autosize);
}
