// @ts-check
// The Song Bank's look (colors, font, cover picture) and the header shown above the song list.
import { esc } from "./dom.js";
import { t } from "./i18n.js";
import { genres, MAX_IMAGE, THEMES, readableAccent, mixHex, inkOn } from "../core/bank.js";

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
  return {
    style: Object.entries(v).map(([k, x]) => `${k}:${x}`).join(";"), themed: Object.keys(v).length > 0
  };
}

/**
 * The header: cover picture, name, title, note, song count and main genres.
 * @param {{ title: string, name: string, bio: string, theme?: import("../core/bank.js").Theme, songs?: { g: string }[] }} d
 * @param {{ count: number, live?: boolean }} o
 */
export function cardHtml(d, o) {
  const gs = genres(d.songs || []).slice(0, 4);
  const title = d.title || (d.name ? `${d.name}'s Song Bank` : t("songBankTitle", "Song Bank"));
  const cover = d.theme?.cover || "";
  return `<article class="sonata-card${cover ? " has-cover" : ""}" aria-label="${esc(title)}">
    ${cover ? `<div class="sc-cover"><img src="${esc(cover)}" alt=""></div>` : ""}
    <div class="sc-top">
      <div class="sc-id"><p class="sc-kicker">${esc(t("songBankTitle", "Song Bank"))}${o.live ? ` · <b>${esc(t("live", "Live"))}</b>` : ""}</p>
        <h2 class="sc-name">${esc(d.name || title)}</h2>${d.name && title !== `${d.name}'s Song Bank` ? `<p class="sc-title">${esc(title)}</p>` : ""}</div>
    </div>
    ${d.bio ? `<p class="sc-bio">${esc(d.bio)}</p>` : ""}
    <div class="sc-stats"><span><b>${o.count}</b> ${esc(o.count === 1 ? t("songWord", "song") : t("songsWord", "songs"))}</span>${gs.map((g) => `<span class="sc-genre">${esc(g)}</span>`).join("")}</div>
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
