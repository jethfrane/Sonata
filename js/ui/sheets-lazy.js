// @ts-check
// Thin async entry points so the dialog code (js/ui/sheets.js) loads on first use.
import { toast } from "./dom.js";
import { t } from "./i18n.js";

/**
 * Load a lazy chunk. After a new release, a tab that was open before it can't find the old
 * file names any more; say so and offer a reload instead of doing nothing.
 * @template T @param {() => Promise<T>} load @returns {Promise<T|null>}
 */
async function chunk(load) {
  try { return await load(); } catch {
    toast(t("loadFailed", "Couldn't load this screen. Check your connection, or reload to get the latest version."), "error", { ms: 9000, action: t("reload", "Reload"), onAction: () => location.reload() });
    return null;
  }
}

/** @param {string} id @param {any[]} args */
const call = async (id, args) => {
  const m = /** @type {any} */ (await chunk(() => import("./sheets.js")));
  return m ? m[id](...args) : undefined;
};

/** @param {...any} a */ export const openKeySheet = (...a) => call("openKeySheet", a);
/** @param {...any} a */ export const openDetails = (...a) => call("openDetails", a);
/** @param {string} [setId] */ export const openShare = (setId) => call("openShare", [setId]);
/** @param {string} [id] */ export const openSetlistEditor = (id) => call("openSetlistEditor", [id]);
/** @param {any} data */ export const openImportSet = (data, /** @type {string} */ source = "") => call("openImportSet", [data, source]);
export const openSettings = () => call("openSettings", []);
/** QR encoder (loaded on first use). */
export const loadQr = () => chunk(() => import("../lib/qr.js"));
/** Play: instruments, tuner, metronome, drums and the audio engine. */
export const playModule = () => chunk(() => import("./playview.js"));
/** Circle of fifths. */
export const theoryModule = () => chunk(() => import("./theory.js"));
/** Stage view. */
export const stageModule = () => chunk(() => import("./stage.js"));
/** Google Drive backup. */
export const driveModule = () => chunk(() => import("../drive.js"));
/** Backup and restore. */
export const openBackup = async () => (await chunk(() => import("./backup.js")))?.openBackup();
/** Help and the guided tour. */
export const helpModule = () => chunk(() => import("./help.js"));
export const openHelp = async () => (await helpModule())?.openHelp();
export const startTour = async () => (await helpModule())?.startTour();
/** Chords screen and chord pop-ups. */
export const chordsModule = () => chunk(() => import("./chords.js"));
/** Song Bank: manager and public page. */
export const bankModule = () => chunk(() => import("./bank.js"));
/** @param {string} name */ export const openChordSheet = async (name) => (await chordsModule())?.openChordSheet(name);
export const openBankManager = async () => (await bankModule())?.openBankManager();
export const openLinksImport = (/** @type {string} */ text = "") => call("openLinksImport", [text]);

/** Print every song in a setlist using the saved print layout. @param {string} id */
export async function printSetlist(id) {
  const m = await chunk(() => import("./exporter.js"));
  if (!m) return;
  let o = { columns: 1, landscape: false };
  try {
    const s = JSON.parse(localStorage.getItem("sonata_export_opts") || "{}");
    o = { columns: [1, 2, 3].includes(s.columns) ? s.columns : 1, landscape: Boolean(s.landscape) };
  } catch { /* defaults */ }
  m.printChart(o, id);
}
