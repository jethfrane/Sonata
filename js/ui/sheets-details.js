// @ts-check
// Song-level metadata sheets: Key & Capo controls (setlist-slot aware) and Song Details.
import { esc, icon, toast, openSheet } from "./dom.js";
import { t } from "./i18n.js";
import { store, detectedKey, soundingKey, shapeKey, writtenKey, effectiveCapo, effectiveTranspose, nudgeTranspose, signed, tick } from "./ctx.js";
import { keyShort, parseKey, pretty, transposeText, keyFromTonic, keyValue } from "../core/music.js";

const KEY_ROOTS_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_ROOTS_MINOR = ["C", "C#", "D", "D#", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/**
 * Options for a key <select>; "auto" shows the detected or base key.
 * @param {string} current
 * @param {import("../core/music.js").Key|null} detected
 * @param {string} [autoLabel]
 */
export function keyOptions(current, detected, autoLabel) {
  const auto = autoLabel ?? (detected ? t("autoKey", "Auto ({key})", { key: pretty(keyShort(detected)) }) : "Auto");
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

/**
 * Options for a capo <select>. When `defaultLabel` is supplied, prepends an empty-value option inheriting song capo.
 * @param {number|null|undefined} capo
 * @param {string} [defaultLabel]
 */
export function capoOptions(capo, defaultLabel) {
  let html = defaultLabel !== undefined
    ? `<option value=""${capo == null ? " selected" : ""}>${esc(defaultLabel)}</option>`
    : "";
  for (let i = 0; i <= 11; i++) {
    html += `<option value="${i}"${capo === i ? " selected" : ""}>${esc(i ? t("capoN", "Capo {n}", { n: i }) : t("noCapo", "No capo"))}</option>`;
  }
  return html;
}

/** Key, transpose, capo and spelling for the open song (edits the active setlist slot when playing a setlist). @param {"key"|"capo"} [focusPart] */
export function openKeySheet(focusPart = "key") {
  const s = store.active();
  if (!s) return;
  const seg = (/** @type {string} */ v, /** @type {string} */ label) => {
    const on = store.settings.enharmonicPref === v;
    return `<button type="button" data-spelling="${v}" class="${on ? "active" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  };
  const slotEntry = () => (!s.readonly ? store.activeSetlistEntry() : null);
  const render = () => {
    const entry = slotEntry();
    const item = entry ? entry.item : null;
    const k = soundingKey(s, item);
    const det = detectedKey(s);
    const tr = effectiveTranspose(s, item);
    const capo = effectiveCapo(s, item);
    const pref = /** @type {any} */ (store.settings.enharmonicPref);
    const songBaseKey = keyFromTonic(writtenKey(s).tonic + (s.transpose || 0), writtenKey(s).mode, pref);
    const keyOpts = entry
      ? keyOptions(item?.key || "auto", songBaseKey, t("slotKeyDefault", "Song: {key}", { key: pretty(keyShort(songBaseKey)) }))
      : keyOptions(s.manualKey, det);
    const capoOpts = entry
      ? capoOptions(item?.capo ?? null, s.capo ? t("slotCapoDefaultN", "Song: Capo {n}", { n: s.capo }) : t("slotCapoDefault", "Song capo"))
      : capoOptions(s.capo);
    const canReset = entry ? (item?.key !== undefined || item?.capo !== undefined) : Boolean(s.transpose || s.capo);
    return `<div class="key-sheet">
      ${entry ? `<p class="status-line synced" id="ksScope">${esc(t("setlistScopeNote", "For \"{set}\" only (base song unchanged)", { set: entry.set.title }))}</p>` : ""}
      <div class="big-key"><span class="mini-label">${esc(t("playsIn", "Band plays in"))}</span><strong>${esc(pretty(k.name))}</strong>
        <span class="muted">${capo ? esc(t("capoShapes", "Capo {n} · {key} shapes", { n: capo, key: pretty(keyShort(shapeKey(s, item))) })) : det ? esc(t("detectedAs", "Detected from chords: {key}", { key: pretty(det.name) })) : "&nbsp;"}</span></div>
      <div class="field-row">
        <div class="field"><span>${esc(t("transpose", "Transpose"))}</span>
          <div class="stepper"><button class="icon-btn" type="button" data-tr="-1" aria-label="${esc(t("transposeDown", "Down a half step"))}">${icon("minus")}</button>
          <output aria-live="polite">${esc(signed(tr))}</output>
          <button class="icon-btn" type="button" data-tr="1" aria-label="${esc(t("transposeUp", "Up a half step"))}">${icon("plus")}</button></div></div>
        <div class="field"><span>${esc(t("capo", "Capo"))}</span>
          <div class="stepper"><button class="icon-btn" type="button" data-capo="-1" aria-label="${esc(t("capoDown", "Capo down"))}"${capo <= 0 ? " disabled" : ""}>${icon("minus")}</button>
          <output aria-live="polite">${capo}</output>
          <button class="icon-btn" type="button" data-capo="1" aria-label="${esc(t("capoUp", "Capo up"))}"${capo >= 11 ? " disabled" : ""}>${icon("plus")}</button></div></div>
      </div>
      <div class="field-row">
        <label class="field"><span>${esc(entry ? t("setlistSlotKey", "Key in this setlist") : t("songKey", "Song key"))}</span><select class="select" id="ksKey"${s.readonly ? " disabled" : ""}>${keyOpts}</select></label>
        <label class="field"><span>${esc(t("capo", "Capo"))} (${esc(t("override", "override"))})</span><select class="select" id="ksCapo">${capoOpts}</select></label>
      </div>
      <div class="field"><span>${esc(t("spelling", "Sharps or flats"))}</span>
        <div class="segmented full" role="group">${seg("auto", t("spellAuto", "Auto"))}${seg("sharp", "♯")}${seg("flat", "♭")}</div></div>
      ${s.readonly ? "" : `<div class="btn-row">
        <button class="btn" type="button" id="ksReset"${canReset ? "" : " disabled"}>${esc(entry ? t("resetSlot", "Use song default") : t("reset", "Reset"))}</button>
        ${entry ? "" : `<button class="btn" type="button" id="ksWrite"${s.transpose ? "" : " disabled"}>${icon("edit")}${esc(t("applyTranspose", "Write into chart"))}</button>`}
      </div>
      <p class="card-hint">${esc(entry
        ? t("setlistScopeHint", "Changes here only affect this setlist. Use Song details to change the saved song.")
        : t("writeHint", "Write into chart rewrites the chords in the new key, so it stays that way everywhere."))}</p>`}
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
    const trBtn = /** @type {HTMLElement|null} */ (target.closest("[data-tr]"));
    const cpBtn = /** @type {HTMLElement|null} */ (target.closest("[data-capo]"));
    const spBtn = /** @type {HTMLElement|null} */ (target.closest("[data-spelling]"));
    const entry = slotEntry();
    if (trBtn) {
      tick();
      if (entry) {
        nudgeTranspose(s, Number(trBtn.dataset.tr));
        rerender();
      } else {
        let next = s.transpose + Number(trBtn.dataset.tr);
        if (next > 11) next -= 12;
        if (next < -11) next += 12;
        apply({ transpose: next });
      }
    } else if (cpBtn) {
      tick();
      const curCapo = effectiveCapo(s, entry ? entry.item : null);
      const nextCapo = Math.max(0, Math.min(11, curCapo + Number(cpBtn.dataset.capo)));
      if (entry) { store.updateSetlistItem(entry.set.id, entry.itemIndex, { capo: nextCapo }); rerender(); }
      else apply({ capo: nextCapo });
    } else if (spBtn) {
      store.settings.enharmonicPref = /** @type {any} */ (spBtn.dataset.spelling);
      store.changed("settings");
      rerender();
    } else if (target.closest("#ksReset")) {
      if (entry) { store.updateSetlistItem(entry.set.id, entry.itemIndex, { key: null, capo: null }); rerender(); }
      else apply({ transpose: 0, capo: 0 });
    } else if (!entry && target.closest("#ksWrite") && s.transpose) {
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
    const entry = slotEntry();
    if (el.id === "ksKey") {
      if (entry) {
        store.updateSetlistItem(entry.set.id, entry.itemIndex, { key: el.value === "auto" ? null : el.value });
        rerender();
      } else if (!s.readonly && el.value !== "auto" && s.transpose) {
        // When overriding a key while an active transpose offset exists, bake the visible transpose
        // so the chords on screen remain intact and the key label immediately matches the chosen key.
        const from = writtenKey(s);
        const pref = /** @type {any} */ (store.settings.enharmonicPref);
        store.update(s, { body: transposeText(s.body, s.transpose, from, pref), transpose: 0, manualKey: el.value });
        store.emit("song-open", s);
        rerender();
      } else {
        apply({ manualKey: el.value });
      }
    }
    if (el.id === "ksCapo") {
      if (entry) {
        store.updateSetlistItem(entry.set.id, entry.itemIndex, { capo: el.value === "" ? null : (Number(el.value) || 0) });
        rerender();
      } else {
        apply({ capo: Number(el.value) || 0 });
      }
    }
  });
}

/** @param {{ name: string, url: string }[]} links */
const linkRows = (links) => links.map((l, i) => `<div class="link-row" data-i="${i}">
  <input class="input" data-k="name" value="${esc(l.name)}" placeholder="${esc(t("linkName", "Name"))}" aria-label="${esc(t("linkName", "Name"))}">
  <input class="input" data-k="url" value="${esc(l.url)}" placeholder="https://" inputmode="url" aria-label="URL">
  <button class="icon-btn" type="button" data-remove="${i}" aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></div>`).join("");

/** Song details: title, artist, arranger, key, capo, tempo, genre, mood, notes, links. */
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
