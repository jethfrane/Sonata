// @ts-check
import { $, $$, esc, icon, toast, confirmSheet, relativeTime, paintIcons } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { store, app, soundingKey, tick, renderOptions, profileName } from "./ctx.js";
import { keyShort, pretty } from "../core/music.js";
import { TRASH_TTL_MS } from "../core/store.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { openShare, openSetlistEditor, printSetlist, openBankManager, openLinksImport } from "./sheets-lazy.js";
import { addDemoSong } from "./editor.js";

/** @type {"all"|"favorites"|"setlists"|"bank"|"trash"} */
let filter = "all";
let setTagFilter = "";
let query = "";
/** Wide screens show the tapped song's chart beside the list (phones open it). */
const wide = matchMedia("(min-width: 900px)");
/** Song shown beside the list ("" = the open song). */
let peekId = "";
/** Items shown per page across all tabs; keeps pages short & fast. */
const PAGE_SIZE = 12;
let page = 1;
let showAllRows = false;
/** @type {ReturnType<typeof setTimeout>|undefined} */
let searchTimer;

/** Accent- and case-insensitive text for search. @param {string} s */
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ctxMenu = () => import("./contextmenu.js");
const menuDeps = () => ({ openShare, openSetlistEditor, printSetlist, openSetlistsFilter });

export function initLibrary() {
  const search = /** @type {HTMLInputElement} */ ($("librarySearch"));
  search.addEventListener("input", () => {
    query = search.value;
    page = 1;
    showAllRows = false;
    clearTimeout(searchTimer);
    if (store.songs.length > 300) searchTimer = setTimeout(renderLibrary, 120); else renderLibrary();
  });
  $$("button[data-filter]").forEach((b) => b.addEventListener("click", () => {
    page = 1;
    showAllRows = false;
    peekId = "";
    setTagFilter = "";
    filter = /** @type {any} */ (b.dataset.filter);
    renderLibrary();
  }));
  $("librarySort").addEventListener("change", () => {
    page = 1;
    try { localStorage.setItem("sonata_library_sort", /** @type {HTMLSelectElement} */ ($("librarySort")).value); } catch { /* ignore */ }
    renderLibrary();
  });
  try {
    const s = localStorage.getItem("sonata_library_sort");
    if (s && [.../** @type {HTMLSelectElement} */ ($("librarySort")).options].some((o) => o.value === s)) {
      /** @type {HTMLSelectElement} */ ($("librarySort")).value = s;
    }
  } catch { /* ignore */ }
  $("newSongBtn").addEventListener("click", () => { newSong(); });
  $("newSetlistBtn").addEventListener("click", () => openSetlistEditor());
  $("libraryList").addEventListener("click", onListClick);
  $("libraryList").addEventListener("contextmenu", onListContextMenu);
  $("libraryList").addEventListener("dblclick", (e) => {
    const row = /** @type {HTMLElement} */ (e.target).closest("[data-id]");
    if (!row || !wide.matches || !/** @type {HTMLElement} */ (e.target).closest('[data-act="open"]')) return;
    peekId = "";
    store.exitSetlist(); store.open(row.getAttribute("data-id") || ""); app.show("editor");
  });
  $("songPeek").addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    const id = $("songPeek").dataset.id || "";
    if (!b || !store.song(id)) return;
    peekId = "";
    store.exitSetlist();
    if (b.id === "peekEdit") { store.open(id); app.show("editor"); }
    if (b.id === "peekPresent") { store.open(id); app.openStage(); }
    if (b.id === "peekShare") { store.open(id); openShare(); }
  });
  wide.addEventListener("change", () => { if (app.view === "songs") renderLibrary(); });
  store.on("change", (/** @type {string} */ kind) => {
    if (kind === "library") { recentSoon(); if (app.view === "songs") renderSoon(); }
    else if (kind === "settings" && app.view === "songs") renderSoon();
  });
  store.on("song-open", () => { recentSoon(); if (app.view === "songs") renderSoon(); });
  $("recentList").addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const pinBtn = /** @type {HTMLElement|null} */ (target.closest("[data-pin-recent]"));
    if (pinBtn) {
      e.stopPropagation();
      togglePin(pinBtn.dataset.pinRecent || "");
      return;
    }
    const b = /** @type {HTMLElement|null} */ (target.closest("[data-recent]"));
    if (!b) return;
    store.exitSetlist();
    store.open(b.dataset.recent || "");
    app.show("editor");
  });
  $("recentList").addEventListener("contextmenu", async (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-recent]"));
    const id = btn?.dataset.recent || "";
    if (!id || !store.song(id)) return;
    e.preventDefault();
    (await ctxMenu()).openSongContextMenu(id, e.clientX, e.clientY, menuDeps());
  });
  renderLibrary();
}

let soon = 0;
function renderSoon() { cancelAnimationFrame(soon); soon = requestAnimationFrame(renderLibrary); }
let recentTimer = /** @type {any} */ (0);
function recentSoon() { clearTimeout(recentTimer); recentTimer = setTimeout(renderRecent, 250); }

export function openSetlistsFilter() {
  filter = "setlists";
  page = 1;
  showAllRows = false;
  renderLibrary();
}

/** @param {string} id */
export function togglePin(id) {
  const s = store.song(id);
  if (!s) return;
  tick();
  store.update(s, { pinned: !s.pinned });
  renderRecent();
  if (app.view === "songs") renderLibrary();
}

/** @param {string} id */
export function toggleFavorite(id) {
  const s = store.song(id);
  if (!s) return;
  tick();
  store.update(s, { isFavorite: !s.isFavorite });
  renderLibrary();
}

/** @param {string} id */
export function toggleSetlistFavorite(id) {
  const set = store.setlists.find((x) => x.id === id);
  if (!set) return;
  tick();
  store.saveSetlist({ id: set.id, isFavorite: !set.isFavorite });
  renderLibrary();
}

/** Sidebar (desktop): pinned + recent songs with artist, live status, and relative touch time. */
export function renderRecent() {
  const host = document.getElementById("recentList");
  if (!host) return;
  const lang = getLang();
  const time = (/** @type {any} */ s) => Date.parse(s.lastOpenedAt || s.updatedAt || s.createdAt) || 0;
  const inActiveSet = new Set(store.currentSetlist()?.songs.map((x) => x.id) || []);
  const sorted = store.songs.slice().sort((a, b) => {
    const pd = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    return pd || (time(b) - time(a));
  }).slice(0, 8);

  if (!sorted.length) {
    const emptyHtml = `<p class="recent-empty">${esc(t("recentEmpty", "Songs you open show up here."))}</p>`;
    if (host.dataset.html !== emptyHtml) { host.innerHTML = emptyHtml; host.dataset.html = emptyHtml; }
    return;
  }

  const pinned = sorted.filter((s) => s.pinned);
  const recent = sorted.filter((s) => !s.pinned);

  const rowHtml = (/** @type {import("../core/store.js").Song} */ s) => {
    const isActive = s.id === store.activeId;
    const k = !s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s)));
    const status = isActive
      ? t("statusEditing", "Open")
      : inActiveSet.has(s.id)
        ? t("statusInSet", "In setlist")
        : s.inBank && store.bank.fileId
          ? t("statusLiveBank", "Live")
          : s.origin
            ? t("statusShared", "Shared")
            : "";
    const meta = [s.artist || s.genre, status, relativeTime(s.lastOpenedAt || s.updatedAt, lang)].filter(Boolean).map(esc).join(" · ");
    return `<div class="recent-row${isActive ? " active" : ""}${s.pinned ? " pinned" : ""}">
      <button type="button" class="recent-item${isActive ? " active" : ""}" data-recent="${esc(s.id)}">
        <span class="recent-key">${esc(k)}</span>
        <span class="recent-body">
          <span class="recent-top"><span class="recent-title">${esc(s.title || t("untitled", "Untitled"))}</span>${isActive ? '<span class="recent-live-dot" aria-hidden="true"></span>' : ""}</span>
          <span class="recent-meta">${meta}</span>
        </span>
      </button>
      <button type="button" class="icon-btn small recent-pin${s.pinned ? " on" : ""}" data-pin-recent="${esc(s.id)}" aria-label="${esc(s.pinned ? t("unpin", "Unpin") : t("pin", "Pin"))}" title="${esc(s.pinned ? t("unpin", "Unpin") : t("pin", "Pin"))}">${icon("pin")}</button>
    </div>`;
  };

  let html = "";
  if (pinned.length) {
    html += `<p class="recent-group-label">${esc(t("pinned", "Pinned"))}</p>` + pinned.map(rowHtml).join("");
    if (recent.length) html += `<p class="recent-group-label">${esc(t("recent", "Recent"))}</p>`;
  }
  html += recent.map(rowHtml).join("");
  if (host.dataset.html !== html) { host.innerHTML = html; host.dataset.html = html; }
}

export function newSong() {
  tick();
  store.createSong({}, profileName());
  app.show("editor");
  setTimeout(() => /** @type {HTMLInputElement} */ ($("songTitle")).focus(), 60);
}

/** @param {Event} e */
async function onListClick(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  const tagFilterBtn = /** @type {HTMLElement|null} */ (target.closest("[data-set-tag-filter]"));
  if (tagFilterBtn) {
    setTagFilter = tagFilterBtn.dataset.setTagFilter || "";
    page = 1;
    showAllRows = false;
    renderLibrary();
    return;
  }
  const pageBtn = /** @type {HTMLElement|null} */ (target.closest("[data-page]"));
  if (pageBtn) {
    const next = Number(pageBtn.dataset.page);
    if (Number.isFinite(next) && next >= 1) {
      page = next;
      showAllRows = false;
      renderLibrary();
      $("libraryList").scrollIntoView({ block: "nearest" });
    }
    return;
  }
  const btn = /** @type {HTMLElement|null} */ (target.closest("[data-act]"));
  if (!btn) return;
  const id = btn.closest("[data-id]")?.getAttribute("data-id") || "";
  const act = btn.dataset.act;
  if (act === "open") {
    if (wide.matches && /** @type {MouseEvent} */ (e).detail < 2) {
      if (peekId === id) { peekId = ""; store.exitSetlist(); store.open(id); app.show("editor"); return; }
      peekId = id;
      renderLibrary();
      return;
    }
    peekId = "";
    store.exitSetlist(); store.open(id); app.show("editor");
  }
  else if (act === "fav") toggleFavorite(id);
  else if (act === "pin") togglePin(id);
  else if (act === "present") { store.exitSetlist(); store.open(id); app.openStage(); }
  else if (act === "share") { store.open(id); openShare(); }
  else if (act === "more") (await ctxMenu()).songMenu(id, menuDeps());
  else if (act === "set-open") { if (store.playSetlist(id)) app.show("editor"); else openSetlistEditor(id); }
  else if (act === "set-play") { if (store.playSetlist(id)) app.openStage(); else openSetlistEditor(id); }
  else if (act === "set-edit") openSetlistEditor(id);
  else if (act === "set-share") openShare(id);
  else if (act === "set-fav") toggleSetlistFavorite(id);
  else if (act === "set-more") (await ctxMenu()).setlistMenu(id, menuDeps());
  else if (act === "trash-restore") {
    const res = store.restoreFromTrash([id]);
    renderLibrary();
    if (res.songs.length || res.setlists.length) toast(t("restoredFromTrash", "Restored from Trash"), "success");
  }
  else if (act === "trash-purge") {
    const entry = store.trash.find((x) => x.id === id);
    if (!entry) return;
    const ok = await confirmSheet({
      title: t("deleteForeverTitle", "Delete forever?"),
      message: t("deleteForeverText", "\"{title}\" will be permanently deleted and cannot be recovered.", { title: entry.item.title || t("untitled", "Untitled") }),
      confirm: t("deleteForever", "Delete forever"),
      cancel: t("cancel", "Cancel"),
      danger: true
    });
    if (ok) { store.purgeFromTrash([id]); renderLibrary(); }
  }
  else if (act === "trash-empty") {
    if (!store.trash.length) return;
    const ok = await confirmSheet({
      title: t("emptyTrashTitle", "Empty trash?"),
      message: t("emptyTrashText", "All {n} items in Trash will be permanently deleted. This cannot be undone.", { n: store.trash.length }),
      confirm: t("emptyTrash", "Empty trash"),
      cancel: t("cancel", "Cancel"),
      danger: true
    });
    if (ok) { store.emptyTrash(); renderLibrary(); toast(t("trashEmptied", "Trash emptied"), "info"); }
  }
  else if (act === "create") newSong();
  else if (act === "demo") { addDemoSong(); app.show("editor"); }
  else if (act === "import") openLinksImport();
  else if (act === "create-set") openSetlistEditor();
  else if (act === "all") { filter = "all"; page = 1; showAllRows = false; renderLibrary(); }
  else if (act === "bank") openBankManager();
  else if (act === "more-rows") { showAllRows = true; renderLibrary(); }
  else if (act === "paged-rows") { showAllRows = false; page = 1; renderLibrary(); }
  else if (act === "clear") { query = ""; setTagFilter = ""; page = 1; showAllRows = false; /** @type {HTMLInputElement} */ ($("librarySearch")).value = ""; renderLibrary(); }
}

/** @param {MouseEvent} e */
async function onListContextMenu(e) {
  const row = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(".row[data-id]:not(.trash-row)"));
  if (!row) return;
  const id = row.getAttribute("data-id") || "";
  if (row.classList.contains("set-row")) {
    if (!store.setlists.some((x) => x.id === id)) return;
    e.preventDefault();
    (await ctxMenu()).openSetlistContextMenu(id, e.clientX, e.clientY, menuDeps());
    return;
  }
  if (!store.song(id)) return;
  e.preventDefault();
  (await ctxMenu()).openSongContextMenu(id, e.clientX, e.clientY, menuDeps());
}

/** @param {"title"|"recent"|"artist"|"key"|"oldest"} sort */
function sortSongs(sort) {
  const list = store.songs.slice();
  const by = (/** @type {(s: any) => string} */ f) => list.sort((a, b) => f(a).localeCompare(f(b), undefined, { sensitivity: "base", numeric: true }));
  const ts = (/** @type {any} */ s) => Date.parse(s.updatedAt || s.createdAt) || 0;
  if (sort === "title") by((s) => s.title);
  else if (sort === "artist") by((s) => s.artist || "\uffff");
  else if (sort === "key") list.sort((a, b) => soundingKey(a).tonic - soundingKey(b).tonic || a.title.localeCompare(b.title));
  else if (sort === "oldest") list.sort((a, b) => ts(a) - ts(b));
  else list.sort((a, b) => ts(b) - ts(a));
  return list;
}

/** @param {"title"|"recent"|"artist"|"key"|"oldest"} sort @param {import("../core/store.js").Setlist[]} sets */
function sortSetlists(sort, sets) {
  const list = sets.slice();
  const ts = (/** @type {any} */ s) => Date.parse(s.updatedAt || s.date) || 0;
  if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
  else if (sort === "artist") list.sort((a, b) => (a.tags?.[0] || "\uffff").localeCompare(b.tags?.[0] || "\uffff", undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title));
  else if (sort === "key") list.sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
  else if (sort === "oldest") list.sort((a, b) => ts(a) - ts(b));
  else list.sort((a, b) => ts(b) - ts(a));
  return list;
}

/** @template T @param {T[]} items */
function paginate(items) {
  const total = items.length;
  if (showAllRows || total <= PAGE_SIZE) {
    return { slice: items, total, page: 1, totalPages: 1, start: total ? 1 : 0, end: total };
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.max(1, Math.min(totalPages, page));
  const offset = (page - 1) * PAGE_SIZE;
  return { slice: items.slice(offset, offset + PAGE_SIZE), total, page, totalPages, start: offset + 1, end: Math.min(total, offset + PAGE_SIZE) };
}

/** @param {{ total: number, page: number, totalPages: number, start: number, end: number }} pg */
function pagerHtml(pg) {
  if (pg.total <= PAGE_SIZE) return "";
  if (showAllRows) {
    return `<div class="pager-bar"><span class="pager-info">${esc(t("showingAll", "Showing all {n}", { n: pg.total }))}</span><button type="button" class="btn small ghost" data-act="paged-rows">${esc(t("paginateRows", "Paginate ({n}/page)", { n: PAGE_SIZE }))}</button></div>`;
  }
  const nums = [];
  for (let i = 1; i <= pg.totalPages; i++) {
    if (i === 1 || i === pg.totalPages || Math.abs(i - pg.page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return `<nav class="pager-bar" aria-label="${esc(t("pagination", "Pages"))}">
    <span class="pager-info">${esc(t("showingRange", "{a}–{b} of {n}", { a: pg.start, b: pg.end, n: pg.total }))}</span>
    <div class="pager-controls">
      <button type="button" class="btn small ghost pager-btn" data-page="${pg.page - 1}"${pg.page <= 1 ? " disabled" : ""} aria-label="${esc(t("prevPage", "Previous page"))}">${icon("chevron-left")}</button>
      ${nums.map((n) => n === "…"
        ? `<span class="pager-dots" aria-hidden="true">…</span>`
        : `<button type="button" class="btn small pager-btn${n === pg.page ? " active" : " ghost"}" data-page="${n}"${n === pg.page ? ' aria-current="page"' : ""}>${n}</button>`).join("")}
      <button type="button" class="btn small ghost pager-btn" data-page="${pg.page + 1}"${pg.page >= pg.totalPages ? " disabled" : ""} aria-label="${esc(t("nextPage", "Next page"))}">${icon("chevron-right")}</button>
      <button type="button" class="btn small ghost pager-all" data-act="more-rows">${esc(t("showAllRows", "Show all ({n})", { n: pg.total }))}</button>
    </div>
  </nav>`;
}

/** @param {import("../core/store.js").Setlist} s @param {string} lang */
function setlistRowHtml(s, lang) {
  const songs = store.setlistSongs(s);
  const preview = songs.slice(0, 4).map((x) => x.title).join(" · ");
  const badges = [
    s.liveId ? `<span class="meta-pill pill-live">${esc(t("liveOnDrive", "Live on Drive"))}</span>` : "",
    s.source ? `<span class="meta-pill pill-shared">${esc(t("syncedFromDrive", "Synced from Drive"))}</span>` : "",
    ...(s.tags || []).map((tg) => `<span class="meta-pill pill-tag">${esc(tg)}</span>`)
  ].filter(Boolean).join("");
  const updated = relativeTime(s.updatedAt || s.date, lang);
  const sub = [
    t(songs.length === 1 ? "songCount1" : "songsInSet", songs.length === 1 ? "1 song" : "{n} songs", { n: songs.length }),
    updated ? t("updatedWhen", "Updated {when}", { when: updated }) : "",
    preview
  ].filter(Boolean).map(esc).join(" · ");
  return `<div class="row set-row${store.setlist.id === s.id ? " active" : ""}" data-id="${esc(s.id)}">
    <button type="button" class="row-main" data-act="set-open">
      <span class="row-icon">${icon(s.liveId || s.source ? "cloud-check" : "list")}</span>
      <span class="row-text">
        <span class="row-title-line"><span class="row-title">${esc(s.title)}</span>${badges ? `<span class="row-badges">${badges}</span>` : ""}</span>
        <span class="row-sub">${sub}</span>
      </span>
    </button>
    <div class="row-hover-acts">
      <button type="button" class="icon-btn small" data-act="set-edit" aria-label="${esc(t("edit", "Edit"))}" title="${esc(t("edit", "Edit"))}">${icon("edit")}</button>
      <button type="button" class="icon-btn small" data-act="set-share" aria-label="${esc(t("share", "Share"))}" title="${esc(t("share", "Share"))}">${icon("share")}</button>
    </div>
    <button type="button" class="icon-btn fav${s.isFavorite ? " on" : ""}" data-act="set-fav" aria-pressed="${Boolean(s.isFavorite)}" aria-label="${esc(t("favorite", "Favorite"))}">${icon(s.isFavorite ? "star-fill" : "star")}</button>
    <button type="button" class="icon-btn" data-act="set-play" aria-label="${esc(t("playSet", "Play"))}" title="${esc(t("playSet", "Play"))}">${icon("present")}</button>
    <button type="button" class="icon-btn" data-act="set-more" aria-label="${esc(t("moreActions", "More actions"))}">${icon("more")}</button>
  </div>`;
}

/** @param {string} title @param {string} text @param {string} actions @param {string} [ic] */
const empty = (title, text, actions, ic = "music") => `<div class="empty"><div class="empty-art">${icon(ic)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="empty-actions">${actions}</div></div>`;

export function renderLibrary() {
  const list = $("libraryList");
  const lang = getLang();
  const nt = store.trash.length;
  $$("button[data-filter]").forEach((b) => {
    const on = b.dataset.filter === filter;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const trashCount = $("trashCount");
  trashCount.textContent = nt ? String(nt) : "";
  trashCount.hidden = !nt;
  const ns = store.songs.length, nl = store.setlists.length;
  $("libraryCount").textContent = `${t(ns === 1 ? "songCount1" : "songsCount", ns === 1 ? "1 song" : "{n} songs", { n: ns })} · ${t(nl === 1 ? "setlistCount1" : "setlistsCount", nl === 1 ? "1 setlist" : "{n} setlists", { n: nl })}`;
  /** @type {HTMLElement} */ (document.querySelector(".library-toolbar")).hidden = !ns && !nl && !nt && filter !== "trash";
  // Keep sort visible across All, Favorites, Setlists, and Song Bank (hide only on Trash).
  $("librarySort").hidden = filter === "trash";
  const q = fold(query.trim());
  const sort = /** @type {any} */ (/** @type {HTMLSelectElement} */ ($("librarySort")).value);

  $("songPeek").hidden = true;
  $("libraryList").closest(".songs-split")?.classList.remove("with-peek");

  if (filter === "trash") {
    if (!nt) {
      list.innerHTML = empty(
        t("trashEmptyTitle", "Trash is empty"),
        t("trashEmptyText", "Deleted songs and setlists stay in Trash for 30 days before permanent removal."),
        !ns && !nl ? `<button class="btn" type="button" data-act="all">${esc(t("showAllSongs", "Show all songs"))}</button>` : "",
        "trash"
      );
      return;
    }
    const trashCard = `<div class="trash-card">
      <div class="trash-card-copy">
        <div class="trash-card-head">${icon("trash")}<b>${esc(t("filterTrash", "Trash"))}</b><span class="filter-badge">${nt}</span></div>
        <p class="muted">${esc(t("trashNotice", "Deleted songs and setlists stay in Trash for 30 days before permanent removal."))}</p>
      </div>
      <button class="btn danger-outline small" type="button" data-act="trash-empty">${icon("trash")}${esc(t("emptyTrash", "Empty trash"))}</button>
    </div>`;
    const entries = store.trash
      .slice()
      .sort((a, b) => (Date.parse(b.trashedAt) || 0) - (Date.parse(a.trashedAt) || 0))
      .filter((e) => !q || fold(e.kind === "song" ? `${e.item.title} ${e.item.artist} ${e.item.creator} ${e.item.body}` : `${e.item.title} ${e.item.description} ${(e.item.tags || []).join(" ")}`).includes(q));
    if (!entries.length) {
      list.innerHTML = trashCard + empty(t("noMatches", "No matches for \"{q}\"", { q: query }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`, "trash");
      return;
    }
    const pg = paginate(entries);
    const nowMs = Date.now();
    list.innerHTML = trashCard + pg.slice.map((e) => {
      const trashedMs = Date.parse(e.trashedAt) || nowMs;
      const left = Math.max(0, Math.ceil((TRASH_TTL_MS - (nowMs - trashedMs)) / 86400000));
      const badge = e.kind === "song"
        ? `<span class="key-badge" title="${esc(t("key", "Key"))}">${esc(!e.item.body.trim() && e.item.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(e.item))))}</span>`
        : `<span class="row-icon">${icon("list")}</span>`;
      const meta = e.kind === "setlist"
        ? t(e.item.items.length === 1 ? "songCount1" : "songsInSet", e.item.items.length === 1 ? "1 song" : "{n} songs", { n: e.item.items.length })
        : e.item.artist;
      const sub = [meta, relativeTime(e.trashedAt, lang), t("daysLeft", "{n}d left", { n: left })].filter(Boolean).map(esc).join(" · ");
      return `<div class="row trash-row" data-id="${esc(e.id)}">
        <div class="row-main">
          ${badge}
          <span class="row-text"><span class="row-title">${esc(e.item.title || t("untitled", "Untitled"))}</span><span class="row-sub">${sub}</span></span>
        </div>
        <div class="trash-acts">
          <button type="button" class="btn small trash-restore-btn" data-act="trash-restore">${icon("undo")}${esc(t("restore", "Restore"))}</button>
          <button type="button" class="btn small ghost danger-text" data-act="trash-purge" aria-label="${esc(t("deleteForever", "Delete forever"))}">${icon("trash")}<span>${esc(t("deleteForever", "Delete forever"))}</span></button>
        </div>
      </div>`;
    }).join("") + pagerHtml(pg);
    paintIcons(list);
    return;
  }

  if (filter === "setlists") {
    if (!store.setlists.length) {
      list.innerHTML = empty(t("emptySetlistsTitle", "No setlists yet"), t("emptySetlistsText", "Group songs for a gig, a rehearsal or a service, then play them in order on stage."), `<button class="btn primary" type="button" data-act="create-set">${icon("plus")}${esc(t("createSetlist", "Create a setlist"))}</button>`);
      return;
    }
    const allTags = [...new Set(store.setlists.flatMap((s) => s.tags || []))];
    const hasFavSets = store.setlists.some((s) => s.isFavorite);
    const tagBar = (allTags.length || hasFavSets)
      ? `<div class="set-filter-bar" role="group" aria-label="${esc(t("filterByTag", "Filter setlists"))}">
          <button type="button" class="chip small${!setTagFilter ? " on" : ""}" data-set-tag-filter="">${esc(t("filterAll", "All"))}</button>
          ${hasFavSets ? `<button type="button" class="chip small${setTagFilter === "__fav" ? " on" : ""}" data-set-tag-filter="__fav">${esc(t("filterFavorites", "Favorites"))}</button>` : ""}
          ${allTags.map((tg) => `<button type="button" class="chip small${setTagFilter === tg ? " on" : ""}" data-set-tag-filter="${esc(tg)}">${esc(tg)}</button>`).join("")}
        </div>`
      : "";
    let sets = sortSetlists(sort, store.setlists);
    if (setTagFilter === "__fav") sets = sets.filter((s) => s.isFavorite);
    else if (setTagFilter) sets = sets.filter((s) => (s.tags || []).some((tg) => tg.toLowerCase() === setTagFilter.toLowerCase()));
    if (q) sets = sets.filter((s) => fold(`${s.title} ${s.description} ${(s.tags || []).join(" ")} ${store.setlistSongs(s).map((x) => x.title).join(" ")}`).includes(q));

    if (!sets.length) {
      list.innerHTML = tagBar + empty(t("noMatches", "No matches for \"{q}\"", { q: query || setTagFilter }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`);
      return;
    }
    const pg = paginate(sets);
    list.innerHTML = tagBar + pg.slice.map((s) => setlistRowHtml(s, lang)).join("") + pagerHtml(pg);
    paintIcons(list);
    return;
  }

  let songs = sortSongs(sort);
  /** @type {import("../core/store.js").Setlist[]} */
  let favSetlists = [];
  if (filter === "favorites") {
    songs = songs.filter((s) => s.isFavorite);
    favSetlists = sortSetlists(sort, store.setlists.filter((s) => s.isFavorite && (!q || fold(`${s.title} ${(s.tags || []).join(" ")}`).includes(q))));
  }
  if (filter === "bank") songs = songs.filter((s) => s.inBank);
  if (q) songs = songs.filter((s) => fold(`${s.title} ${s.artist} ${s.creator} ${s.genre} ${s.mood || ""} ${s.body}`).includes(q));

  if (!store.songs.length && !(filter === "favorites" && favSetlists.length)) {
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

  const bankCard = filter === "bank" ? `<div class="bank-card"><div><b>${esc(store.bank.fileId ? t("bankIsLive", "Your Song Bank is live") : t("songBank", "Song Bank"))}</b><p class="muted">${esc(store.bank.fileId ? t("bankLiveSub", "{n} songs · people scan your QR to browse", { n: store.songs.filter((x) => x.inBank).length }) : t("bankPitch", "List the songs you know or offer. People scan your QR, browse your songs, read charts in their key and support you."))}</p></div><button class="btn primary" type="button" data-act="bank">${icon(store.bank.fileId ? "share" : "bank")}${esc(store.bank.fileId ? t("manageShare", "Manage & share") : t("setUpBank", "Set up"))}</button></div>` : "";
  if (!songs.length && !favSetlists.length) {
    if (filter === "bank") { list.innerHTML = bankCard + empty(t("songBank", "Song Bank"), t("bankNoSongs", "No songs in your Song Bank yet. Open Set up, or use a song's ⋮ menu → Add to Song Bank."), ""); paintIcons(list); return; }
    list.innerHTML = q
      ? empty(t("noMatches", "No matches for \"{q}\"", { q: query }), "", `<button class="btn" type="button" data-act="clear">${esc(t("clearSearch", "Clear search"))}</button>`)
      : empty(t("filterFavorites", "Favorites"), t("noFavorites", "No favorites yet. Tap the star on a song."), `<button class="btn" type="button" data-act="all">${esc(t("showAllSongs", "Show all songs"))}</button>`);
    return;
  }

  /** Map songId -> setlist titles so rows can display live setlist membership badges. @type {Map<string, string[]>} */
  const setsBySong = new Map();
  for (const sl of store.setlists) {
    for (const it of sl.items) {
      if (!setsBySong.has(it.songId)) setsBySong.set(it.songId, []);
      setsBySong.get(it.songId)?.push(sl.title);
    }
  }

  const activeId = store.activeId;
  const pg = paginate(songs);
  const shown = pg.slice;
  const favSetsHtml = favSetlists.length
    ? `<div class="fav-sets-head"><span>${esc(t("favoriteSetlists", "Favorite setlists"))}</span></div>` + favSetlists.map((sl) => setlistRowHtml(sl, lang)).join("")
    : "";
  const favSongsHead = (favSetlists.length && shown.length)
    ? `<div class="fav-sets-head"><span>${esc(t("navSongs", "Songs"))}</span></div>`
    : "";

  list.innerHTML = bankCard + favSetsHtml + favSongsHead + shown.map((s) => {
    const k = !s.body.trim() && s.manualKey === "auto" ? "–" : pretty(keyShort(soundingKey(s)));
    const sets = setsBySong.get(s.id) || [];
    const badges = [
      s.pinned ? `<span class="meta-pill pill-pin">${icon("pin")}${esc(t("pinned", "Pinned"))}</span>` : "",
      s.inBank ? `<span class="meta-pill pill-live">${esc(store.bank.fileId ? t("statusLiveBank", "Live") : t("statusInBank", "Bank"))}</span>` : "",
      s.origin ? `<span class="meta-pill pill-shared">${esc(t("statusShared", "Shared"))}</span>` : "",
      sets.length ? `<span class="meta-pill pill-set">${esc(sets.length === 1 ? sets[0] : t("inNSetlists", "{n} sets", { n: sets.length }))}</span>` : ""
    ].filter(Boolean).join("");
    const updated = s.updatedAt ? t("updatedWhen", "Updated {when}", { when: relativeTime(s.updatedAt, lang) }) : "";
    const sub = [
      s.artist,
      s.genre,
      s.mood,
      s.capo ? t("capoN", "Capo {n}", { n: s.capo }) : "",
      s.bpm ? `${s.bpm} BPM` : "",
      updated
    ].filter(Boolean).map(esc).join(" · ");
    return `<div class="row${s.id === activeId ? " active" : ""}" data-id="${esc(s.id)}">
      <button type="button" class="row-main" data-act="open">
        <span class="key-badge" title="${esc(t("key", "Key"))}">${esc(k)}</span>
        <span class="row-text">
          <span class="row-title-line"><span class="row-title">${esc(s.title)}</span>${badges ? `<span class="row-badges">${badges}</span>` : ""}</span>
          <span class="row-sub">${sub}</span>
        </span>
      </button>
      <div class="row-hover-acts">
        <button type="button" class="icon-btn small" data-act="present" aria-label="${esc(t("present", "Present"))}" title="${esc(t("present", "Present"))}">${icon("present")}</button>
        <button type="button" class="icon-btn small${s.pinned ? " on" : ""}" data-act="pin" aria-label="${esc(s.pinned ? t("unpin", "Unpin") : t("pin", "Pin"))}" title="${esc(s.pinned ? t("unpin", "Unpin") : t("pin", "Pin"))}">${icon("pin")}</button>
        <button type="button" class="icon-btn small" data-act="share" aria-label="${esc(t("share", "Share"))}" title="${esc(t("share", "Share"))}">${icon("share")}</button>
      </div>
      <button type="button" class="icon-btn fav${s.isFavorite ? " on" : ""}" data-act="fav" aria-pressed="${s.isFavorite}" aria-label="${esc(t("favorite", "Favorite"))}">${icon(s.isFavorite ? "star-fill" : "star")}</button>
      <button type="button" class="icon-btn" data-act="more" aria-label="${esc(t("moreActions", "More actions"))}">${icon("more")}</button>
    </div>`;
  }).join("") + pagerHtml(pg);
  paintIcons(list);
  renderPeek(shown);
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
  const meta = [s.artist, s.genre, s.mood, s.bpm ? `${s.bpm} BPM` : "", s.capo ? t("capoN", "Capo {n}", { n: s.capo }) : ""].filter(Boolean);
  host.innerHTML = `<header class="peek-head"><span class="key-badge">${esc(k)}</span><div class="peek-title"><h2>${esc(s.title)}</h2>${meta.length ? `<div class="peek-meta">${meta.map((m) => `<span class="chip static muted">${esc(m)}</span>`).join("")}</div>` : ""}</div></header>
    <div class="peek-actions"><button class="btn primary" type="button" id="peekEdit">${icon("edit")}${esc(t("editChart", "Edit chart"))}</button><button class="btn" type="button" id="peekPresent">${icon("present")}${esc(t("present", "Present"))}</button><button class="btn" type="button" id="peekShare">${icon("share")}${esc(t("share", "Share"))}</button></div>
    <div class="chart peek-chart">${s.body.trim() ? linesToHtml(buildLines(s.body, renderOptions(s))) : `<p class="chart-empty">${esc(t("stageEmpty", "This song has no chart yet."))}</p>`}</div>`;
}
