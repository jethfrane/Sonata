// @ts-check
// Song/setlist import sheet: Sonata share links, chord URL scraping, blocked-site Paste & Auto-Format fallback, and file import.
import { esc, icon, toast, openSheet } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, adoptShared } from "./ctx.js";
import { parseKey, pretty, detectKey } from "../core/music.js";
import { analyzeRawChart, stripLyricsToChordsOnly, autoFormatChart, friendlyLinkName } from "../core/chart.js";
import { loneLink } from "../core/import.js";
import { unpackSong, parseLinks, safeHref } from "../core/share.js";
import { keyOptions, capoOptions } from "./sheets-details.js";

/**
 * Add songs from pasted Sonata links, chord-site URLs, raw chord text, or ChordPro/TXT files.
 * @param {string} [text]
 */
export function openLinksImport(text = "") {
  /** @type {Awaited<ReturnType<typeof parseLinks>>} */
  let found = { title: "", songs: [], sets: [] };
  /** @type {ReturnType<typeof analyzeRawChart>} */
  let analyzed = null;
  /** What happened to a pasted web link: "" (none), "reading", or why it could not be read. */
  let web = "";
  let blockedUrl = "";
  let pendingSourceUrl = "";
  let pendingAutoFormat = false;
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
      const canFallback = web === "blocked" || web === "no-chords" || web === "offline";
      const safe = blockedUrl ? safeHref(blockedUrl) : "";
      return `<p class="status-line${web === "reading" ? "" : " error"}" role="status">${esc(t(key, en))}</p>` + (canFallback
        ? `<div class="import-fallback">
            <button class="btn primary small" type="button" id="lkPasteFormatBtn">${icon("sparkles")}${esc(t("pasteAutoFormat", "Paste chart text → Auto-Format"))}</button>
            ${safe ? `<a class="btn small ghost" href="${esc(safe)}" target="_blank" rel="noopener noreferrer" id="lkOpenSourceLink">${esc(t("openSourcePage", "Open page ↗"))}</a>` : ""}
          </div>
          <p class="card-hint">${esc(t("blockedFallbackHint", "Copy the chords & lyrics from that page, then tap Paste chart text → Auto-Format to clean sections and align chords automatically."))}</p>`
        : "");
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
        <div class="import-fallback">
          <p class="import-title" style="flex:1;min-width:0;margin:0"><strong>${esc(analyzed.title)}</strong>${analyzed.artist ? ` <span class="muted">· ${esc(analyzed.artist)}</span>` : ""}</p>
          <button class="btn small ghost" type="button" id="lkFormatBtn">${icon("sparkles")}${esc(t("autoFormat", "Auto-Format"))}</button>
        </div>
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
  const foundEl = /** @type {HTMLElement} */ (body.querySelector("#lkFound"));
  const paint = () => { foundEl.innerHTML = summary(); };
  let timer = /** @type {any} */ (0);
  let turn = 0;
  const formatArea = () => {
    const raw = area.value.trim();
    if (!raw || loneLink(raw)) return false;
    const fmt = autoFormatChart(raw);
    if (!fmt.body.trim()) return false;
    const meta = [
      fmt.title && fmt.title !== "Untitled" ? `Title: ${fmt.title}` : "",
      fmt.artist ? `Artist: ${fmt.artist}` : "",
      fmt.manualKey && fmt.manualKey !== "auto" ? `Key: ${pretty(keyFromFmt(fmt.manualKey))}` : ""
    ].filter(Boolean);
    area.value = meta.length ? `${meta.join("\n")}\n\n${fmt.body}` : fmt.body;
    return true;
  };
  /** @param {string} manualKey */
  const keyFromFmt = (manualKey) => {
    const [r, m] = manualKey.split(":");
    return r ? `${r}${m === "minor" ? "m" : ""}` : manualKey;
  };
  const read = async () => {
    const mine = ++turn;
    let value = area.value;
    found = await parseLinks(value);
    if (mine !== turn) return;
    const n = found.songs.length + found.sets.reduce((a, s) => a + s.s.length, 0);
    const link = n ? "" : loneLink(value);
    if (pendingAutoFormat && !n && !link && value.includes("\n")) {
      pendingAutoFormat = false;
      formatArea();
      value = area.value;
    }
    web = "";
    analyzed = n || link ? null : analyzeRawChart(value);
    if (analyzed && pendingSourceUrl && !analyzed.links.some((l) => l.url === pendingSourceUrl)) {
      analyzed.links.unshift({ name: friendlyLinkName(pendingSourceUrl), url: pendingSourceUrl });
    }
    if (!link) { paint(); return; }
    // One web link on its own: read the page and build the chart from it.
    if (!navigator.onLine) { blockedUrl = link; web = "offline"; paint(); return; }
    blockedUrl = link;
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
    if (analyzed) blockedUrl = "";
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
  foundEl.addEventListener("click", async (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (el.closest("#lkPasteFormatBtn")) {
      if (blockedUrl) pendingSourceUrl = blockedUrl;
      let clip = "";
      try { clip = (await navigator.clipboard?.readText?.()) || ""; } catch { /* clipboard permission unavailable */ }
      if (clip.trim() && !loneLink(clip.trim())) {
        area.value = clip;
        pendingAutoFormat = false;
        formatArea();
        await read();
        toast(t("pastedAutoFormatted", "Pasted & auto-formatted. Review the preview, then tap Add."), "success");
      } else {
        if (loneLink(area.value)) area.value = "";
        pendingAutoFormat = true;
        area.placeholder = t("pasteFallbackPh", "Paste the copied chords & lyrics here…");
        area.focus();
        toast(t("pasteHereNow", "Now paste the copied chords here — Sonata will auto-format them."), "info");
      }
    } else if (el.closest("#lkFormatBtn")) {
      if (formatArea()) {
        pendingAutoFormat = false;
        await read();
        toast(t("autoFormatted", "Chart cleaned and aligned."), "success");
      }
    }
  });
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
