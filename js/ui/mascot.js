// @ts-check
// Sona: a small blue pixel musician who wanders along the bottom of the
// screen, bobs to the metronome, and shares a tip when tapped.

import { t, getLang } from "./i18n.js";
import { store, app } from "./ctx.js";

const C = { body: "#4F8BFF", shade: "#2F68DD", light: "#A9C8FF", ink: "#0F1B3D", phones: "#1E293B", cup: "#FACC15", wood: "#F59E0B", woodDark: "#B45309", neck: "#7C4A1E" };

/** @typedef {{ eyes: "open"|"blink"|"happy"|"sleep", legs: 0|1|2, arm: "down"|"up"|"strum", guitar: boolean }} Pose */

/** @type {Map<string, string>} */
const cache = new Map();
/** @param {Pose} p */
function sprite(p) {
  const key = `${p.eyes}${p.legs}${p.arm}${p.guitar}`;
  const hit = cache.get(key);
  if (hit) return hit;
  /** @type {string[]} */
  const r = [];
  const R = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ c) => r.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  // headphones band
  R(6, 0, 12, 1, C.phones); R(5, 1, 1, 3, C.phones); R(18, 1, 1, 3, C.phones);
  // body
  R(5, 3, 14, 10, C.body);
  R(6, 4, 3, 3, C.light);
  R(5, 12, 14, 1, C.shade);
  // ear cups
  R(3, 5, 2, 4, C.phones); R(19, 5, 2, 4, C.phones); R(3, 6, 1, 2, C.cup); R(20, 6, 1, 2, C.cup);
  // eyes
  if (p.eyes === "blink") { R(8, 8, 2, 1, C.ink); R(14, 8, 2, 1, C.ink); }
  else if (p.eyes === "sleep") { R(8, 8, 2, 1, C.ink); R(14, 8, 2, 1, C.ink); R(9, 9, 1, 0.5, C.ink); }
  else if (p.eyes === "happy") { R(8, 7, 2, 1, C.ink); R(7, 8, 1, 1, C.ink); R(10, 8, 1, 1, C.ink); R(14, 7, 2, 1, C.ink); R(13, 8, 1, 1, C.ink); R(16, 8, 1, 1, C.ink); }
  else { R(8, 6, 2, 3, C.ink); R(14, 6, 2, 3, C.ink); }
  // legs
  const legX = p.legs === 1 ? [6, 9, 13, 16].map((x, i) => x + (i % 2 ? 1 : 0)) : p.legs === 2 ? [6, 9, 13, 16].map((x, i) => x + (i % 2 ? 0 : 1)) : [6, 9, 13, 16];
  for (const x of legX) R(x, 13, 2, 3, C.body);
  if (p.guitar) {
    // guitar across the body: body bottom-left, neck up to the right
    R(4, 10, 5, 4, C.wood); R(5, 9, 3, 1, C.wood); R(5, 14, 3, 1, C.woodDark); R(6, 11, 1, 1, C.woodDark);
    R(9, 10, 2, 1, C.neck); R(11, 9, 2, 1, C.neck); R(13, 8, 2, 1, C.neck); R(15, 7, 2, 1, C.neck); R(17, 6, 2, 1, C.ink);
  }
  // arms
  R(2, 9, 3, 2, C.shade);
  if (p.arm === "up") R(19, 6, 3, 2, C.shade);
  else if (p.arm === "strum") R(18, 11, 3, 2, C.shade);
  else R(19, 9, 3, 2, C.shade);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" shape-rendering="crispEdges">${r.join("")}</svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  cache.set(key, url);
  return url;
}

/** @type {Record<string, { en: string[], fil: string[] }>} */
const TIPS = {
  songs: {
    en: ["Tap the star to keep a song in Favorites.", "Setlists play in order on stage. Swipe through them with the arrows.", "Search finds lyrics too, not just titles."],
    fil: ["I-tap ang bituin para mapunta sa Paborito ang kanta.", "Sunod-sunod tumutugtog ang setlist sa stage. Gamitin ang mga arrow.", "Pati liriko nahahanap ng search, hindi lang pamagat."]
  },
  editor: {
    en: ["Write chords on the line above the words. I'll keep them lined up.", "Tap a chord chip to drop it right where your cursor is.", "Numbers view turns your chords into Nashville numbers. Great for any key!", "Use − and + by the key to transpose for your singer."],
    fil: ["Isulat ang chords sa linya sa itaas ng liriko. Ako na ang mag-aayos.", "I-tap ang chord chip para ilagay kung nasaan ang cursor mo.", "Ginagawang Nashville numbers ng Numbers view ang chords mo. Pang-kahit anong key!", "Gamitin ang − at + sa tabi ng key para i-transpose para sa singer."]
  },
  tools: {
    en: ["Capo on? I'll show the shapes you actually play.", "Tap tempo four times and I'll find the BPM.", "Share links carry the whole song. No account needed."],
    fil: ["May capo? Ipapakita ko ang hugis na tutugtugin mo.", "I-tap ang tempo nang apat na beses at hahanapin ko ang BPM.", "Kasama na ang buong kanta sa share link. Walang account na kailangan."]
  },
  theory: {
    en: ["The three wedges around your key are the chords that just work: I, IV and V.", "Tap any wedge to hear the chord.", "Relative minor shares all the same notes. Try it for a moody bridge!"],
    fil: ["Ang tatlong wedge sa paligid ng key mo ang mga chord na swak: I, IV at V.", "I-tap ang kahit anong wedge para marinig ang chord.", "Pareho ng nota ang relative minor. Subukan sa malungkot na bridge!"]
  },
  play: {
    en: ["Tap a chord from your song to see it on piano and fretboard.", "Hold a key to let it ring. Slide across to glide.", "Tuner tip: tune up to the note, not down."],
    fil: ["I-tap ang chord mula sa kanta para makita sa piano at fretboard.", "Pindutin nang matagal para tumunog. I-slide para dumulas.", "Tip sa tuner: itaas papunta sa nota, huwag pababa."]
  }
};

export function initMascot() {
  const root = document.createElement("div");
  root.className = "sona";
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = `<div class="sona-notes" aria-hidden="true"></div><button type="button" class="sona-body" aria-label="Sona, your music buddy"><span class="sona-sprite"></span><span class="sona-shadow"></span></button>
    <div class="sona-bubble" role="status" hidden><p class="sona-text"></p><div class="sona-actions"><button type="button" class="sona-next"></button><button type="button" class="sona-hide"></button></div></div>`;
  document.body.appendChild(root);
  const spriteEl = /** @type {HTMLElement} */ (root.querySelector(".sona-sprite"));
  const bubble = /** @type {HTMLElement} */ (root.querySelector(".sona-bubble"));
  const notes = /** @type {HTMLElement} */ (root.querySelector(".sona-notes"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {Pose} */
  const pose = { eyes: "open", legs: 0, arm: "down", guitar: false };
  let x = Math.max(16, window.innerWidth - 120);
  let target = x;
  let facing = -1;
  /** @type {"idle"|"walk"|"play"|"sleep"|"hop"} */
  let state = /** @type {any} */ ("idle");
  let stateUntil = performance.now() + 2500;
  let lastTouch = performance.now();
  let frame = 0;
  let tipIndex = 0;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let bubbleTimer;

  const width = () => (window.innerWidth < 720 ? 44 : 60);
  const range = () => {
    const w = width();
    const max = window.innerWidth - w - 14;
    return window.innerWidth < 720 ? [Math.max(14, window.innerWidth * 0.55), max] : [16, max];
  };
  const draw = () => {
    spriteEl.style.backgroundImage = sprite(pose);
    root.style.setProperty("--x", `${Math.round(x)}px`);
    root.style.setProperty("--w", `${width()}px`);
    root.style.setProperty("--face", String(facing));
    root.dataset.state = state;
  };
  const visible = () => store.settings.buddy && !document.body.classList.contains("stage-open");
  const sync = () => { root.hidden = !visible(); };

  /** @param {typeof state} s @param {number} ms */
  const enter = (s, ms) => { state = s; stateUntil = performance.now() + ms; };

  const floatNote = () => {
    const n = document.createElement("span");
    n.className = "sona-note";
    n.textContent = ["♪", "♫", "♩"][Math.floor(Math.random() * 3)];
    n.style.left = `${20 + Math.random() * 60}%`;
    notes.appendChild(n);
    setTimeout(() => n.remove(), 1600);
  };

  const think = () => {
    const now = performance.now();
    if (state === "sleep") return;
    if (now - lastTouch > 60_000 && state === "idle") { enter("sleep", 1e9); pose.eyes = "sleep"; pose.guitar = false; return; }
    if (now < stateUntil) return;
    const [lo, hi] = range();
    const roll = Math.random();
    if (!reduced && roll < 0.45) { target = lo + Math.random() * (hi - lo); enter("walk", 9000); }
    else if (roll < 0.7) { enter("play", 3500 + Math.random() * 2500); pose.guitar = true; }
    else { enter("idle", 2500 + Math.random() * 3500); pose.guitar = false; }
  };

  let lastT = performance.now();
  const loop = (/** @type {number} */ now) => {
    const dt = Math.min(100, now - lastT) / 1000;
    lastT = now;
    frame++;
    if (!root.hidden) {
      think();
      const [lo, hi] = range();
      if (state === "walk") {
        const dir = Math.sign(target - x);
        facing = dir || facing;
        x += dir * Math.min(Math.abs(target - x), (window.innerWidth < 720 ? 22 : 34) * dt);
        if (frame % 8 === 0) pose.legs = pose.legs === 1 ? 2 : 1;
        if (Math.abs(target - x) < 1) { enter("idle", 2000 + Math.random() * 2000); pose.legs = 0; }
      } else if (!metronome.running) pose.legs = 0;
      if (state === "play") { pose.arm = Math.floor(now / 220) % 2 ? "strum" : "down"; if (frame % 40 === 0) floatNote(); }
      else if (state !== "hop") pose.arm = "down";
      if (state !== "sleep" && state !== "hop") pose.eyes = Math.floor(now / 3200) % 9 === 0 && now % 3200 < 160 ? "blink" : "open";
      if (state === "sleep" && frame % 90 === 0) { const z = document.createElement("span"); z.className = "sona-note z"; z.textContent = "z"; notes.appendChild(z); setTimeout(() => z.remove(), 1600); }
      x = Math.max(lo, Math.min(hi, x));
      draw();
    }
    requestAnimationFrame(loop);
  };

  const metronome = { running: false };
  app.beatListeners.add((b) => {
    metronome.running = true;
    if (root.hidden) return;
    root.classList.remove("beat");
    void root.offsetWidth;
    root.classList.add("beat");
    pose.legs = b % 2 ? 1 : 2;
    if (state === "sleep") { enter("idle", 2000); pose.eyes = "open"; }
    clearTimeout(beatTimer);
    beatTimer = setTimeout(() => { metronome.running = false; pose.legs = 0; }, 1500);
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let beatTimer;

  const say = () => {
    const pool = TIPS[app.view] || TIPS.editor;
    const list = getLang() === "fil" ? pool.fil : pool.en;
    /** @type {HTMLElement} */ (root.querySelector(".sona-text")).textContent = list[tipIndex++ % list.length];
    /** @type {HTMLElement} */ (root.querySelector(".sona-next")).textContent = t("sonaNext", "Another tip");
    /** @type {HTMLElement} */ (root.querySelector(".sona-hide")).textContent = t("sonaHide", "Hide Sona");
    bubble.hidden = false;
    // Keep the bubble on screen.
    const bw = Math.min(260, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - bw - 12, x + width() / 2 - bw / 2));
    bubble.style.setProperty("--bx", `${left - x}px`);
    bubble.style.width = `${bw}px`;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 8000);
  };

  root.querySelector(".sona-body")?.addEventListener("click", () => {
    lastTouch = performance.now();
    pose.eyes = "happy";
    pose.guitar = false;
    enter("hop", 900);
    root.classList.remove("hop");
    void root.offsetWidth;
    root.classList.add("hop");
    floatNote();
    say();
  });
  root.querySelector(".sona-next")?.addEventListener("click", () => { lastTouch = performance.now(); say(); });
  root.querySelector(".sona-hide")?.addEventListener("click", () => {
    bubble.hidden = true;
    store.settings.buddy = false;
    store.changed("settings");
    import("./dom.js").then(({ toast }) => toast(t("sonaHidden", "Sona is hiding. Bring Sona back in Settings."), "info"));
  });
  for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => { lastTouch = performance.now(); if (state === "sleep") { enter("idle", 1500); pose.eyes = "open"; } }, { passive: true });
  store.on("change", (/** @type {string} */ k) => { if (k === "settings") sync(); });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", () => { const [lo, hi] = range(); x = Math.max(lo, Math.min(hi, x)); target = x; });
  sync();
  draw();
  requestAnimationFrame(loop);

}
