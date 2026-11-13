// @ts-check
// Help and the guided tour. Loaded when someone opens Help (the "?" button or the ? key) or on a
// first visit; none of it is part of the first load. Its words live here, in both languages.
import "../../css/help.css";
import { $, esc, icon, openSheet, closeSheet } from "./dom.js";
import { getLang } from "./i18n.js";
import { store, app } from "./ctx.js";
import { addDemoSong } from "./editor.js";
import { openBackup } from "./sheets-lazy.js";

/** @typedef {{ title: string, text: string }} Step */

const EN = {
  help: "Help",
  here: "On this screen",
  tour: "Take the one-minute tour",
  how: "How do I…",
  whatsNew: "What's new",
  backup: "Backup & restore",
  skip: "Skip", back: "Back", next: "Next", start: "Start tour", done: "Done",
  of: "{n} of {m}",
  views: {
    songs: ["Songs", ["Import brings in a chart from a link, pasted chords or a file.", "Tap a song to open it. The star keeps favorites together.", "Setlists group songs in playing order for a gig, a rehearsal or a service."]],
    editor: ["Chart", ["Type chords on the line above the words, or write [G] inside them.", "− and + change the key for the whole song. Tap the key for capo and more.", "Present shows the chart big for the stage. Share sends it as a link, QR code or PDF."]],
    chords: ["Chords", ["Type any chord (Am7, D/F#) to see it on guitar, ukulele, bass and piano.", "Tap a shape to hear it.", "Tap a chord inside a chart to open the same view."]],
    theory: ["Theory", ["Tap a key on the circle to see its chord family and key signature.", "The seven chords of the key are below. Tap one to hear it.", "Lock a key to keep it while you move between songs."]],
    play: ["Play", ["Piano and fretboard show the scale and chords of your song's key.", "The tuner listens through the microphone. Allow it when the browser asks.", "The metronome can save its tempo to the open song."]],
    bank: ["Song Bank", ["A Song Bank is a public, view-only list of the songs someone plays.", "Search it, open a chart and read it in your own key."]]
  },
  topics: [
    ["Write a chart", ["Put chords on their own line above the lyrics, or put them inside the words in square brackets. Both work in the same song.", "PRE:## Verse 1\nG           C        G\nAmazing day, the sun is out\n[C]Sing it [G]loud\n> Band note (never transposed)\nC///  G///     rhythm slashes\n---            divider", "Chord chips above the editor insert a chord at the cursor."]],
    ["Change the key or use a capo", ["In Chart, − and + move every chord a half step. Tap the key button to pick a key, set a capo (you see the shapes you actually play), switch sharps and flats, or write the new key into the chart for good.", "Each song remembers its own key."]],
    ["Import a song I already have", ["In Songs, tap Import. Paste a link to a chord page, the chords themselves, or pick a .txt or ChordPro file. You see a preview before anything is saved.", "Some sites block reading. Copy the chords from the page and paste them instead."]],
    ["Present on stage", ["Open a song and tap Present. Text goes big, the screen stays awake, and auto-scroll pauses when you touch the chart. On a computer, the full screen button (or F) is there when you want it.", "In a setlist, the arrows move to the next song."]],
    ["Share with other people", ["Tap Share in a chart for a link or a QR code. The link carries the song itself, so the other person needs no account.", "The same sheet makes a PDF, an image, a text file or a print-out.", "For a group: make a setlist, then publish a live setlist link. Everyone's copy follows your changes and keeps their own key."]],
    ["Keep my songs safe", ["Songs are saved on this device as you type. Open Back up to turn on Google Drive (automatic, and the same songs on all your devices) or save a backup file with one tap.", "Sonata also keeps earlier versions of your library on this device, so you can go back if something goes wrong."]],
    ["Use it offline or install it", ["After the first visit Sonata opens without internet. Instrument sounds are kept the first time you play them, or all at once from Settings.", "To install: use your browser's menu and choose Install app or Add to Home Screen."]],
    ["Keyboard shortcuts", ["LIST:Ctrl or ⌘ + S — save now|Ctrl or ⌘ + Enter — present the open chart|? — open Help|On stage: Space — auto-scroll · ← → — previous or next song · [ ] — text size · F — full screen · Esc — leave"]]
  ],
  steps: [
    ["Welcome to Sonata", "Chord charts you can write, change key, put on stage and share. For gigs, practice, lessons or church. Want a one-minute look around?"],
    ["Start with your songs", "Import a chart from a link, pasted chords or a file. Or start a new song from scratch."],
    ["Write the chart", "Type chords on the line above the words, or [G] inside them. The finished chart appears as you type. We opened a demo song so you can try."],
    ["Any key, instantly", "− and + move the whole song a half step. Tap the key for capo, sharps or flats. Switch between chords, numbers and lyrics only."],
    ["Play it and share it", "Present shows the chart big for the stage. Share sends it as a link, a QR code or a PDF. No account needed on either side."],
    ["Tools for practice", "Chords shows any chord on guitar, ukulele, bass and piano. Theory has the circle of fifths. Play has a piano, fretboard, tuner and metronome."],
    ["Keep your songs safe", "Songs are saved on this device. Back up to Google Drive or save a backup file here, so you never lose them."],
    ["Help is always here", "Tap ? any time for tips about the screen you are on, or to take this tour again."]
  ]
};

/** @type {typeof EN} */
const FIL = {
  help: "Tulong",
  here: "Sa screen na ito",
  tour: "Mag-tour nang isang minuto",
  how: "Paano…",
  whatsNew: "Ano'ng bago",
  backup: "Backup at restore",
  skip: "Laktawan", back: "Bumalik", next: "Susunod", start: "Simulan ang tour", done: "Tapos",
  of: "{n} sa {m}",
  views: {
    songs: ["Mga Kanta", ["Ang Import ay kumukuha ng chart mula sa link, naka-paste na chords o file.", "I-tap ang kanta para buksan. Ang star ay para sa mga paborito.", "Ang setlist ay pagkakasunod-sunod ng mga kanta para sa gig, rehearsal o service."]],
    editor: ["Chart", ["I-type ang chords sa linya sa itaas ng lyrics, o isulat ang [G] sa loob ng salita.", "Binabago ng − at + ang key ng buong kanta. I-tap ang key para sa capo at iba pa.", "Ang Present ay malaking chart para sa stage. Ang Share ay nagpapadala bilang link, QR code o PDF."]],
    chords: ["Chords", ["I-type ang kahit anong chord (Am7, D/F#) para makita sa gitara, ukulele, bass at piano.", "I-tap ang shape para marinig.", "I-tap ang chord sa loob ng chart para sa parehong view."]],
    theory: ["Theory", ["I-tap ang key sa bilog para makita ang chord family at key signature nito.", "Nasa ibaba ang pitong chords ng key. I-tap para marinig.", "I-lock ang key para manatili kahit lumipat ka ng kanta."]],
    play: ["Play", ["Ipinapakita ng piano at fretboard ang scale at chords ng key ng kanta mo.", "Nakikinig ang tuner gamit ang mikropono. Payagan kapag nagtanong ang browser.", "Puwedeng i-save ng metronome ang tempo sa bukas na kanta."]],
    bank: ["Song Bank", ["Ang Song Bank ay pampublikong listahan ng mga kantang tinutugtog ng isang tao (view lang).", "Maghanap, buksan ang chart at basahin sa sarili mong key."]]
  },
  topics: [
    ["Sumulat ng chart", ["Ilagay ang chords sa sariling linya sa itaas ng lyrics, o sa loob ng salita gamit ang square brackets. Puwedeng pagsamahin sa iisang kanta.", "PRE:## Verse 1\nG           C        G\nAmazing day, the sun is out\n[C]Sing it [G]loud\n> Paalala sa banda (hindi nata-transpose)\nC///  G///     rhythm slashes\n---            divider", "Ang chord chips sa itaas ng editor ay naglalagay ng chord sa cursor."]],
    ["Palitan ang key o gumamit ng capo", ["Sa Chart, ginagalaw ng − at + ang lahat ng chords nang kalahating step. I-tap ang key button para pumili ng key, mag-capo (makikita mo ang shapes na tutugtugin mo), magpalit ng sharps at flats, o isulat nang permanente ang bagong key.", "May sariling key ang bawat kanta."]],
    ["I-import ang kantang mayroon na ako", ["Sa Songs, i-tap ang Import. I-paste ang link ng chord page, ang mismong chords, o pumili ng .txt o ChordPro file. May preview bago i-save.", "May mga site na hindi nababasa. Kopyahin ang chords mula sa page at i-paste na lang."]],
    ["Mag-present sa stage", ["Buksan ang kanta at i-tap ang Present. Lalaki ang text, hindi mamamatay ang screen, at hihinto ang auto-scroll kapag hinawakan mo ang chart. Sa computer, may full screen button (o F) kung gusto mo.", "Sa setlist, ang mga arrow ang papunta sa susunod na kanta."]],
    ["I-share sa iba", ["I-tap ang Share sa chart para sa link o QR code. Dala ng link ang mismong kanta, kaya hindi kailangan ng account ng kausap mo.", "Sa parehong sheet, puwede ring PDF, larawan, text file o print.", "Para sa grupo: gumawa ng setlist, tapos mag-publish ng live setlist link. Susunod ang kopya ng lahat sa mga pagbabago mo, at mananatili ang sarili nilang key."]],
    ["Ingatan ang mga kanta ko", ["Naka-save ang mga kanta sa device na ito habang nagta-type ka. Buksan ang Back up para i-on ang Google Drive (awtomatiko, at pareho ang kanta sa lahat ng device mo) o mag-save ng backup file sa isang tap.", "Nagtatabi rin ang Sonata ng mga naunang bersyon ng library mo sa device na ito, para makabalik ka kung may magkamali."]],
    ["Gamitin offline o i-install", ["Pagkatapos ng unang bisita, bumubukas ang Sonata kahit walang internet. Naitatabi ang tunog ng instrumento sa unang tugtog, o lahat nang sabay mula sa Settings.", "Para i-install: sa menu ng browser, piliin ang Install app o Add to Home Screen."]],
    ["Keyboard shortcuts", ["LIST:Ctrl o ⌘ + S — i-save ngayon|Ctrl o ⌘ + Enter — i-present ang bukas na chart|? — buksan ang Tulong|Sa stage: Space — auto-scroll · ← → — nauna o susunod na kanta · [ ] — laki ng text · F — full screen · Esc — umalis"]]
  ],
  steps: [
    ["Welcome sa Sonata", "Chord charts na puwede mong isulat, palitan ng key, ilagay sa stage at i-share. Para sa gig, practice, lesson o church. Gusto mo ng isang-minutong tour?"],
    ["Magsimula sa mga kanta mo", "Mag-import ng chart mula sa link, naka-paste na chords o file. O magsimula ng bagong kanta."],
    ["Isulat ang chart", "I-type ang chords sa linya sa itaas ng lyrics, o [G] sa loob ng salita. Lumalabas agad ang tapos na chart. Nagbukas kami ng demo na kanta para masubukan mo."],
    ["Kahit anong key, agad-agad", "Ginagalaw ng − at + ang buong kanta nang kalahating step. I-tap ang key para sa capo, sharps o flats. Magpalit sa chords, numbers o lyrics lang."],
    ["Tugtugin at i-share", "Ang Present ay malaking chart para sa stage. Ang Share ay nagpapadala bilang link, QR code o PDF. Walang account na kailangan."],
    ["Mga tool sa practice", "Ipinapakita ng Chords ang kahit anong chord sa gitara, ukulele, bass at piano. Nasa Theory ang circle of fifths. Nasa Play ang piano, fretboard, tuner at metronome."],
    ["Ingatan ang mga kanta mo", "Naka-save ang mga kanta sa device na ito. Mag-back up sa Google Drive o mag-save ng backup file dito, para hindi mawala."],
    ["Laging nandito ang tulong", "I-tap ang ? kahit kailan para sa tips tungkol sa screen na bukas, o para ulitin ang tour na ito."]
  ]
};

const L = () => (getLang() === "fil" ? FIL : EN);

/** One help paragraph: plain text, a chart example (PRE:) or a list (LIST:a|b). @param {string} p */
function part(p) {
  if (p.startsWith("PRE:")) return `<pre class="help-pre" tabindex="0">${esc(p.slice(4))}</pre>`;
  if (p.startsWith("LIST:")) return `<ul>${p.slice(5).split("|").map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<p>${esc(p)}</p>`;
}

/** Help sheet: tips for the screen that is open, the tour, and short answers. */
export function openHelp() {
  const l = L();
  const [name, tips] = /** @type {any} */ (l.views)[app.view] || l.views.songs;
  const body = openSheet({
    title: l.help,
    focus: false,
    body: `<div class="help">
      <section class="help-here" aria-labelledby="helpHere">
        <h3 id="helpHere">${esc(l.here)}: ${esc(name)}</h3>
        <ul>${tips.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </section>
      <button class="btn primary wide" type="button" id="helpTour">${icon("sparkles")}${esc(l.tour)}</button>
      <h3 class="group-title">${esc(l.how)}</h3>
      <div class="help-topics">${l.topics.map(([q, a]) => `<details class="help-topic"><summary>${esc(/** @type {string} */ (q))}${icon("chevron")}</summary><div>${/** @type {string[]} */ (a).map(part).join("")}</div></details>`).join("")}</div>
      <div class="btn-row">
        <button class="btn ghost" type="button" id="helpBackup">${icon("cloud")}${esc(l.backup)}</button>
        <button class="btn ghost" type="button" id="helpAbout">${icon("info")}${esc(l.whatsNew)}</button>
      </div>
    </div>`
  });
  body.addEventListener("click", async (e) => {
    const id = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("button"))?.id;
    if (id === "helpTour") { closeSheet(); startTour(); }
    if (id === "helpBackup") openBackup();
    if (id === "helpAbout") (await import("./sheets.js")).openAbout();
  });
}

/** What each tour step points at; the first that is on screen wins. @type {{ view?: import("./ctx.js").View, sel: string[] }[]} */
const TARGETS = [
  { sel: [] },
  { view: "songs", sel: [".page-actions"] },
  { view: "editor", sel: ["#editorPanes"] },
  { view: "editor", sel: [".editor-toolbar"] },
  { view: "editor", sel: [".head-actions"] },
  { view: "editor", sel: [".sidebar .tabs", ".bottom-nav"] },
  { sel: ["#accountBtn"] },
  { sel: ["#helpBtn"] }
];

/** @type {{ end: () => void }|null} */
let tour = null;

/** The guided tour: a spotlight on one part of the app at a time, with Back, Next and Skip. */
export function startTour() {
  if (tour) return;
  try { localStorage.setItem("sonata_tour_seen", "1"); } catch { /* storage blocked */ }
  closeSheet();
  const l = L();
  const appEl = $("app");
  const before = /** @type {HTMLElement|null} */ (document.activeElement);
  const layer = document.createElement("div");
  layer.className = "tour";
  layer.innerHTML = `<div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
      <p class="tour-count" id="tourCount"></p>
      <h2 id="tourTitle" tabindex="-1"></h2>
      <p class="tour-text" id="tourText"></p>
      <div class="tour-actions">
        <button class="btn ghost small" type="button" data-tour="skip"></button>
        <span class="tour-dots" aria-hidden="true">${TARGETS.map(() => "<i></i>").join("")}</span>
        <button class="btn small" type="button" data-tour="back"></button>
        <button class="btn primary small" type="button" data-tour="next"></button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  /** @type {any} */ (appEl).inert = true;
  const hole = /** @type {HTMLElement} */ (layer.querySelector(".tour-hole"));
  const card = /** @type {HTMLElement} */ (layer.querySelector(".tour-card"));
  const btn = (/** @type {string} */ k) => /** @type {HTMLButtonElement} */ (layer.querySelector(`[data-tour="${k}"]`));
  let i = 0;
  let addedDemo = false;

  /** The element this step points at, if it is on screen. */
  const target = () => {
    for (const sel of TARGETS[i].sel) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return /** @type {HTMLElement} */ (el);
      }
    }
    return null;
  };

  const place = () => {
    const el = target();
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!el) {
      layer.classList.add("center");
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      card.style.left = `${Math.max(12, (vw - cw) / 2)}px`;
      card.style.top = `${Math.max(12, (vh - ch) / 2)}px`;
      return;
    }
    layer.classList.remove("center");
    const r = el.getBoundingClientRect();
    const pad = 6;
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    const w = Math.min(vw - 4, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y;
    hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    const gap = 12;
    // Below the spotlight when there is room, else above it, else over its lower part.
    let top = y + h + gap;
    if (top + ch > vh - 12) top = y - gap - ch;
    if (top < 12) top = Math.max(12, vh - ch - 16);
    card.style.top = `${top}px`;
    card.style.left = `${Math.min(Math.max(12, x + w / 2 - cw / 2), Math.max(12, vw - cw - 12))}px`;
  };

  const show = () => {
    const step = TARGETS[i];
    if (i >= 2 && !store.songs.length) { addDemoSong(); addedDemo = true; }
    if (step.view && app.view !== step.view) app.show(step.view);
    const [title, text] = l.steps[i];
    /** @type {HTMLElement} */ (layer.querySelector("#tourCount")).textContent = l.of.replace("{n}", String(i + 1)).replace("{m}", String(TARGETS.length));
    /** @type {HTMLElement} */ (layer.querySelector("#tourTitle")).textContent = title;
    // The demo sentence only makes sense when the tour opened the demo.
    /** @type {HTMLElement} */ (layer.querySelector("#tourText")).textContent = i === 2 && !addedDemo ? text.split(". ").slice(0, 2).join(". ") + "." : text;
    btn("skip").textContent = l.skip;
    btn("skip").hidden = i === TARGETS.length - 1;
    btn("back").textContent = l.back;
    btn("back").hidden = i === 0;
    btn("next").textContent = i === 0 ? l.start : i === TARGETS.length - 1 ? l.done : l.next;
    layer.querySelectorAll(".tour-dots i").forEach((d, n) => d.classList.toggle("on", n === i));
    target()?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // The screen may have just changed: measure after it has drawn.
    requestAnimationFrame(() => { place(); btn("next").focus({ preventScroll: true }); });
  };

  const end = () => {
    if (!tour) return;
    tour = null;
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey, true);
    layer.remove();
    /** @type {any} */ (appEl).inert = false;
    (document.getElementById("helpBtn") || before)?.focus?.({ preventScroll: true });
  };

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); return; }
    if (e.key !== "Tab") return;
    // Keep the keyboard inside the card.
    const focusable = /** @type {HTMLElement[]} */ ([...card.querySelectorAll("button:not([hidden])")]);
    const at = focusable.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    e.preventDefault();
    focusable[(at + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
  }

  /** @param {number} d */
  function go(d) {
    const next = i + d;
    if (next < 0) return;
    if (next >= TARGETS.length) { end(); return; }
    i = next;
    show();
  }

  layer.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-tour]"));
    if (!b) return;
    if (b.dataset.tour === "skip") end();
    if (b.dataset.tour === "back") go(-1);
    if (b.dataset.tour === "next") go(1);
  });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey, true);
  tour = { end };
  show();
}
