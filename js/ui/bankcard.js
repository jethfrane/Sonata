// @ts-check
// Sonata Card: the Song Bank's face. The same card shows live while the owner edits, leads the
// public page, and downloads as a 1080×1350 image (fits Instagram, Facebook and TikTok posts)
// with a QR code to the Song Bank. Also: photo resizing and reading QR Ph payment codes.
import { esc } from "./dom.js";
import { t } from "./i18n.js";
import { brand, BRANDS } from "./brands.js";
import { socialLinks, genres, MAX_IMAGE, THEMES, readableAccent, inkOn, mixHex } from "../core/bank.js";

/** @typedef {{ title: string, name: string, bio: string, photo: string, socials: import("../core/bank.js").Socials, links: { label: string, url: string }[], theme?: import("../core/bank.js").Theme, songs?: { g: string }[] }} CardData */

const FONT_STACKS = { classic: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, system-ui, sans-serif' };

/**
 * The owner's look as CSS variables for one container, plus plain colors for the card image.
 * Presets set page, card and text colors; the accent is nudged until it is readable on the card.
 * @param {import("../core/bank.js").Theme|undefined} theme @param {boolean} [appDark] the visitor's own dark setting (for "auto")
 */
export function themeVars(theme, appDark = false) {
  const th = THEMES[/** @type {keyof typeof THEMES} */ (theme?.preset)] || THEMES.auto;
  const dark = th.bg ? th.dark : appDark;
  const surface = th.surface || (dark ? "#161619" : "#ffffff");
  const accent = theme?.accent ? readableAccent(theme.accent, surface) : dark ? "#8ea2ff" : "#3b5bdb";
  const strong = readableAccent(mixHex(accent, dark ? "#ffffff" : "#000000", 0.2), surface);
  /** @type {Record<string, string>} */
  const v = {};
  const mix = (/** @type {number} */ k) => `color-mix(in srgb, ${th.text} ${k}%, ${th.surface})`;
  if (th.bg) Object.assign(v, { "--bg": th.bg, "--surface": th.surface, "--surface-2": mix(5), "--surface-3": mix(10), "--line": mix(12), "--line-strong": mix(22), "--text": th.text, "--text-2": mix(86), "--muted": mix(68), "color-scheme": dark ? "dark" : "light" });
  if (th.bg || theme?.accent) Object.assign(v, { "--accent": accent, "--accent-strong": strong, "--accent-soft": `color-mix(in srgb, ${accent} 13%, ${surface})`, "--accent-mid": `color-mix(in srgb, ${accent} 30%, ${surface})`, "--accent-ink": inkOn(accent), "--chord": strong });
  const stack = /** @type {Record<string, string>} */ (FONT_STACKS)[theme?.font || ""];
  if (stack) v["--ui"] = stack;
  const light = !dark;
  return {
    style: Object.entries(v).map(([k, x]) => `${k}:${x}`).join(";"), themed: Object.keys(v).length > 0,
    /** Colors for the card image (always a light page unless the owner chose a dark look). */
    png: { bg: th.bg || "#f6f5f2", surface: th.surface || "#ffffff", text: th.text || "#1b1b1f", text2: th.bg ? mixHex(th.text, th.surface, 0.14) : "#3d3d45", muted: th.bg ? mixHex(th.text, th.surface, 0.32) : "#5f5d66", line: th.bg ? mixHex(th.text, th.surface, 0.88) : "#e5e2dc", accent: theme?.accent ? readableAccent(theme.accent, th.surface || "#ffffff") : th.bg ? (light ? "#3b5bdb" : "#8ea2ff") : "", ink: inkOn(accent) }
  };
}

/** Initials for a card without a photo. @param {string} name */
const initials = (name) => (String(name || "S").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "S").toUpperCase();

/** Logo for a link kind (brand logo, or a plain icon for website/email/other). @param {string} kind */
export function linkIcon(kind) {
  if (BRANDS[kind]) return brand(kind);
  const p = kind === "email" ? '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>' : '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>';
  return `<svg class="brand-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${p}</svg>`;
}

/**
 * The card as HTML.
 * @param {CardData} d @param {{ count: number, live?: boolean, compact?: boolean }} o
 */
export function cardHtml(d, o) {
  const gs = genres(d.songs || []).slice(0, 4);
  const links = socialLinks(d.socials, d.links);
  const title = d.title || (d.name ? `${d.name}'s Song Bank` : t("songBankTitle", "Song Bank"));
  const cover = d.theme?.cover || "";
  return `<article class="sonata-card${o.compact ? " compact" : ""}${cover ? " has-cover" : ""}" aria-label="${esc(t("sonataCard", "Sonata Card"))}">
    ${cover ? `<div class="sc-cover"><img src="${esc(cover)}" alt=""></div>` : ""}
    <div class="sc-top">
      <div class="sc-photo">${d.photo ? `<img src="${esc(d.photo)}" alt="">` : `<span>${esc(initials(d.name || title))}</span>`}</div>
      <div class="sc-id"><p class="sc-kicker">${esc(t("songBankTitle", "Song Bank"))}${o.live ? ` · <b>${esc(t("live", "Live"))}</b>` : ""}</p>
        <h2 class="sc-name">${esc(d.name || title)}</h2>${d.name && title !== `${d.name}'s Song Bank` ? `<p class="sc-title">${esc(title)}</p>` : ""}</div>
    </div>
    ${d.bio ? `<p class="sc-bio">${esc(d.bio)}</p>` : ""}
    <div class="sc-stats"><span><b>${o.count}</b> ${esc(o.count === 1 ? t("songWord", "song") : t("songsWord", "songs"))}</span>${gs.map((g) => `<span class="sc-genre">${esc(g)}</span>`).join("")}</div>
    ${links.length ? `<div class="sc-links">${links.map((l) => `<a class="sc-link sc-${l.kind}" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer nofollow" title="${esc(l.label)}">${linkIcon(l.kind)}<span>${esc(l.text)}</span></a>`).join("")}</div>` : ""}
    <p class="sc-foot">sonata.jethrofrane.xyz</p>
  </article>`;
}

/** Load an image file or data URL. @param {Blob|string} src @returns {Promise<HTMLImageElement>} */
function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    img.onload = () => { if (typeof src !== "string") URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { if (typeof src !== "string") URL.revokeObjectURL(url); fail(new Error("image")); };
    img.src = url;
  });
}

/**
 * Shrink a photo to a square JPEG data URL small enough for the Song Bank file.
 * @param {Blob} file @param {number} [size]
 */
export async function photoData(file, size = 360) {
  const img = await loadImage(file);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= MAX_IMAGE * 1.3) return url;
  }
  return c.toDataURL("image/jpeg", 0.35);
}

/** A wide cover picture (3:1) as a small JPEG data URL. @param {Blob} file */
export async function coverData(file) {
  const img = await loadImage(file);
  const W = 960, H = 320;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  for (const q of [0.82, 0.7, 0.58, 0.45, 0.35]) { const url = c.toDataURL("image/jpeg", q); if (url.length <= MAX_IMAGE * 1.3) return url; }
  return c.toDataURL("image/jpeg", 0.25);
}

/**
 * Read a payment QR (QR Ph: GCash, Maya, banks) from a photo or screenshot.
 * Returns the text inside it, or "" when it can't be read (then the picture itself is kept).
 * @param {Blob} file
 */
export async function readQrImage(file) {
  const [{ default: jsQR }, img] = await Promise.all([import("jsqr"), loadImage(file)]);
  // Try a few sizes: phone screenshots are large, and small codes need upscaling.
  for (const max of [900, 1400, 600, 2000]) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)) || 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    if (r?.data) return r.data;
  }
  return "";
}

/** The uploaded payment picture, shrunk, for codes that couldn't be read. @param {Blob} file */
export async function paymentImage(file) {
  const img = await loadImage(file);
  const max = 720, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.7, 0.55, 0.4]) { const url = c.toDataURL("image/jpeg", q); if (url.length <= MAX_IMAGE * 1.3) return url; }
  return "";
}

/**
 * The card as a 1080×1350 PNG with a QR code to the Song Bank, in the owner's colors.
 * @param {CardData} d @param {{ count: number, url: string, qr: { n: number, dark: (r: number, c: number) => boolean }, accent: string }} o
 * @returns {Promise<Blob>}
 */
export async function cardPng(d, o) {
  const W = 1080, H = 1350, ui = "'Inter Variable', Inter, system-ui, sans-serif";
  const col = themeVars(d.theme).png;
  const accent = col.accent || o.accent;
  const cover = d.theme?.cover || "";
  const dy = cover ? 210 : 0;
  await Promise.all([document.fonts?.load(`800 64px ${ui}`), document.fonts?.load(`500 30px ${ui}`)]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = accent; g.fillRect(0, 0, W, 14);
  // Card
  g.fillStyle = col.surface; g.beginPath(); g.roundRect(60, 70, W - 120, H - 140, 44); g.fill();
  if (cover) {
    try { const im = await loadImage(cover); g.save(); g.beginPath(); g.roundRect(60, 70, W - 120, 300, [44, 44, 0, 0]); g.clip(); g.drawImage(im, 60, 70, W - 120, 300); g.restore(); } catch { /* skip */ }
  }
  // Photo or initials
  const px = 120, py = 130 + dy, ps = 190;
  if (cover) { g.fillStyle = col.surface; g.beginPath(); g.arc(px + ps / 2, py + ps / 2, ps / 2 + 8, 0, Math.PI * 2); g.fill(); }
  g.save(); g.beginPath(); g.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); g.clip();
  if (d.photo) { try { g.drawImage(await loadImage(d.photo), px, py, ps, ps); } catch { /* skip */ } }
  else { g.fillStyle = accent; g.fillRect(px, py, ps, ps); g.fillStyle = col.ink; g.font = `800 76px ${ui}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(initials(d.name || d.title), px + ps / 2, py + ps / 2 + 4); }
  g.restore();
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.fillStyle = accent; g.font = `750 28px ${ui}`; g.fillText(t("songBankTitle", "Song Bank").toUpperCase(), 345, 180 + dy + (cover ? 6 : 0));
  g.fillStyle = col.text; g.font = `800 58px ${ui}`;
  const name = d.name || d.title || "Song Bank";
  g.fillText(name.length > 22 ? name.slice(0, 21) + "…" : name, 345, 246 + dy);
  g.fillStyle = col.muted; g.font = `500 30px ${ui}`;
  g.fillText(`${o.count} ${o.count === 1 ? t("songWord", "song") : t("songsWord", "songs")}${genres(d.songs || []).length ? " · " + genres(d.songs || []).slice(0, 3).join(" · ") : ""}`.slice(0, 48), 345, 296 + dy);
  // Bio, two lines
  let y = 390 + dy;
  if (d.bio) {
    g.fillStyle = col.text2; g.font = `500 32px ${ui}`;
    const words = d.bio.split(/\s+/); let line = ""; let lines = 0;
    for (const w of words) { if (g.measureText(line + w).width > W - 240) { g.fillText(line.trim(), 120, y); y += 46; line = ""; if (++lines === 2) break; } line += w + " "; }
    if (lines < 2 && line.trim()) { g.fillText(line.trim(), 120, y); y += 46; }
  }
  // QR (always dark on white so phone cameras read it)
  const quiet = 4, box = cover ? 380 : 520, mod = Math.floor(box / (o.qr.n + quiet * 2)), side = mod * (o.qr.n + quiet * 2);
  const qx = Math.round((W - side) / 2), qy = Math.max(y + 20, 480 + dy);
  g.fillStyle = "#fff"; g.fillRect(qx, qy, side, side);
  g.strokeStyle = col.line; g.lineWidth = 3; g.strokeRect(qx, qy, side, side);
  g.fillStyle = "#0b1220";
  for (let r = 0; r < o.qr.n; r++) for (let cc = 0; cc < o.qr.n; cc++) if (o.qr.dark(r, cc)) g.fillRect(qx + (cc + quiet) * mod, qy + (r + quiet) * mod, mod, mod);
  g.textAlign = "center"; g.fillStyle = col.text; g.font = `800 40px ${ui}`;
  g.fillText(t("cardScan", "Scan to see my songs"), W / 2, qy + side + 64);
  // Socials (logos drawn from their SVG paths)
  const links = socialLinks(d.socials, d.links).filter((l) => BRANDS[l.kind]).slice(0, 4);
  if (links.length) {
    g.font = `600 26px ${ui}`;
    const widths = links.map((l) => 40 + g.measureText(l.text.slice(0, 18)).width);
    let x = (W - (widths.reduce((a, b) => a + b, 0) + (links.length - 1) * 36)) / 2;
    const ly = qy + side + 128;
    links.forEach((l, i) => {
      g.save(); g.translate(x, ly - 24); g.scale(1.2, 1.2); g.fillStyle = BRANDS[l.kind].hex === "#000000" ? col.text : BRANDS[l.kind].hex; g.fill(new Path2D(BRANDS[l.kind].path)); g.restore();
      g.fillStyle = col.text2; g.textAlign = "left"; g.fillText(l.text.slice(0, 18), x + 40, ly);
      x += widths[i] + 36;
    });
  }
  g.textAlign = "center"; g.fillStyle = col.muted; g.font = `600 24px ${ui}`;
  g.fillText(o.url.replace(/^https?:\/\//, "").split("/")[0], W / 2, H - 100);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("png"))), "image/png"));
}
