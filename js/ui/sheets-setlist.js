// @ts-check
// Setlist management sheets: Setlist editor (with per-slot key/capo overrides), shared setlist import, and Quick Switcher.
import { esc, icon, toast, openSheet, closeSheet, paintIcons } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, effectiveCapo, adoptShared } from "./ctx.js";
import { normalizeTags } from "../core/store.js";
import { keyShort, parseKey, pretty, detectKey } from "../core/music.js";
import { unpackSong } from "../core/share.js";
import { keyOptions, capoOptions } from "./sheets-details.js";

const PRESET_SET_TAGS = [
  ["Church", "tagChurch"],
  ["Worship", "tagWorship"],
  ["Gig", "tagGig"],
  ["Performance", "tagPerformance"],
  ["Rehearsal", "tagRehearsal"],
  ["Acoustic", "tagAcoustic"]
];

/** Create or edit a setlist: title, optional tags, notes, ordered songs with optional per-slot key & capo overrides. @param {string} [id] @param {string[]} [songIds] songs a new setlist starts with */
export function openSetlistEditor(id, songIds = []) {
  const existing = id ? store.setlists.find((s) => s.id === id) : null;
  /** @type {import("../core/store.js").SetlistItem[]} */
  let items = existing
    ? existing.items.filter((i) => store.song(i.songId)).map((i) => ({ ...i }))
    : songIds.filter((x) => store.song(x)).map((songId) => ({ songId }));
  let tags = existing?.tags ? existing.tags.slice() : [];
  let q = "";
  const chosen = () => items.length
    ? items.map((it, i) => {
      const s = store.song(it.songId);
      const baseKey = soundingKey(s || null, null);
      const keyLabel = s?.title || "";
      const defKeyLbl = t("slotKeyDefault", "Song: {key}", { key: pretty(keyShort(baseKey)) });
      const defCapoLbl = s?.capo ? t("slotCapoDefaultN", "Song: Capo {n}", { n: s.capo }) : t("slotCapoDefault", "Song capo");
      return `<li class="set-item" data-sid="${esc(it.songId)}" data-slot-idx="${i}"><span class="set-num">${i + 1}</span><span class="set-name">${esc(keyLabel)}</span>
        <span class="set-item-keys">
          <select class="select set-slot-select${it.key ? " overridden" : ""}" data-slot-key="${i}" aria-label="${esc(t("slotKeyLabel", "Key for {title}", { title: keyLabel }))}">${keyOptions(it.key || "auto", baseKey, defKeyLbl)}</select>
          <select class="select set-slot-select${it.capo !== undefined ? " overridden" : ""}" data-slot-capo="${i}" aria-label="${esc(t("slotCapoLabel", "Capo for {title}", { title: keyLabel }))}">${capoOptions(it.capo ?? null, defCapoLbl)}</select>
        </span>
        <button class="icon-btn small" type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(t("moveUp", "Move up"))}">${icon("arrow-up")}</button>
        <button class="icon-btn small" type="button" data-move="1" ${i === items.length - 1 ? "disabled" : ""} aria-label="${esc(t("moveDown", "Move down"))}">${icon("arrow-down")}</button>
        <button class="icon-btn small" type="button" data-drop aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></li>`;
    }).join("")
    : `<li class="muted set-empty">${esc(t("noSongsInSet", "No songs yet. Pick some below."))}</li>`;
  const tagChips = () => {
    const active = new Set(tags.map((x) => x.toLowerCase()));
    const presets = PRESET_SET_TAGS.map(([name, key]) => {
      const on = active.has(name.toLowerCase());
      return `<button type="button" class="chip small${on ? " on" : ""}" data-set-tag="${esc(name)}" aria-pressed="${on}">${esc(t(key, name))}</button>`;
    });
    const custom = tags.filter((x) => !PRESET_SET_TAGS.some(([p]) => p.toLowerCase() === x.toLowerCase()))
      .map((x) => `<button type="button" class="chip small on" data-set-tag="${esc(x)}" aria-pressed="true">${esc(x)} ×</button>`);
    return [...presets, ...custom].join("");
  };
  const pool = () => {
    const fold = (/** @type {string} */ x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const f = fold(q.trim());
    return store.songs
      .filter((s) => !items.some((it) => it.songId === s.id) && (!f || fold(`${s.title} ${s.artist}`).includes(f)))
      .slice()
      .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0))
      .map((s) => `<button type="button" class="pick" data-add="${esc(s.id)}">${icon("plus")}<span class="pick-text"><span class="pick-title">${esc(s.title)}</span>${s.artist ? `<span class="muted">${esc(s.artist)}</span>` : ""}</span><span class="key-badge small">${esc(pretty(keyShort(soundingKey(s, null))))}</span></button>`).join("")
      || `<p class="muted set-empty">${esc(q.trim() ? t("noMatches", "No matches for \"{q}\"", { q }) : t("allSongsAdded", "Every song is in this setlist."))}</p>`;
  };
  const body = openSheet({
    title: existing ? t("editSetlistTitle", "Edit setlist") : t("newSetlistTitle", "New setlist"),
    wide: true,
    body: `<div class="form">
      <label class="field"><span>${esc(t("setTitle", "Title"))}</span><input class="input" id="slTitle" value="${esc(existing?.title || "")}" placeholder="${esc(t("setTitlePh", "Friday gig, rehearsal, Sunday service…"))}" autocomplete="off"></label>
      <div class="field"><span>${esc(t("setTags", "Tags (optional)"))}</span>
        <div class="chip-row sl-tag-chips" id="slTagChips">${tagChips()}</div>
        <input class="input" id="slTagsInput" value="" placeholder="${esc(t("setTagsPh", "Add custom tag (press Enter)"))}" autocomplete="off" maxlength="24">
      </div>
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
        const extra = /** @type {HTMLInputElement|null} */ (b.querySelector("#slTagsInput"))?.value || "";
        const finalTags = normalizeTags([...tags, ...extra.split(",")]);
        store.saveSetlist({
          id: existing?.id,
          title,
          description,
          tags: finalTags,
          items: items.map((it) => ({
            songId: it.songId,
            ...(it.key ? { key: it.key } : {}),
            ...(it.capo !== undefined ? { capo: it.capo } : {})
          }))
        });
        toast(t("setlistSaved", "Setlist saved"), "success");
        app.refresh();
      } }
    ]
  });
  const list = /** @type {HTMLElement} */ (body.querySelector("#slItems"));
  const poolEl = /** @type {HTMLElement} */ (body.querySelector("#slPool"));
  const tagChipsEl = /** @type {HTMLElement} */ (body.querySelector("#slTagChips"));
  const tagInput = /** @type {HTMLInputElement|null} */ (body.querySelector("#slTagsInput"));
  const toggleTag = (/** @type {string} */ raw) => {
    const clean = raw.trim();
    if (!clean) return;
    const idx = tags.findIndex((x) => x.toLowerCase() === clean.toLowerCase());
    if (idx >= 0) tags.splice(idx, 1);
    else tags = normalizeTags([...tags, clean]);
    if (tagChipsEl) tagChipsEl.innerHTML = tagChips();
  };
  const redraw = () => {
    list.innerHTML = chosen();
    poolEl.innerHTML = pool();
    /** @type {HTMLElement} */ (body.querySelector("#slCount")).textContent = t("songsInSetN", "Songs in this setlist ({n})", { n: items.length });
  };
  tagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      for (const part of tagInput.value.split(",")) {
        const clean = part.trim();
        if (clean && !tags.some((x) => x.toLowerCase() === clean.toLowerCase())) tags = normalizeTags([...tags, clean]);
      }
      tagInput.value = "";
      if (tagChipsEl) tagChipsEl.innerHTML = tagChips();
    }
  });
  list.addEventListener("change", (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.dataset.slotKey !== undefined) {
      const idx = Number(el.dataset.slotKey);
      if (!items[idx]) return;
      if (el.value === "auto") delete items[idx].key; else items[idx].key = el.value;
      el.classList.toggle("overridden", Boolean(items[idx].key));
    } else if (el.dataset.slotCapo !== undefined) {
      const idx = Number(el.dataset.slotCapo);
      if (!items[idx]) return;
      if (el.value === "") delete items[idx].capo; else items[idx].capo = Number(el.value) || 0;
      el.classList.toggle("overridden", items[idx].capo !== undefined);
    }
  });
  body.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const tagBtn = /** @type {HTMLElement|null} */ (el.closest("[data-set-tag]"));
    if (tagBtn) { toggleTag(tagBtn.dataset.setTag || ""); return; }
    const add = /** @type {HTMLElement|null} */ (el.closest("[data-add]"));
    if (add) { items.push({ songId: add.dataset.add || "" }); redraw(); return; }
    const row = el.closest("[data-slot-idx]");
    if (!row) return;
    const i = Number(row.getAttribute("data-slot-idx"));
    const mv = /** @type {HTMLElement|null} */ (el.closest("[data-move]"));
    if (mv) { const j = i + Number(mv.dataset.move); if (j >= 0 && j < items.length) { [items[i], items[j]] = [items[j], items[i]]; redraw(); } }
    if (el.closest("[data-drop]")) { items.splice(i, 1); redraw(); }
  });
  body.querySelector("#slSearch")?.addEventListener("input", (e) => { q = /** @type {HTMLInputElement} */ (e.target).value; poolEl.innerHTML = pool(); });
}

/**
 * Import a shared setlist after the user confirms.
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
    const set = store.saveSetlist({ title: data.t || "Setlist", description: data.d || "", links: Array.isArray(data.l) ? data.l : [], ...(Array.isArray(data.tg) ? { tags: data.tg } : {}), items: ids.map((/** @type {string} */ songId) => ({ songId })), ...(source ? { source } : {}) });
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
    /** @type {{ kind: "set"|"song", id: string, idx?: number, song: import("../core/store.js").Song, item: import("../core/store.js").SetlistItem | null }[]} */
    const entries = [];
    const seenInSet = new Set();
    if (cur) {
      const slots = store.setlistSlots(cur.set);
      slots.forEach(({ song, item }, idx) => {
        if (!match(song)) return;
        entries.push({ kind: "set", id: song.id, idx, song, item });
        seenInSet.add(song.id);
      });
    }
    const sorted = store.songs.slice().sort((a, b) => (Date.parse(b.lastOpenedAt || b.updatedAt) || 0) - (Date.parse(a.lastOpenedAt || a.updatedAt) || 0));
    for (const song of sorted) {
      if (cur && seenInSet.has(song.id)) continue;
      if (match(song)) entries.push({ kind: "song", id: song.id, song, item: null });
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
      const item = e.kind === "set" ? e.item : null;
      const on = e.kind === "set" ? (cur && e.idx === cur.index) : (!cur && s.id === store.activeId);
      const sel = i === cursor;
      const k = !s.body.trim() && s.manualKey === "auto" && !item?.key ? "–" : pretty(keyShort(soundingKey(s, item)));
      const capo = effectiveCapo(s, item);
      const sub = [s.artist, s.bpm ? `${s.bpm} BPM` : "", capo ? t("capoN", "Capo {n}", { n: capo }) : ""].filter(Boolean).join(" · ");
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
