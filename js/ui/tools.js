// @ts-check
import { $, $$, esc, toast, download, slug, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, metronome, writtenKey, detectedKey, soundingKey, shapeKey, renderOptions, nudgeTranspose, signed, tick } from "./ctx.js";
import { keyShort, pretty, transposeText, keyFromTonic, keyValue } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { buildPdf, renderPng, docText } from "../lib/export.js";
import { qrModules } from "../lib/qr.js";
import { packSong, shareUrl } from "../core/share.js";
import { TIME_SIGNATURES } from "../audio.js";
import { keyOptions, capoOptions, openShare } from "./sheets.js";

export function initTools() {
  $("trDown").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), -1); });
  $("trUp").addEventListener("click", () => { tick(); nudgeTranspose(store.active(), 1); });
  $("songKeySelect").addEventListener("change", (e) => {
    const s = store.active();
    if (s && !s.readonly) store.update(s, { manualKey: /** @type {HTMLSelectElement} */ (e.target).value });
  });
  $("capoSelect").addEventListener("change", (e) => {
    const s = store.active();
    if (!s) return;
    const capo = Number(/** @type {HTMLSelectElement} */ (e.target).value);
    if (s.readonly) { s.capo = capo; store.emit("change", "view"); } else store.update(s, { capo });
  });
  $$("[data-spelling]").forEach((b) => b.addEventListener("click", () => {
    store.settings.enharmonicPref = /** @type {any} */ (b.dataset.spelling);
    store.changed("settings");
  }));
  $("resetKeyBtn").addEventListener("click", () => {
    const s = store.active();
    if (s && !s.readonly) store.update(s, { transpose: 0, capo: 0 });
  });
  $("applyTransposeBtn").addEventListener("click", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    if (!s.transpose) { toast(t("nothingToApply", "Nothing to write: transpose is 0."), "info"); return; }
    const from = writtenKey(s);
    const to = keyFromTonic(from.tonic + s.transpose, from.mode, /** @type {any} */ (store.settings.enharmonicPref));
    const body = transposeText(s.body, s.transpose, from, /** @type {any} */ (store.settings.enharmonicPref));
    store.update(s, { body, transpose: 0, manualKey: s.manualKey === "auto" ? "auto" : keyValue(to) });
    store.emit("song-open", s);
    toast(t("transposeWritten", "Chords rewritten in {key}", { key: pretty(to.name) }), "success");
  });

  // Metronome
  const sig = /** @type {HTMLSelectElement} */ ($("sigSelect"));
  sig.innerHTML = TIME_SIGNATURES.map((x) => `<option value="${x.id}">${x.id}</option>`).join("");
  const savedSig = TIME_SIGNATURES.find((x) => x.beats === store.settings.metronomeBeats) || TIME_SIGNATURES[2];
  sig.value = savedSig.id;
  metronome.setSignature(savedSig.id);
  metronome.setBpm(store.settings.metronomeBpm);
  metronome.volume = store.settings.metronomeVolume;
  sig.addEventListener("change", () => { metronome.setSignature(sig.value); store.settings.metronomeBeats = metronome.sig.beats; store.changed("settings"); renderDots(); });
  const setBpm = (/** @type {number} */ v) => { metronome.setBpm(v); store.settings.metronomeBpm = metronome.bpm; store.changed("settings"); syncBpm(); };
  $("bpmDown").addEventListener("click", () => setBpm(metronome.bpm - 1));
  $("bpmUp").addEventListener("click", () => setBpm(metronome.bpm + 1));
  $("bpmRange").addEventListener("input", (e) => setBpm(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("bpmInput").addEventListener("change", (e) => setBpm(Number(/** @type {HTMLInputElement} */ (e.target).value)));
  $("tapBtn").addEventListener("click", () => { const b = metronome.tap(); if (b) setBpm(b); flash(0, "strong"); });
  $("metroBtn").addEventListener("click", () => { metronome.toggle(); syncMetroButton(); });
  $("songTempoBtn").addEventListener("click", () => {
    const s = store.active();
    if (!s || s.readonly) return;
    store.update(s, { bpm: metronome.bpm });
    toast(t("tempoSaved", "Saved {bpm} BPM to the song", { bpm: metronome.bpm }), "success");
  });
  metronome.onBeat((b, accent) => { flash(b, accent); app.beatListeners.forEach((fn) => fn(b, accent)); });
  renderDots();

  // Export
  $("shareBtn").addEventListener("click", () => openShare());
  $("pdfBtn").addEventListener("click", exportPdf);
  $("pngBtn").addEventListener("click", exportPng);
  $("txtBtn").addEventListener("click", () => {
    const docs = exportDocs();
    if (!docs.length) return;
    download(`${slug(docs[0].title)}.txt`, new Blob([docs.map(docText).join("\n\n")], { type: "text/plain;charset=utf-8" }));
  });
  $("printBtn").addEventListener("click", printChart);

  store.on("change", () => { if (app.view === "tools") renderTools(); });
  store.on("song-open", (/** @type {any} */ s) => {
    if (s?.bpm && !metronome.running) { metronome.setBpm(s.bpm); syncBpm(); }
    if (app.view === "tools") renderTools();
  });
}

function renderDots() {
  const host = $("beatDots");
  host.innerHTML = Array.from({ length: metronome.sig.beats }, (_, i) => `<span class="${i === 0 ? "down" : metronome.sig.accents.includes(i) ? "mid" : ""}"></span>`).join("");
}

/** @param {number} b @param {string} accent */
function flash(b, accent) {
  const dots = $("beatDots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === b);
  $("beatDots").dataset.accent = accent;
}

function syncBpm() {
  /** @type {HTMLInputElement} */ ($("bpmInput")).value = String(metronome.bpm);
  /** @type {HTMLInputElement} */ ($("bpmRange")).value = String(metronome.bpm);
  const st = document.getElementById("stageBpm");
  if (st) st.textContent = String(metronome.bpm);
}

export function syncMetroButton() {
  const b = $("metroBtn");
  const on = metronome.running;
  b.innerHTML = `<span data-icon="${on ? "stop" : "play"}"></span><span>${esc(on ? t("stop", "Stop") : t("start", "Start"))}</span>`;
  b.classList.toggle("danger", on);
  b.classList.toggle("primary", !on);
  paintIcons(b);
  const sb = document.getElementById("stageMetroBtn");
  if (sb) sb.classList.toggle("on", on);
  if (!on) for (const d of $("beatDots").children) d.classList.remove("on");
}

export function renderTools() {
  const s = store.active();
  $("toolsSong").textContent = s ? s.title : t("noSong", "No song open");
  const det = detectedKey(s);
  $("detectedKey").textContent = det ? `${pretty(det.name)}` : "—";
  $("detectedKey").title = det ? `${det.confidence}%` : "";
  $("soundingKey").textContent = s ? pretty(soundingKey(s).name) : "—";
  $("shapeKey").textContent = s && s.capo ? pretty(shapeKey(s).name) : "—";
  /** @type {HTMLSelectElement} */ ($("songKeySelect")).innerHTML = keyOptions(s?.manualKey || "auto", det);
  /** @type {HTMLSelectElement} */ ($("songKeySelect")).disabled = !s || Boolean(s.readonly);
  /** @type {HTMLSelectElement} */ ($("capoSelect")).innerHTML = capoOptions(s?.capo || 0);
  $("trValue").textContent = signed(s?.transpose || 0);
  $$("[data-spelling]").forEach((b) => { const on = b.dataset.spelling === store.settings.enharmonicPref; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  /** @type {HTMLButtonElement} */ ($("applyTransposeBtn")).disabled = !s || Boolean(s.readonly) || !s.transpose;
  const cur = store.currentSetlist();
  $("exportHint").textContent = cur ? `${cur.set.title}: PDF includes all ${cur.songs.length} songs.` : "";
  syncBpm();
  syncMetroButton();
}

/** Songs to export: the whole setlist when one is playing. */
function exportDocs() {
  const cur = store.currentSetlist();
  const songs = cur ? cur.songs : [store.active()].filter(Boolean);
  const mode = /** @type {any} */ (store.settings.viewMode);
  return songs.map((s) => {
    const song = /** @type {import("../core/store.js").Song} */ (s);
    const k = soundingKey(song);
    const meta = [`Key ${pretty(keyShort(k))}`];
    if (song.capo) meta.push(`Capo ${song.capo} (${pretty(keyShort(shapeKey(song)))} shapes)`);
    if (song.bpm) meta.push(`${song.bpm} BPM`);
    meta.push({ chords: "Chords", nashville: "Nashville numbers", roman: "Roman numerals", lyrics: "Lyrics" }[/** @type {"chords"} */ (mode)] || "Chords");
    return { title: song.title, artist: song.artist, creator: song.creator, meta: meta.join("  ·  "), lines: buildLines(song.body, renderOptions(song, mode)) };
  });
}

const exportOpts = () => ({
  columns: Number(/** @type {HTMLSelectElement} */ ($("exportColumns")).value) || 1,
  landscape: /** @type {HTMLSelectElement} */ ($("exportOrientation")).value === "landscape",
  accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
});

function exportPdf() {
  const docs = exportDocs();
  if (!docs.length) return;
  const cur = store.currentSetlist();
  download(`${slug(cur ? cur.set.title : docs[0].title)}.pdf`, buildPdf(docs, exportOpts()));
}

async function exportPng() {
  const doc = exportDocs()[0];
  if (!doc) return;
  await document.fonts?.ready;
  const logo = /** @type {HTMLImageElement|null} */ (document.querySelector(".brand img"));
  // The QR opens this exact chart; if the song is too long for a code it points to the app instead.
  const song = store.active();
  let qr = null;
  let qrNote = "";
  if (song && !song.readonly) {
    qr = qrModules(await shareUrl(`${location.origin}/`, packSong(song)));
    if (qr) qrNote = "Opens this song in Sonata on any phone.";
  }
  if (!qr) { qr = qrModules(`${location.origin}/`); qrNote = "Opens Sonata on any phone."; }
  download(`${slug(doc.title)}.png`, await renderPng(doc, { ...exportOpts(), logo, qr, qrNote }));
}

function printChart() {
  const docs = exportDocs();
  const area = $("printArea");
  area.style.setProperty("--print-cols", String(exportOpts().columns));
  area.innerHTML = docs.map((d) => `<article class="print-song"><h1>${esc(d.title)}</h1>
    <p class="print-meta">${esc([d.artist ? `by ${d.artist}` : "", d.creator ? `arr. ${d.creator}` : "", d.meta].filter(Boolean).join("  ·  "))}</p>
    <div class="chart print-chart">${linesToHtml(d.lines)}</div></article>`).join("");
  setTimeout(() => window.print(), 50);
}
