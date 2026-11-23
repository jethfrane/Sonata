// @ts-check
// Share & export sheet: QR cards, share links, Drive live links, PDF / PNG / TXT / ChordPro / Print.
import { esc, icon, toast, openSheet, closeSheet, copyText, download, slug } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, effectiveSong, setlistSongsEffective, renderOptions } from "./ctx.js";
import { buildLines, linesToText } from "../core/chart.js";
import { liveSetUrl, publishLiveSet, stopLiveSet, watchLiveSets } from "./liveset.js";
import { packSong, packSet, shareUrl, qrUrl, setlistMessage } from "../core/share.js";
import { exportPdf, exportPng, exportTxt, exportCho, printChart } from "./exporter.js";

/** The QR library is ~20 KB, so it loads the first time a share sheet opens. */
const loadQr = () => import("../lib/qr.js");
const BASE = () => `${location.origin}/`;

/** Wrap text into at most `max` lines of `width` pixels. @param {CanvasRenderingContext2D} g @param {string} text @param {number} width @param {number} max */
function wrapLines(g, text, width, max) {
  const words = text.split(/\s+/);
  /** @type {string[]} */
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > width && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "…"); }
  return lines;
}

/** A sharp, scannable QR card as a PNG: whole-pixel modules, quiet zone, title and brand. @param {string} url @param {string} title */
async function qrPng(url, title) {
  const { qrModules } = await loadQr();
  const qr = qrModules(url);
  if (!qr) throw new Error("qr too long");
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const ui = "'Inter Variable', Inter, system-ui, sans-serif";
  await Promise.all([document.fonts?.load(`800 44px ${ui}`), document.fonts?.load(`600 30px ${ui}`)]).catch(() => {});
  await document.fonts?.ready;
  g.fillStyle = "#eef2f8"; g.fillRect(0, 0, W, H);
  // White card
  const cx = 70, cy = 70, cw = W - 140, ch = H - 140;
  g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(cx, cy, cw, ch, 40); g.fill();
  // Brand row
  try {
    const logo = new Image(); logo.src = "/icons/icon-512.png"; await logo.decode();
    g.drawImage(logo, cx + 56, cy + 52, 72, 72);
  } catch { /* logo is optional */ }
  g.fillStyle = "#0f172a"; g.textBaseline = "middle"; g.textAlign = "left"; g.font = `800 44px ${ui}`;
  g.fillText("Sonata", cx + 148, cy + 88);
  // QR: integer module size, 4-module quiet zone, black on white for the best scan rate.
  const quiet = 4, box = 700;
  const mod = Math.max(2, Math.floor(box / (qr.n + quiet * 2)));
  const side = mod * (qr.n + quiet * 2);
  const qx = Math.round((W - side) / 2), qy = cy + 170;
  g.fillStyle = "#fff"; g.fillRect(qx, qy, side, side);
  g.fillStyle = "#0b1220";
  for (let r = 0; r < qr.n; r++) for (let col = 0; col < qr.n; col++) if (qr.dark(r, col)) g.fillRect(qx + (col + quiet) * mod, qy + (r + quiet) * mod, mod, mod);
  g.strokeStyle = "#e2e8f0"; g.lineWidth = 2; g.strokeRect(qx - 1, qy - 1, side + 2, side + 2);
  // Title + hint
  g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "#0f172a"; g.font = `800 52px ${ui}`;
  const lines = wrapLines(g, title, cw - 160, 2);
  let ty = qy + side + 92;
  for (const l of lines) { g.fillText(l, W / 2, ty); ty += 62; }
  g.fillStyle = "#475569"; g.font = `600 30px ${ui}`;
  g.fillText("Scan with your phone camera to open it in Sonata", W / 2, ty + 14);
  g.fillStyle = "#94a3b8"; g.font = `600 26px ${ui}`;
  g.fillText("sonata.jethrofrane.xyz", W / 2, cy + ch - 44);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

/** Export choices are remembered per device. */
const EXPORT_KEY = "sonata_export_opts";
function readExportOpts() {
  try {
    const o = JSON.parse(localStorage.getItem(EXPORT_KEY) || "{}");
    return { columns: [1, 2, 3].includes(o.columns) ? o.columns : 1, landscape: Boolean(o.landscape) };
  } catch { return { columns: 1, landscape: false }; }
}

/**
 * Share & export a song (default: the open one) or a setlist by id.
 * Link + QR first (the song travels inside the link), then files.
 * @param {string} [setId]
 */
export async function openShare(setId) {
  const getSet = () => (setId ? store.setlists.find((s) => s.id === setId) || null : null);
  const initSet = getSet();
  const song = initSet ? null : store.active();
  if (!initSet && !song) { toast(t("noSong", "No song open"), "error"); return; }
  if (initSet && !app.drive && navigator.onLine) app.loadDrive().catch(() => {});
  const data = initSet ? packSet(initSet, setlistSongsEffective(initSet)) : packSong(/** @type {any} */ (effectiveSong(song)));
  const title = initSet ? initSet.title : /** @type {any} */ (song).title;
  const [{ qrSvg }, link, packedQrLink] = await Promise.all([loadQr(), shareUrl(BASE(), data), qrUrl(location.origin, data)]);
  const currentQrLink = () => { const s = getSet(); return s?.liveId ? liveSetUrl(s.liveId, s.title) : packedQrLink; };
  const currentShareLink = () => { const s = getSet(); return s?.liveId ? liveSetUrl(s.liveId, s.title) : url; };
  let url = link;
  const opts = readExportOpts();
  const many = initSet ? store.setlistSongs(initSet).length : (store.currentSetlist()?.songs.length || 1);
  // A live link: one address that always shows the latest version of this setlist.
  const liveBlock = () => {
    const s = getSet();
    const id = s?.liveId || "";
    return `<h3 class="group-title">${esc(t("liveLink", "Live link"))}</h3>` + (id
      ? `<p class="status-line synced">${esc(t("liveOn", "Live: this link always shows the latest version."))}</p>
        <div class="share-link"><input class="input" id="liveUrl" readonly value="${esc(liveSetUrl(id, s?.title))}" aria-label="${esc(t("liveLink", "Live link"))}"></div>
        <div class="share-actions">
          <button class="btn primary" type="button" id="liveCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button>
          <button class="btn" type="button" id="liveUpdate">${icon("refresh")}${esc(t("bankUpdate", "Update now"))}</button>
          <button class="btn ghost danger-text" type="button" id="liveStop">${esc(t("bankStop", "Stop sharing"))}</button>
        </div>`
      : `<p class="card-text">${esc(t("liveIntro", "One link for the band that always shows the latest version. Change the setlist or a chart and everyone gets it; each player keeps their own key. It is shared from your Google Drive."))}</p>
        <button class="btn" type="button" id="liveStart">${icon("link")}${esc(t("liveStart", "Make a live link"))}</button>`);
  };
  /** @type {string|null|undefined} */
  let svg;
  let svgFor = "";
  const draw = () => {
    const s = getSet();
    // The QR holds the upper-case form of the link (or the short Drive live link when live).
    const qrTarget = currentQrLink();
    if (svg === undefined || svgFor !== qrTarget) {
      svg = qrSvg(qrTarget, { margin: 4 });
      svgFor = qrTarget;
    }
    // A long song makes a code with many small squares, so it is drawn larger, and a tap fills the screen with it.
    const n = Number(svg?.match(/data-n="(\d+)"/)?.[1] || 0);
    return `<div class="share">
      <div class="share-top">
        ${svg ? `<div class="qr-side"><button type="button" class="qr-box" id="qrZoom" style="--qr-n:${n}" aria-label="${esc(t("qrBigger", "Show the QR code bigger"))}" title="${esc(t("qrBigger", "Show the QR code bigger"))}">${svg}</button>${n > 100 ? `<p class="qr-hint">${esc(t("qrDense", "Long song: tap the code to make it bigger for scanning."))}</p>` : ""}</div>`
          : `<div class="qr-box"><p>${esc(t("qrTooLong", "This song is too long for a QR code. The link still works."))}</p></div>`}
        <div class="share-side">
          <p class="card-text">${esc(t("shareHow2", "Anyone can open the link or scan the code to see the chart and save it. No account needed."))}</p>
          <div class="share-link"><input class="input" id="shareUrl" readonly value="${esc(currentShareLink())}" aria-label="Link"></div>
          <div class="share-actions">
            <button class="btn primary" type="button" id="shareCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button>
            ${!s && song ? `<button class="btn" type="button" id="shareCopyText">${icon("text")}${esc(t("copyChart", "Copy chart"))}</button>` : ""}
            ${"share" in navigator ? `<button class="btn" type="button" id="shareNative">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
            ${svg ? `<button class="btn" type="button" id="shareQr">${icon("qr")}${esc(t("downloadQr", "QR image"))}</button>` : ""}
            ${s ? `<button class="btn" type="button" id="shareSongLinks">${icon("link")}${esc(t("songLinks", "Song links"))}</button>` : ""}
          </div>
          ${s ? `<p class="card-hint">${esc(t("songLinksHint", "Song links: one short link per song in a message. Anyone can paste the whole message into Sonata (Songs → Import) to get the setlist."))}</p>` : ""}
        </div>
      </div>
      ${s ? liveBlock() : ""}
      <h3 class="group-title">${esc(t("exportFiles", "Export"))}${many > 1 ? ` <span class="muted">· ${esc(t("songsInSet", "{n} songs", { n: many }))}</span>` : ""}</h3>
      <div class="export-grid">
        <button class="btn" type="button" data-export="pdf">${icon("file")}PDF</button>
        <button class="btn" type="button" data-export="png" title="${esc(t("pngShape", "Phone-sized image"))}">${icon("image")}PNG <small class="fmt" id="pngShape">${opts.landscape ? "16:9" : "9:16"}</small></button>
        <button class="btn" type="button" data-export="txt">${icon("text")}TXT</button>
        <button class="btn" type="button" data-export="cho">${icon("file")}ChordPro</button>
        <button class="btn" type="button" data-export="print">${icon("print")}${esc(t("print", "Print"))}</button>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("columns", "Columns"))}</span>
          <select class="select" id="exportColumns">${[1, 2, 3].map((n) => `<option value="${n}"${n === opts.columns ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("page", "Page"))}</span>
          <select class="select" id="exportOrientation"><option value="portrait">${esc(t("portrait", "Portrait"))}</option><option value="landscape"${opts.landscape ? " selected" : ""}>${esc(t("landscape", "Landscape"))}</option></select></label>
      </div>
    </div>`;
  };
  const body = openSheet({ title: initSet ? t("shareSetTitle", "Share setlist") : t("shareTitle", "Share \"{title}\"", { title }), body: draw(), wide: true, className: "share-sheet", focus: false });
  const busy = async (/** @type {HTMLElement} */ b, /** @type {() => Promise<void>|void} */ fn) => {
    b.setAttribute("aria-busy", "true");
    try { await fn(); } catch { toast(t("exportFailed", "Couldn't make that file. Please try again."), "error"); } finally { b.removeAttribute("aria-busy"); }
  };
  body.addEventListener("change", (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.id === "exportColumns") opts.columns = Number(el.value) || 1;
    if (el.id === "exportOrientation") {
      opts.landscape = el.value === "landscape";
      const shape = body.querySelector("#pngShape");
      if (shape) shape.textContent = opts.landscape ? "16:9" : "9:16";
    }
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
  });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    const curSet = getSet();
    const curTitle = curSet?.title || title;
    const kind = b.dataset.export;
    if (kind === "pdf") busy(b, () => exportPdf(curTitle, opts, curSet?.id));
    if (kind === "png") busy(b, () => exportPng(opts, curSet?.id));
    if (kind === "txt") busy(b, () => exportTxt(curSet?.id));
    if (kind === "cho") busy(b, () => exportCho(curSet?.id));
    if (kind === "print") { closeSheet(); printChart(opts, curSet?.id); }
    if (b.id === "shareCopy") {
      if (await copyText(currentShareLink())) {
        toast(t("linkCopied", "Link copied"), "success");
        const prev = b.innerHTML;
        b.innerHTML = `${icon("check")}${esc(t("copied", "Copied!"))}`;
        setTimeout(() => { if (b.isConnected) b.innerHTML = prev; }, 1600);
      }
    }
    if (b.id === "shareCopyText" && song) {
      const txt = `${song.title}\n\n${linesToText(buildLines(song.body, renderOptions(song)))}`;
      if (await copyText(txt)) toast(t("copied", "Copied"), "success");
    }
    if (b.id === "shareNative") { try { await navigator.share({ title: `${curTitle} · Sonata`, url: currentShareLink() }); } catch { /* cancelled */ } }
    if (b.id === "qrZoom" && svg) {
      // Over everything in the sheet, white edge to edge: the easiest thing for a camera to read.
      const big = document.createElement("button");
      big.type = "button"; big.className = "qr-zoom"; big.id = "qrZoomed";
      big.setAttribute("aria-label", t("qrSmaller", "Close the big QR code"));
      big.innerHTML = `${svg}<span>${esc(t("qrTapClose", "Tap to close"))}</span>`;
      big.addEventListener("click", () => { big.remove(); b.focus(); });
      b.closest("dialog")?.append(big);
      big.focus();
      return;
    }
    if (b.id === "shareQr") busy(b, async () => download(`sonata-${slug(curTitle)}-qr.png`, await qrPng(currentQrLink(), curTitle)));
    if (curSet && (b.id === "liveStart" || b.id === "liveUpdate")) busy(b, async () => {
      if (!(await publishLiveSet(curSet.id))) return;
      watchLiveSets();
      body.innerHTML = draw();
      const updated = getSet();
      if (b.id === "liveStart" && await copyText(liveSetUrl(updated?.liveId || "", updated?.title || curTitle))) toast(t("liveCopied", "Live link copied. Send it to the band."), "success", { ms: 4500 });
      else toast(t("livePublished", "The live link is up to date."), "success");
    });
    if (curSet && b.id === "liveCopy") { if (await copyText(liveSetUrl(curSet.liveId || "", curSet.title))) toast(t("linkCopied", "Link copied"), "success"); }
    if (curSet && b.id === "liveStop") busy(b, async () => {
      if (await stopLiveSet(curSet.id)) { body.innerHTML = draw(); toast(t("liveStopped", "The live link is off. The setlist is private again."), "info"); }
      else toast(t("bankStopFailed", "Couldn't stop sharing. Check your connection and sign-in."), "error");
    });
    if (b.id === "shareSongLinks" && curSet) busy(b, async () => {
      const msg = await setlistMessage(BASE(), curSet, setlistSongsEffective(curSet));
      if ("share" in navigator && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: `${curSet.title} · Sonata`, text: msg }); return; } catch { /* cancelled: copy instead */ } }
      if (await copyText(msg)) toast(t("songLinksCopied", "Setlist message copied. Paste it in your group chat."), "success", { ms: 4000 });
    });
  });
  body.addEventListener("focusin", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === "shareUrl" || el.id === "liveUrl") el.select();
  });
}
