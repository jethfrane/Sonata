// @ts-check
// Dialog sheets: key & capo, song details, share, setlist editor, settings,
// Drive account, about, and shared-setlist import.
import { esc, icon, toast, openSheet, closeSheet, copyText, download, slug, relativeTime, paintIcons } from "./dom.js";
import { t, getLang, setLang, applyI18n } from "./i18n.js";
import { store, app, detectedKey, soundingKey, shapeKey, writtenKey, signed, tick } from "./ctx.js";
import { keyShort, parseKey, pretty, transposeText, keyFromTonic, keyValue } from "../core/music.js";
import { analyzeRawChart } from "../core/chart.js";
import { loneLink } from "../core/import.js";
import { packSong, packSet, shareUrl, unpackSong, qrUrl, parseLinks, setlistMessage } from "../core/share.js";
import { normalizeSettings, validateBackup, DEFAULT_SETTINGS } from "../core/store.js";
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

/** Key, transpose, capo and spelling for the open song (the editor's key pill). */
export function openKeySheet() {
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
      <div class="field"><span>${esc(t("transpose", "Transpose"))}</span>
        <div class="stepper"><button class="icon-btn" type="button" data-tr="-1" aria-label="${esc(t("transposeDown", "Down a half step"))}">${icon("minus")}</button>
        <output aria-live="polite">${esc(signed(s.transpose))}</output>
        <button class="icon-btn" type="button" data-tr="1" aria-label="${esc(t("transposeUp", "Up a half step"))}">${icon("plus")}</button></div></div>
      <div class="field-row">
        <label class="field"><span>${esc(t("songKey", "Song key"))}</span><select class="select" id="ksKey"${s.readonly ? " disabled" : ""}>${keyOptions(s.manualKey, det)}</select></label>
        <label class="field"><span>${esc(t("capo", "Capo"))}</span><select class="select" id="ksCapo">${capoOptions(s.capo)}</select></label>
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
  const rerender = () => { body.innerHTML = render(); };
  /** @param {Partial<import("../core/store.js").Song>} patch */
  const apply = (patch) => {
    if (s.readonly) { Object.assign(s, patch); store.emit("change", "view"); } else store.update(s, patch);
    rerender();
  };
  body.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const tr = /** @type {HTMLElement|null} */ (target.closest("[data-tr]"));
    const sp = /** @type {HTMLElement|null} */ (target.closest("[data-spelling]"));
    if (tr) {
      tick();
      let next = s.transpose + Number(tr.dataset.tr);
      if (next > 11) next -= 12;
      if (next < -11) next += 12;
      apply({ transpose: next });
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
    if (el.id === "ksKey") apply({ manualKey: el.value });
    if (el.id === "ksCapo") apply({ capo: Number(el.value) });
  });
}

/** @param {{ name: string, url: string }[]} links */
const linkRows = (links) => links.map((l, i) => `<div class="link-row" data-i="${i}">
  <input class="input" data-k="name" value="${esc(l.name)}" placeholder="${esc(t("linkName", "Name"))}" aria-label="${esc(t("linkName", "Name"))}">
  <input class="input" data-k="url" value="${esc(l.url)}" placeholder="https://" inputmode="url" aria-label="URL">
  <button class="icon-btn" type="button" data-remove="${i}" aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></div>`).join("");

/** Song details: title, artist, arranger, key, tempo, notes, links. */
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
        <label class="field"><span>${esc(t("bpm", "Tempo (BPM)"))}</span><input class="input" id="dBpm" type="number" min="30" max="300" inputmode="numeric" value="${s.bpm ?? ""}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(t("genre", "Genre"))}</span><input class="input" id="dGenre" value="${esc(s.genre)}" maxlength="40" list="dGenres" autocomplete="off" placeholder="OPM, Worship, Pop…">
          <datalist id="dGenres">${[...new Set(store.songs.map((x) => x.genre).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join("")}</datalist></label>
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
        store.update(s, {
          title: v("dTitle").trim() || "Untitled",
          artist: v("dArtist").trim(),
          creator: v("dCreator").trim(),
          manualKey: v("dKey"),
          bpm: bpm >= 30 && bpm <= 300 ? Math.round(bpm) : null,
          description: v("dNotes"),
          genre: v("dGenre").trim().slice(0, 40),
          inBank: /** @type {HTMLInputElement} */ (b.querySelector("#dInBank")).checked,
          links: links.filter((l) => l.name.trim() || l.url.trim()).map((l) => ({ name: l.name.trim(), url: l.url.trim() }))
        });
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
  const qr = qrModules(url, ["L", "M"]);
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
  const set = setId ? store.setlists.find((s) => s.id === setId) : null;
  const song = set ? null : store.active();
  if (!set && !song) { toast(t("noSong", "No song open"), "error"); return; }
  const data = set ? packSet(set, store.setlistSongs(set)) : packSong(/** @type {any} */ (song));
  const title = set ? set.title : /** @type {any} */ (song).title;
  const [{ qrSvg }, link, qrLink] = await Promise.all([loadQr(), shareUrl(BASE(), data), qrUrl(location.origin, data)]);
  let url = link;
  const opts = readExportOpts();
  const many = set ? store.setlistSongs(set).length : (store.currentSetlist()?.songs.length || 1);
  const draw = () => {
    // The QR holds the upper-case form of the link (QR alphanumeric mode: a smaller, easier-to-scan code).
    const qrText = url.includes("tinyurl.com") ? url : qrLink;
    const svg = qrSvg(qrText, { ecc: "L", margin: 4 });
    const short = !url.includes("tinyurl.com") && url.length > 300;
    return `<div class="share">
      <div class="share-top">
        <div class="qr-box">${svg || `<p>${esc(t("qrTooLong", "This song is too long for a QR code. The link still works."))}</p>`}</div>
        <div class="share-side">
          <p class="card-text">${esc(t("shareHow2", "Anyone can open the link or scan the code to see the chart and save it. No account needed."))}</p>
          <div class="share-link"><input class="input" id="shareUrl" readonly value="${esc(url)}" aria-label="Link"></div>
          <div class="share-actions">
            <button class="btn primary" type="button" id="shareCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button>
            ${"share" in navigator ? `<button class="btn" type="button" id="shareNative">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
            ${svg ? `<button class="btn" type="button" id="shareQr">${icon("qr")}${esc(t("downloadQr", "QR image"))}</button>` : ""}
            ${set ? `<button class="btn" type="button" id="shareSongLinks">${icon("link")}${esc(t("songLinks", "Song links"))}</button>` : ""}
            ${short ? `<button class="btn" type="button" id="shareShort">${esc(t("shortLink", "Make a short link"))}</button>` : ""}
          </div>
          ${short ? `<p class="card-hint">${esc(t("shortLinkNote", "This sends the link to TinyURL to shorten it."))}</p>` : ""}
          ${set ? `<p class="card-hint">${esc(t("songLinksHint", "Song links: one short link per song in a message. Anyone can paste the whole message into Sonata (Songs → Add from links) to get the setlist."))}</p>` : ""}
        </div>
      </div>
      <h3 class="group-title">${esc(t("exportFiles", "Export"))}${many > 1 ? ` <span class="muted">· ${esc(t("songsInSet", "{n} songs", { n: many }))}</span>` : ""}</h3>
      <div class="export-grid">
        <button class="btn" type="button" data-export="pdf">${icon("file")}PDF</button>
        ${set ? "" : `<button class="btn" type="button" data-export="png">${icon("image")}PNG</button>`}
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
  const body = openSheet({ title: set ? t("shareSetTitle", "Share setlist") : t("shareTitle", "Share \"{title}\"", { title }), body: draw(), wide: true, className: "share-sheet", focus: false });
  const busy = async (/** @type {HTMLElement} */ b, /** @type {() => Promise<void>|void} */ fn) => {
    b.setAttribute("aria-busy", "true");
    try { await fn(); } catch { toast(t("exportFailed", "Couldn't make that file. Please try again."), "error"); } finally { b.removeAttribute("aria-busy"); }
  };
  body.addEventListener("change", (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.id === "exportColumns") opts.columns = Number(el.value) || 1;
    if (el.id === "exportOrientation") opts.landscape = el.value === "landscape";
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
  });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    const kind = b.dataset.export;
    if (kind === "pdf") busy(b, () => exportPdf(title, opts, set?.id));
    if (kind === "png") busy(b, () => exportPng(opts));
    if (kind === "txt") busy(b, () => exportTxt(set?.id));
    if (kind === "print") { closeSheet(); printChart(opts, set?.id); }
    if (b.id === "shareCopy") { if (await copyText(url)) toast(t("linkCopied", "Link copied"), "success"); }
    if (b.id === "shareNative") { try { await navigator.share({ title: `${title} · Sonata`, url }); } catch { /* cancelled */ } }
    if (b.id === "shareQr") busy(b, async () => download(`sonata-${slug(title)}-qr.png`, await qrPng(url.includes("tinyurl.com") ? url : qrLink, title)));
    if (b.id === "shareSongLinks" && set) busy(b, async () => {
      const msg = await setlistMessage(BASE(), set, store.setlistSongs(set));
      if ("share" in navigator && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: `${set.title} · Sonata`, text: msg }); return; } catch { /* cancelled: copy instead */ } }
      if (await copyText(msg)) toast(t("songLinksCopied", "Setlist message copied. Paste it in your group chat."), "success", { ms: 4000 });
    });
    if (b.id === "shareShort") {
      try {
        const r = await fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(6000), referrerPolicy: "no-referrer" });
        const shortUrl = (await r.text()).trim();
        if (r.ok && /^https:\/\/tinyurl\.com\/[A-Za-z0-9]+$/.test(shortUrl)) { url = shortUrl; body.innerHTML = draw(); paintIcons(body); }
        else toast(t("shortFailed", "Couldn't shorten the link"), "error");
      } catch { toast(t("offline", "Offline"), "error"); }
    }
  });
  body.querySelector("#shareUrl")?.addEventListener("focus", (e) => /** @type {HTMLInputElement} */ (e.target).select());
}

/** Create or edit a setlist: title, notes, ordered songs. @param {string} [id] */
export function openSetlistEditor(id) {
  const existing = id ? store.setlists.find((s) => s.id === id) : null;
  /** @type {string[]} */
  let items = existing ? existing.items.map((i) => i.songId).filter((x) => store.song(x)) : [];
  let q = "";
  const chosen = () => items.length
    ? items.map((sid, i) => { const s = store.song(sid); return `<li class="set-item" data-sid="${esc(sid)}"><span class="set-num">${i + 1}</span><span class="set-name">${esc(s?.title || "")}</span><span class="key-badge small">${esc(pretty(keyShort(soundingKey(s || null))))}</span>
        <button class="icon-btn small" type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(t("moveUp", "Move up"))}">${icon("arrow-up")}</button>
        <button class="icon-btn small" type="button" data-move="1" ${i === items.length - 1 ? "disabled" : ""} aria-label="${esc(t("moveDown", "Move down"))}">${icon("arrow-down")}</button>
        <button class="icon-btn small" type="button" data-drop aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></li>`; }).join("")
    : `<li class="muted set-empty">${esc(t("noSongsInSet", "No songs yet. Pick some below."))}</li>`;
  const pool = () => {
    const f = q.trim().toLowerCase();
    return store.songs.filter((s) => !items.includes(s.id) && (!f || `${s.title} ${s.artist}`.toLowerCase().includes(f)))
      .map((s) => `<button type="button" class="pick" data-add="${esc(s.id)}">${icon("plus")}<span class="pick-text"><span class="pick-title">${esc(s.title)}</span>${s.artist ? `<span class="muted">${esc(s.artist)}</span>` : ""}</span><span class="key-badge small">${esc(pretty(keyShort(soundingKey(s))))}</span></button>`).join("")
      || `<p class="muted set-empty">${esc(q.trim() ? t("noMatches", "No matches for \"{q}\"", { q }) : t("allSongsAdded", "Every song is in this setlist."))}</p>`;
  };
  const body = openSheet({
    title: existing ? t("editSetlistTitle", "Edit setlist") : t("newSetlistTitle", "New setlist"),
    wide: true,
    body: `<div class="form">
      <label class="field"><span>${esc(t("setTitle", "Title"))}</span><input class="input" id="slTitle" value="${esc(existing?.title || "")}" placeholder="Sunday Service" autocomplete="off"></label>
      <label class="field"><span>${esc(t("setNotes", "Notes (service order, etc.)"))}</span><textarea class="input" id="slNotes" rows="2">${esc(existing?.description || "")}</textarea></label>
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
export function openImportSet(data) {
  const songs = Array.isArray(data?.s) ? data.s : [];
  openSheet({
    title: t("importSetTitle", "Open shared setlist"),
    body: `<h3 class="sheet-sub">${esc(data.t || "Setlist")}</h3><p class="sheet-text">${esc(t("importSetText", "{n} songs. The setlist and its songs will be saved to your library.", { n: songs.length }))}</p>
      <ol class="import-list">${songs.map((s) => `<li>${esc(s?.t || "")}${s?.a ? ` <span class="muted">· ${esc(s.a)}</span>` : ""}</li>`).join("")}</ol>`,
    actions: [
      { label: t("cancel", "Cancel"), kind: "ghost" },
      { label: t("importSet", "Save setlist"), kind: "primary", onClick: () => {
        const ids = songs.map((/** @type {any} */ sd) => {
          const u = unpackSong(sd);
          const same = store.songs.find((x) => x.title === u.title && x.body === u.body);
          return same ? same.id : store.createSong(/** @type {any} */ (u)).id;
        });
        const set = store.saveSetlist({ title: data.t || "Setlist", description: data.d || "", items: ids.map((/** @type {string} */ songId) => ({ songId })) });
        store.playSetlist(set.id);
        app.show("editor");
        toast(t("setlistSaved", "Setlist saved"), "success");
      } }
    ]
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
      <label class="switch-row"><span>${esc(t("buddyLabel", "Show Sona, the buddy"))}</span><input type="checkbox" class="toggle" data-set="buddy"${s.buddy ? " checked" : ""}></label>
      <label class="switch-row"><span>${esc(t("haptics", "Vibrate on tap"))}</span><input type="checkbox" class="toggle" data-set="haptics"${s.haptics ? " checked" : ""}></label>
      <label class="switch-row"><span>${esc(t("autoArranger", "Add my name as arranger"))}</span><input type="checkbox" class="toggle" data-set="autoFillArranger"${s.autoFillArranger ? " checked" : ""}></label>
      <h3 class="group-title">${esc(t("data", "Data & backup"))}</h3>
      <div class="btn-row">
        <button class="btn" type="button" id="exportBackup">${icon("download")}${esc(t("exportBackup", "Export backup file"))}</button>
        <label class="btn">${icon("upload")}${esc(t("importBackup", "Import backup file"))}<input type="file" id="importBackup" accept="application/json,.json" hidden></label>
      </div>
      ${standalone ? "" : `<button class="btn wide" type="button" id="installBtn">${icon("download")}${esc(t("install", "Install Sonata"))}</button>`}
      <div class="btn-row">
        <button class="btn ghost" type="button" id="aboutBtn">${icon("info")}${esc(t("aboutTitle", "About Sonata"))}</button>
        <button class="btn ghost" type="button" id="resetSettings">${esc(t("resetSettings", "Reset settings"))}</button>
      </div>
    </div>`
  });
  body.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const k = el.dataset.set;
    if (!k) return;
    const v = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
    /** @type {any} */ (s)[k] = v;
    if (k === "previewFontSize") /** @type {HTMLElement} */ (body.querySelector("#fsOut")).textContent = `${v}px`;
    if (k === "editorLineHeight") /** @type {HTMLElement} */ (body.querySelector("#lhOut")).textContent = Number(v).toFixed(2);
    if (k === "language") { setLang(String(v)); applyI18n(); }
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
    if (id === "exportBackup") {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`sonata-backup-${stamp}.json`, new Blob([JSON.stringify(store.snapshot(), null, 2)], { type: "application/json" }));
      toast(t("exported", "Exported"), "success");
    }
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
  body.querySelector("#importBackup")?.addEventListener("change", async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const ok = validateBackup(data);
      if (!ok.ok) { toast(t("badBackup", ok.error), "error"); return; }
      const before = store.songs.length;
      store.importBackup(data);
      app.refresh();
      const added = Math.max(0, store.songs.length - before);
      toast(added ? t("backupRestored", "Restored {n} songs", { n: added }) : t("backupNothingNew", "Backup merged. Nothing new to add."), "success");
      closeSheet();
    } catch { toast(t("badBackup", "That file isn't a Sonata backup."), "error"); }
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
      <p class="muted">Chord charts and music tools for musicians and worship teams. Made by Jethro Frane.</p></div></div>
      <ul class="about-points">
        <li>Free, no account needed. Songs are saved on your device.</li>
        <li>Works offline after the first visit. Install it for the stage.</li>
        <li>Optional Google Drive backup uses one file only Sonata can see.</li>
        <li>A Song Bank is shared only when you publish it: one file in your own Drive that anyone with its link can read. Sonata stores no copy.</li>
        <li>No ads. Anonymous page-view counts only (Vercel Web Analytics, no cookies).</li>
      </ul>
      <p class="verse">“So whether you eat or drink or whatever you do, do it all for the glory of God.” <span>1 Corinthians 10:31</span></p>
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

/** Google Drive account sheet. */
export function openAccount() {
  const d = app.drive;
  if (!d) return;
  const draw = () => {
    const p = d.profile;
    if (d.status === "signed-out" || (!d.token && !p.email)) {
      return `<div class="account">
        <div class="account-hero">${icon("cloud")}</div>
        <p class="sheet-text">${esc(t("accountIntro", "Keep your songs safe and the same on all your devices. Sonata only sees the one file it creates in your Drive (sonata_library.json)."))}</p>
        ${d.error ? `<p class="error-text">${esc(d.error)}</p>` : ""}
        <button class="btn primary wide google" type="button" id="gSignIn"><svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>${esc(t("signInGoogle", "Continue with Google"))}</button>
        <p class="card-hint">${esc(t("accountLocal", "Without signing in, songs stay on this device only. You can still export a backup file in Settings."))}</p>
      </div>`;
    }
    const when = d.lastSynced ? t("lastSynced", "Last synced {when}", { when: relativeTime(d.lastSynced, getLang()) }) : t("neverSynced", "Not synced yet");
    const statusText = d.status === "syncing" ? t("syncing", "Syncing…") : d.status === "expired" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : d.status === "offline" ? t("offline", "Offline") : d.error || when;
    return `<div class="account">
      <div class="profile">${p.picture ? `<img src="${esc(p.picture)}" alt="" width="48" height="48" referrerpolicy="no-referrer">` : `<span class="avatar-fallback">${esc((p.givenName || p.email || "?").charAt(0).toUpperCase())}</span>`}
        <div><strong>${esc(p.name || p.givenName || "Google")}</strong><span class="muted">${esc(p.email || "")}</span></div></div>
      <p class="status-line ${d.status}">${esc(statusText)}</p>
      <div class="btn-row">
        ${d.status === "expired" ? `<button class="btn primary" type="button" id="gSignIn">${icon("refresh")}${esc(t("reconnect", "Reconnect"))}</button>` : `<button class="btn primary" type="button" id="gSync"${d.status === "syncing" ? " disabled" : ""}>${icon("refresh")}${esc(t("syncNow", "Sync now"))}</button>`}
        <button class="btn ghost" type="button" id="gOut">${icon("logout")}${esc(t("signOut", "Sign out"))}</button>
      </div>
      <p class="card-hint">${esc(t("autoSyncNote", "Changes sync automatically while you're signed in."))}</p>
    </div>`;
  };
  /** Stop redrawing once this sheet is gone (the dialog is shared with every other sheet). */
  let unsub = () => {};
  const body = openSheet({ title: t("accountTitle", "Google Drive backup"), body: draw(), onClose: () => unsub() });
  unsub = store.on("drive-status", () => { body.innerHTML = draw(); });
  body.addEventListener("click", async (e) => {
    const id = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"))?.id;
    if (id === "gSignIn") { if (await d.signIn()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (id === "gSync") { if (await d.sync()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (id === "gOut") { d.signOut(); toast(t("signedOut", "Signed out of Google Drive"), "info"); }
  });
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
  const WEB_NOTE = /** @type {Record<string, [string, string]>} */ ({
    reading: ["webReading", "Reading the page…"],
    offline: ["webOffline", "You are offline. Open the page, copy the chords and paste them here."],
    "no-chords": ["webNoChords", "No chords were found on that page. Copy the chords from it and paste them here."],
    "not-found": ["webNotFound", "That page could not be found. Check the link."],
    "bad-url": ["webBadUrl", "That link can't be read. Copy the chords from the page and paste them here."],
    blocked: ["webBlocked", "That site does not let Sonata read its pages. Open it, copy the chords and paste them here."]
  });
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
      return `<div class="analyzed-chart">
        <p class="status-line synced">${esc(t("chartReady", "Chart ready"))} · <strong>${esc(pretty(analyzed.keyName))}</strong>${analyzed.capo ? ` · Capo ${analyzed.capo}` : ""}${analyzed.bpm ? ` · ${analyzed.bpm} BPM` : ""}</p>
        <p class="import-title"><strong>${esc(analyzed.title)}</strong>${analyzed.artist ? ` <span class="muted">· ${esc(analyzed.artist)}</span>` : ""}</p>
        <pre class="import-preview" tabindex="0" aria-label="${esc(t("preview", "Preview"))}">${esc(pretty(analyzed.body.split("\n").slice(0, 10).join("\n")))}</pre>
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
          const song = store.createSong({
            title: analyzed.title,
            artist: analyzed.artist,
            manualKey: analyzed.manualKey,
            capo: analyzed.capo,
            bpm: analyzed.bpm,
            body: analyzed.body,
            links: analyzed.links
          });
          store.open(song.id);
          toast(t("chartImported", "Added in {key}. Check it, then edit anything that is off.", { key: pretty(analyzed.keyName) }), "success", { ms: 4500 });
          app.show("editor");
          app.refresh();
          return;
        }
        if (!n) { toast(t("importNone", "Paste a link or chords to see what will be added."), "error"); return false; }
        /** Reuse a song that's already saved (same title and chart). @param {any} d */
        const add = (d) => { const u = unpackSong(d); const same = store.songs.find((x) => x.title === u.title && x.body === u.body); return same ? same.id : store.createSong(/** @type {any} */ (u)).id; };
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
    analyzed = page && typeof page.text === "string"
      ? analyzeRawChart([link, page.title ? `Title: ${page.title}` : "", page.artist ? `Artist: ${page.artist}` : "", page.text].filter(Boolean).join("\n"))
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
  body.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
  body.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); takeFile(f); } });
  area.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(read, 200); });
  if (text) read();
}
