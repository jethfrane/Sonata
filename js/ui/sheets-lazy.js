// @ts-check
// Thin async entry points so the dialog code (js/ui/sheets.js) loads on first use.

/** @param {string} id */
const call = async (id, /** @type {any[]} */ args) => {
  const m = /** @type {any} */ (await import("./sheets.js"));
  return m[id](...args);
};

/** @param {...any} a */ export const openKeySheet = (...a) => call("openKeySheet", a);
/** @param {...any} a */ export const openDetails = (...a) => call("openDetails", a);
/** @param {string} [setId] */ export const openShare = (setId) => call("openShare", [setId]);
/** @param {string} [id] */ export const openSetlistEditor = (id) => call("openSetlistEditor", [id]);
/** @param {any} data */ export const openImportSet = (data) => call("openImportSet", [data]);
export const openSettings = () => call("openSettings", []);
export const openAccount = () => call("openAccount", []);

/** Print every song in a setlist using the saved print layout. @param {string} id */
export async function printSetlist(id) {
  const { printChart } = await import("./exporter.js");
  let o = { columns: 1, landscape: false };
  try {
    const s = JSON.parse(localStorage.getItem("sonata_export_opts") || "{}");
    o = { columns: [1, 2, 3].includes(s.columns) ? s.columns : 1, landscape: Boolean(s.landscape) };
  } catch { /* defaults */ }
  printChart(o, id);
}
