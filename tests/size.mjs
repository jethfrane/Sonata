// Size budget and build checks. Run after `npm run build` (part of `npm run check`).
// Fails when the first-load script or styles grow past the budget, so new features have to earn their weight.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = { js: 68, css: 19 }; // kB, gzip, first load
const dir = "dist/assets/";
const files = readdirSync(dir);
const kb = (name) => gzipSync(readFileSync(dir + name)).length / 1024;
const js = kb(files.find((f) => /^index-.*\.js$/.test(f)));
const css = kb(files.find((f) => /^index-.*\.css$/.test(f)));
let fail = 0;
const ok = (c, msg) => { console.log(`  ${c ? "✓" : "✗"} ${msg}`); if (!c) fail++; };
ok(js <= BUDGET.js, `first-load script ${js.toFixed(1)} kB gzip (budget ${BUDGET.js})`);
ok(css <= BUDGET.css, `first-load styles ${css.toFixed(1)} kB gzip (budget ${BUDGET.css})`);
const sw = readFileSync("dist/sw.js", "utf8");
ok(sw.includes("sonata-samples") && !/registerRoute\(\/\^\\\/samples/.test(sw) && /url\.pathname|\.pathname\)/.test(sw), "the service worker keeps instrument samples, matched on the path");
ok(!files.some((f) => /jsQR/i.test(f)), "no QR reader library in the build");
process.exit(fail ? 1 : 0);
