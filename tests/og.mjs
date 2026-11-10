// Makes the link-preview images (public/og/*.png, 1200×630) for every kind of page.
// Run: node tests/og.mjs   (needs only Playwright; uses the fonts in node_modules)
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright");
const OUT = fileURLToPath(new URL("../public/og/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(require.resolve(`@fontsource-variable/${pkg}/files/${file}`)).toString("base64")}`;
const INTER = font("inter", "inter-latin-wght-normal.woff2");
const MONO = font("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2");
const ICON = `data:image/svg+xml;base64,${readFileSync(new URL("../public/icons/icon.svg", import.meta.url)).toString("base64")}`;

/** Small visuals per page, drawn in HTML so they stay crisp. */
const chordBox = `<svg viewBox="0 0 120 150" width="210"><rect x="14" y="20" width="92" height="5" rx="2" fill="#1b1b1f"/>${[0, 1, 2, 3, 4].map((r) => `<line x1="16" x2="104" y1="${25 + r * 25}" y2="${25 + r * 25}" stroke="#c9c5bd" stroke-width="2"/>`).join("")}${[0, 1, 2, 3, 4, 5].map((s) => `<line x1="${16 + s * 17.6}" x2="${16 + s * 17.6}" y1="25" y2="125" stroke="#8a8790" stroke-width="2"/>`).join("")}<circle cx="33.6" cy="62" r="8" fill="#3b5bdb"/><circle cx="51.2" cy="62" r="8" fill="#3b5bdb"/><circle cx="68.8" cy="37" r="8" fill="#1b1b1f"/><text x="16" y="14" font-size="12" text-anchor="middle" fill="#8a8790">○</text><text x="86.4" y="14" font-size="12" text-anchor="middle" fill="#8a8790">○</text><text x="104" y="14" font-size="12" text-anchor="middle" fill="#8a8790">○</text></svg>`;
const chart = `<div class="chart"><span class="sec">VERSE 1</span><b>G&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;D/F♯&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Em</b><span>Amazing grace, how sweet</span><b>C&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;G</b><span>the sound that saved</span></div>`;
const circle = `<svg viewBox="0 0 200 200" width="300">${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 - 105) * Math.PI / 180, b = ((i + 1) * 30 - 105) * Math.PI / 180, R = 96, r = 48; const p = (ang, rad) => `${100 + rad * Math.cos(ang)} ${100 + rad * Math.sin(ang)}`; return `<path d="M${p(a, r)} L${p(a, R)} A${R} ${R} 0 0 1 ${p(b, R)} L${p(b, r)} A${r} ${r} 0 0 0 ${p(a, r)}Z" fill="${i === 0 ? "#3b5bdb" : i === 11 || i === 1 ? "#cbd4fa" : "#efede8"}" stroke="#fff" stroke-width="2"/>`; }).join("")}<text x="100" y="110" text-anchor="middle" font-size="30" font-weight="800" fill="#1b1b1f">C</text></svg>`;
const keys = `<svg viewBox="0 0 280 110" width="420">${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 20}" y="0" width="19" height="108" rx="3" fill="${[0, 2, 4].includes(i) ? "#9fb0f5" : "#fff"}" stroke="#c9c5bd"/>`).join("")}${[1, 2, 4, 5, 6, 8, 9, 11, 12, 13].map((i) => `<rect x="${i * 20 - 6}" y="0" width="12" height="66" rx="2" fill="#222228"/>`).join("")}</svg>`;
const tuner = `<svg viewBox="0 0 240 140" width="360"><path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="#e9e7e2" stroke-width="16" stroke-linecap="round"/><path d="M105 22 A100 100 0 0 1 135 22" fill="none" stroke="#5bd38c" stroke-width="16"/><line x1="120" y1="120" x2="124" y2="34" stroke="#3b5bdb" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="120" r="9" fill="#3b5bdb"/></svg>`;
const metro = `<div class="bpm">72<small>BPM</small></div><div class="dots"><i class="on"></i><i></i><i></i><i></i></div>`;
const list = `<div class="list">${[["G", "Here I Am to Worship", "Worship"], ["Am", "Buwan", "OPM"], ["C", "Perfect", "Pop"], ["E", "Way Maker", "Worship"]].map(([k, t, g]) => `<div class="li"><span class="kb">${k}</span><span>${t}<small>${g}</small></span><em>Request</em></div>`).join("")}</div>`;
const qr = `<div class="qrbox">${Array.from({ length: 81 }, (_, i) => `<i class="${[0, 1, 2, 9, 11, 18, 19, 20, 6, 7, 8, 15, 17, 24, 25, 26, 54, 55, 56, 63, 65, 72, 73, 74, 30, 40, 31, 50, 41, 60, 33, 43, 49, 67, 69, 77].includes(i) ? "d" : ""}"></i>`).join("")}</div>`;

const PAGES = {
  home: ["Chord charts & music tools", "Write, transpose and present. Free, offline, no account.", chart],
  songs: ["Your songs & setlists", "Every chart and setlist, searchable and ready for Sunday.", list.replace(/Request/g, "")],
  editor: ["Chart editor", "Chords above the words or inline. Transpose with one tap.", chart],
  song: ["A chord chart for you", "Open it in Sonata to transpose, play along and present.", chart],
  setlist: ["A setlist for you", "Every song in order. Open in Sonata and present.", list.replace(/Request/g, "")],
  stage: ["Stage view", "Big text, auto-scroll and a metronome for the stage.", chart],
  chords: ["Chord finder", "Any chord on guitar, ukulele, bass and piano.", chordBox + keys.replace('width="420"', 'width="300"')],
  theory: ["Circle of fifths", "Keys, chords of the key, slash chords and more.", circle],
  play: ["Play", "Piano, fretboard, tuner and metronome.", keys],
  piano: ["Piano", "Play scales and chords in any key.", keys],
  guitar: ["Guitar fretboard", "Chords and scales on guitar, bass and ukulele.", chordBox],
  tuner: ["Tuner", "Tune guitar, bass or ukulele with your phone.", tuner],
  metronome: ["Metronome", "Steady time with tap tempo, 2/4 to 12/8.", metro],
  bank: ["Song Bank", "Browse the songs and read a chart in your key.", list + qr]
};

const css = `@font-face{font-family:I;src:url(${INTER});font-weight:100 900}@font-face{font-family:M;src:url(${MONO});font-weight:100 900}
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;font-family:I;background:#f6f5f2;color:#1b1b1f;display:grid;grid-template-columns:1fr 470px;align-items:center;gap:36px;padding:70px 76px;position:relative}
body:before{content:"";position:absolute;inset:0 0 auto 0;height:10px;background:#3b5bdb}
.brand{display:flex;align-items:center;gap:16px;font-weight:800;font-size:34px;letter-spacing:-.03em;margin-bottom:46px}.brand img{width:62px;height:62px;border-radius:16px}
h1{font-size:68px;line-height:1.02;letter-spacing:-.045em;font-weight:820}p{margin-top:22px;font-size:29px;line-height:1.35;color:#4b4a52;max-width:560px}
.art{display:grid;place-items:center;gap:20px;background:#fff;border:2px solid #e5e2dc;border-radius:28px;min-height:400px;padding:30px}
.chart{display:grid;gap:4px;font-family:M;font-size:24px}.chart b{color:#2f49b3}.sec{justify-self:start;font:800 15px I;letter-spacing:.08em;background:#edf0fe;color:#2c47b5;padding:5px 12px;border-radius:7px;margin-bottom:8px}
.list{display:grid;gap:10px;width:100%}.li{display:flex;align-items:center;gap:14px;font-weight:650;font-size:21px;padding:10px 12px;border:2px solid #efede8;border-radius:14px}.li small{display:block;font-size:15px;color:#77757e;font-weight:500}.li span:nth-child(2){flex:1}
.kb{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:#edf0fe;color:#2c47b5;font:800 18px M}.li em{font-style:normal;font-size:15px;background:#3b5bdb;color:#fff;padding:6px 12px;border-radius:999px}
.bpm{font:800 120px M;letter-spacing:-.04em;display:grid;justify-items:center}.bpm small{font:800 20px I;letter-spacing:.2em;color:#77757e}.dots{display:flex;gap:16px}.dots i{width:24px;height:24px;border-radius:50%;background:#e9e7e2}.dots i.on{background:#3b5bdb;transform:scale(1.3)}
.qrbox{display:grid;grid-template-columns:repeat(9,12px);gap:0;position:absolute;right:96px;bottom:84px;padding:10px;background:#fff;border:2px solid #e5e2dc;border-radius:12px}.qrbox i{width:12px;height:12px}.qrbox i.d{background:#1b1b1f}
.url{position:absolute;left:76px;bottom:46px;font-size:22px;font-weight:600;color:#8a8790}`;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, [title, sub, art]] of Object.entries(PAGES)) {
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div><div class="brand"><img src="${ICON}" alt="">Sonata</div><h1>${title}</h1><p>${sub}</p></div><div class="art">${art}</div><span class="url">sonata.jethrofrane.xyz</span></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}.png`, type: "png" });
}
await b.close();
console.log(`wrote ${Object.keys(PAGES).length} images to public/og/`);
