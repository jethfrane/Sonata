// Size budget and build checks. Run after `npm run build` (part of `npm run check`).
// Fails when the first-load script or styles grow past the budget, so new features have to earn their weight.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// First load = the entry script plus every chunk the page preloads with it, and the one stylesheet.
// Screens that open later (Play, Theory, Stage, Chords, Help, Backup, Drive) are separate files and don't count.
const BUDGET = { js: 50, css: 19 }; // kB, gzip, first load
const dir = "dist/assets/";
const files = readdirSync(dir);
const kb = (name) => gzipSync(readFileSync(dir + name)).length / 1024;
const html = readFileSync("dist/index.html", "utf8");
const first = [...html.matchAll(/<(?:script[^>]*type="module"[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const js = first.reduce((n, f) => n + kb(f), 0);
const css = kb(files.find((f) => /^index-.*\.css$/.test(f)));
let fail = 0;
const ok = (c, msg) => { console.log(`  ${c ? "✓" : "✗"} ${msg}`); if (!c) fail++; };
ok(js <= BUDGET.js, `first-load script ${js.toFixed(1)} kB gzip in ${first.length} files (budget ${BUDGET.js})`);
const lazy = ["playview", "audio", "theory", "stage", "drive", "help", "backup", "chords", "sheets", "i18n-fil"];
ok(lazy.every((n) => files.some((f) => f.startsWith(n + "-")) && !first.some((f) => f.startsWith(n + "-"))), "Play, audio, Theory, Stage, Drive, Help, Backup, Chords, the dialogs and the Filipino words load on demand, not at start");
ok(["privacy.html", "robots.txt", "sitemap.xml"].every((f) => existsSync("dist/" + f)), "privacy page, robots.txt and sitemap.xml are in the build");
ok(css <= BUDGET.css, `first-load styles ${css.toFixed(1)} kB gzip (budget ${BUDGET.css})`);
const sw = readFileSync("dist/sw.js", "utf8");
ok(sw.includes("sonata-samples") && !/registerRoute\(\/\^\\\/samples/.test(sw) && /url\.pathname|\.pathname\)/.test(sw), "the service worker keeps instrument samples, matched on the path");
ok(!files.some((f) => /jsQR/i.test(f)), "no QR reader library in the build");
process.exit(fail ? 1 : 0);
