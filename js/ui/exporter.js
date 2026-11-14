// @ts-check
// PDF, PNG, TXT and print. The PDF/PNG and QR code libraries load only when used.
import { $, esc, icon, download, slug, openSheet, toast } from "./dom.js";
import { t } from "./i18n.js";
import { openShare } from "./sheets-lazy.js";
import { store, soundingKey, shapeKey, renderOptions } from "./ctx.js";
import { keyShort, pretty } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { packSong, qrUrl } from "../core/share.js";

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
  const { buildPdfSmall } = await import("../lib/export.js");
  download(`${slug(name || docs[0].title)}.pdf`, await buildPdfSmall(docs, { ...o, accent: accent() }));
}

/** @param {ExportOptions} o */
export async function exportPng(o) {
  const doc = exportDocs()[0];
  if (!doc) return;
  const [{ renderPngPages }, { qrModules }] = await Promise.all([import("../lib/export.js"), import("../lib/qr.js")]);
  await document.fonts?.ready;
  const logo = /** @type {HTMLImageElement|null} */ (document.querySelector(".brand img"));
  // The QR opens this exact chart; if the song is too long for a code it points to the app instead.
  const song = store.active();
  let qr = null;
  let qrNote = "";
  if (song && !song.readonly) {
    // Upper-case QR link: alphanumeric mode, a smaller code that scans more easily from paper.
    qr = qrModules(await qrUrl(location.origin, packSong(song)));
    if (qr) qrNote = "Opens this song in Sonata on any phone.";
  }
  if (!qr) { qr = qrModules(`${location.origin}/`); qrNote = "Opens Sonata on any phone."; }
  const pages = await renderPngPages(doc, { ...o, accent: accent(), logo, qr, qrNote });
  openPngPreview(doc.title, pages);
}

/**
 * Show the finished image first. From here it can be copied (to paste into a chat), shared or
 * downloaded; nothing is saved to the device unless the person asks for it.
 * @param {string} title @param {Blob[]} pages
 */
function openPngPreview(title, pages) {
  const name = (/** @type {number} */ i) => `${slug(title)}${pages.length > 1 ? `-page-${i + 1}` : ""}.png`;
  const urls = pages.map((b) => URL.createObjectURL(b));
  const canCopy = Boolean(navigator.clipboard?.write) && typeof ClipboardItem !== "undefined";
  const files = () => pages.map((b, i) => new File([b], name(i), { type: "image/png" }));
  let canShare = false;
  try { canShare = Boolean(navigator.canShare?.({ files: files() })); } catch { /* no file sharing */ }
  const many = pages.length > 1;
  const body = openSheet({
    title: t("pngTitle", "Image preview"),
    wide: true,
    focus: false,
    className: "png-sheet",
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
    body: `<div class="png-preview">
      <p class="card-hint">${esc(canCopy ? t("pngHint", "Copy the image to paste it into a chat, or share or download it.") : t("pngHintHold", "Press and hold the image to copy or save it, or use the buttons below."))}</p>
      ${urls.map((u, i) => `<figure class="png-page">
        <img src="${esc(u)}" alt="${esc(many ? t("pngPageAlt", "{title}, page {n}", { title, n: i + 1 }) : title)}" loading="lazy" decoding="async">
        ${many ? `<figcaption><span>${esc(t("pageOf", "Page {n} of {m}", { n: i + 1, m: pages.length }))}</span>${canCopy ? `<button class="btn small" type="button" data-copy="${i}">${icon("copy")}${esc(t("copyImage", "Copy image"))}</button>` : ""}</figcaption>` : ""}
      </figure>`).join("")}
    </div>`,
    actions: [
      { label: t("back", "Back"), kind: "ghost", onClick: () => { openShare(); return false; } },
      ...(canShare ? [{ label: t("share", "Share"), onClick: async () => { try { await navigator.share({ files: files(), title }); } catch { /* closed */ } return false; } }] : []),
      { label: many ? t("downloadAll", "Download all") : t("download", "Download"), onClick: async () => {
        for (let i = 0; i < pages.length; i++) {
          download(name(i), pages[i]);
          if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 350));
        }
        toast(t("downloaded", "Downloaded"), "success");
        return false;
      } },
      ...(canCopy && !many ? [{ label: t("copyImage", "Copy image"), kind: /** @type {"primary"} */ ("primary"), onClick: () => { copyPage(0); return false; } }] : [])
    ]
  });
  /** @param {number} i */
  async function copyPage(i) {
    try {
      // The blob is handed over inside the tap; Safari refuses a clipboard write that starts later.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pages[i] })]);
      toast(t("imageCopied", "Image copied. Paste it anywhere."), "success", { ms: 3000 });
    } catch {
      toast(t("imageCopyFailed", "This browser can't copy images. Press and hold the image, or download it."), "error", { ms: 5000 });
    }
  }
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-copy]"));
    if (b) copyPage(Number(b.dataset.copy));
  });
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
