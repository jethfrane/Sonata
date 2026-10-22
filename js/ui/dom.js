// @ts-check
// Small DOM helpers: icons, escaping, toasts, the shared dialog sheet.

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @param {string} sel @param {ParentNode} [root] */
export const $$ = (sel, root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);

/** @param {unknown} s */
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// 24px stroke icons drawn in the Lucide style.
/** @type {Record<string, string>} */
const ICONS = {
  library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 8h7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  piano: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v9M12 4v9M17 4v9M7 13v7M12 13v7M17 13v7"/><path d="M5.5 4h3v9h-3zM10.5 4h3v9h-3zM15.5 4h3v9h-3z" fill="currentColor" stroke="none"/>',
  guitar: '<path d="m20 2 2 2-5 5"/><path d="m17 9-6.5 6.5"/><path d="M11 9.5a3 3 0 0 0-4.6.3L4.3 12A4 4 0 0 0 4 17.6l2.4 2.4A4 4 0 0 0 12 19.7l2.2-2.1a3 3 0 0 0 .3-4.6"/><circle cx="9" cy="15" r="1.4"/>',
  tuner: '<path d="M12 21a9 9 0 1 1 9-9"/><path d="m12 12 5-6"/><circle cx="12" cy="12" r="1.5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
  cloud: '<path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z"/>',
  "cloud-check": '<path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z"/><path d="m9 13 2 2 4-4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.6a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.6a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  present: '<path d="M3 4h18v12H3z"/><path d="M12 16v4M8 21h8"/><path d="m10 8 4 2-4 2z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8" fill="currentColor"/><circle cx="3.5" cy="12" r=".8" fill="currentColor"/><circle cx="3.5" cy="18" r=".8" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15v4M17 17h4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.8-8.8M16 7l3 3M14 9l2 2"/>',
  metronome: '<path d="M8 21h8l-2.5-17h-3z"/><path d="M5 21h14"/><path d="m12 15 6-9"/>',
  play: '<path d="m7 4 13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  "star-fill": '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  duplicate: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  "arrow-up": '<path d="M12 19V5M5 12l7-7 7 7"/>',
  "arrow-down": '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
};

/** @param {string} name @param {string} [cls] */
export function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.music}</svg>`;
}

/** Replace every [data-icon] placeholder with its SVG. @param {ParentNode} [root] */
export function paintIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = /** @type {HTMLElement} */ (el).dataset.icon || "";
    if (el.getAttribute("data-icon-painted") === name) return;
    el.innerHTML = icon(name);
    el.setAttribute("data-icon-painted", name);
  });
}

/** @param {HTMLElement} el @param {string} name */
export function setIcon(el, name) {
  if (!el) return;
  el.dataset.icon = name;
  el.innerHTML = icon(name);
  el.setAttribute("data-icon-painted", name);
}

/**
 * Brief, non-blocking message. Only for things the user needs to know.
 * @param {string} message @param {"info"|"success"|"error"} [kind] @param {{ action?: string, onAction?: () => void, ms?: number }} [o]
 */
export function toast(message, kind = "info", o = {}) {
  const host = $("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${icon(kind === "error" ? "info" : kind === "success" ? "check" : "info")}<span>${esc(message)}</span>`;
  if (o.action && o.onAction) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = o.action;
    b.addEventListener("click", () => { o.onAction?.(); el.remove(); });
    el.appendChild(b);
  }
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild?.remove();
  setTimeout(() => el.classList.add("leaving"), (o.ms || 2600) - 250);
  setTimeout(() => el.remove(), o.ms || 2600);
}

/**
 * @typedef {{ label: string, kind?: "primary"|"danger"|"ghost", value?: string,
 *   onClick?: (body: HTMLElement) => boolean|void|Promise<boolean|void> }} SheetAction
 * @typedef {{ title: string, body: string|HTMLElement, actions?: SheetAction[], wide?: boolean,
 *   onOpen?: (body: HTMLElement) => void, onClose?: () => void, className?: string }} SheetOptions
 */


/**
 * Open the shared dialog. An action that returns false keeps it open.
 * @param {SheetOptions} o
 */
export function openSheet(o) {
  const dlg = /** @type {HTMLDialogElement} */ ($("sheet"));
  const body = $("sheetBody");
  const foot = $("sheetFoot");
  if (dlg.open) closeSheet();
  $("sheetTitle").textContent = o.title;
  dlg.className = `sheet${o.wide ? " wide" : ""}${o.className ? " " + o.className : ""}`;
  if (typeof o.body === "string") body.innerHTML = o.body; else { body.innerHTML = ""; body.appendChild(o.body); }
  foot.innerHTML = "";
  foot.hidden = !(o.actions && o.actions.length);
  for (const a of o.actions || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${a.kind || ""}`;
    b.textContent = a.label;
    b.addEventListener("click", async () => {
      const keep = a.onClick ? await a.onClick(body) : undefined;
      if (keep !== false) closeSheet();
    });
    foot.appendChild(b);
  }
  paintIcons(body);
  const onClose = () => { dlg.removeEventListener("close", onClose); o.onClose?.(); };
  dlg.addEventListener("close", onClose);
  dlg.showModal();
  // Close when tapping the dimmed backdrop.
  dlg.onclick = (e) => { if (e.target === dlg) closeSheet(); };
  o.onOpen?.(body);
  const first = /** @type {HTMLElement|null} */ (body.querySelector("input:not([type=hidden]):not([readonly]), select, textarea"));
  if (first && !matchMedia("(pointer: coarse)").matches) first.focus();
  return body;
}

export function closeSheet() {
  const dlg = /** @type {HTMLDialogElement} */ ($("sheet"));
  if (dlg.open) dlg.close();
}

/**
 * Ask before something destructive.
 * @param {{ title: string, message: string, confirm: string, cancel: string, danger?: boolean }} o
 * @returns {Promise<boolean>}
 */
export function confirmSheet(o) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title: o.title,
      body: `<p class="sheet-text">${esc(o.message)}</p>`,
      actions: [
        { label: o.cancel, kind: "ghost", onClick: () => { answered = true; resolve(false); } },
        { label: o.confirm, kind: o.danger ? "danger" : "primary", onClick: () => { answered = true; resolve(true); } }
      ],
      onClose: () => { if (!answered) resolve(false); }
    });
  });
}

/** Save a Blob as a file. @param {string} name @param {Blob} blob */
export function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** @param {string} text */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** @param {string} s */
export const slug = (s) => (String(s || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "song");

/** @param {string|number} iso @param {string} [lang] */
export function relativeTime(iso, lang = "en") {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = (Date.now() - t) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === "fil" ? "fil" : "en", { numeric: "auto" });
  if (diff < 60) return rtf.format(0, "second");
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 7) return rtf.format(-Math.round(diff / 86400), "day");
  return new Date(t).toLocaleDateString(lang === "fil" ? "fil-PH" : undefined, { month: "short", day: "numeric", year: diff > 86400 * 300 ? "numeric" : undefined });
}
