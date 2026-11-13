// @ts-check
import { $, $$, esc, icon, toast, openSheet, confirmSheet, relativeTime, paintIcons } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { store, app, soundingKey, tick, renderOptions, profileName } from "./ctx.js";
import { keyShort, pretty } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { openShare, openSetlistEditor, printSetlist, openBankManager, openLinksImport } from "./sheets-lazy.js";
import { addDemoSong } from "./editor.js";

/** @type {"all"|"favorites"|"setlists"|"bank"} */
let filter = "all";
let query = "";
/** Wide screens show the tapped song's chart beside the list (phones open it). */
const wide = matchMedia("(min-width: 900px)");
/** Song shown beside the list ("" = the open song). */
let peekId = "";
/** Rows drawn at once; "Show more" adds a page. Resets when the search or filter changes. */
const PAGE = 200;
let limit = PAGE;
/** @type {ReturnType<typeof setTimeout>|undefined} */
let searchTimer;

/** Accent- and case-insensitive text for search. @param {string} s */
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function initLibrary() {
  const search = /** @type {HTMLInputElement} */ ($("librarySearch"));
  search.addEventListener("input", () => {
    query = search.value;
    limit = PAGE;
    // Small libraries answer every key at once; big ones wait for a short pause in typing.
    clearTimeout(searchTimer);
    if (store.songs.length > 300) searchTimer = setTimeout(renderLibrary, 120); else renderLibrary();
  });
  $$("button[data-filter]").forEach((b) => b.addEventListener("click", () => {
    limit = PAGE;
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
  $("libraryList").addEventListener("dblclick", (e) => {
    const row = /** @type {HTMLElement} */ (e.target).closest("[data-id]");
    if (!row || !wide.matches || !/** @type {HTMLElement} */ (e.target).closest('[data-act="open"]')) return;
    store.exitSetlist(); store.open(row.getAttribute("data-id") || ""); app.show("editor");
  });
  $("songPeek").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    const id = $("songPeek").dataset.id || "";
    if (!b || !store.song(id)) return;
    store.exitSetlist();
    if (b.id === "peekEdit") { store.open(id); app.show("editor"); }
    if (b.id === "peekPresent") { store.open(id); app.openStage(); }
    if (b.id === "peekShare") { store.open(id); openShare(); }
  });
  wide.addEventListener("change", () => { if (app.view === "songs") renderLibrary(); });
  store.on("change", (/** @type {string} */ kind) => { if (kind === "library") { recentSoon(); if (app.view === "songs") renderSoon(); } });
  store.on("song-open", () => { recentSoon(); if (app.view === "songs") renderSoon(); });
  $("recentList").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-recent]"));
    if (!b) return;
    store.exitSetlist();
    store.open(b.dataset.recent || "");
    app.show("editor");
  });
  renderLibrary();
}

let soon = 0;
function renderSoon() { cancelAnimationFrame(soon); soon = requestAnimationFrame(renderLibrary); }
let recentTimer = /** @type {any} */ (0);
function recentSoon() { clearTimeout(recentTimer); recentTimer = setTimeout(renderRecent, 250); }

/** Sidebar (desktop): the songs you opened last, one tap away. */
export function renderRecent() {
  const host = document.getElementById("recentList");
  if (!host) return;
  const time = (/** @type {any} */ s) => Date.parse(s.lastOpenedAt || s.updatedAt) || 0;
  const songs = store.songs.slice().sort((a, b) => time(b) - time(a)).slice(0, 7);
  const html = songs.length
    ? songs.map((s) => `<button type="button" class="recent-item${s.id === store.activeId ? " active" : ""}" data-recent="${esc(s.id)}"><span class="recent-key">${esc(!s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s))))}</span><span class="recent-title">${esc(s.title || "Untitled")}</span></button>`).join("")
    : `<p class="recent-empty">${esc(t("recentEmpty", "Songs you open show up here."))}</p>`;
  if (host.dataset.html !== html) { host.innerHTML = html; host.dataset.html = html; }
}

export function newSong() {
  tick();
  store.createSong({}, profileName());
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
  if (act === "open") {
    if (wide.matches && /** @type {MouseEvent} */ (e).detail < 2) { peekId = id; renderLibrary(); return; }
    store.exitSetlist(); store.open(id); app.show("editor");
  }
  else if (act === "fav") toggleFavorite(id);
  else if (act === "more") songMenu(id);
  else if (act === "set-open") { if (store.playSetlist(id)) app.show("editor"); else openSetlistEditor(id); }
  else if (act === "set-play") { if (store.playSetlist(id)) app.openStage(); else openSetlistEditor(id); }
  else if (act === "set-more") setlistMenu(id);
  else if (act === "create") newSong();
  else if (act === "demo") { addDemoSong(); app.show("editor"); }
  else if (act === "import") openLinksImport();
  else if (act === "create-set") openSetlistEditor();
  else if (act === "all") { filter = "all"; renderLibrary(); }
  else if (act === "bank") openBankManager();
  else if (act === "more-rows") { limit += PAGE * 2; renderLibrary(); }
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
      <button type="button" class="menu-item" data-m="bank">${icon("bank")}<span>${esc(s.inBank ? t("removeFromBank", "Remove from Song Bank") : t("addToBank", "Add to Song Bank"))}</span></button>
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
    if (m === "bank") { store.update(s, { inBank: !s.inBank }); renderLibrary(); toast(s.inBank ? t("addedToBank", "Added to your Song Bank") : t("removedFromBank", "Removed from your Song Bank"), "success"); }
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
      store.restoreSongs(removed, setsBefore);
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
      <button type="button" class="menu-item" data-m="print">${icon("print")}<span>${esc(t("print", "Print"))}</span></button>
      <button type="button" class="menu-item danger" data-m="del">${icon("trash")}<span>${esc(t("delete", "Delete"))}</span></button>
    </div>`
  });
  body.addEventListener("click", async (e) => {
    const m = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-m]"))?.dataset.m;
    if (!m) return;
    /** @type {HTMLDialogElement} */ ($("sheet")).close();
    if (m === "print") printSetlist(id);
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
  $$("button[data-filter]").forEach((b) => { const on = b.dataset.filter === filter; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  const ns = store.songs.length, nl = store.setlists.length;
  $("libraryCount").textContent = `${t(ns === 1 ? "songCount1" : "songsCount", ns === 1 ? "1 song" : "{n} songs", { n: ns })} · ${t(nl === 1 ? "setlistCount1" : "setlistsCount", nl === 1 ? "1 setlist" : "{n} setlists", { n: nl })}`;
  /** @type {HTMLElement} */ (document.querySelector(".library-toolbar")).hidden = !ns && !nl;
  // Sorting applies to songs only.
  $("librarySort").hidden = filter === "setlists";
  const q = fold(query.trim());

  // The side preview shows only when a song list is drawn (renderPeek below).
  $("songPeek").hidden = true;
  $("libraryList").closest(".songs-split")?.classList.remove("with-peek");
  if (filter === "setlists") {
    const sets = store.setlists.filter((s) => !q || fold(s.title).includes(q));
    if (!store.setlists.length) {
      list.innerHTML = empty(t("emptySetlistsTitle", "No setlists yet"), t("emptySetlistsText", "Group songs for a gig, a rehearsal or a service, then play them in order on stage."), `<button class="btn primary" type="button" data-act="create-set">${icon("plus")}${esc(t("createSetlist", "Create a setlist"))}</button>`);
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
  if (filter === "bank") songs = songs.filter((s) => s.inBank);
  if (q) songs = songs.filter((s) => fold(`${s.title} ${s.artist} ${s.creator} ${s.body}`).includes(q));

  if (!store.songs.length) {
    // First visit: three ways in, nothing else. Import comes first: most people already have their songs somewhere.
    const choice = (/** @type {string} */ act, /** @type {string} */ ic, /** @type {[string, string]} */ title, /** @type {[string, string]} */ sub) =>
      `<button type="button" class="welcome-choice" data-act="${act}">${icon(ic)}<span><b>${esc(t(title[0], title[1]))}</b><small>${esc(t(sub[0], sub[1]))}</small></span></button>`;
    list.innerHTML = `<div class="welcome">
      <h2>${esc(t("welcomeTitle", "Your chord charts, ready to play"))}</h2>
      <p>${esc(t("welcomeText2", "Saved on this device. Works offline. No account."))}</p>
      <div class="welcome-choices">
        ${choice("import", "download", ["welcomeImport", "Import a song"], ["welcomeImportSub", "Paste a link to a chord page, or the chords."])}
        ${choice("create", "edit", ["createSong", "Write a song"], ["welcomeWriteSub", "Start from a blank chart."])}
        ${choice("demo", "sparkles", ["tryDemo", "Try the demo song"], ["welcomeDemoSub", "See a finished chart and the stage view."])}
      </div>
    </div>`;
    return;
  }
  // Song Bank: a card to manage and share it sits above its songs.
  const bankCard = filter === "bank" ? `<div class="bank-card"><div><b>${esc(store.bank.fileId ? t("bankIsLive", "Your Song Bank is live") : t("songBank", "Song Bank"))}</b><p class="muted">${esc(store.bank.fileId ? t("bankLiveSub", "{n} songs · people scan your QR to browse", { n: store.songs.filter((x) => x.inBank).length }) : t("bankPitch", "List the songs you know or offer. People scan your QR, browse your songs, read charts in their key and support you."))}</p></div><button class="btn primary" type="button" data-act="bank">${icon(store.bank.fileId ? "share" : "bank")}${esc(store.bank.fileId ? t("manageShare", "Manage & share") : t("setUpBank", "Set up"))}</button></div>` : "";
  if (!songs.length) {
    if (filter === "bank") { list.innerHTML = bankCard + empty(t("songBank", "Song Bank"), t("bankNoSongs", "No songs in your Song Bank yet. Open Set up, or use a song's ⋮ menu → Add to Song Bank."), ""); paintIcons(list); return; }
    list.innerHTML = q
      ? empty(t("noMatches", "No matches for \"{q}\"", { q: query }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`)
      : empty(t("filterFavorites", "Favorites"), t("noFavorites", "No favorites yet. Tap the star on a song."), `<button class="btn" type="button" data-act="all">${esc(t("showAllSongs", "Show all songs"))}</button>`);
    return;
  }
  const activeId = store.activeId;
  // Big libraries: draw the first rows now and the rest on request, so typing in search stays quick.
  const total = songs.length;
  songs = songs.slice(0, limit);
  list.innerHTML = bankCard + songs.map((s) => {
    const k = !s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s)));
    const sub = [s.artist, relativeTime(s.updatedAt, lang)].filter(Boolean).map(esc).join(" · ");
    return `<div class="row${s.id === activeId ? " active" : ""}" data-id="${esc(s.id)}">
      <button type="button" class="row-main" data-act="open">
        <span class="key-badge" title="${esc(t("key", "Key"))}">${esc(k)}</span>
        <span class="row-text"><span class="row-title">${esc(s.title)}</span><span class="row-sub">${sub}${s.genre ? ` · ${esc(s.genre)}` : ""}</span></span>
      </button>
      <button type="button" class="icon-btn fav${s.isFavorite ? " on" : ""}" data-act="fav" aria-pressed="${s.isFavorite}" aria-label="${esc(t("favorite", "Favorite"))}">${icon(s.isFavorite ? "star-fill" : "star")}</button>
      <button type="button" class="icon-btn" data-act="more" aria-label="${esc(t("moreActions", "More actions"))}">${icon("more")}</button>
    </div>`;
  }).join("") + (total > songs.length
    ? `<div class="row more-row"><button type="button" class="btn ghost wide" data-act="more-rows">${esc(t("showMoreSongs", "Show more ({n} left)", { n: total - songs.length }))}</button></div>`
    : "");
  paintIcons(list);
  renderPeek(songs);
}

/** The chart of the tapped (or open) song beside the list, on wide screens. @param {any[]} shown */
function renderPeek(shown) {
  const host = $("songPeek");
  const s = wide.matches && filter !== "setlists" ? (store.song(peekId) || shown.find((x) => x.id === store.activeId) || shown[0] || null) : null;
  host.hidden = !s;
  $("libraryList").closest(".songs-split")?.classList.toggle("with-peek", Boolean(s));
  if (!s) return;
  host.dataset.id = s.id;
  document.querySelectorAll("#libraryList .row[data-id]").forEach((r) => r.classList.toggle("peeked", r.getAttribute("data-id") === s.id));
  const k = pretty(keyShort(soundingKey(s)));
  const meta = [s.artist, s.genre, s.bpm ? `${s.bpm} BPM` : "", s.capo ? t("capoN", "Capo {n}", { n: s.capo }) : ""].filter(Boolean);
  host.innerHTML = `<header class="peek-head"><span class="key-badge">${esc(k)}</span><div><h2>${esc(s.title)}</h2>${meta.length ? `<p class="muted">${esc(meta.join(" · "))}</p>` : ""}</div></header>
    <div class="peek-actions"><button class="btn primary" type="button" id="peekEdit">${icon("edit")}${esc(t("editChart", "Edit chart"))}</button><button class="btn" type="button" id="peekPresent">${icon("present")}${esc(t("present", "Present"))}</button><button class="btn" type="button" id="peekShare">${icon("share")}${esc(t("share", "Share"))}</button></div>
    <div class="chart peek-chart">${s.body.trim() ? linesToHtml(buildLines(s.body, renderOptions(s))) : `<p class="chart-empty">${esc(t("stageEmpty", "This song has no chart yet."))}</p>`}</div>`;
}
