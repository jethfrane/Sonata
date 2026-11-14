// Button audit: press every button on every screen (and every button inside the sheet or menu a
// button opens) and report the ones where nothing at all happens: no change on the page, no sound,
// no navigation, no copy, download, print or share. A button that does nothing is either broken
// or should not be there.
// Run: node tests/serve.mjs 5391 dist, then BASE=http://127.0.0.1:5391 node tests/buttons.e2e.mjs [desktop|phone]
// Needs the localhost-only test hook, so it cannot run against the live site.
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const only = process.argv[2] || "";
const VIEWPORTS = { desktop: { width: 1280, height: 860 }, phone: { width: 390, height: 844 } };
const ROUTES = ["/songs", "/editor", "/chords", "/theory", "/play", "/play/piano", "/play/guitar", "/play/tuner", "/play/metronome", "/play/drums", "/stage"];
const SEL = 'button, a[href], [role="button"], summary, input[type="checkbox"], input[type="radio"]';

const ID = "song-btn-aaaaaaa";
const seed = () => {
  localStorage.clear();
  const body = "# Verse 1\n[G]Amazing grace how [C]sweet the [G]sound\nThat saved a [Em]wretch like [D]me\n\n# Chorus\n[G]I once was lost but [C]now am [G]found\nWas [Em]blind but [D]now I [G]see";
  localStorage.setItem("sonata:v12:songs", JSON.stringify([
    { id: "song-btn-aaaaaaa", title: "Amazing Grace", artist: "Traditional", body, manualKey: "auto", bpm: 90, capo: 2, updatedAt: "2026-09-01T00:00:00.000Z", links: [{ name: "Reference video", url: "https://youtu.be/aqz-KE-bpKQ" }, { name: "Notes", url: "https://example.com/notes" }] },
    { id: "song-btn-bbbbbbb", title: "Second Song", body: "[C]One two [F]three [G]four", manualKey: "auto", updatedAt: "2026-09-02T00:00:00.000Z" }
  ]));
  localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-1", title: "Sunday", items: [{ songId: "song-btn-aaaaaaa" }, { songId: "song-btn-bbbbbbb" }], date: "2026-09-03" }]));
  localStorage.setItem("sonata:v12:active", "song-btn-aaaaaaa");
};

/** Count everything a press can do besides changing the page. Runs before the app's own scripts. */
const hooks = () => {
  const fx = (window.__fx = { n: 0, what: [] });
  const note = (w) => { fx.n++; if (!fx.what.includes(w)) fx.what.push(w); };
  const wrap = (obj, name, w, ret) => { const o = obj?.[name]; if (!o) return; obj[name] = function (...a) { note(w); return ret ? ret() : o.apply(this, a); }; };
  wrap(window.AudioScheduledSourceNode?.prototype, "start", "sound");
  wrap(window.AudioBufferSourceNode?.prototype, "start", "sound"); // sampled instruments: it has its own start()
  wrap(window.AudioContext?.prototype, "resume", "sound");
  wrap(window, "open", "new window", () => null);
  wrap(window, "print", "print", () => undefined);
  wrap(history, "pushState", "address");
  wrap(history, "replaceState", "address");
  wrap(Storage.prototype, "setItem", "saved");
  wrap(Element.prototype, "requestFullscreen", "full screen", () => Promise.resolve());
  wrap(HTMLAnchorElement.prototype, "click", "download");
  wrap(HTMLInputElement.prototype, "click", "file picker", () => undefined);
  wrap(HTMLInputElement.prototype, "showPicker", "file picker", () => undefined);
  wrap(HTMLElement.prototype, "focus", "focus");
  wrap(Element.prototype, "scrollIntoView", "scroll");
  wrap(Element.prototype, "scrollTo", "scroll");
  wrap(window, "scrollTo", "scroll");
  if (navigator.clipboard) { wrap(navigator.clipboard, "writeText", "copy", () => Promise.resolve()); wrap(navigator.clipboard, "write", "copy", () => Promise.resolve()); }
  if (navigator.mediaDevices) wrap(navigator.mediaDevices, "getUserMedia", "microphone", () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })));
  navigator.share = () => { note("share"); return Promise.resolve(); };
  document.addEventListener("DOMContentLoaded", () => new MutationObserver((m) => { fx.n += m.length; if (!fx.what.includes("page")) fx.what.push("page"); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }));
};

/** The visible, enabled controls in `root`, each with a label and a way to find it again. */
const list = (p, rootSel) => p.evaluate(([sel, rootSel]) => {
  const root = rootSel ? document.querySelector(rootSel) : document;
  if (!root) return [];
  const seen = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden], [inert]") && r.bottom > 0 && r.right > 0; };
  return [...root.querySelectorAll(sel)].map((el, i) => ({ el, i })).filter(({ el }) => seen(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true").map(({ el, i }) => ({
    i,
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    label: (el.getAttribute("aria-label") || el.textContent || el.title || el.value || "").trim().replace(/\s+/g, " ").slice(0, 50),
    attrs: [...el.attributes].filter((a) => /^data-|^class$|^href$/.test(a.name)).map((a) => `${a.name}=${a.value}`).join(" ").slice(0, 110),
    external: el.tagName === "A" && /^https?:/.test(el.getAttribute("href") || "") && !(el.getAttribute("href") || "").startsWith(location.origin),
    inSheet: Boolean(el.closest("dialog, .menu, .popover"))
  }));
}, [SEL, rootSel || ""]);

/** Press control number i (as listed) and say what happened. */
async function press(p, i, rootSel) {
  await p.evaluate(() => { window.__fx.n = 0; window.__fx.what = []; });
  const url = p.url();
  const errs = p.errs.length;
  const done = await p.evaluate(([sel, rootSel, i]) => {
    const root = rootSel ? document.querySelector(rootSel) : document;
    const el = root?.querySelectorAll(sel)[i];
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    window.__fx.n = 0; window.__fx.what = [];
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o)); el.dispatchEvent(new MouseEvent("mouseup", o));
    // SVG controls (the circle of fifths) have no click() of their own.
    if (typeof el.click === "function") el.click(); else el.dispatchEvent(new MouseEvent("click", o));
    return true;
  }, [SEL, rootSel || "", i]);
  if (!done) return { missing: true };
  await p.waitForTimeout(450);
  const fx = await p.evaluate(() => ({ n: window.__fx.n, what: window.__fx.what })).catch(() => ({ n: 1, what: ["navigated"] }));
  const what = fx.what.filter((w) => w !== "focus" && w !== "scroll");
  if (p.url() !== url && !what.includes("address")) what.push("address");
  return { what, soft: fx.what, errors: p.errs.slice(errs) };
}

const b = await chromium.launch();
const dead = [], broken = [];
let pressed = 0;
for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  if (only && only !== vpName) continue;
  const ctx = await b.newContext({ viewport });
  await ctx.addInitScript(hooks);
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.goto(BASE + "/songs"); await p.evaluate(seed);
  const fresh = async (route) => { await p.evaluate(seed).catch(() => {}); await p.goto(BASE + route); await p.waitForTimeout(550); };
  for (const route of ROUTES) {
    await fresh(route);
    const top = await list(p);
    console.log(`${vpName} ${route}: ${top.length} controls`);
    for (const c of top) {
      if (c.external) continue; // opens another site in a new tab; nothing to observe here
      await fresh(route);
      const r = await press(p, c.i);
      if (r.missing) continue;
      pressed++;
      const where = `${vpName} ${route}`;
      const name = `${c.tag}${c.id ? "#" + c.id : ""} "${c.label}" [${c.attrs}]`;
      if (r.errors.length) broken.push(`${where}: ${name} → ${r.errors[0]}`);
      if (!r.what.length) dead.push(`${where}: ${name}${r.soft.length ? ` (only ${r.soft.join(", ")})` : ""}`);
      // What it opened: a sheet, a menu or a pop-up. Press everything inside that, too.
      const layer = await p.evaluate(() => (document.querySelector("dialog[open]") ? "dialog[open]" : document.querySelector(".menu:not([hidden])") ? ".menu:not([hidden])" : ""));
      if (!layer) continue;
      const inner = await list(p, layer);
      for (const d of inner) {
        if (d.external) continue;
        await fresh(route);
        const again = await press(p, c.i);
        if (again.missing) break;
        if (!(await p.evaluate((l) => Boolean(document.querySelector(l)), layer))) break;
        const r2 = await press(p, d.i, layer);
        if (r2.missing) continue;
        pressed++;
        const name2 = `${name} › ${d.tag}${d.id ? "#" + d.id : ""} "${d.label}" [${d.attrs}]`;
        if (r2.errors.length) broken.push(`${where}: ${name2} → ${r2.errors[0]}`);
        if (!r2.what.length) dead.push(`${where}: ${name2}${r2.soft.length ? ` (only ${r2.soft.join(", ")})` : ""}`);
      }
    }
  }
  await ctx.close();
}
await b.close();
console.log(`\n${pressed} presses.`);
console.log(`\nThrew an error (${broken.length}):`); for (const x of broken) console.log("  ✗", x);
console.log(`\nDid nothing (${dead.length}):`); for (const x of dead) console.log("  ·", x);
// Some controls are right to do nothing in this fixed state (the option already chosen, a tab already open),
// so this list is for a person to read; only errors fail the run.
process.exit(broken.length ? 1 : 0);
