// @ts-check
// Chord dictionary: every chord type Sonata knows, its notes, and playable
// shapes for fretted instruments (guitar, ukulele, bass). No DOM; unit-tested.
import { parseChord, noteName, mod12, chordTones, prefersFlats, keyFromTonic, NOTE_TO_PC } from "./music.js";

/**
 * @typedef {{ id: string, label: string, group: string, iv: number[], optional?: number[] }} Quality
 * `id` is the suffix written after the root (C + "m7" = Cm7). `iv` are semitones above the root.
 * `optional` intervals may be left out of a shape (the fifth, and the 9th/11th of 13th chords).
 */

/** @type {Quality[]} */
export const QUALITIES = [
  { id: "", label: "Major", group: "Major", iv: [0, 4, 7], optional: [7] },
  { id: "6", label: "6", group: "Major", iv: [0, 4, 7, 9], optional: [7] },
  { id: "maj7", label: "maj7", group: "Major", iv: [0, 4, 7, 11], optional: [7] },
  { id: "add9", label: "add9", group: "Major", iv: [0, 4, 7, 2], optional: [7] },
  { id: "6/9", label: "6/9", group: "Major", iv: [0, 4, 7, 9, 2], optional: [7] },
  { id: "maj9", label: "maj9", group: "Major", iv: [0, 4, 7, 11, 2], optional: [7] },
  { id: "maj7#11", label: "maj7♯11", group: "Major", iv: [0, 4, 7, 11, 6], optional: [7] },
  { id: "maj13", label: "maj13", group: "Major", iv: [0, 4, 7, 11, 2, 9], optional: [7, 2] },
  { id: "m", label: "Minor", group: "Minor", iv: [0, 3, 7], optional: [7] },
  { id: "m6", label: "m6", group: "Minor", iv: [0, 3, 7, 9], optional: [7] },
  { id: "m7", label: "m7", group: "Minor", iv: [0, 3, 7, 10], optional: [7] },
  { id: "madd9", label: "m(add9)", group: "Minor", iv: [0, 3, 7, 2], optional: [7] },
  { id: "m9", label: "m9", group: "Minor", iv: [0, 3, 7, 10, 2], optional: [7] },
  { id: "m11", label: "m11", group: "Minor", iv: [0, 3, 7, 10, 2, 5], optional: [7, 2] },
  { id: "m(maj7)", label: "m(maj7)", group: "Minor", iv: [0, 3, 7, 11], optional: [7] },
  { id: "7", label: "7", group: "Dominant", iv: [0, 4, 7, 10], optional: [7] },
  { id: "9", label: "9", group: "Dominant", iv: [0, 4, 7, 10, 2], optional: [7] },
  { id: "11", label: "11", group: "Dominant", iv: [0, 7, 10, 2, 5], optional: [7, 2] },
  { id: "13", label: "13", group: "Dominant", iv: [0, 4, 7, 10, 2, 9], optional: [7, 2] },
  { id: "7sus4", label: "7sus4", group: "Dominant", iv: [0, 5, 7, 10], optional: [7] },
  { id: "7b9", label: "7♭9", group: "Dominant", iv: [0, 4, 7, 10, 1], optional: [7] },
  { id: "7#9", label: "7♯9", group: "Dominant", iv: [0, 4, 7, 10, 3], optional: [7] },
  { id: "7#5", label: "7♯5", group: "Dominant", iv: [0, 4, 8, 10] },
  { id: "7b5", label: "7♭5", group: "Dominant", iv: [0, 4, 6, 10] },
  { id: "sus2", label: "sus2", group: "Suspended", iv: [0, 2, 7] },
  { id: "sus4", label: "sus4", group: "Suspended", iv: [0, 5, 7] },
  { id: "9sus4", label: "9sus4", group: "Suspended", iv: [0, 5, 7, 10, 2], optional: [7] },
  { id: "add11", label: "add11", group: "Suspended", iv: [0, 4, 7, 5], optional: [7] },
  { id: "dim", label: "dim", group: "Dim & aug", iv: [0, 3, 6] },
  { id: "dim7", label: "dim7", group: "Dim & aug", iv: [0, 3, 6, 9] },
  { id: "m7b5", label: "m7♭5 (ø)", group: "Dim & aug", iv: [0, 3, 6, 10] },
  { id: "aug", label: "aug (+)", group: "Dim & aug", iv: [0, 4, 8] },
  { id: "5", label: "5 (power)", group: "Power", iv: [0, 7] }
];

export const QUALITY_GROUPS = ["Major", "Minor", "Dominant", "Suspended", "Dim & aug", "Power"];

/** Same chord type written differently ("min7", "-7", "M7", "°7"…) → catalog id. */
const ALIASES = {
  maj: "", M: "", min: "m", "-": "m", mi: "m", min7: "m7", "-7": "m7", mi7: "m7", M7: "maj7", Maj7: "maj7", Δ: "maj7", Δ7: "maj7",
  "°": "dim", o: "dim", "°7": "dim7", o7: "dim7", ø: "m7b5", ø7: "m7b5", "m7-5": "m7b5", min7b5: "m7b5", "+": "aug", "+7": "7#5", aug7: "7#5",
  sus: "sus4", 2: "add9", add2: "add9", madd2: "madd9", "m(add9)": "madd9", 69: "6/9", "m6/9": "m6", M9: "maj9", Maj9: "maj9", "mM7": "m(maj7)", "mMaj7": "m(maj7)",
  "7(b9)": "7b9", "7(#9)": "7#9", "7sus": "7sus4", "9sus": "9sus4", "add4": "add11", "dom7": "7"
};

/** @param {string} id */
export const qualityById = (id) => QUALITIES.find((q) => q.id === id) || null;

/**
 * Everything about a chord name, for the dictionary.
 * Unknown qualities still get notes from the general chord reader.
 * @param {string} name e.g. "Am7/G", "D/F#", "Csus4"
 */
export function describeChord(name) {
  const c = parseChord(String(name || "").trim());
  if (!c) return null;
  const qid = c.quality in ALIASES ? /** @type {any} */ (ALIASES)[c.quality] : c.quality;
  const q = qualityById(qid);
  const iv = q ? q.iv : chordTones({ ...c, bass: "", bassPc: null }).map((pc) => mod12(pc - c.rootPc));
  const flats = c.root.includes("b") || (c.bass || "").includes("b") || (!c.root.includes("#") && prefersFlats(keyFromTonic(c.rootPc, /^m(?!aj)/.test(qid) ? "minor" : "major")));
  const pcs = iv.map((i) => mod12(c.rootPc + i));
  return {
    name: c.root + c.quality + (c.bass ? "/" + c.bass : ""),
    root: c.root, rootPc: c.rootPc, quality: q ? q.id : c.quality, label: q ? q.label : c.quality || "Major",
    bass: c.bass, bassPc: c.bassPc,
    intervals: iv, pcs,
    optional: q?.optional || [7],
    notes: pcs.map((pc) => noteName(pc, flats)),
    bassNote: c.bassPc !== null ? noteName(c.bassPc, flats) : "",
    formula: iv.map(intervalName)
  };
}

const IV_NAMES = ["1", "♭9", "9", "♭3", "3", "11", "♭5", "5", "♯5", "6", "♭7", "7"];
/** @param {number} i semitones above the root */
export function intervalName(i) { return IV_NAMES[mod12(i)]; }

/** Name a chord from parts. @param {number} rootPc @param {string} quality @param {number|null} [bassPc] @param {boolean} [flats] */
export function chordName(rootPc, quality, bassPc = null, flats = false) {
  return noteName(rootPc, flats) + quality + (bassPc !== null && bassPc !== undefined && mod12(bassPc) !== mod12(rootPc) ? "/" + noteName(bassPc, flats) : "");
}

/**
 * Slash chords that make musical sense for a chord: its inversions (bass on the 3rd, 5th, 7th)
 * and the common walking-bass ones (I/♭7, Am/G…).
 * @param {string} name
 */
export function inversions(name) {
  const d = describeChord(name);
  if (!d) return [];
  const flats = /b/.test(d.root);
  const base = d.root + d.quality;
  const out = d.intervals.filter((i) => i !== 0 && i !== 2 && i !== 5).map((i) => base + "/" + noteName(d.rootPc + i, flats));
  if (d.quality === "" || d.quality === "m") out.push(base + "/" + noteName(d.rootPc + 10, !d.root.includes("#"))); // C/Bb, G/F, Am/G
  return [...new Set(out)];
}

/** Standard tunings, low string first (MIDI). */
export const TUNINGS = {
  guitar: { label: "Guitar", strings: [40, 45, 50, 55, 59, 64], names: ["E", "A", "D", "G", "B", "E"] },
  ukulele: { label: "Ukulele", strings: [67, 60, 64, 69], names: ["G", "C", "E", "A"] },
  bass: { label: "Bass", strings: [28, 33, 38, 43], names: ["E", "A", "D", "G"] }
};

/**
 * @typedef {{ frets: number[], base: number, fingers: number, barre: number, score: number, notes: number[] }} Voicing
 * `frets`: one per string, low string first; -1 = not played, 0 = open.
 * `base`: fret shown at the top of the diagram (1 for open shapes).
 * `barre`: fret of a barre (0 = none). `notes`: MIDI notes that sound.
 */

/**
 * Playable shapes for a chord on a fretted instrument, best first.
 * The lowest note is the chord's bass (the slash note when there is one).
 * Rules: at most 4 fingers (a barre counts as one), a stretch of 4 frets, every
 * chord tone present except the optional ones, and no more than one muted string
 * between played strings.
 * @param {string} name
 * @param {number[]} tuning MIDI of each open string, low first
 * @param {{ max?: number, maxFret?: number, reentrant?: boolean }} [o]
 * @returns {Voicing[]}
 */
export function voicings(name, tuning = TUNINGS.guitar.strings, o = {}) {
  const d = describeChord(name);
  if (!d) return [];
  const max = o.max ?? 8;
  const maxFret = o.maxFret ?? 14;
  const n = tuning.length;
  const reentrant = o.reentrant ?? (n === 4 && tuning[0] > tuning[1]); // ukulele: high G string
  const bass = d.bassPc ?? d.rootPc;
  const slash = d.bassPc !== null;
  const all = new Set(d.pcs.concat(d.bassPc !== null ? [d.bassPc] : []));
  const optional = new Set(d.optional.map((i) => mod12(d.rootPc + i)));
  const required = [...all].filter((pc) => !optional.has(pc) || pc === bass);
  // Few strings: drop the fifth first, then the 9th, so 4-string shapes still exist.
  const minPlayed = n >= 6 ? 4 : n === 4 ? (reentrant ? 4 : 3) : n - 1;
  /** @type {Map<string, Voicing>} */
  const found = new Map();
  for (let lo = 0; lo <= maxFret - 3; lo++) {
    /** @type {number[][]} */
    const options = tuning.map((open) => {
      const opts = [-1];
      if (all.has(mod12(open))) opts.push(0);
      for (let f = Math.max(1, lo); f <= lo + 3; f++) if (all.has(mod12(open + f))) opts.push(f);
      return opts;
    });
    const frets = new Array(n).fill(-1);
    const walk = (/** @type {number} */ s) => {
      if (s === n) { judge(frets.slice()); return; }
      for (const f of options[s]) { frets[s] = f; walk(s + 1); }
    };
    walk(0);
  }
  /** @param {number[]} f */
  function judge(f) {
    const played = f.map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
    if (played.length < Math.min(minPlayed, n)) return;
    const notes = played.map((i) => tuning[i] + f[i]);
    // Lowest sounding note must be the bass (re-entrant ukulele: the lowest pitch, wherever it is).
    // A ukulele's high G string makes inversions normal (G = 0232), so only slash chords pin its bass.
    const lowest = Math.min(...notes);
    if ((!reentrant || slash) && mod12(lowest) !== mod12(bass)) return;
    if (!reentrant && mod12(tuning[played[0]] + f[played[0]]) !== mod12(bass)) return;
    const pcsHere = new Set(notes.map(mod12));
    if (!required.every((pc) => pcsHere.has(pc))) return;
    const first = played[0], last = played[played.length - 1];
    let inner = 0;
    for (let i = first; i <= last; i++) if (f[i] < 0) inner++;
    if (inner > 1) return;
    if (n === 4 && f.some((x) => x < 0) && reentrant) return; // ukulele: all four strings ring
    const fretted = f.filter((x) => x > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    if (maxF - minF > 3) return;
    // Barre: two or more strings at the lowest fret, with nothing open between them.
    const atMin = f.map((x, i) => (x === minF ? i : -1)).filter((i) => i >= 0);
    let barre = 0;
    if (minF > 0 && atMin.length >= 2) {
      const from = atMin[0];
      const blocked = f.slice(from).some((x) => x === 0);
      if (!blocked) barre = minF;
    }
    const fingers = barre ? 1 + fretted.filter((x) => x > minF).length : fretted.length;
    if (fingers > 4) return;
    const opens = f.filter((x) => x === 0).length;
    const base = maxF <= 4 ? 1 : minF;
    // Open strings sounding between fretted ones (10321x) are hard to keep clear of.
    const firstF = f.findIndex((x) => x > 0), lastF = f.length - 1 - [...f].reverse().findIndex((x) => x > 0);
    let openBetween = 0;
    if (firstF >= 0) for (let i = firstF; i <= lastF; i++) if (f[i] === 0) openBetween++;
    // Guitar: strings left silent on the thin side sound thin; strum shapes ring through.
    const trebleMutes = n >= 6 ? n - 1 - last : 0;
    let score = minF * 1.4 - played.length * 0.9 + fingers * 0.6 + inner * 5 + (barre ? 0.8 : 0) + (maxF - minF) * 0.9 + openBetween * 1.6 + trebleMutes * 1.3;
    if (minF <= 3) score -= opens * 0.7;
    if (pcsHere.size < all.size) score += (all.size - pcsHere.size) * 1.5; // a dropped optional note
    if (n >= 6 && f[0] < 0 && f[1] < 0 && played.length < 5) score += 0.5;
    const key = f.join(",");
    if (!found.has(key)) found.set(key, { frets: f, base, fingers, barre, score, notes: notes.slice().sort((a, b) => a - b) });
  }
  const list = [...found.values()].sort((a, b) => a.score - b.score);
  // The shape every chord book shows comes first, when this is a standard tuning and a known chord.
  const canon = (n === 6 && tuning.join() === TUNINGS.guitar.strings.join() ? CANON.guitar : n === 4 && tuning.join() === TUNINGS.ukulele.strings.join() ? CANON.ukulele : null)?.[d.name];
  if (canon) {
    const f = canon.split("").map((ch) => (ch === "x" ? -1 : parseInt(ch, 36)));
    const key = f.join(",");
    const known = found.get(key) || shapeOf(f, tuning);
    const at = list.indexOf(known);
    if (at >= 0) list.splice(at, 1);
    list.unshift(known);
  }
  // Keep shapes that differ: drop near-duplicates in the same spot that only add or remove one string.
  /** @type {Voicing[]} */
  const out = [];
  for (const v of list) {
    const pos = Math.min(...v.frets.filter((x) => x > 0).concat([99]));
    if (out.some((u) => u.frets.filter((x, i) => x !== v.frets[i]).length <= 1 && Math.abs(Math.min(...u.frets.filter((x) => x > 0).concat([99])) - pos) < 2)) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** A voicing from fixed frets (for the standard shapes). @param {number[]} f @param {number[]} tuning @returns {Voicing} */
function shapeOf(f, tuning) {
  const fretted = f.filter((x) => x > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0, maxF = fretted.length ? Math.max(...fretted) : 0;
  const atMin = f.filter((x) => x === minF).length;
  const barre = minF > 0 && atMin >= 2 && !f.slice(f.indexOf(minF)).some((x) => x === 0) ? minF : 0;
  const notes = f.map((x, i) => (x >= 0 ? tuning[i] + x : -1)).filter((x) => x >= 0).sort((a, b) => a - b);
  return { frets: f, base: maxF <= 4 ? 1 : minF, fingers: barre ? 1 + fretted.filter((x) => x > minF).length : fretted.length, barre, score: -99, notes };
}

/** The shapes chord books print first (frets low string first; x = not played; a–f = 10–15). */
const CANON = {
  guitar: {
    C: "x32010", C7: "x32310", Cmaj7: "x32000", Cadd9: "x32030", Csus4: "x33011", Csus2: "x30013", "C/E": "032010", "C/G": "332010", C6: "x32210",
    D: "xx0232", Dm: "xx0231", D7: "xx0212", Dmaj7: "xx0222", Dm7: "xx0211", Dsus4: "xx0233", Dsus2: "xx0230", "D/F#": "200232", Dadd9: "xx0230", D6: "xx0202",
    E: "022100", Em: "022000", E7: "020100", Em7: "022030", Esus4: "022200", Emaj7: "021100", Eadd9: "024100", "E/G#": "4x2100",
    F: "133211", Fmaj7: "xx3210", Fm: "133111", F7: "131211", "F/C": "x33211", Fadd9: "xx3013",
    G: "320003", G7: "320001", Gmaj7: "320002", Gsus4: "330013", "G/B": "x20003", "G/D": "xx0003", Gadd9: "300203", G6: "320000",
    A: "x02220", Am: "x02210", A7: "x02020", Am7: "x02010", Amaj7: "x02120", Asus4: "x02230", Asus2: "x02200", "Am/G": "3x2210", "A/C#": "x42220", A7sus4: "x02030",
    B7: "x21202", Bm: "x24432", Bm7: "x20202", B: "x24442", Bb: "x13331", "F#m": "244222", "C#m": "x46654", Eb: "x68886", Ab: "466544", "G#m": "466444", Gm: "355333", Cm: "x35543"
  },
  ukulele: {
    C: "0003", Cmaj7: "0002", C7: "0001", Csus4: "0013", Cadd9: "0203", Am: "2000", Am7: "0000", A: "2100", A7: "0100", Dm: "2210", D: "2220", D7: "2223", Dm7: "2213", Dsus4: "0230",
    Em: "0432", E7: "1202", Em7: "0202", E: "4442", F: "2010", Fmaj7: "2413", G: "0232", G7: "0212", Gmaj7: "0222", Gsus4: "0233", Bb: "3211", Bm: "4222", "F#m": "2120", B7: "2322"
  }
};

/**
 * Where the chord's notes are on a bass neck (frets 0–7): for walking lines, not strummed shapes.
 * @param {string} name
 * @returns {{ string: number, fret: number, pc: number, root: boolean, bass: boolean }[]}
 */
export function bassMap(name, tuning = TUNINGS.bass.strings, frets = 7) {
  const d = describeChord(name);
  if (!d) return [];
  const want = new Set(d.pcs.concat(d.bassPc !== null ? [d.bassPc] : []));
  const out = [];
  for (let s = 0; s < tuning.length; s++) for (let f = 0; f <= frets; f++) {
    const pc = mod12(tuning[s] + f);
    if (want.has(pc)) out.push({ string: s, fret: f, pc, root: pc === d.rootPc, bass: d.bassPc !== null && pc === d.bassPc });
  }
  return out;
}

/**
 * Piano notes for a chord: the bass an octave below, the chord in close position from the root.
 * @param {string} name
 * @returns {{ bass: number, notes: number[] }|null}
 */
export function pianoVoicing(name) {
  const d = describeChord(name);
  if (!d) return null;
  const root = 60 + d.rootPc; // middle C octave
  const notes = d.intervals.map((i) => root + (i < 0 ? i + 12 : i)).sort((a, b) => a - b);
  const bassPc = d.bassPc ?? d.rootPc;
  return { bass: 48 + bassPc - (bassPc > 7 ? 12 : 0), notes };
}

/** Every root, spelled the usual way for a chord (Bb not A#, F# not Gb). */
export const ROOTS = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].filter((r) => r !== "Db");

/** @param {string} root */
export const rootPc = (root) => NOTE_TO_PC[root] ?? 0;
