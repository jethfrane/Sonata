// @ts-check
// Lazy-loaded song/setlist action sheets, Trash undo helpers, and native right-click context menus.
import { $, esc, icon, toast, openSheet } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, tick } from "./ctx.js";

/** @typedef {{ label: string, icon?: string, kbd?: string, danger?: boolean, active?: boolean, sepBefore?: boolean, onSelect: () => void }} CtxItem */
/** @typedef {{ openShare: (id?: string) => any, openSetlistEditor: (id?: string, songIds?: string[]) => any, printSetlist: (id: string) => any, openSetlistsFilter: () => void }} MenuDeps */

/** @type {(() => void)|null} */
let activeClose = null;

export function closeContextMenu() {
  activeClose?.();
}

/**
 * Open an accessible floating context menu (`role="menu"`) anchored at `(x, y)`.
 * @param {{ x: number, y: number, title?: string, items: CtxItem[] }} o
 */
export function openContextMenu(o) {
  closeContextMenu();
  if (!o.items.length) return;

  const menu = document.createElement("div");
  menu.className = "ui-ctx-menu";
  menu.setAttribute("role", "menu");
  if (o.title) menu.setAttribute("aria-label", o.title);

  menu.innerHTML = (o.title ? `<div class="ui-ctx-head">${esc(o.title)}</div>` : "")
    + o.items.map((it, i) => `${it.sepBefore ? '<div class="ui-ctx-sep" role="separator"></div>' : ""}<button type="button" role="menuitem" class="ui-ctx-item${it.danger ? " danger" : ""}${it.active ? " on" : ""}" data-ctx-idx="${i}">${it.icon ? icon(it.icon) : ""}<span class="ui-ctx-label">${esc(it.label)}</span>${it.kbd ? `<kbd class="ui-ctx-kbd">${esc(it.kbd)}</kbd>` : ""}</button>`).join("");

  document.body.appendChild(menu);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = Math.min(menu.offsetWidth || 220, vw - 16);
  const mh = Math.min(menu.offsetHeight || 260, vh - 16);
  const left = Math.max(8, Math.min(o.x, vw - mw - 8));
  const top = Math.max(8, Math.min(o.y, vh - mh - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  const close = () => {
    if (activeClose !== close) return;
    activeClose = null;
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close);
    menu.remove();
  };
  activeClose = close;

  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (e.target instanceof Node && menu.contains(e.target)) return;
    close();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const btns = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll(".ui-ctx-item")]);
    const idx = btns.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); btns[(idx + 1) % btns.length]?.focus(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); btns[(idx - 1 + btns.length) % btns.length]?.focus(); return; }
    if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); btns[0]?.focus(); return; }
    if (e.key === "End") { e.preventDefault(); e.stopPropagation(); btns[btns.length - 1]?.focus(); return; }
  };

  menu.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-ctx-idx]"));
    if (!btn) return;
    const item = o.items[Number(btn.dataset.ctxIdx)];
    close();
    item?.onSelect?.();
  });

  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);

  /** @type {HTMLElement|null} */ (menu.querySelector(".ui-ctx-item"))?.focus({ preventScroll: true });
}

/** @param {string} id */
function togglePin(id) {
  const s = store.song(id);
  if (!s) return;
  tick();
  store.update(s, { pinned: !s.pinned });
  app.refresh();
}

/** @param {string} id */
function toggleFavorite(id) {
  const s = store.song(id);
  if (!s) return;
  tick();
  store.update(s, { isFavorite: !s.isFavorite });
  app.refresh();
}

/** @param {string} id */
function toggleSetlistFavorite(id) {
  const set = store.setlists.find((x) => x.id === id);
  if (!set) return;
  tick();
  store.saveSetlist({ id: set.id, isFavorite: !set.isFavorite });
  app.refresh();
}

/** @param {string[]} ids */
export function deleteWithUndo(ids) {
  const trashed = store.trashSongs(ids);
  app.refresh();
  if (!trashed.length) return;
  const trashedIds = trashed.map((e) => e.id);
  toast(t("movedToTrash", "Moved to Trash"), "info", {
    ms: 7000,
    action: t("undoDelete", "Undo"),
    onAction: () => {
      store.restoreFromTrash(trashedIds);
      app.refresh();
    }
  });
}

/** @param {string} id */
export function trashSetlistWithUndo(id) {
  const entry = store.trashSetlist(id);
  app.refresh();
  if (entry) {
    toast(t("movedToTrash", "Moved to Trash"), "info", {
      ms: 7000,
      action: t("undoDelete", "Undo"),
      onAction: () => { store.restoreFromTrash([id]); app.refresh(); }
    });
  }
}

/** Put one song at the end of a setlist, or start a new setlist with it. @param {string} id @param {MenuDeps} deps */
export function addToSetlist(id, deps) {
  const s = store.song(id);
  if (!s) return;
  if (!store.setlists.length) { deps.openSetlistEditor(undefined, [id]); return; }
  const count = (/** @type {number} */ n) => t(n === 1 ? "songCount1" : "songsCount", n === 1 ? "1 song" : "{n} songs", { n });
  const rows = store.setlists.map((set) => {
    const has = set.items.some((i) => i.songId === id);
    return `<button type="button" class="menu-item set-pick" data-set="${esc(set.id)}" ${has ? "disabled" : ""}>${icon(has ? "check" : "list")}<span class="set-pick-text"><span>${esc(set.title)}</span><span class="muted">${esc(has ? t("inSetAlready", "Already in this setlist") : count(store.setlistSongs(set).length))}</span></span></button>`;
  }).join("");
  const body = openSheet({
    title: t("addToSetlist", "Add to setlist"),
    className: "menu-sheet",
    body: `<p class="muted set-pick-song">${esc(s.title)}</p><div class="menu-list">${rows}
      <button type="button" class="menu-item" data-set="">${icon("plus")}<span>${esc(t("newSetlist", "New setlist"))}</span></button></div>`
  });
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-set]"));
    if (!b || b.disabled) return;
    /** @type {HTMLDialogElement} */ ($("sheet")).close();
    const set = store.setlists.find((x) => x.id === b.dataset.set);
    if (!set) { deps.openSetlistEditor(undefined, [id]); return; }
    store.saveSetlist({ id: set.id, items: [...set.items, { songId: id }] });
    app.refresh();
    toast(t("addedToSet", "Added to {title}", { title: set.title }), "success", {
      action: t("open", "Open"),
      onAction: () => deps.openSetlistsFilter()
    });
  });
}

/** @param {string} id @param {MenuDeps} deps */
export function songMenu(id, deps) {
  const s = store.song(id);
  if (!s) return;
  const body = openSheet({
    title: s.title,
    className: "menu-sheet",
    body: `<div class="menu-list">
      <button type="button" class="menu-item" data-m="open">${icon("edit")}<span>${esc(t("open", "Open"))}</span></button>
      <button type="button" class="menu-item" data-m="present">${icon("present")}<span>${esc(t("present", "Present"))}</span></button>
      <button type="button" class="menu-item" data-m="pin">${icon("pin")}<span>${esc(s.pinned ? t("unpin", "Unpin") : t("pin", "Pin to sidebar"))}</span></button>
      <button type="button" class="menu-item" data-m="share">${icon("share")}<span>${esc(t("share", "Share"))}</span></button>
      <button type="button" class="menu-item" data-m="set">${icon("list")}<span>${esc(t("addToSetlist", "Add to setlist"))}</span></button>
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
    if (m === "pin") togglePin(id);
    if (m === "share") { store.open(id); deps.openShare(); }
    if (m === "set") addToSetlist(id, deps);
    if (m === "dup") { store.duplicate(s); app.show("editor"); }
    if (m === "bank") { store.update(s, { inBank: !s.inBank }); app.refresh(); toast(s.inBank ? t("addedToBank", "Added to your Song Bank") : t("removedFromBank", "Removed from your Song Bank"), "success"); }
    if (m === "del") deleteWithUndo([id]);
  });
}

/** @param {string} id @param {MenuDeps} deps */
export function setlistMenu(id, deps) {
  const set = store.setlists.find((s) => s.id === id);
  if (!set) return;
  const body = openSheet({
    title: set.title,
    className: "menu-sheet",
    body: `<div class="menu-list">
      <button type="button" class="menu-item" data-m="play">${icon("present")}<span>${esc(t("playSet", "Play"))}</span></button>
      <button type="button" class="menu-item" data-m="edit">${icon("edit")}<span>${esc(t("edit", "Edit"))}</span></button>
      <button type="button" class="menu-item" data-m="fav">${icon(set.isFavorite ? "star-fill" : "star")}<span>${esc(set.isFavorite ? t("unfavorite", "Remove from Favorites") : t("favorite", "Favorite"))}</span></button>
      <button type="button" class="menu-item" data-m="share">${icon("share")}<span>${esc(t("share", "Share"))}</span></button>
      ${set.liveId || set.source ? `<button type="button" class="menu-item" data-m="sync">${icon("refresh")}<span>${esc(t("syncSetlist", "Sync Drive link"))}</span></button>` : ""}
      <button type="button" class="menu-item" data-m="print">${icon("print")}<span>${esc(t("print", "Print"))}</span></button>
      <button type="button" class="menu-item danger" data-m="del">${icon("trash")}<span>${esc(t("delete", "Delete"))}</span></button>
    </div>`
  });
  body.addEventListener("click", async (e) => {
    const m = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-m]"))?.dataset.m;
    if (!m) return;
    /** @type {HTMLDialogElement} */ ($("sheet")).close();
    if (m === "print") deps.printSetlist(id);
    if (m === "play") { if (store.playSetlist(id)) app.openStage(); }
    if (m === "edit") deps.openSetlistEditor(id);
    if (m === "fav") toggleSetlistFavorite(id);
    if (m === "share") deps.openShare(id);
    if (m === "sync") { await (await import("./liveset.js")).syncLiveSetNow(id); app.refresh(); }
    if (m === "del") trashSetlistWithUndo(id);
  });
}

/** @param {string} id @param {number} x @param {number} y @param {MenuDeps} deps */
export function openSongContextMenu(id, x, y, deps) {
  const s = store.song(id);
  if (!s) return;
  openContextMenu({
    x,
    y,
    title: s.title || t("untitled", "Untitled"),
    items: [
      { label: t("open", "Open"), icon: "edit", kbd: "↵", onSelect: () => { store.exitSetlist(); store.open(id); app.show("editor"); } },
      { label: t("present", "Present"), icon: "present", onSelect: () => { store.exitSetlist(); store.open(id); app.openStage(); } },
      { label: s.pinned ? t("unpin", "Unpin") : t("pin", "Pin to sidebar"), icon: "pin", active: Boolean(s.pinned), sepBefore: true, onSelect: () => togglePin(id) },
      { label: s.isFavorite ? t("unfavorite", "Remove from Favorites") : t("favorite", "Favorite"), icon: s.isFavorite ? "star-fill" : "star", active: s.isFavorite, onSelect: () => toggleFavorite(id) },
      { label: t("addToSetlist", "Add to setlist"), icon: "list", onSelect: () => addToSetlist(id, deps) },
      { label: t("share", "Share"), icon: "share", sepBefore: true, onSelect: () => { store.open(id); deps.openShare(); } },
      { label: t("duplicate", "Duplicate"), icon: "duplicate", onSelect: () => { store.duplicate(s); app.show("editor"); } },
      { label: s.inBank ? t("removeFromBank", "Remove from Song Bank") : t("addToBank", "Add to Song Bank"), icon: "bank", onSelect: () => { store.update(s, { inBank: !s.inBank }); app.refresh(); toast(s.inBank ? t("addedToBank", "Added to your Song Bank") : t("removedFromBank", "Removed from your Song Bank"), "success"); } },
      { label: t("delete", "Delete"), icon: "trash", danger: true, sepBefore: true, onSelect: () => deleteWithUndo([id]) }
    ]
  });
}

/** @param {string} id @param {number} x @param {number} y @param {MenuDeps} deps */
export function openSetlistContextMenu(id, x, y, deps) {
  const set = store.setlists.find((s) => s.id === id);
  if (!set) return;
  openContextMenu({
    x,
    y,
    title: set.title,
    items: [
      { label: t("playSet", "Play"), icon: "present", onSelect: () => { if (store.playSetlist(id)) app.openStage(); } },
      { label: t("open", "Open"), icon: "edit", onSelect: () => { if (store.playSetlist(id)) app.show("editor"); else deps.openSetlistEditor(id); } },
      { label: t("edit", "Edit"), icon: "sliders", sepBefore: true, onSelect: () => deps.openSetlistEditor(id) },
      { label: set.isFavorite ? t("unfavorite", "Remove from Favorites") : t("favorite", "Favorite"), icon: set.isFavorite ? "star-fill" : "star", active: Boolean(set.isFavorite), onSelect: () => toggleSetlistFavorite(id) },
      { label: t("share", "Share"), icon: "share", sepBefore: true, onSelect: () => deps.openShare(id) },
      ...(set.liveId || set.source ? [{ label: t("syncSetlist", "Sync Drive link"), icon: "refresh", onSelect: async () => { await (await import("./liveset.js")).syncLiveSetNow(id); app.refresh(); } }] : []),
      { label: t("print", "Print"), icon: "print", onSelect: () => deps.printSetlist(id) },
      { label: t("delete", "Delete"), icon: "trash", danger: true, sepBefore: true, onSelect: () => trashSetlistWithUndo(id) }
    ]
  });
}
