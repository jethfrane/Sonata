// @ts-check
// Dialog sheets: key & capo, song details, share, setlist editor, settings,
// Drive account, about, and shared-setlist import.
import { esc, icon, toast, openSheet, closeSheet, copyText, download, slug, paintIcons } from "./dom.js";
import { t, setLang, applyI18n } from "./i18n.js";
import { store, app, detectedKey, soundingKey, shapeKey, writtenKey, signed, tick, adoptShared, renderOptions } from "./ctx.js";
import { keyShort, parseKey, pretty, transposeText, keyFromTonic, keyValue, detectKey } from "../core/music.js";
import { analyzeRawChart, stripLyricsToChordsOnly, buildLines, linesToText } from "../core/chart.js";
import { loneLink } from "../core/import.js";
import { sampleUrls } from "../audio.js";
import { liveSetUrl, publishLiveSet, stopLiveSet, watchLiveSets } from "./liveset.js";
import { packSong, packSet, shareUrl, unpackSong, qrUrl, parseLinks, setlistMessage } from "../core/share.js";
import { normalizeSettings, DEFAULT_SETTINGS } from "../core/store.js";
import { openBackup } from "./sheets-lazy.js";
import { exportPdf, exportPng, exportTxt, printChart } from "./exporter.js";

/** The QR library is ~20 KB, so it loads the first time a share sheet opens. */
const loadQr = () => import("../lib/qr.js");

const KEY_ROOTS_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_ROOTS_MINOR = ["C", "C#", "D", "D#", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Options for a key <select>; "auto" shows the detected key. @param {string} current @param {import("../core/music.js").Key|null} detected */
export function keyOptions(current, detected) {
  const auto = detected ? t("autoKey", "Auto ({key})", { key: pretty(keyShort(detected)) }) : "Auto";
  let html = `<option value="auto"${current === "auto" ? " selected" : ""}>${esc(auto)}</option>`;
  for (const [mode, roots] of /** @type {const} */ ([["major", KEY_ROOTS_MAJOR], ["minor", KEY_ROOTS_MINOR]])) {
    html += `<optgroup label="${mode === "major" ? esc(t("major", "Major")) : esc(t("minor", "Minor"))}">`;
    for (const r of roots) {
      const v = `${r}:${mode}`;
      const cur = parseKey(current);
      const sel = cur && cur.root === r && cur.mode === mode ? " selected" : "";
      html += `<option value="${v}"${sel}>${esc(pretty(r + (mode === "minor" ? "m" : "")))}</option>`;
    }
    html += "</optgroup>";
  }
  return html;
}

/** @param {number} capo */
export function capoOptions(capo) {
  let html = "";
  for (let i = 0; i <= 11; i++) html += `<option value="${i}"${i === capo ? " selected" : ""}>${esc(i ? t("capoN", "Capo {n}", { n: i }) : t("noCapo", "No capo"))}</option>`;
  return html;
}

/** Key, transpose, capo and spelling for the open song (the editor's key pill). @param {"key"|"capo"} [focusPart] */
export function openKeySheet(focusPart = "key") {
  const s = store.active();
  if (!s) return;
  const seg = (/** @type {string} */ v, /** @type {string} */ label) => {
    const on = store.settings.enharmonicPref === v;
    return `<button type="button" data-spelling="${v}" class="${on ? "active" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  };
  const render = () => {
    const k = soundingKey(s);
    const det = detectedKey(s);
    return `<div class="key-sheet">
      <div class="big-key"><span class="mini-label">${esc(t("playsIn", "Band plays in"))}</span><strong>${esc(pretty(k.name))}</strong>
        <span class="muted">${s.capo ? esc(t("capoShapes", "Capo {n} · {key} shapes", { n: s.capo, key: pretty(keyShort(shapeKey(s))) })) : det ? esc(t("detectedAs", "Detected from chords: {key}", { key: pretty(det.name) })) : "&nbsp;"}</span></div>
      <div class="field-row">
        <div class="field"><span>${esc(t("transpose", "Transpose"))}</span>
          <div class="stepper"><button class="icon-btn" type="button" data-tr="-1" aria-label="${esc(t("transposeDown", "Down a half step"))}">${icon("minus")}</button>
          <output aria-live="polite">${esc(signed(s.transpose))}</output>
          <button class="icon-btn" type="button" data-tr="1" aria-label="${esc(t("transposeUp", "Up a half step"))}">${icon("plus")}</button></div></div>
        <div class="field"><span>${esc(t("capo", "Capo"))}</span>
          <div class="stepper"><button class="icon-btn" type="button" data-capo="-1" aria-label="${esc(t("capoDown", "Capo down"))}"${s.capo <= 0 ? " disabled" : ""}>${icon("minus")}</button>
          <output aria-live="polite">${s.capo}</output>
          <button class="icon-btn" type="button" data-capo="1" aria-label="${esc(t("capoUp", "Capo up"))}"${s.capo >= 11 ? " disabled" : ""}>${icon("plus")}</button></div></div>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("songKey", "Song key"))}</span><select class="select" id="ksKey"${s.readonly ? " disabled" : ""}>${keyOptions(s.manualKey, det)}</select></label>
        <label class="field"><span>${esc(t("capo", "Capo"))} (${esc(t("override", "override"))})</span><select class="select" id="ksCapo">${capoOptions(s.capo)}</select></label>
      </div>
      <div class="field"><span>${esc(t("spelling", "Sharps or flats"))}</span>
        <div class="segmented full" role="group">${seg("auto", t("spellAuto", "Auto"))}${seg("sharp", "♯")}${seg("flat", "♭")}</div></div>
      ${s.readonly ? "" : `<div class="btn-row">
        <button class="btn" type="button" id="ksReset"${s.transpose || s.capo ? "" : " disabled"}>${esc(t("reset", "Reset"))}</button>
        <button class="btn" type="button" id="ksWrite"${s.transpose ? "" : " disabled"}>${icon("edit")}${esc(t("applyTranspose", "Write into chart"))}</button>
      </div>
      <p class="card-hint">${esc(t("writeHint", "Write into chart rewrites the chords in the new key, so it stays that way everywhere."))}</p>`}
    </div>`;
  };
  const body = openSheet({ title: t("keyAndCapo", "Key & capo"), body: render(), focus: false, actions: [{ label: t("done", "Done"), kind: "primary" }] });
  if (focusPart === "capo" && !matchMedia("(pointer: coarse)").matches) /** @type {HTMLElement|null} */ (body.querySelector("#ksCapo"))?.focus();
  const rerender = () => { body.innerHTML = render(); };
  /** @param {Partial<import("../core/store.js").Song>} patch */
  const apply = (patch) => {
    if (s.readonly) { Object.assign(s, patch); store.emit("change", "view"); } else store.update(s, patch);
    rerender();
  };
  body.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const tr = /** @type {HTMLElement|null} */ (target.closest("[data-tr]"));
    const cp = /** @type {HTMLElement|null} */ (target.closest("[data-capo]"));
    const sp = /** @type {HTMLElement|null} */ (target.closest("[data-spelling]"));
    if (tr) {
      tick();
      let next = s.transpose + Number(tr.dataset.tr);
      if (next > 11) next -= 12;
      if (next < -11) next += 12;
      apply({ transpose: next });
    } else if (cp) {
      tick();
      apply({ capo: Math.max(0, Math.min(11, s.capo + Number(cp.dataset.capo))) });
    } else if (sp) {
      store.settings.enharmonicPref = /** @type {any} */ (sp.dataset.spelling);
      store.changed("settings");
      rerender();
    } else if (target.closest("#ksReset")) {
      apply({ transpose: 0, capo: 0 });
    } else if (target.closest("#ksWrite") && s.transpose) {
      const from = writtenKey(s);
      const pref = /** @type {any} */ (store.settings.enharmonicPref);
      const to = keyFromTonic(from.tonic + s.transpose, from.mode, pref);
      store.update(s, { body: transposeText(s.body, s.transpose, from, pref), transpose: 0, manualKey: s.manualKey === "auto" ? "auto" : keyValue(to) });
      store.emit("song-open", s);
      toast(t("transposeWritten", "Chords rewritten in {key}", { key: pretty(to.name) }), "success");
      rerender();
    }
  });
  body.addEventListener("change", (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.id === "ksKey") {
      // When overriding a key while an active transpose offset exists, bake the visible transpose
      // so the chords on screen remain intact and the key label immediately matches the chosen key.
      if (!s.readonly && el.value !== "auto" && s.transpose) {
        const from = writtenKey(s);
        const pref = /** @type {any} */ (store.settings.enharmonicPref);
        store.update(s, { body: transposeText(s.body, s.transpose, from, pref), transpose: 0, manualKey: el.value });
        store.emit("song-open", s);
        rerender();
      } else {
        apply({ manualKey: el.value });
      }
    }
    if (el.id === "ksCapo") apply({ capo: Number(el.value) || 0 });
  });
}

/** @param {{ name: string, url: string }[]} links */
const linkRows = (links) => links.map((l, i) => `<div class="link-row" data-i="${i}">
  <input class="input" data-k="name" value="${esc(l.name)}" placeholder="${esc(t("linkName", "Name"))}" aria-label="${esc(t("linkName", "Name"))}">
  <input class="input" data-k="url" value="${esc(l.url)}" placeholder="https://" inputmode="url" aria-label="URL">
  <button class="icon-btn" type="button" data-remove="${i}" aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></div>`).join("");

/** Song details: title, artist, arranger, key, capo, tempo, notes, links. */
export function openDetails() {
  const s = store.active();
  if (!s || s.readonly) return;
  let links = s.links.map((l) => ({ ...l }));
  const body = openSheet({
    title: t("songDetails", "Song details"),
    body: `<div class="form">
      <label class="field"><span>${esc(t("songTitle", "Song title"))}</span><input class="input" id="dTitle" value="${esc(s.title === "Untitled" ? "" : s.title)}" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>${esc(t("artist", "Artist / writer"))}</span><input class="input" id="dArtist" value="${esc(s.artist)}" autocomplete="off"></label>
        <label class="field"><span>${esc(t("arranger", "Arranged by"))}</span><input class="input" id="dCreator" value="${esc(s.creator)}" autocomplete="off"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("songKey", "Song key"))}</span><select class="select" id="dKey">${keyOptions(s.manualKey, detectedKey(s))}</select></label>
        <label class="field"><span>${esc(t("capo", "Capo"))}</span><select class="select" id="dCapo">${capoOptions(s.capo)}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("genre", "Genre"))}</span><input class="input" id="dGenre" value="${esc(s.genre)}" maxlength="40" list="dGenres" autocomplete="off" placeholder="OPM, Worship, Pop…">
          <datalist id="dGenres">${[...new Set(store.songs.map((x) => x.genre).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join("")}</datalist></label>
        <label class="field"><span>${esc(t("mood", "Mood / tone"))}</span><input class="input" id="dMood" value="${esc(s.mood || "")}" maxlength="30" list="dMoods" autocomplete="off" placeholder="Joyful, Solemn, Reflective…">
          <datalist id="dMoods">${[...new Set(["Joyful", "Solemn", "Reflective", "Anthemic", "Intimate", "Upbeat", ...store.songs.map((x) => x.mood || "").filter(Boolean)])].map((m) => `<option value="${esc(m)}">`).join("")}</datalist></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("bpm", "Tempo (BPM)"))}</span><input class="input" id="dBpm" type="number" min="30" max="300" inputmode="numeric" value="${s.bpm ?? ""}"></label>
        <label class="switch-row d-bank"><span>${esc(t("inMyBank", "In my Song Bank"))}</span><input type="checkbox" class="toggle" id="dInBank"${s.inBank ? " checked" : ""}></label>
      </div>
      <label class="field"><span>${esc(t("notes", "Notes"))}</span><textarea class="input" id="dNotes" rows="3">${esc(s.description)}</textarea></label>
      <div class="field"><span>${esc(t("links", "Links"))}</span><div id="dLinks">${linkRows(links)}</div>
        <button class="btn small ghost" type="button" id="dAddLink">${icon("plus")}${esc(t("addLink", "Add link"))}</button></div>
    </div>`,
    actions: [
      { label: t("cancel", "Cancel"), kind: "ghost" },
      { label: t("save", "Save"), kind: "primary", onClick: (b) => {
        const v = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (b.querySelector("#" + id)).value;
        const bpm = Number(v("dBpm"));
        const nextKey = v("dKey");
        const capo = Math.max(0, Math.min(11, Number(v("dCapo")) || 0));
        /** @type {Partial<import("../core/store.js").Song>} */
        const patch = {
          title: v("dTitle").trim() || "Untitled",
          artist: v("dArtist").trim(),
          creator: v("dCreator").trim(),
          manualKey: nextKey,
          capo,
          bpm: bpm >= 30 && bpm <= 300 ? Math.round(bpm) : null,
          description: v("dNotes"),
          genre: v("dGenre").trim().slice(0, 40),
          mood: v("dMood").trim().slice(0, 30),
          inBank: /** @type {HTMLInputElement} */ (b.querySelector("#dInBank")).checked,
          links: links.filter((l) => l.name.trim() || l.url.trim()).map((l) => ({ name: l.name.trim(), url: l.url.trim() }))
        };
        if (nextKey !== s.manualKey && nextKey !== "auto" && s.transpose) {
          const from = writtenKey(s);
          const pref = /** @type {any} */ (store.settings.enharmonicPref);
          patch.body = transposeText(s.body, s.transpose, from, pref);
          patch.transpose = 0;
        }
        store.update(s, patch);
        store.emit("song-open", s);
      } }
    ]
  });
  const area = /** @type {HTMLElement} */ (body.querySelector("#dLinks"));
  area.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const i = Number(el.closest("[data-i]")?.getAttribute("data-i"));
    const k = /** @type {"name"|"url"} */ (el.dataset.k);
    if (links[i] && k) links[i][k] = el.value;
  });
  area.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-remove]"));
    if (!b) return;
    links.splice(Number(b.dataset.remove), 1);
    area.innerHTML = linkRows(links);
  });
  body.querySelector("#dAddLink")?.addEventListener("click", () => {
    links.push({ name: "", url: "" });
    area.innerHTML = linkRows(links);
    /** @type {HTMLInputElement|null} */ (area.querySelector(".link-row:last-child input"))?.focus();
  });
}

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
  const data = initSet ? packSet(initSet, store.setlistSongs(initSet)) : packSong(/** @type {any} */ (song));
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
      const msg = await setlistMessage(BASE(), curSet, store.setlistSongs(curSet));
      if ("share" in navigator && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: `${curSet.title} · Sonata`, text: msg }); return; } catch { /* cancelled: copy instead */ } }
      if (await copyText(msg)) toast(t("songLinksCopied", "Setlist message copied. Paste it in your group chat."), "success", { ms: 4000 });
    });
  });
  body.addEventListener("focusin", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === "shareUrl" || el.id === "liveUrl") el.select();
  });
}

/** Create or edit a setlist: title, notes, ordered songs. @param {string} [id] */
/** @param {string} [id] @param {string[]} [songIds] songs a new setlist starts with */
export function openSetlistEditor(id, songIds = []) {
  const existing = id ? store.setlists.find((s) => s.id === id) : null;
  /** @type {string[]} */
  let items = existing ? existing.items.map((i) => i.songId).filter((x) => store.song(x)) : songIds.filter((x) => store.song(x));
  let q = "";
  const chosen = () => items.length
    ? items.map((sid, i) => { const s = store.song(sid); return `<li class="set-item" data-sid="${esc(sid)}"><span class="set-num">${i + 1}</span><span class="set-name">${esc(s?.title || "")}</span><span class="key-badge small">${esc(pretty(keyShort(soundingKey(s || null))))}</span>
        <button class="icon-btn small" type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(t("moveUp", "Move up"))}">${icon("arrow-up")}</button>
        <button class="icon-btn small" type="button" data-move="1" ${i === items.length - 1 ? "disabled" : ""} aria-label="${esc(t("moveDown", "Move down"))}">${icon("arrow-down")}</button>
        <button class="icon-btn small" type="button" data-drop aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></li>`; }).join("")
    : `<li class="muted set-empty">${esc(t("noSongsInSet", "No songs yet. Pick some below."))}</li>`;
  const pool = () => {
    const fold = (/** @type {string} */ x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const f = fold(q.trim());
    return store.songs.filter((s) => !items.includes(s.id) && (!f || fold(`${s.title} ${s.artist}`).includes(f)))
      .map((s) => `<button type="button" class="pick" data-add="${esc(s.id)}">${icon("plus")}<span class="pick-text"><span class="pick-title">${esc(s.title)}</span>${s.artist ? `<span class="muted">${esc(s.artist)}</span>` : ""}</span><span class="key-badge small">${esc(pretty(keyShort(soundingKey(s))))}</span></button>`).join("")
      || `<p class="muted set-empty">${esc(q.trim() ? t("noMatches", "No matches for \"{q}\"", { q }) : t("allSongsAdded", "Every song is in this setlist."))}</p>`;
  };
  const body = openSheet({
    title: existing ? t("editSetlistTitle", "Edit setlist") : t("newSetlistTitle", "New setlist"),
    wide: true,
    body: `<div class="form">
      <label class="field"><span>${esc(t("setTitle", "Title"))}</span><input class="input" id="slTitle" value="${esc(existing?.title || "")}" placeholder="${esc(t("setTitlePh", "Friday gig, rehearsal, Sunday service…"))}" autocomplete="off"></label>
      <label class="field"><span>${esc(t("setNotes", "Notes (order, cues, who sings)"))}</span><textarea class="input" id="slNotes" rows="2">${esc(existing?.description || "")}</textarea></label>
      <div class="field"><span id="slCount">${esc(t("songsInSetN", "Songs in this setlist ({n})", { n: items.length }))}</span><ol class="set-items" id="slItems">${chosen()}</ol></div>
      <div class="field"><span>${esc(t("addSongs", "Add songs"))}</span>
        <input class="input" id="slSearch" type="search" placeholder="${esc(t("search", "Search"))}" autocomplete="off">
        <div class="pick-list" id="slPool">${pool()}</div></div>
    </div>`,
    actions: [
      { label: t("cancel", "Cancel"), kind: "ghost" },
      { label: t("save", "Save"), kind: "primary", onClick: (b) => {
        if (!items.length) { toast(t("setNeedsSongs", "Add at least one song."), "error"); return false; }
        const title = /** @type {HTMLInputElement} */ (b.querySelector("#slTitle")).value.trim() || "Setlist";
        const description = /** @type {HTMLTextAreaElement} */ (b.querySelector("#slNotes")).value;
        store.saveSetlist({ id: existing?.id, title, description, items: items.map((songId) => ({ songId })) });
        toast(t("setlistSaved", "Setlist saved"), "success");
        app.refresh();
      } }
    ]
  });
  const list = /** @type {HTMLElement} */ (body.querySelector("#slItems"));
  const poolEl = /** @type {HTMLElement} */ (body.querySelector("#slPool"));
  const redraw = () => {
    list.innerHTML = chosen();
    poolEl.innerHTML = pool();
    /** @type {HTMLElement} */ (body.querySelector("#slCount")).textContent = t("songsInSetN", "Songs in this setlist ({n})", { n: items.length });
  };
  body.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const add = /** @type {HTMLElement|null} */ (el.closest("[data-add]"));
    if (add) { items.push(add.dataset.add || ""); redraw(); return; }
    const row = el.closest("[data-sid]");
    if (!row) return;
    const i = items.indexOf(row.getAttribute("data-sid") || "");
    const mv = /** @type {HTMLElement|null} */ (el.closest("[data-move]"));
    if (mv) { const j = i + Number(mv.dataset.move); if (j >= 0 && j < items.length) { [items[i], items[j]] = [items[j], items[i]]; redraw(); } }
    if (el.closest("[data-drop]")) { items.splice(i, 1); redraw(); }
  });
  body.querySelector("#slSearch")?.addEventListener("input", (e) => { q = /** @type {HTMLInputElement} */ (e.target).value; poolEl.innerHTML = pool(); });
}

/** Import a shared setlist after the user confirms. @param {any} data */
/**
 * @param {any} data a shared setlist @param {string} [source] the live setlist file it came from;
 *   the saved setlist then follows that file and is brought up to date when it changes
 */
export function openImportSet(data, source = "") {
  const songs = Array.isArray(data?.s) ? data.s : [];
  const songRow = (/** @type {any} */ s) => {
    const k = parseKey(s?.k) || (s?.b ? detectKey(s.b) : null);
    const meta = [
      s?.a || "",
      s?.bpm ? `${s.bpm} BPM` : "",
      s?.c ? t("capoN", "Capo {n}", { n: s.c }) : ""
    ].filter(Boolean).join(" · ");
    return `<li><div class="import-set-row"><span class="import-set-info"><strong>${esc(s?.t || "Untitled")}</strong>${meta ? `<small class="muted">${esc(meta)}</small>` : ""}</span>${k ? `<span class="key-badge small">${esc(pretty(keyShort(k)))}</span>` : ""}</div></li>`;
  };
  const save = (/** @type {boolean} */ present) => {
    const ids = songs.map((/** @type {any} */ sd) => adoptShared(unpackSong(sd)).song.id);
    const set = store.saveSetlist({ title: data.t || "Setlist", description: data.d || "", links: Array.isArray(data.l) ? data.l : [], items: ids.map((/** @type {string} */ songId) => ({ songId })), ...(source ? { source } : {}) });
    store.playSetlist(set.id);
    app.drive?.schedule();
    if (present) app.openStage(); else app.show("editor");
    toast(t("setlistSaved", "Setlist saved"), "success");
  };
  openSheet({
    title: t("importSetTitle", "Open shared setlist"),
    body: `<h3 class="sheet-sub">${esc(data.t || "Setlist")}</h3>${data.d ? `<p class="card-hint">${esc(data.d)}</p>` : ""}<p class="sheet-text">${esc(t("importSetText", "{n} songs. The setlist and its songs will be saved to your library.", { n: songs.length }))}</p>${source ? `<p class="card-hint">${esc(t("liveFollow", "This is a live setlist. When its owner changes it, your copy is brought up to date and your own keys are kept."))}</p>` : ""}
      <ol class="import-list import-set-list">${songs.map(songRow).join("")}</ol>`,
    actions: [
      { label: t("cancel", "Cancel"), kind: "ghost" },
      { label: t("saveAndPresent", "Save & stage"), onClick: () => save(true) },
      { label: t("importSet", "Save setlist"), kind: "primary", onClick: () => save(false) }
    ]
  });
}

/** Quick song switcher (⌘K / Ctrl+K, Chart header, Setlist title, Stage title). */
export function openSongSwitcher() {
  const cur = store.currentSetlist();
  const fold = (/** @type {string} */ s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let q = "";
  let cursor = 0;

  const matchingEntries = () => {
    const f = fold(q.trim());
    const match = (/** @type {import("../core/store.js").Song} */ s) => !f || fold(`${s.title} ${s.artist} ${s.genre}`).includes(f);
    /** @type {{ kind: "set"|"song", id: string, idx?: number, song: import("../core/store.js").Song }[]} */
    const entries = [];
    const seenInSet = new Set();
    if (cur) {
      cur.songs.forEach((song, idx) => {
        if (!match(song)) return;
        entries.push({ kind: "set", id: song.id, idx, song });
        seenInSet.add(song.id);
      });
    }
    const sorted = store.songs.slice().sort((a, b) => (Date.parse(b.lastOpenedAt || b.updatedAt) || 0) - (Date.parse(a.lastOpenedAt || a.updatedAt) || 0));
    for (const song of sorted) {
      if (cur && !f && seenInSet.has(song.id)) continue;
      if (cur && f && seenInSet.has(song.id)) continue;
      if (match(song)) entries.push({ kind: "song", id: song.id, song });
    }
    return entries;
  };

  const renderList = () => {
    const entries = matchingEntries();
    if (!entries.length) return `<p class="muted set-empty">${esc(q.trim() ? t("noMatches", "No matches for \"{q}\"", { q }) : t("noSong", "No song open"))}</p>`;
    cursor = Math.max(0, Math.min(entries.length - 1, cursor));
    const setEntries = entries.filter((e) => e.kind === "set");
    const libEntries = entries.filter((e) => e.kind === "song");
    let flatIdx = 0;
    const renderRow = (/** @type {typeof entries[number]} */ e) => {
      const i = flatIdx++;
      const s = e.song;
      const on = e.kind === "set" ? (cur && e.idx === cur.index) : (!cur && s.id === store.activeId);
      const sel = i === cursor;
      const k = !s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s)));
      const sub = [s.artist, s.bpm ? `${s.bpm} BPM` : "", s.capo ? t("capoN", "Capo {n}", { n: s.capo }) : ""].filter(Boolean).join(" · ");
      return `<button type="button" class="sw-opt${on ? " on" : ""}${sel ? " sel" : ""}" data-sw-kind="${e.kind}" data-sw-id="${esc(s.id)}"${e.idx !== undefined ? ` data-sw-idx="${e.idx}"` : ""}${on ? ' aria-current="true"' : ""}>
        ${e.idx !== undefined ? `<span class="sw-num">${e.idx + 1}</span>` : ""}
        <span class="key-badge small">${esc(k)}</span>
        <span class="sw-text"><strong>${esc(s.title || t("untitled", "Untitled"))}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
        ${on ? icon("check") : ""}
      </button>`;
    };
    let html = "";
    if (setEntries.length && cur) {
      html += `<p class="mini-label sw-group">${esc(cur.set.title)} · ${esc(t("songsInSet", "{n} songs", { n: cur.songs.length }))}</p>`;
      html += setEntries.map(renderRow).join("");
    }
    if (libEntries.length) {
      html += `<p class="mini-label sw-group">${esc(cur ? t("allSongs", "All songs") : t("songsTitle", "Songs"))}</p>`;
      html += libEntries.map(renderRow).join("");
    }
    return html;
  };

  const body = openSheet({
    title: t("switchSong", "Switch song"),
    body: `<div class="switcher">
      <label class="search">
        <span data-icon="search"></span>
        <input id="swSearch" type="search" autocomplete="off" placeholder="${esc(t("switchSearchPh", "Type a song title, artist, or genre…"))}" aria-label="${esc(t("switchSong", "Switch song"))}">
      </label>
      <div class="sw-list" id="swList" aria-label="${esc(t("songsTitle", "Songs"))}">${renderList()}</div>
    </div>`,
    actions: [{ label: t("close", "Close"), kind: "ghost" }]
  });

  const listEl = /** @type {HTMLElement} */ (body.querySelector("#swList"));
  const searchEl = /** @type {HTMLInputElement} */ (body.querySelector("#swSearch"));
  const activate = (/** @type {HTMLElement|null} */ btn) => {
    if (!btn) return;
    const kind = btn.dataset.swKind;
    if (kind === "set" && cur) {
      store.playSetlist(cur.set.id, Number(btn.dataset.swIdx || 0));
    } else {
      const id = btn.dataset.swId || "";
      store.exitSetlist();
      store.open(id);
    }
    if (!document.body.classList.contains("stage-open") && app.view !== "editor") app.show("editor");
    closeSheet();
  };

  searchEl.addEventListener("input", () => {
    q = searchEl.value;
    cursor = 0;
    listEl.innerHTML = renderList();
    paintIcons(listEl);
  });
  searchEl.addEventListener("keydown", (e) => {
    const btns = /** @type {HTMLElement[]} */ ([...listEl.querySelectorAll(".sw-opt")]);
    if (!btns.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor = (cursor + 1) % btns.length;
      listEl.innerHTML = renderList();
      paintIcons(listEl);
      listEl.querySelector(".sw-opt.sel")?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor - 1 + btns.length) % btns.length;
      listEl.innerHTML = renderList();
      paintIcons(listEl);
      listEl.querySelector(".sw-opt.sel")?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(btns[cursor] || btns[0]);
    }
  });
  listEl.addEventListener("click", (e) => {
    activate(/** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(".sw-opt")));
  });
}

/** Settings sheet. */
export function openSettings() {
  const s = store.settings;
  const opt = (/** @type {string} */ v, /** @type {string} */ label, /** @type {any} */ cur) => `<option value="${v}"${String(cur) === v ? " selected" : ""}>${esc(label)}</option>`;
  const accents = [["blue", "Blue"], ["teal", "Teal"], ["violet", "Violet"], ["rose", "Rose"], ["amber", "Amber"]];
  const standalone = matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone;
  const body = openSheet({
    title: t("settingsTitle", "Settings"),
    body: `<div class="form settings">
      <h3 class="group-title">${esc(t("appearance", "Appearance"))}</h3>
      <div class="field-row">
        <label class="field"><span>${esc(t("theme", "Theme"))}</span><select class="select" data-set="theme">${opt("system", t("themeSystem", "Match device"), s.theme)}${opt("light", t("themeLight", "Light"), s.theme)}${opt("dark", t("themeDark", "Dark"), s.theme)}</select></label>
        <label class="field"><span>${esc(t("language", "Language"))}</span><select class="select" data-set="language">${opt("en", "English", s.language)}${opt("fil", "Filipino", s.language)}</select></label>
      </div>
      <label class="field"><span>${esc(t("uiText", "Interface text"))}</span><select class="select" data-set="uiText">${opt("s", t("sizeSmall", "Small"), s.uiText)}${opt("m", t("sizeMedium", "Medium"), s.uiText)}${opt("l", t("sizeLarge", "Large"), s.uiText)}</select></label>
      <div class="field"><span>${esc(t("color", "Color"))}</span><div class="swatches">${accents.map(([v, l]) => `<button type="button" class="swatch${s.accentTheme === v ? " on" : ""}" data-accent="${v}" style="--sw:var(--sw-${v})" aria-label="${l}" aria-pressed="${s.accentTheme === v}"></button>`).join("")}</div></div>
      <label class="field"><span>${esc(t("chartText", "Chart text size"))} <output id="fsOut">${s.previewFontSize}px</output></span><input class="range" type="range" min="12" max="28" data-set="previewFontSize" value="${s.previewFontSize}"></label>
      <label class="field"><span>${esc(t("lineSpacing", "Line spacing"))} <output id="lhOut">${s.editorLineHeight.toFixed(2)}</output></span><input class="range" type="range" min="1.2" max="2.2" step="0.05" data-set="editorLineHeight" value="${s.editorLineHeight}"></label>
      <label class="switch-row"><span>${esc(t("haptics", "Vibrate on tap"))}</span><input type="checkbox" class="toggle" data-set="haptics"${s.haptics ? " checked" : ""}></label>
      <label class="switch-row"><span>${esc(t("autoArranger", "Add my name as arranger"))}</span><input type="checkbox" class="toggle" data-set="autoFillArranger"${s.autoFillArranger ? " checked" : ""}></label>
      <h3 class="group-title">${esc(t("data", "Data & backup"))}</h3>
      <p class="card-hint" id="storageNote">${esc(t("storageLocal", "Your songs are saved on this device."))}</p>
      <button class="btn wide" type="button" id="openBackupBtn">${icon("cloud")}${esc(t("backupTitle", "Backup & restore"))}</button>
      <button class="btn wide" type="button" id="openAiMcpBtn">${icon("sparkles")}${esc(t("aiMcpTitle", "AI Agents & MCP"))}</button>
      <div id="soundsRow"><button class="btn wide" type="button" id="soundsBtn">${icon("download")}${esc(t("soundsKeep", "Keep instrument sounds on this device (3.8 MB)"))}</button></div>
      ${standalone ? "" : `<button class="btn wide" type="button" id="installBtn">${icon("download")}${esc(t("install", "Install Sonata"))}</button>`}
      <div class="btn-row">
        <button class="btn ghost" type="button" id="aboutBtn">${icon("info")}${esc(t("aboutTitle", "About Sonata"))}</button>
        <button class="btn ghost" type="button" id="resetSettings">${esc(t("resetSettings", "Reset settings"))}</button>
      </div>
    </div>`
  });
  // Instrument sounds: normally each is saved the first time it is played. This saves them all, for playing offline.
  const soundsRow = /** @type {HTMLElement} */ (body.querySelector("#soundsRow"));
  const soundsDone = () => { soundsRow.innerHTML = `<p class="status-line synced">${esc(t("soundsKept", "All instrument sounds are on this device and work offline."))}</p>`; };
  const soundsCache = () => ("caches" in window ? caches.open("sonata-samples") : Promise.reject(new Error("no cache")));
  soundsCache().then(async (c) => { if ((await c.keys()).length >= sampleUrls().length) soundsDone(); }).catch(() => { soundsRow.hidden = true; });
  soundsRow.addEventListener("click", async (e) => {
    const b = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("#soundsBtn"));
    if (!b || b.disabled) return;
    b.disabled = true;
    const urls = sampleUrls();
    try {
      const c = await soundsCache();
      for (let i = 0; i < urls.length; i++) {
        if (!(await c.match(urls[i]))) { const r = await fetch(urls[i]); if (!r.ok) throw new Error(String(r.status)); await c.put(urls[i], r); }
        b.textContent = t("soundsSaving", "Saving sounds… {n} of {m}", { n: i + 1, m: urls.length });
      }
      soundsDone();
    } catch {
      b.disabled = false; b.textContent = t("soundsKeep", "Keep instrument sounds on this device (3.8 MB)");
      toast(navigator.onLine ? t("soundsFailed", "Couldn't save the sounds. Please try again.") : t("offline", "Offline"), "error");
    }
  });
  // Say plainly whether the browser may clear the songs, and what to do about it.
  (async () => {
    const kept = await navigator.storage?.persisted?.().catch(() => false);
    const backedUp = Boolean(app.drive?.signedIn);
    const note = body.querySelector("#storageNote");
    if (note) note.textContent = kept
      ? t("storageKept", "Your songs are saved on this device, and the browser will not clear them on its own.")
      : backedUp ? t("storageDrive", "Your songs are saved on this device and backed up to your Google Drive.")
      : t("storageRisk", "Your songs are saved on this device only. A browser can clear them when space runs low, so back up to Google Drive or save a backup file.");
  })();
  body.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const k = el.dataset.set;
    if (!k) return;
    const v = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
    /** @type {any} */ (s)[k] = v;
    if (k === "previewFontSize") /** @type {HTMLElement} */ (body.querySelector("#fsOut")).textContent = `${v}px`;
    if (k === "editorLineHeight") /** @type {HTMLElement} */ (body.querySelector("#lhOut")).textContent = Number(v).toFixed(2);
    // Filipino words load on first use; repaint once they are here.
    if (k === "language") { setLang(String(v)).then(() => { applyI18n(); store.changed("settings"); }); return; }
    store.changed("settings");
  });
  body.addEventListener("click", async (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const sw = /** @type {HTMLElement|null} */ (el.closest("[data-accent]"));
    if (sw) {
      s.accentTheme = sw.dataset.accent || "blue";
      body.querySelectorAll("[data-accent]").forEach((b) => { b.classList.toggle("on", b === sw); b.setAttribute("aria-pressed", String(b === sw)); });
      store.changed("settings");
    }
    const id = /** @type {HTMLElement|null} */ (el.closest("button"))?.id;
    if (id === "openBackupBtn") openBackup();
    if (id === "openAiMcpBtn") openBackup("ai");
    if (id === "installBtn") showInstall();
    if (id === "aboutBtn") openAbout();
    if (id === "resetSettings") {
      const lang = s.language;
      store.settings = normalizeSettings({ ...DEFAULT_SETTINGS, language: lang });
      store.changed("settings");
      closeSheet();
      toast(t("settingsReset", "Settings reset"), "success");
    }
  });
}

function showInstall() {
  const p = /** @type {any} */ (app).installPrompt;
  if (p) { p.prompt(); p.userChoice.finally(() => { /** @type {any} */ (app).installPrompt = null; }); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  openSheet({ title: t("install", "Install Sonata"), body: `<p class="sheet-text">${esc(ios ? t("installIos", "On iPhone/iPad: tap Share in Safari, then \"Add to Home Screen\".") : t("installOther", "Use your browser menu and choose \"Install app\" or \"Add to Home screen\"."))}</p>`, actions: [{ label: t("close", "Close"), kind: "primary" }] });
}

/** About Sonata and release notes. */
export async function openAbout() {
  const body = openSheet({
    title: t("aboutTitle", "About Sonata"),
    wide: true,
    body: `<div class="about">
      <div class="about-head"><img src="/icons/icon.svg" alt="" width="56" height="56"><div><h3>Sonata <span class="version">v${esc(/** @type {any} */ (app).version || "")}</span></h3>
      <p class="muted">Chord charts and music tools for every musician: gigs, practice, lessons and church. Made by Jethro Frane.</p></div></div>
      <ul class="about-points">
        <li>Free, no account needed. Songs are saved on your device.</li>
        <li>Works offline after the first visit. Install it for the stage.</li>
        <li>Optional Google Drive backup uses one file only Sonata can see. Earlier versions of your library are kept on your device.</li>
        <li>A Song Bank is shared only when you publish it: one file in your own Drive that anyone with its link can read. Sonata stores no copy.</li>
        <li>No ads. Anonymous page-view counts only (Vercel Web Analytics, no cookies).</li>
      </ul>
      <p class="about-links"><a href="/privacy" target="_blank" rel="noopener">${esc(t("privacyTerms", "Privacy & terms"))}</a><a href="https://jethrofrane.xyz" target="_blank" rel="noopener">${esc(t("contact", "Contact"))}</a></p>
      <h3 class="group-title">${esc(t("whatsNew", "What's new"))}</h3>
      <div class="changelog" id="changelog"><p class="muted">…</p></div>
    </div>`
  });
  try {
    const logs = await (await fetch("/update_log.json", { cache: "no-cache" })).json();
    /** @type {HTMLElement} */ (body.querySelector("#changelog")).innerHTML = logs.slice(0, 8).map((/** @type {any} */ v, /** @type {number} */ i) => `<details${i === 0 ? " open" : ""}><summary><strong>v${esc(v.version)}</strong><span class="muted">${esc(v.date)}</span></summary>
      <p class="log-lead">${esc(v.whatsNew || "")}</p><ul>${(v.changes || []).map((/** @type {string} */ c) => `<li>${esc(c)}</li>`).join("")}</ul></details>`).join("");
  } catch { /** @type {HTMLElement} */ (body.querySelector("#changelog")).innerHTML = `<p class="muted">Release notes are available online.</p>`; }
}

/**
 * Add songs from pasted Sonata links (one song per link, or a whole-setlist link). When the
 * message came from "Song links" (first line "Setlist: …"), the setlist is rebuilt too.
 * @param {string} [text]
 */
export function openLinksImport(text = "") {
  /** @type {Awaited<ReturnType<typeof parseLinks>>} */
  let found = { title: "", songs: [], sets: [] };
  /** @type {ReturnType<typeof analyzeRawChart>} */
  let analyzed = null;
  /** What happened to a pasted web link: "" (none), "reading", or why it could not be read. */
  let web = "";
  let chordsOnlyImport = false;
  const WEB_NOTE = /** @type {Record<string, [string, string]>} */ ({
    reading: ["webReading", "Reading the page…"],
    offline: ["webOffline", "You are offline. Open the page, copy the chords and paste them here."],
    "no-chords": ["webNoChords", "No chords were found on that page. Copy the chords from it and paste them here."],
    "not-found": ["webNotFound", "That page could not be found. Check the link."],
    "bad-url": ["webBadUrl", "That link can't be read. Copy the chords from the page and paste them here."],
    "slow-down": ["webSlowDown", "That was a lot of links in a short time. Wait a minute and try again, or paste the chords here."],
    blocked: ["webBlocked", "That site does not let Sonata read its pages. Open it, copy the chords and paste them here."]
  });
  const analyzedBody = () => {
    if (!analyzed) return "";
    if (!chordsOnlyImport) return analyzed.body;
    const stripped = stripLyricsToChordsOnly(analyzed.body, { key: parseKey(analyzed.manualKey) || undefined });
    return stripped || analyzed.body;
  };
  const summary = () => {
    if (web && !analyzed) {
      const [key, en] = WEB_NOTE[web] || WEB_NOTE.blocked;
      return `<p class="status-line${web === "reading" ? "" : " error"}" role="status">${esc(t(key, en))}</p>`;
    }
    const n = found.songs.length + found.sets.reduce((a, s) => a + s.s.length, 0);
    if (n) {
      return `<p class="status-line synced">${esc(t("linksFound", "Found {n} songs", { n }))}${found.sets.length ? ` · ${esc(t("linksSets", "{n} setlists", { n: found.sets.length }))}` : ""}</p>
        <ol class="import-list">${found.songs.map((s) => `<li>${esc(s.t || "Untitled")}${s.a ? ` <span class="muted">· ${esc(s.a)}</span>` : ""}</li>`).join("")}${found.sets.map((s) => `<li><b>${esc(s.t)}</b> <span class="muted">· ${esc(t("songsInSet", "{n} songs", { n: s.s.length }))}</span></li>`).join("")}</ol>
        ${found.songs.length > 1 ? `<label class="switch-row"><span>${esc(t("linksMakeSet", "Also make a setlist"))}</span><input type="checkbox" class="toggle" id="lkMakeSet" checked></label>
          <label class="field"><span>${esc(t("setTitle", "Title"))}</span><input class="input" id="lkSetTitle" value="${esc(found.title || t("importedSetlist", "Imported setlist"))}" maxlength="80"></label>` : ""}`;
    }
    if (analyzed) {
      const previewBody = analyzedBody();
      const detKey = detectKey(analyzed.body);
      const effKey = parseKey(analyzed.manualKey) || detKey || parseKey(analyzed.keyName);
      const statusKey = effKey ? effKey.name : analyzed.keyName;
      return `<div class="analyzed-chart">
        <p class="status-line synced">${esc(t("chartReady", "Chart ready"))} · <strong>${esc(pretty(statusKey))}</strong>${analyzed.capo ? ` · Capo ${analyzed.capo}` : ""}${analyzed.bpm ? ` · ${analyzed.bpm} BPM` : ""}</p>
        <p class="import-title"><strong>${esc(analyzed.title)}</strong>${analyzed.artist ? ` <span class="muted">· ${esc(analyzed.artist)}</span>` : ""}</p>
        <div class="field-row import-overrides">
          <label class="field"><span>${esc(t("songKey", "Song key"))}</span><select class="select" id="lkKey">${keyOptions(analyzed.manualKey || "auto", detKey)}</select></label>
          <label class="field"><span>${esc(t("capo", "Capo"))}</span><select class="select" id="lkCapo">${capoOptions(analyzed.capo || 0)}</select></label>
        </div>
        <label class="switch-row import-chords-only"><span>${esc(t("importChordsOnly", "Chords only (without lyrics)"))}</span><input type="checkbox" class="toggle" id="lkChordsOnly"${chordsOnlyImport ? " checked" : ""}></label>
        <pre class="import-preview" tabindex="0" aria-label="${esc(t("preview", "Preview"))}">${esc(pretty(previewBody.split("\n").slice(0, 12).join("\n")))}</pre>
      </div>`;
    }
    return `<p class="muted">${esc(t("importNone", "Paste a link or chords to see what will be added."))}</p>`;
  };
  const body = openSheet({
    title: t("importSongs", "Import"), wide: true, focus: !text,
    body: `<div class="form"><label class="field"><span>${esc(t("importPaste", "Paste a link to a chord page, the chords themselves, or Sonata links"))}</span><textarea class="input" id="lkText" rows="6" placeholder="${esc(t("importPh", "https://…  or  G   D/F#   Em   C"))}">${esc(text)}</textarea></label>
      <label class="btn small ghost import-file"><span data-icon="file"></span><span>${esc(t("importFile", "Choose a file (.txt, ChordPro)"))}</span><input type="file" id="lkFile" accept=".txt,.cho,.chopro,.chordpro,.pro,.crd,text/plain" hidden></label>
      <div id="lkFound" aria-live="polite">${summary()}</div></div>`,
    actions: [
      { label: t("cancel", "Cancel"), kind: "ghost" },
      { label: t("add", "Add"), kind: "primary", onClick: (b) => {
        const n = found.songs.length + found.sets.length;
        if (!n && analyzed) {
          if (chordsOnlyImport && store.settings.viewMode === "lyrics") {
            store.settings.viewMode = "chords";
            store.changed("settings");
          }
          const song = store.createSong({
            title: analyzed.title,
            artist: analyzed.artist,
            manualKey: analyzed.manualKey,
            capo: analyzed.capo,
            bpm: analyzed.bpm,
            body: analyzedBody(),
            links: analyzed.links
          });
          store.open(song.id);
          toast(t("chartImported", "Added in {key}. Check it, then edit anything that is off.", { key: pretty(analyzed.keyName) }), "success", { ms: 4500 });
          app.show("editor");
          app.refresh();
          return;
        }
        if (!n) { toast(t("importNone", "Paste a link or chords to see what will be added."), "error"); return false; }
        /** Reuse a song that is already saved, bringing an older copy up to date. @param {any} d */
        const add = (d) => adoptShared(unpackSong(d)).song.id;
        const ids = found.songs.map(add);
        for (const set of found.sets) store.saveSetlist({ title: set.t || "Setlist", description: set.d || "", items: set.s.map((d) => ({ songId: add(d) })) });
        const make = /** @type {HTMLInputElement|null} */ (b.querySelector("#lkMakeSet"));
        let made = null;
        if (make?.checked && ids.length > 1) made = store.saveSetlist({ title: /** @type {HTMLInputElement} */ (b.querySelector("#lkSetTitle")).value.trim() || "Setlist", description: "", items: ids.map((songId) => ({ songId })) });
        toast(made ? t("linksAddedSet", "Added {n} songs and the setlist", { n: ids.length }) : t("linksAdded", "Added {n} songs", { n: ids.length + found.sets.reduce((a, s) => a + s.s.length, 0) }), "success");
        app.show("songs");
        app.refresh();
      } }
    ]
  });
  const area = /** @type {HTMLTextAreaElement} */ (body.querySelector("#lkText"));
  let timer = /** @type {any} */ (0);
  let turn = 0;
  const read = async () => {
    const mine = ++turn;
    const value = area.value;
    found = await parseLinks(value);
    if (mine !== turn) return;
    const n = found.songs.length + found.sets.reduce((a, s) => a + s.s.length, 0);
    const link = n ? "" : loneLink(value);
    web = "";
    analyzed = n || link ? null : analyzeRawChart(value);
    const paint = () => { /** @type {HTMLElement} */ (body.querySelector("#lkFound")).innerHTML = summary(); };
    if (!link) { paint(); return; }
    // One web link on its own: read the page and build the chart from it.
    if (!navigator.onLine) { web = "offline"; paint(); return; }
    web = "reading"; paint();
    /** @type {any} */
    let page = null;
    try {
      const r = await fetch(`/api/import?url=${encodeURIComponent(link)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      page = await r.json();
    } catch { page = { error: "blocked" }; }
    if (mine !== turn) return;
    const srcUrl = page?.source || link;
    analyzed = page && typeof page.text === "string"
      ? analyzeRawChart([srcUrl, page.title ? `Title: ${page.title}` : "", page.artist ? `Artist: ${page.artist}` : "", page.text].filter(Boolean).join("\n"))
      : null;
    web = analyzed ? "" : String(page?.error || "no-chords");
    paint();
  };
  const file = /** @type {HTMLInputElement} */ (body.querySelector("#lkFile"));
  const takeFile = async (/** @type {File|undefined} */ f) => {
    if (!f) return;
    if (f.size > 512 * 1024) { toast(t("importTooBig", "That file is too large to be a chord chart."), "error"); return; }
    area.value = await f.text();
    read();
  };
  file.addEventListener("change", () => { takeFile(file.files?.[0]); file.value = ""; });
  body.addEventListener("change", (e) => {
    const el = /** @type {HTMLInputElement|HTMLSelectElement} */ (e.target);
    if (el.id === "lkChordsOnly") {
      chordsOnlyImport = /** @type {HTMLInputElement} */ (el).checked;
      const pre = /** @type {HTMLElement|null} */ (body.querySelector(".import-preview"));
      if (pre && analyzed) pre.textContent = pretty(analyzedBody().split("\n").slice(0, 12).join("\n"));
    } else if (analyzed && (el.id === "lkKey" || el.id === "lkCapo")) {
      if (el.id === "lkKey") {
        analyzed.manualKey = el.value;
        const k = parseKey(el.value) || detectKey(analyzed.body);
        if (k) analyzed.keyName = k.name;
      } else {
        analyzed.capo = Math.max(0, Math.min(11, Number(el.value) || 0));
      }
      const st = /** @type {HTMLElement|null} */ (body.querySelector(".analyzed-chart .status-line"));
      if (st) st.innerHTML = `${esc(t("chartReady", "Chart ready"))} · <strong>${esc(pretty(analyzed.keyName))}</strong>${analyzed.capo ? ` · Capo ${analyzed.capo}` : ""}${analyzed.bpm ? ` · ${analyzed.bpm} BPM` : ""}`;
    }
  });
  body.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
  body.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); takeFile(f); } });
  area.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(read, 200); });
  if (text) read();
}
