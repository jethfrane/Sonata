// @ts-check
// English lives in the HTML and code (t("key", "English")); the Filipino
// translations are in i18n-fil.js. Missing keys fall back to English.

let lang = "en";

/** Filled from i18n-fil.js the first time Filipino is chosen, so English users never download it. @type {Record<string, string>} */
let FIL = {};
let loaded = false;

/** Resolves once the language's words are ready. @param {string} l */
export async function setLang(l) {
  lang = l === "fil" ? "fil" : "en";
  document.documentElement.lang = lang;
  if (lang === "fil" && !loaded) {
    // If the file can't be fetched (offline before it was ever cached), the app stays in English.
    try { FIL = (await import("./i18n-fil.js")).default; loaded = true; } catch { /* English */ }
  }
}
export const getLang = () => lang;

/**
 * @param {string} key
 * @param {string} [en] English text
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, en, vars) {
  let s = (lang === "fil" && FIL[key]) || en || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Translate static markup. English originals are kept so switching back works. @param {ParentNode} [root] */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    if (el.dataset.en === undefined) el.dataset.en = el.textContent || "";
    el.textContent = (lang === "fil" && FIL[el.dataset.i18n || ""]) || el.dataset.en;
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    for (const pair of (el.dataset.i18nAttr || "").split(",")) {
      const [attr, key] = pair.split(":").map((x) => x.trim());
      if (!attr || !key) continue;
      const store = `en${attr.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}`;
      if (el.dataset[store] === undefined) el.dataset[store] = el.getAttribute(attr) || "";
      const en = el.dataset[store] || "";
      el.setAttribute(attr, (lang === "fil" && FIL[key]) || en);
    }
  });
}
