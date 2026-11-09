// @ts-check
// Song bank. Musician side: choose songs, genres and how to be contacted, then publish one
// file to their own Google Drive. Listener side (/bank/<id>): search the list, read a chart in
// any key, and send a request through the musician's chosen app. No Sonata server stores anything.
import { $, esc, icon, openSheet, closeSheet, paintIcons, toast, copyText, download } from "./dom.js";
import { t } from "./i18n.js";
import { store, app, soundingKey, tick } from "./ctx.js";
import { keyShort, pretty, parseKey, keyFromTonic, detectKey, mod12 } from "../core/music.js";
import { buildLines, linesToHtml } from "../core/chart.js";
import { normalizeProfile, buildBankFile, parseBankFile, genres, requestText, requestTargets, searchBank, validBankId, CONTACT_KINDS } from "../core/bank.js";
import { loadQr } from "./sheets-lazy.js";

const ORIGIN = () => location.origin;
export const bankUrl = (/** @type {string} */ id) => `${ORIGIN()}/bank/${id}`;
/** @param {any} s */
const keyOf = (s) => pretty(keyShort(soundingKey(s)));

// ---------- Musician side ----------

/** Songs marked for the bank. */
export const bankSongs = () => store.songs.filter((s) => s.inBank);

/** Publish (or update) the public file in the musician's Drive. @returns {Promise<boolean>} */
export async function publishBank() {
  const d = app.drive;
  if (!d || !d.token) { toast(t("bankNeedsDrive", "Sign in with Google first. Your song list is shared from your own Drive."), "info", { ms: 6000, action: t("signIn", "Sign in"), onAction: () => d?.signIn() }); return false; }
  if (!bankSongs().length) { toast(t("bankEmpty", "Add at least one song to your song bank first."), "error"); return false; }
  const file = buildBankFile(store.bank, store.songs, keyOf);
  const r = await d.publishBank(file, store.bank.fileId);
  if (!r.ok) {
    toast(r.reason === "signin" ? t("reconnectText", "Your Google session expired. Reconnect to keep syncing.") : r.reason === "offline" ? t("offlineNote", "You're offline. Songs still save on this device.") : t("bankPublishFailed", "Couldn't publish the song list. Try again."), "error", { ms: 6000 });
    return false;
  }
  store.bank = { ...store.bank, fileId: r.id, publishedAt: store.bank.publishedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.bankDirty = false;
  store.changed("settings");
  return true;
}

/** After library edits, keep a published bank current (quietly, a little later). */
let republishTimer = /** @type {any} */ (0);
export function watchBank() {
  store.on("library-change", () => {
    if (!store.bank.fileId || !app.drive?.token) return;
    store.bankDirty = true;
    clearTimeout(republishTimer);
    republishTimer = setTimeout(() => { if (store.bankDirty) publishBank(); }, 15000);
  });
}

/** Song bank manager: profile, contacts, songs and sharing. */
export function openBankManager() {
  const p = store.bank;
  const all = store.songs.filter((s) => !s.readonly).slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
  const gl = genres(all.map((s) => ({ g: s.genre })));
  const contactLabel = { messenger: "Messenger username", whatsapp: "WhatsApp number", sms: "Phone (text message)", telegram: "Telegram username", email: "Email", instagram: "Instagram username" };
  const ph = { messenger: "your.username", whatsapp: "+63 917 000 0000", sms: "+63 917 000 0000", telegram: "username", email: "you@example.com", instagram: "username" };
  const draw = () => {
    const n = bankSongs().length;
    const link = p.fileId ? bankUrl(p.fileId) : "";
    return `<div class="form bank-form">
      <div class="bank-share-box">
        ${link ? `<p class="status-line synced">${esc(t("bankLive", "Live: anyone with the link or QR can see {n} songs.", { n }))}</p>
          <div class="share-link"><input class="input" id="bankLink" readonly value="${esc(link)}" aria-label="Link"></div>
          <div class="share-actions"><button class="btn primary" type="button" id="bankCopy">${icon("copy")}${esc(t("copyLink", "Copy link"))}</button>
          ${"share" in navigator ? `<button class="btn" type="button" id="bankShareNative">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
          <button class="btn" type="button" id="bankQr">${icon("qr")}${esc(t("qrPoster", "QR poster"))}</button>
          <button class="btn" type="button" id="bankPublish">${icon("refresh")}${esc(t("bankUpdate", "Update now"))}</button></div>`
        : `<p class="card-text">${esc(t("bankIntro", "Share the songs you can play. People scan your QR, find a song, pick a key and send you a request. The list is one file in your own Google Drive; Sonata keeps no copy."))}</p>
          <button class="btn primary wide" type="button" id="bankPublish">${icon("share")}${esc(t("bankPublishBtn", "Publish my song list ({n})", { n }))}</button>`}
      </div>
      <h3 class="group-title">${esc(t("bankProfile", "About you"))}</h3>
      <div class="field-row">
        <label class="field"><span>${esc(t("bankName", "Name or band"))}</span><input class="input" data-p="name" value="${esc(p.name)}" maxlength="80" placeholder="${esc(t("bankNamePh", "Your name"))}" autocomplete="name"></label>
        <label class="field"><span>${esc(t("bankTitle", "List title"))}</span><input class="input" data-p="title" value="${esc(p.title)}" maxlength="80" placeholder="${esc(t("bankTitlePh", "Songs I can play tonight"))}"></label>
      </div>
      <label class="field"><span>${esc(t("bankBio", "Short note"))}</span><textarea class="input" data-p="bio" rows="2" maxlength="400" placeholder="${esc(t("bankBioPh", "Acoustic covers, OPM and worship. Requests welcome!"))}">${esc(p.bio)}</textarea></label>
      <label class="switch-row"><span>${esc(t("bankCharts", "Let listeners see my charts"))}</span><input type="checkbox" class="toggle" data-p="charts"${p.charts ? " checked" : ""}></label>
      <h3 class="group-title">${esc(t("bankRequestsVia", "Send requests to"))}</h3>
      <p class="card-hint">${esc(t("bankContactsHint", "Fill in at least one. Requests open that app with the song already written."))}</p>
      ${CONTACT_KINDS.map((k) => `<label class="field"><span>${esc(contactLabel[k])}</span><input class="input" data-c="${k}" value="${esc(p.contacts[k])}" placeholder="${esc(ph[k])}" ${k === "email" ? 'type="email" inputmode="email"' : k === "whatsapp" || k === "sms" ? 'type="tel" inputmode="tel"' : 'autocapitalize="off"'} autocomplete="off"></label>`).join("")}
      <h3 class="group-title">${esc(t("bankSongsTitle", "Songs in the list"))} <span class="muted" id="bankCount">${n}/${all.length}</span></h3>
      <div class="btn-row"><button class="btn small" type="button" id="bankAll">${esc(t("selectAll", "Select all"))}</button><button class="btn small" type="button" id="bankNone">${esc(t("selectNone", "Clear"))}</button></div>
      <datalist id="genreList">${["OPM", "Worship", "Pop", "Rock", "Ballad", "R&B", "Country", "Jazz", "Reggae", "Christmas", ...gl].filter((g, i, a) => a.indexOf(g) === i).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      <ul class="bank-pick">${all.map((s) => `<li><label class="bp-check"><input type="checkbox" data-in="${esc(s.id)}"${s.inBank ? " checked" : ""}><span><b>${esc(s.title)}</b><small>${esc(s.artist || "")}</small></span></label>
        <input class="input bp-genre" data-genre="${esc(s.id)}" value="${esc(s.genre)}" list="genreList" placeholder="${esc(t("genre", "Genre"))}" aria-label="${esc(t("genreFor", "Genre for {t}", { t: s.title }))}"></li>`).join("") || `<li class="muted">${esc(t("noSongsYet", "No songs yet."))}</li>`}</ul>
      ${p.fileId ? `<button class="btn ghost danger-text" type="button" id="bankUnpublish">${esc(t("bankStop", "Stop sharing"))}</button>` : ""}
    </div>`;
  };
  const body = openSheet({ title: t("songBank", "Song bank"), wide: true, className: "bank-sheet", body: draw(), focus: false });
  const redraw = () => { body.innerHTML = draw(); paintIcons(body); };
  body.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.p && el.type !== "checkbox") { /** @type {any} */ (store.bank)[el.dataset.p] = el.value; store.bank = normalizeProfile({ ...store.bank, contacts: store.bank.contacts }); store.changed("settings"); markDirty(); }
    if (el.dataset.c) { store.bank.contacts = { ...store.bank.contacts, [el.dataset.c]: el.value }; store.bank = normalizeProfile(store.bank); store.changed("settings"); markDirty(); }
    if (el.dataset.genre) { const s = store.song(el.dataset.genre); if (s) store.update(s, { genre: el.value.slice(0, 40) }); }
  });
  body.addEventListener("change", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.p === "charts") { store.bank = { ...store.bank, charts: el.checked }; store.changed("settings"); markDirty(); }
    if (el.dataset.in) { const s = store.song(el.dataset.in); if (s) store.update(s, { inBank: el.checked }); $("bankCount").textContent = `${bankSongs().length}/${all.length}`; }
  });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.id === "bankAll" || b.id === "bankNone") { const on = b.id === "bankAll"; for (const s of all) if (s.inBank !== on) store.update(s, { inBank: on }); redraw(); }
    if (b.id === "bankPublish") { b.setAttribute("aria-busy", "true"); if (await publishBank()) { toast(t("bankPublished", "Song list is live"), "success"); redraw(); } else b.removeAttribute("aria-busy"); }
    if (b.id === "bankCopy") { if (await copyText(bankUrl(store.bank.fileId))) toast(t("linkCopied", "Link copied"), "success"); }
    if (b.id === "bankShareNative") { try { await navigator.share({ title: store.bank.title || t("songBank", "Song bank"), text: t("bankShareText", "Request a song from my list:"), url: bankUrl(store.bank.fileId) }); } catch { /* cancelled */ } }
    if (b.id === "bankQr") { b.setAttribute("aria-busy", "true"); try { await qrPoster(); } finally { b.removeAttribute("aria-busy"); } }
    if (b.id === "bankUnpublish") {
      if (await app.drive?.unpublishBank(store.bank.fileId)) { store.bank = { ...store.bank, fileId: "", publishedAt: "" }; store.changed("settings"); toast(t("bankStopped", "Your song list is private again."), "info"); redraw(); }
      else toast(t("bankStopFailed", "Couldn't stop sharing. Check your connection and sign-in."), "error");
    }
  });
}

function markDirty() { if (store.bank.fileId) { store.bankDirty = true; clearTimeout(republishTimer); republishTimer = setTimeout(() => { if (store.bankDirty) publishBank(); }, 15000); } }

/** A printable QR poster for the tip jar or mic stand. */
async function qrPoster() {
  const m = await loadQr();
  if (!m) return;
  const { qrModules } = m;
  const url = bankUrl(store.bank.fileId);
  const qr = qrModules(url, ["M", "L"]);
  if (!qr) return;
  const W = 1200, H = 1600, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1b1b1f"; g.textAlign = "center";
  g.font = "800 84px Inter, system-ui, sans-serif"; g.fillText(t("posterTitle", "Request a song"), W / 2, 170);
  g.font = "600 46px Inter, system-ui, sans-serif"; g.fillStyle = "#3b5bdb"; g.fillText((store.bank.name || store.bank.title || "").slice(0, 40), W / 2, 250);
  const size = 860, x0 = (W - size) / 2, y0 = 320, cell = size / (qr.n + 8);
  g.fillStyle = "#000";
  for (let r = 0; r < qr.n; r++) for (let col = 0; col < qr.n; col++) if (qr.dark(r, col)) g.fillRect(Math.floor(x0 + (col + 4) * cell), Math.floor(y0 + (r + 4) * cell), Math.ceil(cell), Math.ceil(cell));
  g.fillStyle = "#3d3d45"; g.font = "500 38px Inter, system-ui, sans-serif";
  g.fillText(t("posterSteps", "Scan · find a song · pick a key · send"), W / 2, y0 + size + 90);
  g.fillStyle = "#5f5d66"; g.font = "500 30px Inter, system-ui, sans-serif"; g.fillText(t("posterFoot", "{n} songs · made with Sonata", { n: bankSongs().length }), W / 2, y0 + size + 150);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  if (blob) download("sonata-song-list-qr.png", /** @type {Blob} */ (blob));
}

// ---------- Listener side ----------

/** @type {{ id: string, data: import("../core/bank.js").BankFile|null, q: string, genre: string, picks: Map<string, string>, error: string }} */
const view = { id: "", data: null, q: "", genre: "", picks: new Map(), error: "" };
const CACHE = (/** @type {string} */ id) => `sonata_bank_${id}`;

/** Open a musician's list. @param {string} id */
export async function openBank(id) {
  if (view.id === id && view.data) { renderBank(); return; }
  Object.assign(view, { id, data: null, q: "", genre: "", picks: new Map(), error: "" });
  if (!validBankId(id)) { view.error = t("bankBadLink", "This song list link is incomplete."); renderBank(); return; }
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
    if (!view.data) view.error = navigator.onLine ? t("bankLoadFailed", "This song list isn't available. The musician may have stopped sharing it.") : t("bankOffline", "You're offline, and this song list hasn't been opened on this device before.");
  }
  if (view.id === id) renderBank();
}

/** @param {boolean} [loading] */
function renderBank(loading = false) {
  const host = $("bankBody");
  const d = view.data;
  document.title = `${d?.title || t("songList", "Song list")} · Sonata`;
  if (!d) {
    $("bankHeading").textContent = t("songList", "Song list");
    host.innerHTML = loading ? `<p class="muted bank-loading">${esc(t("loading", "Loading…"))}</p>` : `<div class="empty"><div class="empty-art">${icon("music")}</div><h2>${esc(t("bankUnavailable", "Song list unavailable"))}</h2><p>${esc(view.error)}</p><div class="empty-actions"><button class="btn" type="button" data-bk="retry">${esc(t("tryAgain", "Try again"))}</button></div></div>`;
    paintIcons(host);
    return;
  }
  $("bankHeading").textContent = d.title;
  const gl = genres(d.songs);
  const list = searchBank(d.songs, view.q, { genre: view.genre });
  const targets = requestTargets(d.contacts, "");
  host.innerHTML = `
    <div class="bank-about">${d.name ? `<p class="bank-name">${icon("mic")}<b>${esc(d.name)}</b></p>` : ""}${d.bio ? `<p class="bank-bio">${esc(d.bio)}</p>` : ""}
      <p class="muted bank-meta">${esc(t("songsCount", "{n} songs", { n: d.songs.length }))}${targets.length ? ` · ${esc(t("requestsBy", "Requests by {apps}", { apps: targets.map((x) => x.label).join(", ") }))}` : ""}</p></div>
    <label class="search bank-search"><span>${icon("search")}</span><input type="search" id="bankSearch" value="${esc(view.q)}" placeholder="${esc(t("bankSearchPh", "Search songs or artists"))}" aria-label="${esc(t("search", "Search"))}" autocomplete="off" enterkeyhint="search"></label>
    ${gl.length ? `<div class="chip-row bank-genres" role="group" aria-label="${esc(t("genre", "Genre"))}"><button type="button" class="chip${view.genre ? "" : " on"}" data-genre="" aria-pressed="${!view.genre}">${esc(t("filterAll", "All"))}</button>${gl.map((g) => `<button type="button" class="chip${view.genre === g ? " on" : ""}" data-genre="${esc(g)}" aria-pressed="${view.genre === g}">${esc(g)}</button>`).join("")}</div>` : ""}
    <div class="library-list bank-list">${list.map((s) => {
      const picked = view.picks.has(s.id);
      return `<div class="row${picked ? " active" : ""}" data-sid="${esc(s.id)}">
        <button type="button" class="row-main" data-bk="${s.b ? "view" : "pick"}"><span class="key-badge">${esc(s.k || "–")}</span><span class="row-text"><span class="row-title">${esc(s.t)}</span><span class="row-sub">${esc([s.a, s.g].filter(Boolean).join(" · "))}</span></span></button>
        <button type="button" class="btn small${picked ? " primary" : ""}" data-bk="pick" aria-pressed="${picked}">${picked ? icon("check") : icon("plus")}<span>${esc(picked ? t("picked", "Picked") : t("request", "Request"))}</span></button></div>`;
    }).join("") || `<p class="muted bank-none">${esc(t("noMatches", "No matches for \"{q}\"", { q: view.q || view.genre }))}</p>`}</div>
    <p class="bank-foot">${esc(t("bankFoot", "Made with Sonata. Your request goes straight to the musician; Sonata doesn't see it."))} <a href="/songs">${esc(t("bankMakeOwn", "Make your own song list"))}</a></p>
    <div class="bank-bar" ${view.picks.size ? "" : "hidden"}><span>${esc(t("pickedN", "{n} picked", { n: view.picks.size }))}</span><button type="button" class="btn primary" data-bk="send">${icon("send")}${esc(t("sendRequest", "Send request"))}</button></div>`;
  paintIcons(host);
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
    if (act === "pick" && s) { if (view.picks.has(s.id)) view.picks.delete(s.id); else view.picks.set(s.id, s.k); renderBank(); }
    if (act === "view" && s) viewSong(s);
    if (act === "send") requestSheet();
  });
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
      { label: t("saveToSongs", "Save to my songs"), kind: "ghost", onClick: () => { const n = store.createSong({ title: s.t, artist: s.a, body: s.b || "", genre: s.g, manualKey: `${written.root}:${written.mode}`, transpose: steps, bpm: s.bpm }); toast(t("savedNow", "Saved"), "success"); void n; } },
      { label: t("requestInKey", "Request in {k}", { k: keyNow() }), kind: "primary", onClick: () => { view.picks.set(s.id, keyNow()); renderBank(); requestSheet(); } }
    ]
  });
  paintIcons(body);
  body.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-step]"));
    if (!b) return;
    steps = mod12(steps + Number(b.dataset.step) + 6) - 6;
    body.innerHTML = draw(); paintIcons(body);
    const btn = /** @type {HTMLElement|null} */ (document.querySelector("#sheetFoot .btn.primary"));
    if (btn) btn.textContent = t("requestInKey", "Request in {k}", { k: keyNow() });
  });
}

/** Choose keys, add a name and note, then open the musician's app. */
function requestSheet() {
  const d = view.data;
  if (!d || !view.picks.size) return;
  const KEYS12 = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const picks = () => [...view.picks.entries()].map(([id, key]) => { const s = songById(id); return s ? { t: s.t, a: s.a, key } : null; }).filter((x) => x !== null);
  const text = (/** @type {HTMLElement} */ body) => requestText(/** @type {any} */ (picks()), { from: /** @type {HTMLInputElement} */ (body.querySelector("#rqFrom")).value.trim(), note: /** @type {HTMLTextAreaElement} */ (body.querySelector("#rqNote")).value.trim(), bank: d.name });
  const targets = requestTargets(d.contacts, "x");
  const body = openSheet({
    title: t("sendRequest", "Send request"), focus: false,
    body: `<div class="form">
      <ul class="set-items">${[...view.picks.entries()].map(([id, key]) => { const s = songById(id); if (!s) return ""; const minor = /m$/.test(s.k);
        return `<li class="set-item"><span class="set-name">${esc(s.t)}</span><label class="sr-only" for="rk-${esc(id)}">${esc(t("key", "Key"))}</label><select class="select rq-key" id="rk-${esc(id)}" data-rk="${esc(id)}">${KEYS12.map((k) => { const v = pretty(k) + (minor ? "m" : ""); return `<option${v === key ? " selected" : ""}>${esc(v)}</option>`; }).join("")}</select>
        <button class="icon-btn small" type="button" data-drop="${esc(id)}" aria-label="${esc(t("remove", "Remove"))}">${icon("x")}</button></li>`; }).join("")}</ul>
      <label class="field"><span>${esc(t("yourName", "Your name (optional)"))}</span><input class="input" id="rqFrom" maxlength="60" autocomplete="given-name"></label>
      <label class="field"><span>${esc(t("rqNote", "Note (optional)"))}</span><textarea class="input" id="rqNote" rows="2" maxlength="300" placeholder="${esc(t("rqNotePh", "Dedication, table number…"))}"></textarea></label>
      <p class="mini-label">${esc(t("sendWith", "Send with"))}</p>
      <div class="rq-targets">${targets.map((x) => `<button class="btn${targets[0] === x ? " primary" : ""}" type="button" data-go="${x.kind}">${esc(x.label)}</button>`).join("")}
        ${"share" in navigator ? `<button class="btn" type="button" data-go="share">${icon("share")}${esc(t("shareNative", "Share…"))}</button>` : ""}
        <button class="btn" type="button" data-go="copy">${icon("copy")}${esc(t("copyText", "Copy text"))}</button></div>
      ${targets.some((x) => !x.prefilled) ? `<p class="card-hint">${esc(t("rqPasteHint", "Telegram and Instagram open the chat; the request is copied, so paste it there."))}</p>` : ""}
      ${targets.length ? "" : `<p class="card-hint">${esc(t("rqNoContact", "This musician hasn't added a way to reach them. Copy the request and show it to them."))}</p>`}
    </div>`
  });
  paintIcons(body);
  body.addEventListener("change", (e) => { const el = /** @type {HTMLSelectElement} */ (e.target); if (el.dataset.rk) view.picks.set(el.dataset.rk, el.value); });
  body.addEventListener("click", async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"));
    if (!b) return;
    if (b.dataset.drop) { view.picks.delete(b.dataset.drop); renderBank(); if (!view.picks.size) closeSheet(); else b.closest("li")?.remove(); return; }
    const go = b.dataset.go;
    if (!go) return;
    const msg = text(body);
    if (go === "copy") { if (await copyText(msg)) toast(t("copied", "Copied"), "success"); return; }
    if (go === "share") { try { await navigator.share({ text: msg }); sent(); } catch { /* cancelled */ } return; }
    const target = requestTargets(d.contacts, msg).find((x) => x.kind === go);
    if (!target) return;
    if (!target.prefilled) await copyText(msg);
    window.open(target.href, "_blank", "noopener");
    sent();
  });
  const sent = () => { toast(t("rqSent", "Request ready to send. Thanks!"), "success"); view.picks.clear(); renderBank(); closeSheet(); };
}
