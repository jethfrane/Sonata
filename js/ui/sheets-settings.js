// @ts-check
// App preferences, offline sound caching, install prompt helper, and About sheet.
import { esc, icon, toast, openSheet, closeSheet } from "./dom.js";
import { t, setLang, applyI18n } from "./i18n.js";
import { store, app } from "./ctx.js";
import { sampleUrls } from "../audio.js";
import { normalizeSettings, DEFAULT_SETTINGS } from "../core/store.js";
import { openBackup } from "./sheets-lazy.js";

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
      <div class="settings-actions">
        <button class="btn wide" type="button" id="openBackupBtn">${icon("gdrive")}${esc(t("backupTitle", "Backup & restore"))}</button>
        <button class="btn wide" type="button" id="openAiMcpBtn">${icon("sparkles")}${esc(t("aiMcpTitle", "AI Agents & MCP"))}</button>
        <div id="soundsRow"><button class="btn wide" type="button" id="soundsBtn">${icon("download")}${esc(t("soundsKeep", "Keep instrument sounds on this device (3.8 MB)"))}</button></div>
        ${standalone ? "" : `<button class="btn wide" type="button" id="installBtn">${icon("download")}${esc(t("install", "Install Sonata"))}</button>`}
      </div>
      <div class="settings-foot">
        <button class="btn ghost" type="button" id="openHelpBtn">${icon("help")}${esc(t("help", "Help"))}</button>
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
    if (id === "openHelpBtn") { closeSheet(); document.getElementById("helpBtn")?.click(); }
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
      <p class="muted">Chord charts, setlists and music tools for gigs, practice, lessons and worship teams.</p></div></div>
      <ul class="about-points">
        <li>Free, no account needed. Songs are saved on your device.</li>
        <li>Works offline after the first visit. Install it for the stage.</li>
        <li>Optional Google Drive backup uses one file only Sonata can see. Earlier versions of your library are kept on your device.</li>
        <li>A Song Bank is shared only when you publish it: one file in your own Drive that anyone with its link can read. Sonata stores no copy.</li>
        <li>No ads. Anonymous page-view counts only (Vercel Web Analytics, no cookies).</li>
      </ul>
      <p class="about-links"><a href="/privacy" target="_blank" rel="noopener">${esc(t("privacyTerms", "Privacy & terms"))}</a></p>
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
