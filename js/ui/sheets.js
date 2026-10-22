// @ts-check
// Dialog sheets: key & capo, song details, share, setlist editor, settings,
// Drive account, about, and shared-setlist import.
import { $, esc, icon, toast, openSheet, closeSheet, copyText, download, slug, relativeTime } from "./dom.js";
import { t, getLang, setLang, applyI18n } from "./i18n.js";
import { store, app, detectedKey, soundingKey, shapeKey, signed, tick } from "./ctx.js";
import { keyShort, parseKey, pretty } from "../core/music.js";
import { packSong, packSet, shareUrl, unpackSong } from "../core/share.js";
import { normalizeSettings, validateBackup, DEFAULT_SETTINGS } from "../core/store.js";
import { qrSvg, qrModules } from "../lib/qr.js";

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

/** Quick key, transpose and capo controls for the editor's key pill. */
export function openKeySheet() {
  const s = store.active();
  if (!s) return;
  const render = () => {
    const k = soundingKey(s);
    return `<div class="key-sheet">
      <div class="big-key"><span class="mini-label">${esc(t("playsIn", "Band plays in"))}</span><strong>${esc(pretty(k.name))}</strong>
        ${s.capo ? `<span class="muted">${esc(t("capoShapes", "Capo {n} · {key} shapes", { n: s.capo, key: pretty(keyShort(shapeKey(s))) }))}</span>` : ""}</div>
      <div class="field"><span>${esc(t("transpose", "Transpose"))}</span>
        <div class="stepper"><button class="icon-btn" type="button" data-tr="-1" aria-label="${esc(t("transposeDown", "Down a half step"))}">${icon("minus")}</button>
        <output>${esc(signed(s.transpose))}</output>
        <button class="icon-btn" type="button" data-tr="1" aria-label="${esc(t("transposeUp", "Up a half step"))}">${icon("plus")}</button></div></div>
      <label class="field"><span>${esc(t("songKey", "Song key"))}</span><select class="select" id="ksKey"${s.readonly ? " disabled" : ""}>${keyOptions(s.manualKey, detectedKey(s))}</select></label>
      <label class="field"><span>${esc(t("capo", "Capo"))}</span><select class="select" id="ksCapo">${capoOptions(s.capo)}</select></label>
    </div>`;
  };
  const body = openSheet({ title: t("keyAndCapo", "Key & capo"), body: render(), actions: [{ label: t("close", "Close"), kind: "primary" }] });
  const rerender = () => { body.innerHTML = render(); };
  /** @param {Partial<import("../core/store.js").Song>} patch */
  const apply = (patch) => {
    if (s.readonly) { Object.assign(s, patch); store.emit("change", "view"); } else store.update(s, patch);
    rerender();
  };
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-tr]"));
    if (!b) return;
    tick();
    let next = s.transpose + Number(b.dataset.tr);
    if (next > 11) next -= 12;
    if (next < -11) next += 12;
    apply({ transpose: next });
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
  const qr = qrModules(url);
  if (!qr) throw new Error("qr too long");
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const ui = "'Plus Jakarta Sans', system-ui, sans-serif";
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

/**
 * Share a song (default: the open one) or a setlist by id.
 * @param {string} [setId]
 */
export async function openShare(setId) {
  const set = setId ? store.setlists.find((s) => s.id === setId) : null;
  const song = set ? null : store.active();
  if (!set && !song) { toast(t("noSong", "No song open"), "error"); return; }
  const data = set ? packSet(set, store.setlistSongs(set)) : packSong(/** @type {any} */ (song));
  const title = set ? set.title : /** @type {any} */ (song).title;
  let url = await shareUrl(BASE(), data);
  const draw = () => {
    const svg = qrSvg(url, { ecc: "M", margin: 4 }) || qrSvg(url, { margin: 4 });
    return `<div class="share">
      <div class="qr-box">${svg || `<p class="muted">${esc(t("qrTooLong", "This song is too long for a QR code. The link still works."))}</p>`}</div>
      <div class="share-link"><input class="input" id="shareUrl" readonly value="${esc(url)}" aria-label="Link"><button class="btn" type="button" id="shareCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button></div>
      <div class="share-actions">
        ${"share" in navigator ? `<button class="btn primary" type="button" id="shareNative">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
        ${svg ? `<button class="btn" type="button" id="shareQr">${icon("download")}${esc(t("downloadQr", "Download QR"))}</button>` : ""}
        ${!svg && !url.includes("tinyurl.com") ? `<button class="btn" type="button" id="shareShort">${esc(t("shortLink", "Make a short link"))}</button>` : ""}
      </div>
      ${!svg && !url.includes("tinyurl.com") ? `<p class="card-hint">${esc(t("shortLinkNote", "This sends the link to TinyURL to shorten it."))}</p>` : ""}
      <p class="card-hint">${esc(t("shareHow", "They can open the link or scan the QR with a phone camera, see the song and save it."))}</p>
    </div>`;
  };
  const body = openSheet({ title: set ? t("shareSetTitle", "Share setlist") : t("shareTitle", "Share \"{title}\"", { title }), body: draw() });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.id === "shareCopy") { if (await copyText(url)) toast(t("linkCopied", "Link copied"), "success"); }
    if (b.id === "shareNative") { try { await navigator.share({ title: `${title} · Sonata`, url }); } catch { /* cancelled */ } }
    if (b.id === "shareQr") { try { download(`sonata-${slug(title)}-qr.png`, await qrPng(url, title)); } catch { toast(t("qrTooLong", "This song is too long for a QR code. The link still works."), "error"); } }
    if (b.id === "shareShort") {
      try {
        const r = await fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
        const short = (await r.text()).trim();
        if (r.ok && /^https:\/\/tinyurl\.com\//.test(short)) { url = short; body.innerHTML = draw(); }
        else toast(t("syncIssue", "Couldn't shorten the link"), "error");
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
      .map((s) => `<button type="button" class="pick" data-add="${esc(s.id)}">${icon("plus")}<span>${esc(s.title)}</span><span class="muted">${esc(s.artist)}</span></button>`).join("");
  };
  const body = openSheet({
    title: existing ? t("editSetlistTitle", "Edit setlist") : t("newSetlistTitle", "New setlist"),
    wide: true,
    body: `<div class="form">
      <label class="field"><span>${esc(t("setTitle", "Title"))}</span><input class="input" id="slTitle" value="${esc(existing?.title || "")}" placeholder="Sunday Service" autocomplete="off"></label>
      <label class="field"><span>${esc(t("setNotes", "Notes (service order, etc.)"))}</span><textarea class="input" id="slNotes" rows="2">${esc(existing?.description || "")}</textarea></label>
      <div class="field"><span>${esc(t("songsInThisSet", "Songs in this setlist"))}</span><ol class="set-items" id="slItems">${chosen()}</ol></div>
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
  const redraw = () => { list.innerHTML = chosen(); poolEl.innerHTML = pool(); };
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
      toast(t("backupRestored", "Restored {n} songs", { n: Math.max(0, store.songs.length - before) || (data.songs || []).length }), "success");
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
  const body = openSheet({ title: t("accountTitle", "Google Drive backup"), body: draw() });
  const unsub = store.on("drive-status", () => { if (/** @type {HTMLDialogElement} */ ($("sheet")).open) body.innerHTML = draw(); else unsub(); });
  body.addEventListener("click", async (e) => {
    const id = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"))?.id;
    if (id === "gSignIn") { if (await d.signIn()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (id === "gSync") { if (await d.sync()) toast(t("syncDone", "Synced with Google Drive"), "success"); }
    if (id === "gOut") { d.signOut(); toast(t("signedOut", "Signed out of Google Drive"), "info"); }
  });
}

