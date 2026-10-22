// @ts-check
// Pure music theory helpers: notes, chord parsing, transposition, key detection
// and number systems. No DOM access, so everything here is unit-tested in Node.

export const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** @type {Record<string, number>} */
export const NOTE_TO_PC = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11
};

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};

// Conventional key names: the spelling musicians actually write.
const MAJOR_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
// Keys whose signature uses flats (by tonic pitch class).
const FLAT_MAJOR_PCS = [5, 10, 3, 8, 1, 6];
const FLAT_MINOR_PCS = [2, 7, 0, 5, 10, 3];

/** Circle of fifths, clockwise from C. */
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/**
 * @typedef {{ root: string, mode: "major"|"minor", tonic: number, name: string }} Key
 * @typedef {{ raw: string, root: string, quality: string, bass: string, rootPc: number,
 *   bassPc: number|null, slashes: string }} Chord
 * @typedef {"auto"|"sharp"|"flat"} Spelling
 */

export const mod12 = (/** @type {number} */ n) => ((n % 12) + 12) % 12;

/** @param {string} s */
const normalizeNote = (s) => {
  if (!s) return "";
  let n = s.charAt(0).toUpperCase() + s.slice(1).replace(/♯/g, "#").replace(/♭/g, "b");
  if (n.length === 2 && n[1] === "B") n = n[0] + "b";
  return n;
};

const QUALITY_RE = /^(?:maj|Maj|M|min|m|-|dim|°|o|aug|\+|sus|add|ø)?(?:\d{1,2})?(?:(?:maj|Maj|M|sus|add|dim|aug|no)\d{0,2}|[#b+\-]\d{1,2})*(?:\([^)]*\))?$/;

/**
 * Parse one chord symbol such as "G", "F#m7", "C/G", "Bbmaj7", "D///".
 * Returns null for anything that is not a chord.
 * @param {string} input
 * @returns {Chord|null}
 */
export function parseChord(input) {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || /^[-/|%.]+$/.test(text)) return null;
  // Trailing rhythm slashes: "C///" means C for four beats.
  let core = text;
  let slashes = "";
  const rhythm = text.match(/^(.*?[^/])(\/{2,})$/) || text.match(/^([A-G][^/]*)(\/)$/);
  if (rhythm) { core = rhythm[1]; slashes = rhythm[2]; }
  const slashAt = core.indexOf("/");
  const main = slashAt >= 0 ? core.slice(0, slashAt) : core;
  const bassRaw = slashAt >= 0 ? core.slice(slashAt + 1) : "";
  const m = main.match(/^([A-Ga-g](?:#|b|♯|♭)?)(.*)$/);
  if (!m) return null;
  const root = normalizeNote(m[1]);
  const quality = m[2] || "";
  if (!(root in NOTE_TO_PC)) return null;
  if (quality && !QUALITY_RE.test(quality)) return null;
  let bass = "";
  if (bassRaw) {
    bass = normalizeNote(bassRaw);
    if (!(bass in NOTE_TO_PC)) return null;
  }
  return { raw: text, root, quality, bass, rootPc: NOTE_TO_PC[root], bassPc: bass ? NOTE_TO_PC[bass] : null, slashes };
}

/**
 * Broad chord family, used for key detection, numerals and audio.
 * Case matters: "CM7" is major seventh, "Cm7" is minor seventh.
 * @param {Chord|string} chord
 * @returns {"major"|"minor"|"diminished"|"half-diminished"|"augmented"|"suspended"|"power"}
 */
export function chordFamily(chord) {
  const q = typeof chord === "string" ? chord : chord.quality || "";
  if (/^(dim|°|o)/.test(q)) return "diminished";
  if (/^(ø|m7b5|m7-5|min7b5)/.test(q)) return "half-diminished";
  if (/^(aug|\+)/.test(q)) return "augmented";
  if (/^(maj|Maj|M(?!in))/.test(q)) return "major";
  if (/^(m|min|-)/.test(q)) return "minor";
  if (/sus/.test(q)) return "suspended";
  if (q === "5") return "power";
  return "major";
}

/**
 * Pitch classes that sound in a chord (root first). Good enough to light up
 * a piano or fretboard; extensions above the 9th are kept simple.
 * @param {Chord|string} chordOrText
 * @returns {number[]}
 */
export function chordTones(chordOrText) {
  const c = typeof chordOrText === "string" ? parseChord(chordOrText) : chordOrText;
  if (!c) return [];
  const q = c.quality;
  const fam = chordFamily(c);
  /** @type {number[]} */
  let iv;
  if (fam === "power") iv = [0, 7];
  else if (fam === "diminished") iv = /7/.test(q) ? [0, 3, 6, 9] : [0, 3, 6];
  else if (fam === "half-diminished") iv = [0, 3, 6, 10];
  else if (fam === "augmented") iv = [0, 4, 8];
  else if (/sus2/.test(q)) iv = [0, 2, 7];
  else if (/sus/.test(q)) iv = [0, 5, 7];
  else if (fam === "minor") iv = [0, 3, 7];
  else iv = [0, 4, 7];
  const has = (/** @type {RegExp} */ r) => r.test(q);
  if (fam !== "diminished" && fam !== "half-diminished") {
    if (has(/(maj|Maj|M)(7|9|11|13)/) || has(/^m(?:in)?(?:Maj|M)7/)) iv.push(11);
    else if (has(/(^|[^d])(7|9|11|13)/) && !has(/add|6/)) iv.push(10);
    if (has(/6/) && !has(/b6/)) iv.push(9);
  }
  if (has(/9|add9|add2/)) iv.push(has(/b9/) ? 1 : has(/#9/) ? 3 : 2);
  if (has(/11/)) iv.push(has(/#11/) ? 6 : 5);
  if (has(/13/)) iv.push(9);
  if (has(/b5|-5/) && fam !== "half-diminished") iv = iv.map((x) => (x === 7 ? 6 : x));
  if (has(/#5/) && fam !== "augmented") iv = iv.map((x) => (x === 7 ? 8 : x));
  const pcs = [...new Set(iv.map((x) => mod12(c.rootPc + x)))];
  if (c.bassPc !== null && !pcs.includes(c.bassPc)) pcs.unshift(c.bassPc);
  return pcs;
}

/** @param {string} token */
function splitToken(token) {
  const m = token.match(/^([|()[\]{}<>"'.,;:]*)(.*?)([|()[\]{}<>"'.,;:]*)$/);
  return m ? { lead: m[1], core: m[2], trail: m[3] } : { lead: "", core: token, trail: "" };
}

/** Tokens allowed on a chord line that are not chords: bars, repeats, N.C., "x2". */
const NEUTRAL_TOKEN = /^(?:[|:%/.\-]+|N\.?C\.?|x\d+|\d+x|\(x?\d+\)|-+)$/i;

const SECTION_WORD = /^(verse|chorus|bridge|intro|outro|interlude|tag|pre-?chorus|instrumental|ending|coda|v\d|c\d)[\s\d:]*$/i;

/**
 * True when every token on the line is a chord or a neutral rhythm mark.
 * @param {string} line
 */
export function isChordLine(line) {
  const t = line.trim();
  if (!t || /^(#|---|>|\/\/)/.test(t) || /\[[^\]]+\]/.test(line) || SECTION_WORD.test(t)) return false;
  let chords = 0;
  for (const token of t.split(/\s+/)) {
    if (NEUTRAL_TOKEN.test(token)) continue;
    if (parseChord(splitToken(token).core)) chords++;
    else return false;
  }
  return chords > 0;
}

/** @typedef {"header"|"subheader"|"divider"|"note"|"chords"|"lyrics"|"inline"|"empty"} LineKind */

/** @param {string} line @returns {LineKind} */
export function lineKind(line) {
  const t = line.trim();
  if (!t) return "empty";
  if (t.startsWith("## ")) return "subheader";
  if (t.startsWith("# ")) return "header";
  if (/^-{3,}$/.test(t)) return "divider";
  if (t.startsWith(">") || t.startsWith("//")) return "note";
  if (/\[[^\]]+\]/.test(line)) return "inline";
  if (isChordLine(line)) return "chords";
  return "lyrics";
}

/**
 * All chords in a chart, in order.
 * @param {string} text
 * @returns {Chord[]}
 */
export function extractChords(text) {
  /** @type {Chord[]} */
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const kind = lineKind(line);
    if (kind === "inline") {
      for (const m of line.matchAll(/\[([^\]]+)\]/g)) { const c = parseChord(m[1]); if (c) out.push(c); }
    } else if (kind === "chords") {
      for (const token of line.trim().split(/\s+/)) { const c = parseChord(splitToken(token).core); if (c) out.push(c); }
    }
  }
  return out;
}

/**
 * Should a key (or chord, when no key) be spelled with flats?
 * @param {Key|null} key
 * @param {Spelling} [spelling]
 */
export function prefersFlats(key, spelling = "auto") {
  if (spelling === "flat") return true;
  if (spelling === "sharp") return false;
  if (!key) return false;
  if (key.root.includes("b")) return true;
  if (key.root.includes("#")) return false;
  return (key.mode === "minor" ? FLAT_MINOR_PCS : FLAT_MAJOR_PCS).includes(key.tonic);
}

/**
 * Note name for a pitch class in a given context.
 * @param {number} pc
 * @param {boolean} flats
 */
export const noteName = (pc, flats) => (flats ? FLAT_NOTES : SHARP_NOTES)[mod12(pc)];

/**
 * Conventional key name for a tonic.
 * @param {number} tonic
 * @param {"major"|"minor"} mode
 * @param {Spelling} [spelling]
 * @returns {Key}
 */
export function keyFromTonic(tonic, mode, spelling = "auto") {
  const pc = mod12(tonic);
  let root = (mode === "minor" ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[pc];
  if (spelling === "flat") root = FLAT_NOTES[pc];
  if (spelling === "sharp") root = SHARP_NOTES[pc];
  return { root, mode, tonic: pc, name: `${root} ${mode}` };
}

/**
 * Parse "G", "C#m", "Bb minor", "G:major", "f#" into a key.
 * @param {unknown} value
 * @returns {Key|null}
 */
export function parseKey(value) {
  if (!value || value === "auto") return null;
  if (typeof value === "object") {
    const k = /** @type {any} */ (value);
    return k && typeof k.tonic === "number" && k.root ? k : null;
  }
  const s = String(value).trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const parts = s.includes(":") ? s.split(":") : null;
  const m = parts
    ? [s, parts[0].trim(), (parts[1] || "").trim()]
    : s.match(/^([A-Ga-g][#b]?)\s*(m|min|minor|maj|major)?$/i);
  if (!m) return null;
  const root = normalizeNote(m[1]);
  if (!(root in NOTE_TO_PC)) return null;
  const rawMode = (m[2] || "").toLowerCase();
  const mode = rawMode === "m" || rawMode.startsWith("min") ? "minor" : "major";
  return { root, mode, tonic: NOTE_TO_PC[root], name: `${root} ${mode}` };
}

/** @param {Key} key */
export const keyValue = (key) => `${key.root}:${key.mode}`;
/** @param {Key} key */
export const keyShort = (key) => key.root + (key.mode === "minor" ? "m" : "");

/**
 * Guess the key from the chords. Weights the first and last chord, which
 * usually sit on the tonic. Returns confidence 0..100.
 * @param {Chord[]|string} input
 */
export function detectKey(input) {
  const chords = Array.isArray(input) ? input : extractChords(input);
  if (!chords.length) return null;
  const MAJOR_W = { 0: 3, 2: 1.35, 4: 1.2, 5: 1.55, 7: 2.25, 9: 1.45, 11: 0.65, 3: 0.45, 8: 0.35, 10: 0.5 };
  const MINOR_W = { 0: 3, 2: 0.7, 3: 1.75, 5: 1.45, 7: 1.55, 8: 1.45, 10: 1.35, 11: 0.55 };
  /** @type {{tonic:number, mode:"major"|"minor", score:number}[]} */
  const cands = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of /** @type {const} */ (["major", "minor"])) {
      const prof = /** @type {Record<number, number>} */ (mode === "major" ? MAJOR_W : MINOR_W);
      let score = 0;
      chords.forEach((c, i) => {
        const d = mod12(c.rootPc - tonic);
        const fam = chordFamily(c);
        const w = 1 + (i === 0 ? 0.45 : 0) + (i === chords.length - 1 ? 0.7 : 0);
        score += (prof[d] ?? -0.35) * w;
        if (mode === "major") {
          if ([0, 5, 7].includes(d) && ["major", "suspended", "power"].includes(fam)) score += 1.05 * w;
          if ([2, 4, 9].includes(d) && fam === "minor") score += 0.95 * w;
          if (d === 11 && (fam === "diminished" || fam === "half-diminished")) score += 0.8 * w;
        } else {
          if ([0, 5].includes(d) && fam === "minor") score += 1.1 * w;
          if (d === 7 && fam !== "diminished") score += 0.8 * w;
          if (d === 2 && (fam === "diminished" || fam === "half-diminished")) score += 0.7 * w;
        }
      });
      cands.push({ tonic, mode, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  const confidence = Math.round(Math.min(99, Math.max(0, (best.score - cands[1].score + 1) * 12)));
  return { ...keyFromTonic(best.tonic, best.mode), confidence };
}

/**
 * Transpose a single chord.
 * @param {Chord} c
 * @param {number} steps
 * @param {boolean} flats
 */
export function transposeChord(c, steps, flats) {
  const root = noteName(c.rootPc + steps, flats);
  const bass = c.bassPc !== null ? "/" + noteName(c.bassPc + steps, flats) : "";
  return root + c.quality + bass + c.slashes;
}

/**
 * Apply a function to every chord in a chart, leaving lyrics, notes and
 * spacing alone. Chord-line spacing is kept so chords stay above their words.
 * @param {string} text
 * @param {(c: Chord) => string} fn
 */
export function mapChords(text, fn) {
  return String(text || "").split("\n").map((line) => {
    const kind = lineKind(line);
    if (kind === "inline") {
      return line.replace(/\[([^\]]+)\]/g, (whole, inner) => { const c = parseChord(inner); return c ? `[${fn(c)}]` : whole; });
    }
    if (kind !== "chords") return line;
    // Rebuild the line keeping each chord's start column when possible.
    let out = "";
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line))) {
      const { lead, core, trail } = splitToken(m[0]);
      const c = parseChord(core);
      const next = c ? lead + fn(c) + trail : m[0];
      const pad = Math.max(out.length ? 1 : 0, m.index - out.length);
      out += " ".repeat(pad) + next;
    }
    return out;
  }).join("\n");
}

/**
 * @param {string} text
 * @param {number} steps
 * @param {Key|null} key  key of the original chart (sets the spelling)
 * @param {Spelling} [spelling]
 */
export function transposeText(text, steps, key, spelling = "auto") {
  if (!steps && spelling === "auto") return String(text || "");
  const target = key ? keyFromTonic(key.tonic + steps, key.mode) : null;
  const flats = target ? prefersFlats(target, spelling) : spelling === "flat";
  return mapChords(text, (c) => transposeChord(c, steps, flats));
}

const ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
const ROMAN_MINOR = ["I", "bII", "II", "III", "#III", "IV", "#IV", "V", "VI", "#VI", "VII", "#VII"];
const DEGREE = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];

/** @param {Chord} c @param {Key} key */
export function romanChord(c, key) {
  const d = mod12(c.rootPc - key.tonic);
  const fam = chordFamily(c);
  const base = (key.mode === "minor" ? ROMAN_MINOR : ROMAN)[d];
  const lower = fam === "minor" || fam === "diminished" || fam === "half-diminished";
  const numeral = base.replace(/[IV]+/, (r) => (lower ? r.toLowerCase() : r));
  let suffix = c.quality;
  if (fam === "diminished") suffix = suffix.replace(/^(dim|°|o)/, "°");
  else if (fam === "half-diminished") suffix = "ø7";
  else if (fam === "augmented") suffix = suffix.replace(/^(aug|\+)/, "+");
  else if (fam === "minor") suffix = suffix.replace(/^(min|m|-)/, "");
  else suffix = suffix.replace(/^Maj|^M(?=\d)/, "maj");
  const bass = c.bassPc !== null ? "/" + DEGREE[mod12(c.bassPc - key.tonic)] : "";
  return numeral + suffix + bass + c.slashes;
}

/** @param {Chord} c @param {Key} key */
export function nashvilleChord(c, key) {
  const d = mod12(c.rootPc - key.tonic);
  const fam = chordFamily(c);
  let suffix = c.quality.replace(/^min(?!or)/, "m").replace(/^-/, "m").replace(/^Maj|^M(?=\d)/, "maj");
  if (fam === "diminished") suffix = suffix.replace(/^(dim|o)/, "°");
  const bass = c.bassPc !== null ? "/" + DEGREE[mod12(c.bassPc - key.tonic)] : "";
  return DEGREE[d] + suffix + bass + c.slashes;
}

/**
 * The seven diatonic chords of a key, with numerals and chord names.
 * @param {Key} key
 * @param {Spelling} [spelling]
 */
export function diatonicChords(key, spelling = "auto") {
  const flats = prefersFlats(key, spelling);
  const major = [["I", ""], ["ii", "m"], ["iii", "m"], ["IV", ""], ["V", ""], ["vi", "m"], ["vii°", "dim"]];
  const minor = [["i", "m"], ["ii°", "dim"], ["III", ""], ["iv", "m"], ["v", "m"], ["VI", ""], ["VII", ""]];
  const steps = SCALES[key.mode];
  return (key.mode === "minor" ? minor : major).map(([numeral, q], i) => {
    const pc = mod12(key.tonic + steps[i]);
    const name = noteName(pc, flats) + q;
    return { numeral, name, degree: i + 1, pc, quality: q === "m" ? "minor" : q === "dim" ? "diminished" : "major" };
  });
}

/** Chord families offered for every key (chord bar, chord players). */
export const CHORD_TYPES = [
  { id: "triad", label: "Triads" },
  { id: "7th", label: "7ths" },
  { id: "sus4", label: "Sus4" },
  { id: "sus2", label: "Sus2" },
  { id: "add9", label: "Add9" },
  { id: "6", label: "6ths" },
  { id: "9th", label: "9ths" },
  { id: "power", label: "Power (5)" },
  { id: "borrowed", label: "Borrowed" }
];

/**
 * The chords of a key in one family, in scale order.
 * @param {Key} key @param {string} type one of CHORD_TYPES ids
 * @param {Spelling} [spelling]
 * @returns {{ name: string, numeral: string, pc: number }[]}
 */
export function chordsForKey(key, type, spelling = "auto") {
  const flats = prefersFlats(key, spelling);
  const minorKey = key.mode === "minor";
  const nm = (/** @type {number} */ pc, /** @type {string} */ q) => noteName(pc, flats) + q;
  if (type === "borrowed") {
    const T = key.tonic;
    const rows = minorKey
      ? [["IV", 5, ""], ["V", 7, ""], ["V7", 7, "7"], ["♭II", 1, ""], ["♭v", 6, "dim"]]
      : [["♭III", 3, ""], ["iv", 5, "m"], ["♭VI", 8, ""], ["♭VII", 10, ""], ["II", 2, ""], ["III7", 4, "7"]];
    return rows.map(([numeral, off, q]) => {
      const pc = mod12(T + Number(off));
      const fl = String(numeral).startsWith("♭") || flats;
      return { numeral: String(numeral), pc, name: noteName(pc, fl) + q };
    });
  }
  /** @type {{ name: string, numeral: string, pc: number }[]} */
  const out = [];
  for (const d of diatonicChords(key, spelling)) {
    const dominant = minorKey ? d.degree === 7 : d.degree === 5;
    const dim = d.quality === "diminished";
    const minor = d.quality === "minor";
    /** @type {string|null} */
    let q = null;
    if (type === "triad") q = dim ? "dim" : minor ? "m" : "";
    else if (type === "7th") q = dim ? "m7b5" : minor ? "m7" : dominant ? "7" : "maj7";
    else if (type === "sus4") q = dim ? null : "sus4";
    else if (type === "sus2") q = dim ? null : "sus2";
    else if (type === "add9") q = dim ? null : minor ? "madd9" : "add9";
    else if (type === "6") q = dim ? null : minor ? "m6" : "6";
    else if (type === "9th") q = dim ? null : minor ? "m9" : dominant ? "9" : "maj9";
    else if (type === "power") q = dim ? null : "5";
    if (q === null) continue;
    out.push({ name: nm(d.pc, q), numeral: d.numeral, pc: d.pc });
  }
  return out;
}

/**
 * Number of sharps (positive) or flats (negative) in the key signature.
 * @param {Key} key
 */
export function keySignature(key) {
  const majorPc = key.mode === "minor" ? mod12(key.tonic + 3) : key.tonic;
  const idx = CIRCLE.indexOf(majorPc); // 0..11 clockwise from C
  const flats = prefersFlats(key);
  if (idx === 0) return 0;
  return flats ? idx - 12 : idx;
}

/** Relative major/minor. @param {Key} key */
export const relativeKey = (key) =>
  key.mode === "major" ? keyFromTonic(key.tonic + 9, "minor") : keyFromTonic(key.tonic + 3, "major");

/** Pretty accidentals for display (not for editable text). @param {string} s */
export const pretty = (s) => String(s)
  .replace(/([A-G1-7])#/g, "$1♯").replace(/([A-G1-7])b/g, "$1♭")
  .replace(/(^|[\s/(])#(?=[1-7IViv])/g, "$1♯").replace(/(^|[\s/(])b(?=[1-7IViv])/g, "$1♭");

/** MIDI note number to frequency. @param {number} midi @param {number} [a4] */
export const midiToFreq = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);
