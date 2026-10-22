// @ts-check
import { $, $$, esc, icon, toast, openSheet, confirmSheet, relativeTime, paintIcons } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { store, app, soundingKey, tick } from "./ctx.js";
import { keyShort, pretty } from "../core/music.js";
import { openShare, openSetlistEditor } from "./sheets.js";
import { addDemoSong } from "./editor.js";

/** @type {"all"|"favorites"|"setlists"} */
let filter = "all";
let query = "";

/** Accent- and case-insensitive text for search. @param {string} s */
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function initLibrary() {
  const search = /** @type {HTMLInputElement} */ ($("librarySearch"));
  search.addEventListener("input", () => { query = search.value; renderLibrary(); });
  $$("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = /** @type {any} */ (b.dataset.filter);
    renderLibrary();
  }));
  $("librarySort").addEventListener("change", () => {
    try { localStorage.setItem("sonata_library_sort", /** @type {HTMLSelectElement} */ ($("librarySort")).value); } catch { /* ignore */ }
    renderLibrary();
  });
  try { const s = localStorage.getItem("sonata_library_sort"); if (s) /** @type {HTMLSelectElement} */ ($("librarySort")).value = s; } catch { /* ignore */ }
  $("newSongBtn").addEventListener("click", () => { newSong(); });
  $("newSetlistBtn").addEventListener("click", () => openSetlistEditor());
  $("libraryList").addEventListener("click", onListClick);
  store.on("change", (/** @type {string} */ kind) => { if (kind === "library" && app.view === "songs") renderSoon(); });
  store.on("song-open", () => { if (app.view === "songs") renderSoon(); });
  renderLibrary();
}

let soon = 0;
function renderSoon() { cancelAnimationFrame(soon); soon = requestAnimationFrame(renderLibrary); }

export function newSong() {
  tick();
  store.createSong({}, app.drive?.profile.name || "");
  app.show("editor");
  setTimeout(() => /** @type {HTMLInputElement} */ ($("songTitle")).focus(), 60);
}

/** @param {Event} e */
function onListClick(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  const btn = /** @type {HTMLElement|null} */ (target.closest("[data-act]"));
  if (!btn) return;
  const id = btn.closest("[data-id]")?.getAttribute("data-id") || "";
  const act = btn.dataset.act;
  if (act === "open") { store.exitSetlist(); store.open(id); app.show("editor"); }
  else if (act === "fav") toggleFavorite(id);
  else if (act === "more") songMenu(id);
  else if (act === "set-open") { if (store.playSetlist(id)) app.show("editor"); else openSetlistEditor(id); }
  else if (act === "set-play") { if (store.playSetlist(id)) app.openStage(); else openSetlistEditor(id); }
  else if (act === "set-more") setlistMenu(id);
  else if (act === "create") newSong();
  else if (act === "demo") { addDemoSong(); app.show("editor"); }
  else if (act === "create-set") openSetlistEditor();
  else if (act === "clear") { query = ""; /** @type {HTMLInputElement} */ ($("librarySearch")).value = ""; renderLibrary(); }
}

/** @param {string} id */
function toggleFavorite(id) {
  const s = store.song(id);
  if (!s) return;
  tick();
  store.update(s, { isFavorite: !s.isFavorite });
  renderLibrary();
}

/** @param {string} id */
function songMenu(id) {
  const s = store.song(id);
  if (!s) return;
  const body = openSheet({
    title: s.title,
    className: "menu-sheet",
    body: `<div class="menu-list">
      <button type="button" class="menu-item" data-m="open">${icon("edit")}<span>${esc(t("open", "Open"))}</span></button>
      <button type="button" class="menu-item" data-m="present">${icon("present")}<span>${esc(t("present", "Present"))}</span></button>
      <button type="button" class="menu-item" data-m="share">${icon("share")}<span>${esc(t("share", "Share"))}</span></button>
      <button type="button" class="menu-item" data-m="dup">${icon("duplicate")}<span>${esc(t("duplicate", "Duplicate"))}</span></button>
      <button type="button" class="menu-item danger" data-m="del">${icon("trash")}<span>${esc(t("delete", "Delete"))}</span></button>
    </div>`
  });
  body.addEventListener("click", (e) => {
    const m = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-m]"))?.dataset.m;
    if (!m) return;
    /** @type {HTMLDialogElement} */ ($("sheet")).close();
    if (m === "open") { store.exitSetlist(); store.open(id); app.show("editor"); }
    if (m === "present") { store.exitSetlist(); store.open(id); app.openStage(); }
    if (m === "share") { store.open(id); openShare(); }
    if (m === "dup") { store.duplicate(s); app.show("editor"); }
    if (m === "del") deleteWithUndo([id]);
  });
}

/** @param {string[]} ids */
export function deleteWithUndo(ids) {
  const removed = store.songs.filter((s) => ids.includes(s.id)).map((s) => ({ ...s }));
  const setsBefore = store.setlists.map((s) => ({ ...s, items: [...s.items] }));
  store.deleteSongs(ids);
  renderLibrary();
  toast(t("deleted", "Deleted"), "info", {
    ms: 7000,
    action: t("undoDelete", "Undo"),
    onAction: () => {
      store.songs.unshift(...removed);
      store.deletedIds = store.deletedIds.filter((x) => !ids.includes(x));
      store.setlists = setsBefore;
      store.changed();
      renderLibrary();
    }
  });
}

/** @param {string} id */
function setlistMenu(id) {
  const set = store.setlists.find((s) => s.id === id);
  if (!set) return;
  const body = openSheet({
    title: set.title,
    className: "menu-sheet",
    body: `<div class="menu-list">
      <button type="button" class="menu-item" data-m="play">${icon("present")}<span>${esc(t("playSet", "Play"))}</span></button>
      <button type="button" class="menu-item" data-m="edit">${icon("edit")}<span>${esc(t("edit", "Edit"))}</span></button>
      <button type="button" class="menu-item" data-m="share">${icon("share")}<span>${esc(t("share", "Share"))}</span></button>
      <button type="button" class="menu-item danger" data-m="del">${icon("trash")}<span>${esc(t("delete", "Delete"))}</span></button>
    </div>`
  });
  body.addEventListener("click", async (e) => {
    const m = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-m]"))?.dataset.m;
    if (!m) return;
    /** @type {HTMLDialogElement} */ ($("sheet")).close();
    if (m === "play") { if (store.playSetlist(id)) app.openStage(); }
    if (m === "edit") openSetlistEditor(id);
    if (m === "share") openShare(id);
    if (m === "del") {
      const ok = await confirmSheet({ title: t("deleteSetTitle", "Delete setlist?"), message: t("deleteSetText", "\"{title}\" will be deleted. The songs stay in your library.", { title: set.title }), confirm: t("delete", "Delete"), cancel: t("cancel", "Cancel"), danger: true });
      if (ok) { store.deleteSetlist(id); renderLibrary(); }
    }
  });
}

/** @param {"title"|"recent"|"artist"|"key"} sort */
function sortSongs(sort) {
  const list = store.songs.slice();
  const by = (/** @type {(s: any) => string} */ f) => list.sort((a, b) => f(a).localeCompare(f(b), undefined, { sensitivity: "base", numeric: true }));
  if (sort === "title") by((s) => s.title);
  else if (sort === "artist") by((s) => s.artist || "￿");
  else if (sort === "key") list.sort((a, b) => soundingKey(a).tonic - soundingKey(b).tonic || a.title.localeCompare(b.title));
  else list.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  return list;
}

/** @param {string} title @param {string} text @param {string} actions */
const empty = (title, text, actions) => `<div class="empty"><div class="empty-art">${icon("music")}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="empty-actions">${actions}</div></div>`;

export function renderLibrary() {
  const list = $("libraryList");
  const lang = getLang();
  $$("[data-filter]").forEach((b) => { const on = b.dataset.filter === filter; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  const ns = store.songs.length, nl = store.setlists.length;
  $("libraryCount").textContent = `${t(ns === 1 ? "songCount1" : "songsCount", ns === 1 ? "1 song" : "{n} songs", { n: ns })} · ${t(nl === 1 ? "setlistCount1" : "setlistsCount", nl === 1 ? "1 setlist" : "{n} setlists", { n: nl })}`;
  const q = fold(query.trim());

  if (filter === "setlists") {
    const sets = store.setlists.filter((s) => !q || fold(s.title).includes(q));
    if (!store.setlists.length) {
      list.innerHTML = empty(t("emptySetlistsTitle", "No setlists yet"), t("emptySetlistsText", "Group songs for Sunday or a gig, then play them in order on stage."), `<button class="btn primary" type="button" data-act="create-set">${icon("plus")}${esc(t("createSetlist", "Create a setlist"))}</button>`);
      return;
    }
    list.innerHTML = sets.map((s) => {
      const songs = store.setlistSongs(s);
      const preview = songs.slice(0, 4).map((x) => x.title).join(" · ");
      return `<div class="row set-row${store.setlist.id === s.id ? " active" : ""}" data-id="${esc(s.id)}">
        <button type="button" class="row-main" data-act="set-open">
          <span class="row-icon">${icon("list")}</span>
          <span class="row-text"><span class="row-title">${esc(s.title)}</span><span class="row-sub">${esc(t("songsInSet", "{n} songs", { n: songs.length }))}${preview ? " · " + esc(preview) : ""}</span></span>
        </button>
        <button type="button" class="icon-btn" data-act="set-play" aria-label="${esc(t("playSet", "Play"))}" title="${esc(t("playSet", "Play"))}">${icon("present")}</button>
        <button type="button" class="icon-btn" data-act="set-more" aria-label="${esc(t("moreActions", "More actions"))}">${icon("more")}</button>
      </div>`;
    }).join("") || empty(t("noMatches", "No matches for \"{q}\"", { q: query }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`);
    return;
  }

  const sort = /** @type {any} */ (/** @type {HTMLSelectElement} */ ($("librarySort")).value);
  let songs = sortSongs(sort);
  if (filter === "favorites") songs = songs.filter((s) => s.isFavorite);
  if (q) songs = songs.filter((s) => fold(`${s.title} ${s.artist} ${s.creator} ${s.body}`).includes(q));

  if (!store.songs.length) {
    list.innerHTML = empty(t("emptyLibraryTitle", "No songs yet"), t("emptyLibraryText", "Write your first chart, or open the demo to see how Sonata works."),
      `<button class="btn primary" type="button" data-act="create">${icon("plus")}${esc(t("createSong", "Create a song"))}</button><button class="btn" type="button" data-act="demo">${icon("sparkles")}${esc(t("tryDemo", "Try the demo song"))}</button>`);
    return;
  }
  if (!songs.length) {
    list.innerHTML = q
      ? empty(t("noMatches", "No matches for \"{q}\"", { q: query }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`)
      : empty(t("filterFavorites", "Favorites"), t("noFavorites", "No favorites yet. Tap the star on a song."), "");
    return;
  }
  const activeId = store.activeId;
  list.innerHTML = songs.map((s) => {
    const k = !s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s)));
    const sub = [s.artist, relativeTime(s.updatedAt, lang)].filter(Boolean).map(esc).join(" · ");
    return `<div class="row${s.id === activeId ? " active" : ""}" data-id="${esc(s.id)}">
      <button type="button" class="row-main" data-act="open">
        <span class="key-badge" title="${esc(t("key", "Key"))}">${esc(k)}</span>
        <span class="row-text"><span class="row-title">${esc(s.title)}</span><span class="row-sub">${sub}</span></span>
      </button>
      <button type="button" class="icon-btn fav${s.isFavorite ? " on" : ""}" data-act="fav" aria-pressed="${s.isFavorite}" aria-label="${esc(t("favorite", "Favorite"))}">${icon(s.isFavorite ? "star-fill" : "star")}</button>
      <button type="button" class="icon-btn" data-act="more" aria-label="${esc(t("moreActions", "More actions"))}">${icon("more")}</button>
    </div>`;
  }).join("");
  paintIcons(list);
}
