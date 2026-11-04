// @ts-check
// PDF, PNG, TXT and print. The PDF/PNG and QR code libraries load only when used.
import { $, esc, download, slug } from "./dom.js";
import { store, soundingKey, shapeKey, renderOptions } from "./ctx.js";
import { keyShort, pretty } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { packSong, shareUrl } from "../core/share.js";

/** @typedef {{ columns: number, landscape: boolean }} ExportOptions */

/** Songs to export: the given setlist, the playing setlist, or the open song. @param {string} [setId] */
export function exportDocs(setId) {
  const set = setId ? store.setlists.find((x) => x.id === setId) : null;
  const cur = set ? { songs: store.setlistSongs(set) } : store.currentSetlist();
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

const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

/** @param {string} name @param {ExportOptions} o @param {string} [setId] */
export async function exportPdf(name, o, setId) {
  const docs = exportDocs(setId);
  if (!docs.length) return;
  const { buildPdf } = await import("../lib/export.js");
  download(`${slug(name || docs[0].title)}.pdf`, buildPdf(docs, { ...o, accent: accent() }));
}

/** @param {ExportOptions} o */
export async function exportPng(o) {
  const doc = exportDocs()[0];
  if (!doc) return;
  const [{ renderPng }, { qrModules }] = await Promise.all([import("../lib/export.js"), import("../lib/qr.js")]);
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
  download(`${slug(doc.title)}.png`, await renderPng(doc, { ...o, accent: accent(), logo, qr, qrNote }));
}

/** @param {string} [setId] */
export async function exportTxt(setId) {
  const docs = exportDocs(setId);
  if (!docs.length) return;
  const { docText } = await import("../lib/export.js");
  download(`${slug(docs[0].title)}.txt`, new Blob([docs.map(docText).join("\n\n")], { type: "text/plain;charset=utf-8" }));
}

/** @param {ExportOptions} o @param {string} [setId] */
export function printChart(o, setId) {
  const docs = exportDocs(setId);
  const area = $("printArea");
  area.style.setProperty("--print-cols", String(o.columns));
  area.innerHTML = docs.map((d) => `<article class="print-song"><h1>${esc(d.title)}</h1>
    <p class="print-meta">${esc([d.artist ? `by ${d.artist}` : "", d.creator ? `arr. ${d.creator}` : "", d.meta].filter(Boolean).join("  ·  "))}</p>
    <div class="chart print-chart">${linesToHtml(d.lines)}</div></article>`).join("");
  setTimeout(() => window.print(), 50);
}
