// @ts-check
// Song Bank. Owner side: a Sonata Card (photo, name, links), their look (colors, font, cover),
// songs and genres, upcoming gigs and ways to be supported, then publish one file to their own
// Google Drive. Visitor side (/bank/<id>/<name>): a view-only page with the card, gigs, support
// codes, search and a chart in any key. There are no requests: people ask at the gig or in the
// live chat. No Sonata server stores anything, and Sonata never handles money: payment codes
// are shown exactly as the owner uploaded them.
import { $, esc, icon, openSheet, closeSheet, paintIcons, toast, copyText, download } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, tick } from "./ctx.js";
import { keyShort, pretty, parseKey, keyFromTonic, detectKey, mod12 } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import {
  normalizeProfile, buildBankFile, parseBankFile, genres, searchBank, validBankId, THEMES, FONTS, upcomingGigs, paymentPayee,
  SOCIAL_KINDS, PAYMENT_LABELS, guessPaymentLabel, isPaymentQr, bankSlug
} from "../core/bank.js";
import { loadQr } from "./sheets-lazy.js";
import { cardHtml, cardPng, photoData, coverData, readQrImage, paymentImage, linkIcon, themeVars } from "./bankcard.js";

/** Link to a Song Bank, with the owner's name at the end so it reads well (the id is what counts). */
export const bankUrl = (/** @type {string} */ id, /** @type {string} */ name = store.bank.name || store.bank.title) => `${location.origin}/bank/${id}${bankSlug(name) ? "/" + bankSlug(name) : ""}`;
/** @param {any} s */
const keyOf = (s) => pretty(keyShort(soundingKey(s)));
const isDark = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b5bdb";

// ---------- Owner side ----------

/** Songs marked for the bank. */
export const bankSongs = () => store.songs.filter((s) => s.inBank);

/** Publish (or update) the public file in the owner's Drive. @returns {Promise<boolean>} */
export async function publishBank() {
  const d = app.drive;
  if (!d || !d.token) { toast(t("bankNeedsDrive", "Sign in with Google first. Your Song Bank is shared from your own Drive."), "info", { ms: 6000, action: t("signIn", "Sign in"), onAction: () => d?.signIn() }); return false; }
  if (!bankSongs().length) { toast(t("bankEmpty", "Add at least one song to your Song Bank first."), "error"); return false; }
  const file = buildBankFile(store.bank, store.songs, keyOf);
  const r = await d.publishBank(file, store.bank.fileId);
  if (!r.ok) {
    toast(r.reason === "signin" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : r.reason === "offline" ? t("offlineNote", "You're offline. Songs still save on this device.") : t("bankPublishFailed", "Couldn't publish your Song Bank. Try again."), "error", { ms: 6000 });
    return false;
  }
  store.bank = { ...store.bank, fileId: r.id, publishedAt: store.bank.publishedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.bankDirty = false;
  store.changed("settings");
  return true;
}

/** After edits, keep a published bank current (quietly, a little later). */
let republishTimer = /** @type {any} */ (0);
function markDirty() {
  if (!store.bank.fileId || !app.drive?.token) return;
  store.bankDirty = true;
  clearTimeout(republishTimer);
  republishTimer = setTimeout(() => { if (store.bankDirty) publishBank(); }, 15000);
}
export function watchBank() { store.on("library-change", markDirty); }

const SOCIAL_UI = {
  instagram: ["Instagram", "username"], tiktok: ["TikTok", "username"], facebook: ["Facebook", "username or page"],
  youtube: ["YouTube", "@channel"], spotify: ["Spotify", "https://open.spotify.com/artist/…"], x: ["X", "username"],
  threads: ["Threads", "username"], website: ["Website", "yoursite.com"], email: ["Email", "you@example.com"]
};

/** "NAME · City" written inside a payment code. @param {string} qr */
const payeeText = (qr) => { const p = paymentPayee(qr); return p ? [p.name, p.city].filter(Boolean).join(" · ") : ""; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const THEME_NAMES = /** @type {Record<string, string>} */ ({ auto: "Match app", paper: "Paper", night: "Night", stage: "Stage", sunrise: "Sunrise", ocean: "Ocean", garden: "Garden", rose: "Rose" });
const FONT_NAMES = /** @type {Record<string, string>} */ ({ modern: "Modern", classic: "Classic serif", rounded: "Rounded" });

/** Song Bank editor: the Sonata Card live on top, then profile, links, support, songs, sharing. */
export function openBankManager() {
  const all = store.songs.filter((s) => !s.readonly).slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
  let filter = "";
  const card = () => {
    const p = store.bank;
    return cardHtml({ ...p, songs: bankSongs().map((s) => ({ g: s.genre })) }, { count: bankSongs().length, live: Boolean(p.fileId) });
  };
  const cardWrapStyle = () => themeVars(store.bank.theme, isDark()).style;
  const gigRows = () => store.bank.gigs.map((g, i) => `<div class="gig-edit" data-gig="${i}">
      <div class="field-row"><label class="field"><span>${esc(t("gigDate", "Date"))}</span><input class="input" type="date" data-gk="date" value="${esc(g.date)}" min="${today()}"></label>
        <label class="field"><span>${esc(t("gigTime", "Time (optional)"))}</span><input class="input" type="time" data-gk="time" value="${esc(g.time)}"></label></div>
      <label class="field"><span>${esc(t("gigPlace", "Where"))}</span><input class="input" data-gk="place" value="${esc(g.place)}" maxlength="80" placeholder="${esc(t("gigPlacePh", "Cafe, church, town plaza…"))}"></label>
      <label class="field"><span>${esc(t("gigNote", "Note (optional)"))}</span><input class="input" data-gk="note" value="${esc(g.note)}" maxlength="120" placeholder="${esc(t("gigNotePh", "Acoustic set, free entry…"))}"></label>
      <label class="field"><span>${esc(t("gigLink", "Link (optional)"))}</span><input class="input" type="url" data-gk="url" value="${esc(g.url)}" maxlength="300" placeholder="https://" inputmode="url" autocapitalize="off"></label>
      <button class="btn small ghost danger-text" type="button" data-gdel="${i}">${icon("trash")}${esc(t("remove", "Remove"))}</button></div>`).join("");
  const songRows = () => {
    const f = filter.trim().toLowerCase();
    return all.filter((s) => !f || `${s.title} ${s.artist} ${s.genre}`.toLowerCase().includes(f)).map((s) => `<li><label class="bp-check"><input type="checkbox" data-in="${esc(s.id)}"${s.inBank ? " checked" : ""}><span><b>${esc(s.title)}</b><small>${esc(s.artist || "")}</small></span></label>
      <input class="input bp-genre" data-genre="${esc(s.id)}" value="${esc(s.genre)}" list="genreList" placeholder="${esc(t("genre", "Genre"))}" aria-label="${esc(t("genreFor", "Genre for {t}", { t: s.title }))}"></li>`).join("") || `<li class="muted">${esc(all.length ? t("noMatches", "No matches for \"{q}\"", { q: filter }) : t("noSongsYet", "No songs yet."))}</li>`;
  };
  const payRows = () => store.bank.payments.map((pm, i) => `<div class="pay-edit" data-pay="${i}">
      <div class="pay-qr">${pm.qr ? `<div class="pay-qr-svg" data-qr="${esc(pm.qr)}"></div>` : `<img src="${esc(pm.img)}" alt="">`}</div>
      <div class="pay-fields">
        <label class="field"><span>${esc(t("payWallet", "Wallet or bank"))}</span><select class="select" data-pl="${i}">${PAYMENT_LABELS.map((l) => `<option${l === pm.label ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("payName", "Account name (optional)"))}</span><input class="input" data-pn="${i}" value="${esc(pm.name)}" maxlength="60" placeholder="J. F."></label>
        <button class="btn small ghost danger-text" type="button" data-pdel="${i}">${icon("trash")}${esc(t("remove", "Remove"))}</button>
        ${pm.qr && paymentPayee(pm.qr) ? `<p class="card-hint pay-payee">${esc(t("payPays", "Pays: {name}", { name: payeeText(pm.qr) }))}</p>` : ""}
        ${pm.qr ? "" : `<p class="card-hint">${esc(t("payKeptImage", "Couldn't read this code, so the picture is shown as you uploaded it."))}</p>`}
      </div></div>`).join("");
  const draw = () => {
    const p = store.bank;
    const n = bankSongs().length;
    const link = p.fileId ? bankUrl(p.fileId) : "";
    const gl = genres(all.map((s) => ({ g: s.genre })));
    return `<div class="bank-editor">
      <div class="be-preview">
        <div id="beCard" class="be-themed" style="${esc(cardWrapStyle())}">${card()}</div>
        <div class="be-share">
          ${link ? `<p class="status-line synced">${esc(t("bankLive", "Live: anyone with the link or QR can see {n} songs.", { n }))}</p>
            <div class="share-link"><input class="input" id="bankLink" readonly value="${esc(link)}" aria-label="Link"></div>
            <div class="share-actions"><button class="btn primary" type="button" id="bankCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button>
            ${"share" in navigator ? `<button class="btn" type="button" id="bankShareNative">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
            <button class="btn" type="button" id="bankCardPng">${icon("image")}${esc(t("cardDownload", "Card image"))}</button>
            <button class="btn" type="button" id="bankOpen">${icon("present")}${esc(t("bankView", "View page"))}</button>
            <button class="btn" type="button" id="bankPublish">${icon("refresh")}${esc(t("bankUpdate", "Update now"))}</button></div>`
          : `<p class="card-text">${esc(t("bankIntro", "Share the songs you know or offer. Anyone can scan your QR, browse your songs, read a chart in their key and support you. It is view-only: people ask for songs at your gig or in your live chat. Your Song Bank is one file in your own Google Drive; Sonata keeps no copy."))}</p>
            <button class="btn primary wide" type="button" id="bankPublish">${icon("share")}${esc(t("bankPublishBtn", "Publish my Song Bank ({n})", { n }))}</button>`}
        </div>
      </div>
      <div class="be-form form">
        <h3 class="group-title">${esc(t("bankProfile", "Your card"))}</h3>
        <div class="be-photo"><div class="sc-photo">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : icon("music")}</div>
          <label class="btn small">${icon("upload")}${esc(p.photo ? t("changePhoto", "Change photo") : t("addPhoto", "Add photo"))}<input type="file" id="bePhoto" accept="image/*" hidden></label>
          ${p.photo ? `<button class="btn small ghost" type="button" id="bePhotoDel">${esc(t("remove", "Remove"))}</button>` : ""}</div>
        <div class="field-row">
          <label class="field"><span>${esc(t("bankName", "Name, band or team"))}</span><input class="input" data-p="name" value="${esc(p.name)}" maxlength="80" placeholder="${esc(t("bankNamePh", "Your name"))}" autocomplete="name"></label>
          <label class="field"><span>${esc(t("bankTitle", "Title"))}</span><input class="input" data-p="title" value="${esc(p.title)}" maxlength="80" placeholder="${esc(t("bankTitlePh", "Songs I can play"))}"></label>
        </div>
        <label class="field"><span>${esc(t("bankBio", "Short note"))}</span><textarea class="input" data-p="bio" rows="2" maxlength="400" placeholder="${esc(t("bankBioPh", "OPM, pop and worship. Catch me live every Friday!"))}">${esc(p.bio)}</textarea></label>

        <h3 class="group-title">${esc(t("bankLinks", "Social links"))}</h3>
        <p class="card-hint">${esc(t("bankLinksHint", "Shown on your card so people can follow you. Only https links are kept."))}</p>
        <div class="be-socials">${SOCIAL_KINDS.map((k) => `<label class="be-social"><span class="be-ico" title="${esc(SOCIAL_UI[k][0])}">${linkIcon(k)}</span><span class="sr-only">${esc(SOCIAL_UI[k][0])}</span>
          <input class="input" data-s="${k}" value="${esc(p.socials[k])}" placeholder="${esc(SOCIAL_UI[k][0])}: ${esc(SOCIAL_UI[k][1])}" ${k === "email" ? 'type="email" inputmode="email"' : 'autocapitalize="off" spellcheck="false"'} autocomplete="off"></label>`).join("")}</div>

        <h3 class="group-title">${esc(t("bankSupport", "Support (QR Ph)"))}</h3>
        <p class="card-hint">${esc(t("bankSupportHint", "Add a GCash, Maya or bank QR code from a screenshot. People pay you directly; Sonata never handles money."))}</p>
        <div id="bePays">${payRows()}</div>
        ${p.payments.length < 4 ? `<label class="btn small">${icon("qr")}${esc(t("addPayQr", "Add payment QR"))}<input type="file" id="bePay" accept="image/*" hidden></label>` : ""}

        <h3 class="group-title">${esc(t("bankStyle", "Style"))}</h3>
        <p class="card-hint">${esc(t("bankStyleHint", "Make your page and card match your brand. Sonata keeps colors readable."))}</p>
        <div class="theme-grid" role="group" aria-label="${esc(t("bankLook", "Look"))}">${Object.entries(THEMES).map(([id, th]) => `<button type="button" class="theme-sw" data-preset="${id}" aria-pressed="${p.theme.preset === id}"><span class="theme-chip" style="${th.bg ? `background:${th.bg};color:${th.text};border-color:${th.text}33` : ""}"><i style="${th.bg ? `background:${th.surface}` : ""}"></i><b>Aa</b></span><span>${esc(t("theme_" + id, THEME_NAMES[id]))}</span></button>`).join("")}</div>
        <div class="field-row be-look">
          <label class="field"><span>${esc(t("bankAccent", "Accent color"))}</span><span class="accent-row"><input class="color-input" type="color" id="beAccent" value="${esc(p.theme.accent || "#3b5bdb")}" aria-label="${esc(t("bankAccent", "Accent color"))}">${p.theme.accent ? `<button class="btn small ghost" type="button" id="beAccentReset">${esc(t("reset", "Reset"))}</button>` : `<small class="muted">${esc(t("accentDefault", "Default"))}</small>`}</span></label>
          <label class="field"><span>${esc(t("bankFont", "Font"))}</span><select class="select" id="beFont">${FONTS.map((f) => `<option value="${f}"${p.theme.font === f ? " selected" : ""}>${esc(t("font_" + f, FONT_NAMES[f]))}</option>`).join("")}</select></label>
        </div>
        <div class="be-photo"><label class="btn small">${icon("image")}${esc(p.theme.cover ? t("changeCover", "Change cover") : t("addCover", "Add cover picture"))}<input type="file" id="beCover" accept="image/*" hidden></label>
          ${p.theme.cover ? `<button class="btn small ghost" type="button" id="beCoverDel">${esc(t("remove", "Remove"))}</button>` : ""}</div>

        <h3 class="group-title">${esc(t("bankGigs", "Upcoming gigs"))} <span class="muted">${p.gigs.length}/6</span></h3>
        <p class="card-hint">${esc(t("bankGigsHint", "Shown on your page until the day passes."))}</p>
        <div id="beGigs">${gigRows()}</div>
        ${p.gigs.length < 6 ? `<button class="btn small" type="button" id="beGigAdd">${icon("plus")}${esc(t("addGig", "Add a gig"))}</button>` : ""}

        <label class="switch-row"><span>${esc(t("bankCharts", "Let people see my charts"))}</span><input type="checkbox" class="toggle" data-p="charts"${p.charts ? " checked" : ""}></label>

        <h3 class="group-title">${esc(t("bankSongsTitle", "Songs"))} <span class="muted" id="bankCount">${n}/${all.length}</span></h3>
        <div class="be-songtools"><label class="search"><span data-icon="search"></span><input type="search" id="beFilter" value="${esc(filter)}" placeholder="${esc(t("search", "Search"))}" aria-label="${esc(t("search", "Search"))}" autocomplete="off"></label>
          <button class="btn small" type="button" id="bankAll">${esc(t("selectAll", "Select all"))}</button><button class="btn small" type="button" id="bankNone">${esc(t("selectNone", "Clear"))}</button></div>
        <datalist id="genreList">${["OPM", "Worship", "Pop", "Rock", "Ballad", "R&B", "Country", "Jazz", "Reggae", "Christmas", "Kids", ...gl].filter((g, i, a) => a.indexOf(g) === i).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
        <ul class="bank-pick" id="bePick">${songRows()}</ul>
        ${p.fileId ? `<button class="btn ghost danger-text" type="button" id="bankUnpublish">${esc(t("bankStop", "Stop sharing"))}</button>` : ""}
      </div>
    </div>`;
  };
  const body = openSheet({ title: t("songBank", "Song Bank"), wide: true, className: "bank-sheet", body: draw(), focus: false });
  const paintPays = async () => {
    const m = await loadQr();
    body.querySelectorAll("[data-qr]").forEach((el) => { el.innerHTML = m?.qrSvg(/** @type {HTMLElement} */ (el).dataset.qr || "", { ecc: "M", margin: 2 }) || ""; });
  };
  const redraw = () => { const y = body.scrollTop; body.innerHTML = draw(); paintIcons(body); paintPays(); body.scrollTop = y; };
  const refreshCard = () => { const c = /** @type {HTMLElement|null} */ (body.querySelector("#beCard")); if (c) { c.innerHTML = card(); c.setAttribute("style", cardWrapStyle()); } };
  /** Tidy the profile but keep half-typed gigs (they are checked when published). */
  const tidy = () => { const gigs = store.bank.gigs; store.bank = { ...normalizeProfile(store.bank), gigs }; };
  const setTheme = (/** @type {any} */ patch) => { store.bank = { ...store.bank, theme: { ...store.bank.theme, ...patch } }; store.changed("settings"); markDirty(); };
  const setGigs = (/** @type {any[]} */ rows) => { store.bank = { ...store.bank, gigs: rows.slice(0, 6) }; store.changed("settings"); markDirty(); };
  paintIcons(body); paintPays();
  const save = () => { tidy(); store.changed("settings"); markDirty(); refreshCard(); };
  body.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.p && el.type !== "checkbox") { /** @type {any} */ (store.bank)[el.dataset.p] = el.value; save(); }
    if (el.dataset.s) { store.bank.socials = { ...store.bank.socials, [el.dataset.s]: el.value }; store.bank = { ...store.bank, ...{ socials: { ...store.bank.socials } } }; store.changed("settings"); markDirty(); refreshCardSoon(); }
    if (el.id === "beAccent") { setTheme({ accent: el.value }); refreshCard(); }
    if (el.dataset.gk) { const i = Number(el.closest("[data-gig]")?.getAttribute("data-gig")); const rows = store.bank.gigs.map((g) => ({ ...g })); if (rows[i]) { /** @type {any} */ (rows[i])[el.dataset.gk] = el.value; setGigs(rows); } }
    if (el.dataset.pn !== undefined) { const pm = store.bank.payments[Number(el.dataset.pn)]; if (pm) { pm.name = el.value.slice(0, 60); store.changed("settings"); markDirty(); } }
    if (el.dataset.genre) { const s = store.song(el.dataset.genre); if (s) { store.update(s, { genre: el.value.slice(0, 40) }); refreshCard(); } }
    if (el.id === "beFilter") { filter = el.value; /** @type {HTMLElement} */ (body.querySelector("#bePick")).innerHTML = songRows(); }
  });
  // Social handles are tidied (links → names) once typing pauses, so the field doesn't jump while typing.
  let socialTimer = /** @type {any} */ (0);
  const refreshCardSoon = () => { clearTimeout(socialTimer); socialTimer = setTimeout(() => { tidy(); store.changed("settings"); refreshCard(); }, 500); };
  body.addEventListener("change", async (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.s) { tidy(); el.value = /** @type {any} */ (store.bank.socials)[el.dataset.s]; save(); }
    if (el.id === "beFont") { setTheme({ font: el.value }); refreshCard(); }
    if (el.dataset.p === "charts") { store.bank = { ...store.bank, charts: el.checked }; store.changed("settings"); markDirty(); }
    if (el.dataset.in) { const s = store.song(el.dataset.in); if (s) store.update(s, { inBank: el.checked }); $("bankCount").textContent = `${bankSongs().length}/${all.length}`; refreshCard(); }
    if (el.dataset.pl !== undefined) { const pm = store.bank.payments[Number(el.dataset.pl)]; if (pm) { pm.label = el.value; store.changed("settings"); markDirty(); } }
    const file = el.files?.[0];
    if (el.id === "bePhoto" && file) {
      try { store.bank = { ...store.bank, photo: await photoData(file) }; save(); redraw(); }
      catch { toast(t("photoFailed", "Couldn't use that picture. Try a JPG or PNG."), "error"); }
    }
    if (el.id === "beCover" && file) {
      try { setTheme({ cover: await coverData(file) }); refreshCard(); redraw(); }
      catch { toast(t("photoFailed", "Couldn't use that picture. Try a JPG or PNG."), "error"); }
    }
    if (el.id === "bePay" && file) {
      try {
        const qr = await readQrImage(file);
        if (qr && !isPaymentQr(qr)) toast(t("payNotQrPh", "That code isn't a QR Ph payment code, but it was added as it is."), "info", { ms: 5000 });
        const pay = qr ? { label: guessPaymentLabel(qr), name: "", qr, img: "" } : { label: "Other", name: "", qr: "", img: await paymentImage(file) };
        if (!pay.qr && !pay.img) throw new Error("empty");
        store.bank = normalizeProfile({ ...store.bank, payments: [...store.bank.payments, pay] });
        save(); redraw();
        toast(qr ? (paymentPayee(qr) ? t("payReadName", "Payment code read: it pays {name}. Check that this is you.", { name: payeeText(qr) }) : t("payRead", "Payment code read. Check the wallet name.")) : t("payImage", "Code added as a picture."), "success", { ms: 6000 });
      } catch { toast(t("payFailed", "Couldn't use that picture. Try a clear screenshot of the QR code."), "error"); }
    }
  });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.id === "bankAll" || b.id === "bankNone") { const on = b.id === "bankAll"; for (const s of all) if (s.inBank !== on) store.update(s, { inBank: on }); redraw(); }
    if (b.dataset.preset) { setTheme({ preset: b.dataset.preset }); refreshCard(); redraw(); }
    if (b.id === "beAccentReset") { setTheme({ accent: "" }); refreshCard(); redraw(); }
    if (b.id === "beCoverDel") { setTheme({ cover: "" }); refreshCard(); redraw(); }
    if (b.id === "beGigAdd") { setGigs([...store.bank.gigs, { date: "", time: "", place: "", note: "", url: "" }]); redraw(); }
    if (b.dataset.gdel !== undefined) { setGigs(store.bank.gigs.filter((_, j) => j !== Number(b.dataset.gdel))); redraw(); }
    if (b.id === "bePhotoDel") { store.bank = { ...store.bank, photo: "" }; save(); redraw(); }
    if (b.dataset.pdel !== undefined) { const i = Number(b.dataset.pdel); store.bank = normalizeProfile({ ...store.bank, payments: store.bank.payments.filter((_, j) => j !== i) }); save(); redraw(); }
    if (b.id === "bankPublish") { b.setAttribute("aria-busy", "true"); if (await publishBank()) { toast(t("bankPublished", "Your Song Bank is live"), "success"); redraw(); } else b.removeAttribute("aria-busy"); }
    if (b.id === "bankCopy") { if (await copyText(bankUrl(store.bank.fileId))) toast(t("linkCopied", "Link copied"), "success"); }
    if (b.id === "bankOpen") { closeSheet(); app.show("bank", { sub: store.bank.fileId }); }
    if (b.id === "bankShareNative") { try { await navigator.share({ title: store.bank.title || t("songBank", "Song Bank"), text: t("bankShareText", "See the songs I play:"), url: bankUrl(store.bank.fileId) }); } catch { /* cancelled */ } }
    if (b.id === "bankCardPng") { b.setAttribute("aria-busy", "true"); try { await downloadCard(); } catch { toast(t("exportFailed", "Couldn't make that file. Please try again."), "error"); } finally { b.removeAttribute("aria-busy"); } }
    if (b.id === "bankUnpublish") {
      if (await app.drive?.unpublishBank(store.bank.fileId)) { store.bank = { ...store.bank, fileId: "", publishedAt: "" }; store.changed("settings"); toast(t("bankStopped", "Your Song Bank is private again."), "info"); redraw(); }
      else toast(t("bankStopFailed", "Couldn't stop sharing. Check your connection and sign-in."), "error");
    }
  });
}

/** The Sonata Card as an image, with a QR code to the Song Bank. */
async function downloadCard() {
  const m = await loadQr();
  if (!m) return;
  const url = bankUrl(store.bank.fileId);
  const qr = m.qrModules(url, ["M", "L"]);
  if (!qr) return;
  const blob = await cardPng({ ...store.bank, songs: bankSongs().map((s) => ({ g: s.genre })) }, { count: bankSongs().length, url, qr, accent: accent() });
  download(`sonata-card-${bankSlug(store.bank.name || "song-bank") || "song-bank"}.png`, blob);
}

// ---------- Visitor side ----------

/** @type {{ id: string, data: import("../core/bank.js").BankFile|null, q: string, genre: string, error: string }} */
const view = { id: "", data: null, q: "", genre: "", error: "" };
const CACHE = (/** @type {string} */ id) => `sonata_bank_${id}`;

/** Open a Song Bank. @param {string} id */
export async function openBank(id) {
  if (view.id === id && view.data) { renderBank(); return; }
  Object.assign(view, { id, data: null, q: "", genre: "", error: "" });
  if (!validBankId(id)) { view.error = t("bankBadLink", "This Song Bank link is incomplete."); renderBank(); return; }
  try { const c = localStorage.getItem(CACHE(id)); if (c) view.data = parseBankFile(JSON.parse(c)); } catch { /* ignore */ }
  renderBank(true);
  try {
    const r = await fetch(`/api/bank?id=${encodeURIComponent(id)}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    const data = parseBankFile(await r.json());
    if (!data) throw new Error("bad");
    view.data = data;
    try { localStorage.setItem(CACHE(id), JSON.stringify(data)); } catch { /* full */ }
  } catch {
    if (!view.data) view.error = navigator.onLine ? t("bankLoadFailed", "This Song Bank isn't available. Its owner may have stopped sharing it.") : t("bankOffline", "You're offline, and this Song Bank hasn't been opened on this device before.");
  }
  if (view.id === id) {
    renderBank();
    // Show the owner's name at the end of the address (readable when copied).
    const slug = bankSlug(view.data?.name || view.data?.title || "");
    if (view.data && slug && location.pathname.startsWith(`/bank/${id}`) && location.pathname !== `/bank/${id}/${slug}`) { try { history.replaceState(history.state, "", `/bank/${id}/${slug}`); } catch { /* sandboxed */ } }
  }
}

/** Put the owner's look on the public page (colors, font) without touching the rest of the app. @param {import("../core/bank.js").Theme|undefined} theme */
function applyLook(theme) {
  const root = $("view-bank");
  const v = themeVars(theme, isDark());
  if (v.style) root.setAttribute("style", v.style); else root.removeAttribute("style");
  root.classList.toggle("bank-themed", v.themed);
}

/** @param {import("../core/bank.js").Gig[]} gigs */
function gigsHtml(gigs) {
  const day = (/** @type {import("../core/bank.js").Gig} */ g) => { const [y, m, d] = g.date.split("-").map(Number); return new Date(y, m - 1, d); };
  return `<section class="card bank-gigs" aria-labelledby="gigsTitle"><h2 id="gigsTitle">${icon("calendar")}${esc(t("gigsTitle", "Upcoming gigs"))}</h2>
    <ul class="gig-list">${gigs.map((g) => {
      const d = day(g);
      const when = [d.toLocaleDateString(undefined, { weekday: "long" }), g.time ? new Date(2000, 0, 1, Number(g.time.slice(0, 2)), Number(g.time.slice(3))).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""].filter(Boolean).join(" · ");
      return `<li class="gig"><div class="gig-date" aria-hidden="true"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(undefined, { month: "short" }))}</small></div>
        <div class="gig-body"><strong>${esc(g.place)}</strong><span>${esc([when, g.note].filter(Boolean).join(" · "))}</span></div>
        ${g.url ? `<a class="btn small" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(t("gigDetails", "Details"))}</a>` : ""}</li>`;
    }).join("")}</ul></section>`;
}

/** @param {boolean} [loading] */
function renderBank(loading = false) {
  const host = $("bankBody");
  const d = view.data;
  document.title = `${d?.title || t("songBankTitle", "Song Bank")} · Sonata`;
  $("bankHeading").textContent = d?.title || t("songBankTitle", "Song Bank");
  applyLook(d?.theme);
  if (!d) {
    host.innerHTML = loading ? `<p class="muted bank-loading">${esc(t("loading", "Loading…"))}</p>` : `<div class="empty"><div class="empty-art">${icon("music")}</div><h2>${esc(t("bankUnavailable", "Song Bank unavailable"))}</h2><p>${esc(view.error)}</p><div class="empty-actions"><button class="btn" type="button" data-bk="retry">${esc(t("tryAgain", "Try again"))}</button></div></div>`;
    paintIcons(host);
    return;
  }
  const gl = genres(d.songs);
  const list = searchBank(d.songs, view.q, { genre: view.genre });
  const gigs = upcomingGigs(d.gigs || [], today());
  host.innerHTML = `
    <div class="bank-top">${cardHtml(d, { count: d.songs.length })}
      ${d.payments.length ? `<section class="card bank-support" aria-labelledby="supportTitle"><h2 id="supportTitle">${icon("heart")}${esc(t("supportName", "Support {name}", { name: d.name || t("theOwner", "the owner") }))}</h2>
        <div class="pay-list">${d.payments.map((pm, i) => `<button type="button" class="pay-card" data-bk="pay" data-i="${i}"><span class="pay-qr">${pm.qr ? `<span class="pay-qr-svg" data-qr="${esc(pm.qr)}"></span>` : `<img src="${esc(pm.img)}" alt="">`}</span><b>${esc(pm.label)}</b>${pm.name || (pm.qr && paymentPayee(pm.qr)) ? `<small>${esc(pm.name || paymentPayee(pm.qr)?.name || "")}</small>` : ""}</button>`).join("")}</div>
        <p class="card-hint">${esc(t("payNote", "Scan with your GCash, Maya or bank app. Payments go straight to them; Sonata never handles money and can't check who owns a Song Bank. Make sure the name your app shows is the right one."))}</p></section>` : ""}
    </div>
    ${gigs.length ? gigsHtml(gigs) : ""}
    <label class="search bank-search"><span data-icon="search"></span><input type="search" id="bankSearch" value="${esc(view.q)}" placeholder="${esc(t("bankSearchPh", "Search songs or artists"))}" aria-label="${esc(t("search", "Search"))}" autocomplete="off" enterkeyhint="search"></label>
    ${gl.length ? `<div class="chip-row bank-genres" role="group" aria-label="${esc(t("genre", "Genre"))}"><button type="button" class="chip${view.genre ? "" : " on"}" data-genre="" aria-pressed="${!view.genre}">${esc(t("filterAll", "All"))}</button>${gl.map((g) => `<button type="button" class="chip${view.genre === g ? " on" : ""}" data-genre="${esc(g)}" aria-pressed="${view.genre === g}">${esc(g)}</button>`).join("")}</div>` : ""}
    <div class="library-list bank-list">${list.map((s) => {
      const inner = `<span class="key-badge">${esc(s.k || "–")}</span><span class="row-text"><span class="row-title">${esc(s.t)}</span><span class="row-sub">${esc([s.a, s.g].filter(Boolean).join(" · "))}</span></span>`;
      return `<div class="row" data-sid="${esc(s.id)}">${s.b ? `<button type="button" class="row-main" data-bk="view" aria-label="${esc(t("openChart", "Open chart: {t}", { t: s.t }))}">${inner}<span class="row-go" aria-hidden="true">${icon("chevron")}</span></button>` : `<div class="row-main static">${inner}</div>`}</div>`;
    }).join("") || `<p class="muted bank-none">${esc(t("noMatches", "No matches for \"{q}\"", { q: view.q || view.genre }))}</p>`}</div>
    <p class="bank-foot">${esc(t("bankFoot", "Made with Sonata. This page is view-only; Sonata keeps no copy of it."))} <a href="/songs">${esc(t("bankMakeOwn", "Make your own Song Bank"))}</a></p>`;
  paintIcons(host);
  if (d.payments.some((p) => p.qr)) loadQr().then((m) => host.querySelectorAll("[data-qr]").forEach((el) => { el.innerHTML = m?.qrSvg(/** @type {HTMLElement} */ (el).dataset.qr || "", { ecc: "M", margin: 2 }) || ""; }));
  const input = /** @type {HTMLInputElement|null} */ (host.querySelector("#bankSearch"));
  input?.addEventListener("input", () => { view.q = input.value; const pos = input.selectionStart; renderBank(); const again = /** @type {HTMLInputElement} */ ($("bankSearch")); again.focus(); again.setSelectionRange(pos, pos); });
}

/** @param {string} id */
const songById = (id) => view.data?.songs.find((s) => s.id === id) || null;

export function initBank() {
  $("bankBody").addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const b = /** @type {HTMLElement|null} */ (el.closest("button"));
    if (!b) return;
    if (b.dataset.genre !== undefined) { view.genre = b.dataset.genre; renderBank(); return; }
    const act = b.dataset.bk;
    const sid = b.closest("[data-sid]")?.getAttribute("data-sid") || "";
    const s = songById(sid);
    tick();
    if (act === "retry") { const id = view.id; view.id = ""; openBank(id); }
    if (act === "view" && s) viewSong(s);
    if (act === "pay") showPayment(Number(b.dataset.i));
  });
}

/** A payment code, big, for scanning from another phone or saving. @param {number} i */
async function showPayment(i) {
  const d = view.data;
  const pm = d?.payments[i];
  if (!d || !pm) return;
  const m = pm.qr ? await loadQr() : null;
  const body = openSheet({
    title: `${pm.label}${pm.name ? ` · ${pm.name}` : ""}`, focus: false,
    body: `<div class="pay-big" tabindex="0">${pm.qr ? m?.qrSvg(pm.qr, { ecc: "M", margin: 4 }) || "" : `<img src="${esc(pm.img)}" alt="${esc(pm.label)} QR">`}
      ${pm.qr && paymentPayee(pm.qr) ? `<p class="pay-payee-big">${esc(t("payPaysTo", "This code pays"))} <b>${esc(payeeText(pm.qr))}</b></p>` : ""}
      <p class="card-hint">${esc(t("payNoteShort", "Check that the name your app shows matches before you pay. Payments go straight to them; Sonata never handles money and can't verify Song Banks."))}</p></div>`,
    actions: [{ label: t("saveImage", "Save image"), kind: "ghost", onClick: async () => { await savePayment(pm); return false; } }, { label: t("done", "Done"), kind: "primary" }]
  });
  paintIcons(body);
}

/** Save a payment code as a PNG (to scan from the gallery in GCash or Maya). @param {import("../core/bank.js").Payment} pm */
async function savePayment(pm) {
  const name = `${bankSlug(pm.label) || "payment"}-qr.png`;
  if (pm.img) { const r = await fetch(pm.img); download(name, await r.blob()); return; }
  const m = await loadQr();
  const qr = m?.qrModules(pm.qr, ["M", "L"]);
  if (!qr) return;
  const mod = 12, quiet = 4, side = (qr.n + quiet * 2) * mod;
  const c = document.createElement("canvas"); c.width = side; c.height = side;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = "#fff"; g.fillRect(0, 0, side, side); g.fillStyle = "#000";
  for (let r = 0; r < qr.n; r++) for (let col = 0; col < qr.n; col++) if (qr.dark(r, col)) g.fillRect((col + quiet) * mod, (r + quiet) * mod, mod, mod);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  if (blob) download(name, /** @type {Blob} */ (blob));
}

/** Read a chart from the list, in any key. @param {import("../core/bank.js").BankSong} s */
function viewSong(s) {
  const written = parseKey(s.k.endsWith("m") ? s.k.slice(0, -1) + ":minor" : s.k + ":major") || detectKey(s.b || "") || keyFromTonic(0, "major");
  let steps = 0;
  const keyNow = () => pretty(keyShort(keyFromTonic(written.tonic + steps, written.mode)));
  const draw = () => `<div class="bank-song">
      <p class="muted">${esc([s.a, s.g, s.bpm ? `${s.bpm} BPM` : ""].filter(Boolean).join(" · "))}</p>
      <div class="stepper bank-key"><button class="icon-btn" type="button" data-step="-1" aria-label="${esc(t("transposeDown", "Transpose down"))}">${icon("minus")}</button><output>${esc(keyNow())}</output><button class="icon-btn" type="button" data-step="1" aria-label="${esc(t("transposeUp", "Transpose up"))}">${icon("plus")}</button></div>
      <div class="chart bank-chart">${linesToHtml(buildLines(s.b || "", { key: written, transpose: steps, title: s.t }))}</div></div>`;
  const body = openSheet({
    title: s.t, wide: true, focus: false, body: draw(),
    actions: [
      { label: t("saveToSongs", "Save to my songs"), kind: "ghost", onClick: () => { store.createSong({ title: s.t, artist: s.a, body: s.b || "", genre: s.g, manualKey: `${written.root}:${written.mode}`, transpose: steps, bpm: s.bpm }); toast(t("savedNow", "Saved"), "success"); } },
      { label: t("done", "Done"), kind: "primary" }
    ]
  });
  paintIcons(body);
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-step]"));
    if (!b) return;
    steps = mod12(steps + Number(b.dataset.step) + 6) - 6;
    body.innerHTML = draw(); paintIcons(body);
  });
}
