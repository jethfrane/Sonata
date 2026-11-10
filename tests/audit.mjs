// Layout audit: screenshots every screen and state at several widths, and checks each one for
// horizontal overflow, controls off screen, tap targets under 44px (touch widths) and axe issues.
// Run against the built app: npm run build && npm run serve:dist, then
//   OUT=/path/to/folder BASE=http://127.0.0.1:5391 node tests/audit.mjs
// Writes <OUT>/<width>/<state>.png and <OUT>/report.json. Exits 1 if a hard check fails
// (page overflow, element off screen, page error) unless AUDIT_SOFT=1.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const OUT = process.env.OUT || fileURLToPath(new URL("../audit-out/", import.meta.url));
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

const VIEWPORTS = [
  { name: "360", width: 360, height: 740, touch: true },
  { name: "390", width: 390, height: 844, touch: true },
  { name: "landscape", width: 844, height: 390, touch: true },
  { name: "768", width: 768, height: 1024, touch: true },
  { name: "1024", width: 1024, height: 768, touch: true },
  { name: "1440", width: 1440, height: 900, touch: false }
];

const LONG = "## Verse 1\nG           G/B       C        G\nAmazing grace, how sweet the sound\nG                   Em      D\nThat saved a wretch like me\nG            G/B        C          G\nI once was lost, but now am found\nG         Em      D         G\nWas blind but now I see\n\n## Chorus\n> All in, full band\n[C]My chains are [G]gone, I've been set [D]free\nMy [Em]God, my [C]Savior has [G]ransomed [D]me\nAnd [C]like a flood His [G]mercy [Em]reigns\nUn[C]ending [G]love, a[D]mazing [G]grace\n\n## Bridge\nC///  G/B///  Am7///  G///\n// Drums build here\nC  D  Em  G/D  C  D  G\n";

/** @param {number} n */
function library(n) {
  const now = Date.now();
  const songs = Array.from({ length: n }, (_, i) => ({
    id: `song-a-${i}`, title: i === 0 ? "Amazing Grace (My Chains Are Gone) — extended worship version" : `Song number ${i + 1}`,
    artist: i % 3 ? "Chris Tomlin" : "Hillsong Worship United and Friends", manualKey: ["G:major", "C:major", "A:minor", "Eb:major"][i % 4],
    transpose: 0, capo: 0, bpm: 72, creator: "", description: "", links: i === 0 ? [{ name: "Reference", url: "https://example.com/watch" }] : [], isFavorite: i % 5 === 0,
    body: i === 0 ? LONG : "## Verse\nC        Am\nWords here\n",
    createdAt: new Date(now - i * 864e5).toISOString(), updatedAt: new Date(now - i * 36e5).toISOString(), lastOpenedAt: new Date(now - i * 36e5).toISOString()
  }));
  const setlists = n ? [{ id: "set-1", title: "Sunday service, November 9 (morning + evening)", description: "", items: songs.slice(0, 4).map((s) => ({ songId: s.id })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] : [];
  return { songs, setlists };
}

/** Each state: seed size, path, and steps to reach it. */
const STATES = [
  { name: "welcome", n: 0, path: "/songs" },
  { name: "songs", n: 40, path: "/songs" },
  { name: "songs-nomatch", n: 40, path: "/songs", run: async (p) => { await p.fill("#librarySearch", "zzzz"); } },
  { name: "setlists", n: 40, path: "/songs", run: async (p) => { await p.click('[data-filter="setlists"]'); } },
  { name: "setlists-empty", n: 3, path: "/songs", run: async (p) => { await p.evaluate(() => { const s = window.__sonata.store; s.setlists = []; s.changed("library"); }); await p.click('[data-filter="setlists"]'); } },
  { name: "chart-edit", n: 40, path: "/editor" },
  { name: "chart-view", n: 40, path: "/editor", run: async (p) => { const b = p.locator('[data-pane="preview"]'); if (await b.isVisible()) await b.click(); } },
  { name: "chart-new", n: 40, path: "/songs", run: async (p) => { await p.click("#newSongBtn"); } },
  { name: "chart-setlist", n: 40, path: "/songs", run: async (p) => { await p.click('[data-filter="setlists"]'); await p.click('[data-act="set-open"]'); } },
  { name: "theory", n: 40, path: "/theory" },
  { name: "play-piano", n: 40, path: "/play/piano" },
  { name: "play-guitar", n: 40, path: "/play/guitar" },
  { name: "play-tuner", n: 40, path: "/play/tuner" },
  { name: "play-metronome", n: 40, path: "/play/metronome" },
  { name: "stage", n: 40, path: "/editor", run: async (p) => { await p.click("#presentBtn"); } },
  { name: "stage-setlist", n: 40, path: "/songs", run: async (p) => { await p.click('[data-filter="setlists"]'); await p.click('[data-act="set-play"]'); } },
  { name: "sheet-key", n: 40, path: "/editor", run: async (p) => { await p.click("#keyPill"); } },
  { name: "sheet-share", n: 40, path: "/editor", run: async (p) => { await p.click("#shareSongBtn"); await p.waitForTimeout(500); } },
  { name: "sheet-details", n: 40, path: "/editor", run: async (p) => { await p.click("#detailsBtn"); } },
  { name: "sheet-settings", n: 40, path: "/songs", run: async (p) => { await p.click("#settingsBtn"); } },
  { name: "sheet-drive", n: 40, path: "/songs", run: async (p) => { await p.click("#accountBtn"); } },
  { name: "sheet-song-menu", n: 40, path: "/songs", run: async (p) => { await p.click('[data-act="more"]'); } },
  { name: "sheet-setlist-edit", n: 40, path: "/songs", run: async (p) => { await p.click("#newSetlistBtn"); } },
  { name: "toast-update", n: 40, path: "/editor", run: async (p) => {
    // Same markup as toast(): the real prompt only appears when a new service worker waits.
    await p.evaluate(() => { const h = document.getElementById("toasts"); h.innerHTML = `<div class="toast toast-info"><svg class="icon"></svg><span>A new version of Sonata is ready.</span><button type="button" class="toast-action">Reload</button></div>`; });
  } },
  { name: "offline", n: 40, path: "/songs", offline: true },
  // v4 screens
  { name: "chords", n: 40, path: "/chords/Am7" },
  { name: "chords-slash", n: 40, path: "/chords/D-over-F%23" },
  { name: "chord-sheet", n: 40, path: "/editor", run: async (p) => { const v = p.locator('button[data-pane="preview"]'); if (await v.isVisible()) await v.click(); await p.click("#preview .ch >> nth=1"); } },
  { name: "theory-slash", n: 40, path: "/theory", run: async (p) => { await p.selectOption("#theoryType", "slash"); } },
  { name: "songs-bank", n: 40, path: "/songs", run: async (p) => { await p.evaluate(() => { const s = window.__sonata.store; s.songs.slice(0, 6).forEach((x) => { x.inBank = true; x.genre = "OPM"; }); s.changed("library"); }); await p.click('[data-filter="bank"]'); } },
  { name: "bank-manager", n: 40, path: "/songs", run: async (p) => { await p.click('[data-filter="bank"]'); await p.click('[data-act="bank"]'); } },
  { name: "links-import", n: 40, path: "/songs", run: async (p) => { await p.click("#addLinksBtn"); } },
  { name: "youtube", n: 40, path: "/editor", run: async (p) => { await p.evaluate(() => { const s = window.__sonata.store; s.update(s.active(), { links: [{ name: "Reference video", url: "https://youtu.be/dQw4w9WgXcQ" }] }); }); await p.waitForTimeout(200); await p.click(".yt-chip"); } },
  { name: "bank-public", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "plain" },
  { name: "bank-stage", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "stage" },
  { name: "bank-sunrise", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "sunrise" },
  { name: "bank-long", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "long" },
  { name: "bank-chart", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "stage", run: async (p) => { await p.click('.bank-list [data-bk="view"] >> nth=0'); } },
  { name: "bank-pay", n: 0, path: "/bank/1AbCdEfGhIjKlMnOpQrStUvWxYz012345", bank: "plain", run: async (p) => { await p.click('[data-bk="pay"] >> nth=0'); } },
  { name: "bank-manager-style", n: 40, path: "/songs", run: async (p) => { await p.click('[data-filter="bank"]'); await p.click('[data-act="bank"]'); await p.locator("#beGigAdd").scrollIntoViewIfNeeded(); await p.click("#beGigAdd"); await p.click('[data-preset="stage"]'); await p.locator(".be-look").scrollIntoViewIfNeeded(); } }
];
const BANK = { type: "sonata-bank", v: 1, title: "Jethro's Song Bank", name: "Jethro Frane", bio: "OPM, pop and worship. Catch me live every Friday!", socials: { instagram: "jethrofrane", tiktok: "jethrofrane", facebook: "jethro.frane", youtube: "@jethrofrane", email: "j@example.com" }, payments: [{ label: "GCash", name: "J. F.", qr: "00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO83CHRN5204601653036085802PH5912JETHRO FRANE6011Quezon City6304ABCD" }, { label: "Maya", name: "J. F.", qr: "00020101021127830012com.p2pqrpay0111PAPHPHM1XXX02089996440303152170200000006560417DWQM4TK3JDO83CHRN5204601653036085802PH5912JETHRO FRANE6011Quezon City6304ABCD" }], updatedAt: "2026-11-09",
  songs: Array.from({ length: 30 }, (_, i) => ({ id: "b" + i, t: ["Buwan", "Perfect", "Mundo", "Way Maker", "Tadhana", "Hallelujah"][i % 6] + (i > 5 ? " " + i : ""), a: ["Juan Karlos", "Ed Sheeran", "IV of Spades", "Sinach", "Up Dharma Down", "Leonard Cohen"][i % 6], g: ["OPM", "Pop", "OPM", "Worship", "OPM", "Ballad"][i % 6], k: ["Am", "G", "C", "E", "D", "C"][i % 6], b: i % 2 ? "" : "Am  F  C  G\nIkaw ang buwan" })) };

const browser = await chromium.launch();
/** A real small JPEG for the cover picture. */
const COVER = await (async () => { const c = await browser.newContext(); const pg = await c.newPage(); const d = await pg.evaluate(() => { const cv = document.createElement("canvas"); cv.width = 960; cv.height = 320; const x = cv.getContext("2d"); const g = x.createLinearGradient(0, 0, 960, 320); g.addColorStop(0, "#f59e0b"); g.addColorStop(1, "#be185d"); x.fillStyle = g; x.fillRect(0, 0, 960, 320); return cv.toDataURL("image/jpeg", 0.7); }); await c.close(); return d; })();
const GIGS = [{ date: "2099-01-05", time: "19:30", place: "Plaza Miranda, Quiapo", note: "Acoustic set, free entry", url: "https://example.com/gig" }, { date: "2099-02-14", place: "Cafe Uno", note: "", url: "" }];
const BANKS = {
  plain: { ...BANK, v: 3, gigs: GIGS },
  stage: { ...BANK, v: 3, gigs: GIGS, theme: { preset: "stage", accent: "#e11d48", font: "classic", cover: "" } },
  sunrise: { ...BANK, v: 3, gigs: GIGS, theme: { preset: "sunrise", accent: "#0d9488", font: "rounded", cover: COVER } },
  long: { ...BANK, v: 3, gigs: GIGS, title: "Sunday Worship Team — Grace Fellowship Church Quezon City Music Ministry", name: "Grace Fellowship Church Music Ministry & Friends", bio: "We serve with worship every Sunday and weddings, debuts, birthdays and corporate events in Metro Manila and nearby provinces.", socials: { instagram: "gracefellowshipqcmusic", tiktok: "gracefellowshipqc", facebook: "gracefellowshipqc", youtube: "@gracefellowshipqc", website: "https://gracefellowshipqc.example.com/music-ministry", email: "musicministry@gracefellowshipqc.example.com" }, theme: { preset: "ocean", accent: "#ffee00", font: "modern", cover: COVER } }
};
mkdirSync(OUT, { recursive: true });
const report = [];
let hard = 0;

for (const vp of VIEWPORTS) {
  mkdirSync(`${OUT}/${vp.name}`, { recursive: true });
  for (const st of STATES) {
    if (ONLY && !ONLY.includes(st.name)) continue;
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 1000, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    if (st.bank) await page.route("**/api/bank?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BANKS[st.bank === true ? "plain" : st.bank]) }));
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    await page.goto(BASE + "/songs");
    await page.evaluate(({ lib }) => {
      localStorage.clear();
      localStorage.setItem("sonata:v12:songs", JSON.stringify(lib.songs));
      localStorage.setItem("sonata:v12:setlists", JSON.stringify(lib.setlists));
      if (lib.songs.length) localStorage.setItem("sonata:v12:active", lib.songs[0].id);
      localStorage.setItem("sonata:v12:settings", JSON.stringify({ buddy: false }));
    }, { lib: library(st.n) });
    if (st.offline) {
      // Install the service worker (local opt-in ?sw), wait until it controls the page, then cut the network.
      await page.goto(BASE + st.path + "?sw");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })); }).catch((e) => errors.push("sw: " + e.message));
      await ctx.setOffline(true);
    }
    await page.goto(BASE + st.path).catch((e) => errors.push("load: " + String(e.message).split("\n")[0]));
    await page.waitForTimeout(400);
    try { if (st.run) await st.run(page); } catch (e) { errors.push("step: " + String(e.message || e).split("\n")[0]); }
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${vp.name}/${st.name}.png`, animations: "disabled" });
    const m = await page.evaluate(({ touch }) => {
      const vw = document.documentElement.clientWidth;
      const vh = innerHeight;
      const visible = (el) => { const s = getComputedStyle(el); if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      /** Inside something that scrolls sideways on purpose (chord bar, piano). */
      const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
      const label = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${el.dataset.act ? `[act=${el.dataset.act}]` : ""}${el.textContent?.trim() ? ` "${el.textContent.trim().slice(0, 24)}"` : el.getAttribute("aria-label") ? ` (${el.getAttribute("aria-label")})` : ""}`;
      const modal = document.querySelector("dialog[open]");
      const stage = document.getElementById("stage");
      const scope = modal || (stage && !stage.hidden ? stage : document.body);
      const ctrls = [...scope.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=tab], summary, label.btn")].filter(visible);
      const offscreen = [], small = [];
      for (const el of ctrls) {
        const r = el.getBoundingClientRect();
        if (!inScroller(el) && (r.right > vw + 1 || r.left < -1)) offscreen.push(label(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
        // Piano keys and fret cells are instrument surfaces with their own geometry.
        if (touch && !el.closest(".skip-link, .pk, .fc") && el.type !== "range" && (r.width < 44 || r.height < 44) && !(el.tagName === "INPUT" && (el.type === "checkbox")) && !el.closest(".chart-input")) small.push(label(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      // Text that is cut off (ellipsis is allowed only where text-overflow says so).
      const clipped = [...scope.querySelectorAll("h1,h2,h3,strong,button span,label,p")].filter(visible).filter((el) => el.getBoundingClientRect().width > 2 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== "ellipsis" && getComputedStyle(el).overflow !== "visible").map(label).slice(0, 10);
      // Content hidden behind the bottom bar at the end of the page.
      const nav = document.querySelector(".bottom-nav");
      const navH = nav && visible(nav) ? nav.getBoundingClientRect().height : 0;
      return {
        docOverflow: document.documentElement.scrollWidth - vw,
        offscreen: offscreen.slice(0, 15), small: small.slice(0, 40), smallCount: small.length, clipped,
        navH, scrollH: document.documentElement.scrollHeight, vh,
        dialogOverflowY: modal ? modal.scrollHeight > modal.clientHeight + 2 : false,
        dialogHeight: modal ? Math.round(modal.getBoundingClientRect().height) : 0
      };
    }, { touch: vp.touch });
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((x) => x.target.join(" ")) }));
    });
    const row = { vp: vp.name, state: st.name, errors, axe, ...m };
    if (m.docOverflow > 0 || m.offscreen.length || errors.length) hard++;
    report.push(row);
    const flags = [m.docOverflow > 0 && `overflow+${m.docOverflow}`, m.offscreen.length && `offscreen ${m.offscreen.length}`, m.smallCount && `small ${m.smallCount}`, axe.length && `axe ${axe.map((a) => a.id).join(",")}`, errors.length && `errors ${errors.length}`, m.clipped.length && `clipped ${m.clipped.length}`].filter(Boolean);
    console.log(`${vp.name.padEnd(9)} ${st.name.padEnd(20)} ${flags.join(" | ") || "ok"}`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n${report.length} states, ${hard} with hard failures. Report: ${OUT}/report.json`);
if (hard && !process.env.AUDIT_SOFT) process.exit(1);
