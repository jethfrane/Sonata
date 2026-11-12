// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/core/music.js";
import { buildLines, linesToText, pairSegments, uniqueChords, analyzeRawChart } from "../js/core/chart.js";
import { Store, normalizeSong, mergeLibraries, validateBackup, KEYS, libraryFingerprint, memoryStorage } from "../js/core/store.js";
import { parsePath } from "../js/router.js";
import { packSong, packSet, encodeShare, decodeShare, unpackSong, safeHref, MAX_LINK, qrUrl, decodeQr, parseLinks, setlistMessage } from "../js/core/share.js";
import { detectPitch, noteFromFreq } from "../js/core/pitch.js";
import { buildPdf, pdfString } from "../js/lib/export.js";

test("chord parsing and families", () => {
  assert.equal(M.chordFamily(M.parseChord("CM7")), "major");
  assert.equal(M.chordFamily(M.parseChord("Cm7")), "minor");
  assert.equal(M.chordFamily(M.parseChord("F#m7b5")), "half-diminished");
  assert.deepEqual(M.chordTones("Cmaj7"), [0, 4, 7, 11]);
  assert.deepEqual(M.chordTones("D/F#"), [2, 6, 9]);
  assert.equal(M.parseChord("Hello"), null);
  assert.equal(M.parseChord("G/B///").slashes, "///");
  assert.ok(M.isChordLine("G  -  C/G  -  G  -  D/F#"));
  assert.ok(!M.isChordLine("Amazing grace how sweet"));
});

test("transpose keeps columns and spells by key", () => {
  const g = M.parseKey("G");
  assert.equal(M.transposeText("G       C/G        G", 3, g), "Bb      Eb/Bb      Bb");
  assert.equal(M.transposeText("[G]once", 2, g), "[A]once");
  assert.equal(M.transposeText("F  Bb", 1, M.parseKey("F")), "F# B");
});

test("numbers and key facts", () => {
  const am = M.parseKey("Am");
  assert.equal(M.romanChord(M.parseChord("E7"), am), "V7");
  assert.equal(M.romanChord(M.parseChord("Bdim"), am), "ii°");
  assert.equal(M.nashvilleChord(M.parseChord("D/F#"), M.parseKey("G")), "5/7");
  assert.equal(M.keySignature(M.parseKey("Eb")), -3);
  assert.equal(M.keySignature(M.parseKey("F#m")), 3);
  assert.equal(M.relativeKey(M.parseKey("G")).name, "E minor");
  assert.equal(M.detectKey("G C G Em D G").name, "G major");
});

test("chart model: pairs, inline chords, lyrics view", () => {
  const key = M.parseKey("G");
  const lines = buildLines("## Verse\nG    C\nHello world\n[D]Hi [G]there", { key, mode: "chords" });
  assert.equal(lines[0].type, "section");
  assert.equal(lines[1].type, "pair");
  assert.equal(lines[2].type, "pair");
  assert.equal(linesToText(buildLines("[G]Amazing [C]grace", { key, mode: "lyrics" })), "Amazing grace");
  assert.ok(pairSegments("G       C", "Amazing grace").length >= 2);
  assert.deepEqual(uniqueChords("G C\nla [D]la", { key }), ["G", "C", "D"]);
  const capo = linesToText(buildLines("G C D", { key, capo: 2, transpose: 0 }));
  assert.equal(capo, "F Bb C");
});

test("store loads v1 data and skips bad records", () => {
  const mem = new Map();
  const ls = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  mem.set(KEYS.songs, JSON.stringify([{ id: "a", title: "A", body: "G", savedSnapshot: "G" }, null, 5]));
  const st = new Store(/** @type {any} */ (ls)).load();
  assert.equal(st.songs.length, 1);
  assert.equal(st.songs[0].transpose, 0);
  st.deleteSongs(["a"]);
  st.persist();
  assert.ok(JSON.parse(mem.get(KEYS.deleted)).includes("a"));
});

test("merge: newest wins, deletions win", () => {
  const a = normalizeSong({ id: "x", title: "old", updatedAt: "2026-01-01T00:00:00Z" });
  const b = normalizeSong({ id: "x", title: "new", updatedAt: "2026-02-01T00:00:00Z" });
  assert.equal(mergeLibraries({ songs: [a] }, { songs: [b] }).songs[0].title, "new");
  assert.equal(mergeLibraries({ songs: [a], deletedIds: ["x"] }, { songs: [b] }).songs.length, 0);
  assert.equal(validateBackup({ songs: "nope" }).ok, false);
});

test("share links round-trip", async () => {
  const enc = await encodeShare(packSong({ title: "T", body: "G C\nla", capo: 2, transpose: -1 }));
  const back = unpackSong(await decodeShare(enc));
  assert.equal(back.title, "T");
  assert.equal(back.capo, 2);
  assert.equal(back.transpose, -1);
  const set = await decodeShare(await encodeShare(packSet({ title: "S" }, [{ title: "a", body: "" }])));
  assert.equal(set.type, "set");
  assert.equal(await decodeShare("!!!"), null);
});

test("tuner pitch detection", () => {
  const sr = 48000, n = 4096, f = 110;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.3 * Math.sin(2 * Math.PI * f * i / sr) + 0.15 * Math.sin(4 * Math.PI * f * i / sr);
  const r = detectPitch(buf, sr);
  assert.ok(r && Math.abs(r.freq - f) < 0.3);
  assert.equal(noteFromFreq(r.freq).name, "A");
  assert.equal(detectPitch(new Float32Array(n), sr), null);
});

test("pdf keeps accented letters and is valid", async () => {
  assert.equal(pdfString("Señor"), "Se\\361or");
  assert.equal(pdfString("(a)"), "\\(a\\)");
  const pdf = await buildPdf([{ title: "Song", meta: "Key G", lines: buildLines("G\nHello", { key: M.parseKey("G") }) }]).text();
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.endsWith("%%EOF"));
  assert.ok(/^[\x00-\x7f]*$/.test(pdf), "pure ASCII so xref offsets are exact");
});

test("slash chords keep their bass; held notes are named", () => {
  const g = M.chordInfo("G/B");
  assert.equal(g.bassPc, 11);
  assert.equal(g.rootPc, 7);
  assert.deepEqual([...g.pcs].sort((a, b) => a - b), [2, 7, 11]);
  assert.equal(M.chordInfo("D/F#").bassPc, 6);
  assert.deepEqual(M.chordInfo("D/F#").pcs.slice().sort((a, b) => a - b), [2, 6, 9]);
  assert.equal(M.chordInfo("C").bassPc, null);
  assert.equal(M.identifyChord([55, 59, 62]), "G");
  assert.equal(M.identifyChord([47, 55, 62]), "G/B");
  assert.equal(M.identifyChord([60, 63, 67, 70]), "Cm7");
  assert.equal(M.identifyChord([60]), null);
});

test("share links: safe hrefs and size caps", async () => {
  assert.equal(safeHref("https://youtu.be/x"), "https://youtu.be/x");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("data:text/html,hi"), "");
  assert.equal(safeHref("not a url"), "");
  assert.equal(await decodeShare("A".repeat(MAX_LINK + 1)), null);
  // A tiny link that inflates to ~5 MB is refused instead of freezing the tab.
  const big = "v3." + JSON.stringify({ t: "x", b: "a".repeat(5 * 1024 * 1024) });
  const bytes = new Uint8Array(await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  const bomb = Buffer.from(bytes).toString("base64url");
  assert.ok(bomb.length < MAX_LINK, "bomb fits in a link");
  assert.equal(await decodeShare(bomb), null);
  // Normal songs still round-trip.
  const d = await decodeShare(await encodeShare(packSong({ title: "Ok", body: "G C" })));
  assert.equal(d.t, "Ok");
});

const freshStore = () => new Store(memoryStorage()).load();

test("blank starter songs are remembered as deleted, so sync can't bring them back", () => {
  const st = freshStore();
  const blank = st.createSong({});
  st.createSong({ title: "Real", body: "G C" });
  assert.ok(!st.songs.some((s) => s.id === blank.id));
  assert.ok(st.deletedIds.includes(blank.id));
  st.mergeIn({ songs: [blank], setlists: [] });
  assert.ok(!st.songs.some((s) => s.id === blank.id), "remote copy of the blank song stays gone");
});

test("undo and backup restore survive a deletion mark that already synced", () => {
  const st = freshStore();
  const a = st.createSong({ title: "Keep", body: "C F" });
  const set = st.saveSetlist({ title: "Sun", items: [{ songId: a.id }] });
  const setsBefore = st.setlists.map((x) => ({ ...x, items: [...x.items] }));
  const removed = st.songs.map((x) => ({ ...x }));
  st.deleteSongs([a.id]);
  const remote = { songs: [], setlists: [], deletedIds: [a.id] }; // Drive already has the mark
  st.restoreSongs(removed, setsBefore);
  st.mergeIn(remote);
  assert.equal(st.songs.length, 1, "undo keeps the song after the next sync");
  assert.equal(st.songs[0].title, "Keep");
  assert.equal(st.setlists.find((x) => x.id === set.id).items[0].songId, st.songs[0].id, "setlist points at the restored song");
  // Backup restore of something deleted here
  const st2 = freshStore();
  const b = st2.createSong({ title: "Gone", body: "D A" });
  st2.deleteSongs([b.id]);
  st2.importBackup({ songs: [b], setlists: [] });
  st2.mergeIn({ songs: [], setlists: [], deletedIds: [b.id] });
  assert.equal(st2.songs.filter((x) => x.title === "Gone").length, 1);
});

test("library fingerprint ignores order of deletions and the export time", () => {
  const st = freshStore();
  st.createSong({ title: "A", body: "G" });
  const one = st.snapshot();
  const two = { ...st.snapshot(), exportedAt: "x", deletedIds: [...one.deletedIds].reverse() };
  const before = libraryFingerprint(one);
  assert.equal(before, libraryFingerprint(two));
  st.createSong({ title: "B", body: "C" });
  assert.notEqual(before, libraryFingerprint(st.snapshot()));
});

test("memory storage stands in when the browser blocks storage", () => {
  const m = memoryStorage();
  m.setItem("k", 5);
  assert.equal(m.getItem("k"), "5");
  assert.equal(m.getItem("nope"), null);
  m.removeItem("k");
  assert.equal(m.length, 0);
});

test("a malformed URL escape does not break routing", () => {
  assert.doesNotThrow(() => parsePath("/song/%E0%A4%A"));
  assert.equal(parsePath("/play/%zz").view, "play");
  assert.equal(parsePath("/song/hello-abc123/stage").stage, true);
});

test("two tabs saving at once keep each other's songs", () => {
  const shared = memoryStorage();
  const a = new Store(shared).load();
  const b = new Store(shared).load();
  a.createSong({ title: "From A", body: "G C" });
  a.persist();
  b.createSong({ title: "From B", body: "D A" });
  b.persist(); // b has not seen A's save; it must merge instead of overwriting
  const saved = JSON.parse(shared.getItem(KEYS.songs)).map((s) => s.title).sort();
  assert.deepEqual(saved, ["From A", "From B"]);
  assert.ok(b.songs.some((s) => s.title === "From A"), "b picked up A's song");
  // A deletion in one tab is not undone by the other
  const x = a.songs.find((s) => s.title === "From A");
  a.deleteSongs([x.id]); a.persist();
  b.persist();
  assert.ok(!JSON.parse(shared.getItem(KEYS.songs)).some((s) => s.title === "From A"));
});

test("a lone lowercase letter is a word, not a chord line", () => {
  assert.equal(M.lineKind("a"), "lyrics");
  assert.equal(M.lineKind("a b c"), "lyrics");
  assert.equal(M.lineKind("Am G"), "chords");
  assert.equal(M.lineKind("A"), "chords");
});

test("v3.2: 6/9 chords are chords, not a bass note", () => {
  const c = M.parseChord("C6/9");
  assert.equal(c.quality, "6/9");
  assert.equal(c.bassPc, null);
  assert.deepEqual(M.chordTones("C6/9"), [0, 4, 7, 9, 2]);
  assert.equal(M.parseChord("C6/9/E").bass, "E");
  assert.equal(M.parseChord("C6/9///").slashes, "///");
  assert.equal(M.parseChord("C7/9"), null, "only 6/9 is read as one chord");
  assert.equal(M.transposeText("G  C6/9  D", 2, M.parseKey("G")), "A  D6/9  E");
});

test("v3.2: labels and repeat marks keep a line a chord line", () => {
  assert.equal(M.lineKind("Intro: G  C  G"), "chords");
  assert.equal(M.lineKind("Tag:  Em  C"), "chords");
  assert.equal(M.lineKind("Em  C  G  D  (repeat)"), "chords");
  assert.equal(M.lineKind("G  C  (x2)"), "chords");
  assert.equal(M.lineKind("Intro:"), "lyrics", "a label alone is not a chord line");
  assert.equal(M.lineKind("Verse 2"), "lyrics");
  assert.equal(M.lineKind("Note: G is the key"), "lyrics", "only known labels, and only first");
  assert.equal(M.transposeText("Intro: G  C  G", 2, M.parseKey("G")), "Intro: A  D  A");
  const html = buildLines("Intro: G  C  (x2)", { key: M.parseKey("G") }).map((l) => l.chords).join("");
  assert.equal(html, "Intro: G  C  (x2)");
  assert.deepEqual(M.extractChords("Intro: G  C  (repeat)").map((c) => c.raw), ["G", "C"]);
});

// ---- v4 ----
import * as CH from "../js/core/chords.js";
import { QRCode } from "../js/lib/qr.js";
import { createRequire } from "node:module";
const jsQR = createRequire(import.meta.url)("jsqr");

/** Render a QR code to pixels and read it back with an independent decoder. */
function scan(text, ecc) {
  const qr = QRCode.generate(text, ecc);
  const n = qr.getModuleCount(), sc = 4, m = 4, W = (n + 2 * m) * sc;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c))
    for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) { const i = (((r + m) * sc + y) * W + (c + m) * sc + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return { n, data: jsQR(px, W, W)?.data };
}

test("v4: QR codes scan at every error-correction level, in byte and alphanumeric mode", async () => {
  for (const ecc of ["L", "M", "Q", "H"]) {
    assert.equal(scan("https://sonata.jethrofrane.xyz/share/x?s=abc_DEF-123", ecc).data, "https://sonata.jethrofrane.xyz/share/x?s=abc_DEF-123", "byte " + ecc);
    assert.equal(scan("HTTPS://SONATA.JETHROFRANE.XYZ/Q/ABCDEF234567", ecc).data, "HTTPS://SONATA.JETHROFRANE.XYZ/Q/ABCDEF234567", "alnum " + ecc);
  }
  const body = "## Verse\n" + "G        D/F#        Em      C\nHere I am to worship, here I am to bow down\n".repeat(10);
  const d = packSong({ title: "Here I Am", body });
  const q = await qrUrl("https://sonata.jethrofrane.xyz", d);
  const old = "https://sonata.jethrofrane.xyz/share/here-i-am?s=" + (await encodeShare(d));
  const a = scan(q, "L"), b = scan(old, "L");
  assert.equal(a.data, q);
  assert.ok(a.n < b.n, `QR link makes a smaller code (${a.n} < ${b.n})`);
  assert.equal((await decodeQr(q.split("/Q/")[1])).b, d.b);
});

test("v4: compact links round-trip songs and setlists; v3 links still open", async () => {
  const song = packSong({ title: "Way Maker", artist: "Sinach", body: "G C", manualKey: "G:major", capo: 2, bpm: 68, genre: "Worship", links: [{ name: "Ref", url: "https://youtu.be/x" }] });
  const back = await decodeShare(await encodeShare(song));
  assert.deepEqual(back, song);
  const set = packSet({ title: "Sunday", description: "Morning" }, [{ title: "A", body: "G" }, { title: "B", body: "D" }]);
  assert.deepEqual(await decodeShare(await encodeShare(set)), set);
  const zlib = await import("node:zlib");
  const v3 = zlib.deflateRawSync("v3." + JSON.stringify({ t: "Old link", b: "C G" })).toString("base64url");
  assert.equal((await decodeShare(v3)).t, "Old link");
});

test("v4: a pasted setlist message rebuilds the setlist", async () => {
  const msg = await setlistMessage("https://sonata.jethrofrane.xyz/", { title: "Sunday, Nov 9" }, [{ title: "One", body: "G C" }, { title: "Two", artist: "X", body: "D A" }]);
  const r = await parseLinks("Hi team!\n" + msg + "\nthanks");
  assert.equal(r.title, "Sunday, Nov 9");
  assert.deepEqual(r.songs.map((s) => s.t), ["One", "Two"]);
  const q = await qrUrl("https://sonata.jethrofrane.xyz", packSong({ title: "Three", body: "E" }));
  assert.equal((await parseLinks(`see ${q.toLowerCase().replace("https://sonata.jethrofrane.xyz", "https://sonata.jethrofrane.xyz")}`)).songs[0].t, "Three");
  assert.deepEqual((await parseLinks("no links here https://example.com/?s=garbage")).songs, []);
});

test("v4: chord dictionary names notes, formulas and slash chords", () => {
  const d = CH.describeChord("Am7/G");
  assert.deepEqual(d.notes, ["A", "C", "E", "G"]);
  assert.deepEqual(d.formula, ["1", "♭3", "5", "♭7"]);
  assert.equal(d.bassNote, "G");
  assert.equal(CH.describeChord("Bbmaj7").notes.join(" "), "Bb D F A");
  assert.equal(CH.describeChord("F#m7b5").notes.join(" "), "F# A C E");
  assert.equal(CH.describeChord("Cmin7").quality, "m7", "aliases map to the catalog");
  assert.deepEqual(CH.inversions("C"), ["C/E", "C/G", "C/Bb"]);
  for (const q of CH.QUALITIES) assert.ok(CH.describeChord("C" + q.id), "parses C" + q.id);
});

test("v4: guitar and ukulele shapes match the chord books and always sound the chord", () => {
  const first = (n, t) => CH.voicings(n, t)[0].frets.map((x) => (x < 0 ? "x" : x)).join("");
  const G = CH.TUNINGS.guitar.strings, U = CH.TUNINGS.ukulele.strings;
  for (const [n, want] of [["C", "x32010"], ["G", "320003"], ["D", "xx0232"], ["Am", "x02210"], ["E", "022100"], ["F", "133211"], ["D/F#", "200232"], ["G/B", "x20003"], ["Am/G", "3x2210"], ["Bm", "x24432"]]) assert.equal(first(n, G), want, n);
  for (const [n, want] of [["C", "0003"], ["G", "0232"], ["Am", "2000"], ["F", "2010"], ["D", "2220"]]) assert.equal(first(n, U), want, "uke " + n);
  // Every shape of many chords: lowest guitar note is the bass, and only chord tones sound.
  for (const n of ["Cmaj9", "Ebsus2", "F#m11", "Ab7#9", "B13", "Dm/C", "E/G#", "Gdim7", "Caug", "A6/9", "C#m7b5", "Bb/D"]) {
    const d = CH.describeChord(n);
    const ok = new Set(d.pcs.concat(d.bassPc ?? []));
    const vs = CH.voicings(n, G);
    assert.ok(vs.length >= 2, n + " has shapes");
    for (const v of vs) {
      assert.ok(v.notes.every((m) => ok.has(((m % 12) + 12) % 12)), n + " only chord tones");
      assert.equal(((v.notes[0] % 12) + 12) % 12, d.bassPc ?? d.rootPc, n + " bass");
      assert.ok(v.fingers <= 4, n + " playable");
    }
  }
  assert.ok(CH.bassMap("Am/G").some((p) => p.bass && p.fret === 3 && p.string === 0), "bass map marks the slash note");
  assert.deepEqual(CH.pianoVoicing("C/E"), { bass: 52, notes: [60, 64, 67] });
});

test("v4: chord families for a key include slash, walking bass and secondary dominants", () => {
  const g = M.parseKey("G:major");
  assert.deepEqual(M.chordsForKey(g, "slash").slice(0, 6).map((c) => c.name), ["G/B", "Am/C", "Bm/D", "C/E", "D/F#", "Em/G"]);
  assert.deepEqual(M.chordsForKey(g, "walk").map((c) => c.name), ["G", "D/F#", "Em", "Em/D", "C", "G/B", "Am", "D"]);
  assert.ok(M.chordsForKey(g, "secondary").map((c) => c.name).includes("B7"));
  for (const t of M.CHORD_TYPES) for (const c of M.chordsForKey(g, t.id)) assert.ok(M.parseChord(c.name), `${t.id}: ${c.name} parses`);
});

test("v4: compressed PDF is valid and much smaller", async () => {
  const { buildPdfSmall } = await import("../js/lib/export.js");
  const zlib = await import("node:zlib");
  const body = "## Verse\n" + "G        D/F#      Em        C\nHere I am to worship, here I am to bow down\n".repeat(30);
  const docs = [{ title: "Long song", meta: "Key G", lines: buildLines(body, { key: M.parseKey("G") }) }];
  const plain = Buffer.from(await (await buildPdf(docs)).arrayBuffer());
  const small = Buffer.from(await (await buildPdfSmall(docs)).arrayBuffer());
  assert.ok(small.length < plain.length * 0.6, `smaller: ${small.length} vs ${plain.length}`);
  const text = small.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF"));
  // Every xref offset points at "n 0 obj".
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + String(i + 1).length + 6), `${i + 1} 0 obj`));
  // Page streams inflate back to the drawing commands.
  const m = text.match(/\/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/);
  const start = m.index + m[0].length;
  const inflated = zlib.inflateSync(small.subarray(start, start + Number(m[1]))).toString("latin1");
  assert.ok(inflated.includes("Here I am to worship"));
});

test("v4: libraries saved before genre/song bank existed don't count as changed", () => {
  const old = { songs: [{ id: "a", title: "A", body: "G", updatedAt: "2026-01-01T00:00:00.000Z" }], setlists: [], deletedIds: [] };
  const now = { songs: old.songs.map((s) => ({ ...s, genre: "", inBank: false })), setlists: [], deletedIds: [] };
  assert.equal(libraryFingerprint(old), libraryFingerprint(now));
  assert.notEqual(libraryFingerprint(old), libraryFingerprint({ ...now, songs: [{ ...now.songs[0], inBank: true }] }));
});

test("Song Bank v2: social links, payment codes and v1 files", async () => {
  const B = await import("../js/core/bank.js");
  const s = B.normalizeSocials({ instagram: "https://www.instagram.com/jethrofrane/?hl=en", tiktok: "@jethro.frane", facebook: "https://m.facebook.com/jethro.frane", youtube: "https://youtube.com/@jethro", spotify: "https://evil.example.com/x", website: "jethrofrane.xyz", email: "bad" });
  assert.equal(s.instagram, "jethrofrane");
  assert.equal(s.tiktok, "jethro.frane");
  assert.equal(s.facebook, "jethro.frane");
  assert.equal(s.youtube, "https://youtube.com/@jethro");
  assert.equal(s.spotify, "", "only spotify.com links");
  assert.equal(s.website, "https://jethrofrane.xyz/");
  assert.equal(s.email, "");
  // v1 files: Messenger name becomes Facebook; WhatsApp, SMS and Telegram are dropped.
  const v1 = B.parseBankFile({ type: "sonata-bank", v: 1, title: "Old", songs: [], contacts: { whatsapp: "+63917", messenger: "old.name", email: "a@b.co", telegram: "x" } });
  assert.equal(v1.socials.facebook, "old.name");
  assert.equal(v1.socials.email, "a@b.co");
  assert.ok(!("whatsapp" in v1.socials));
  assert.ok(!("requestTargets" in B) && !("requestText" in B), "Song Banks are view-only: no request channel");
  // Payment codes: QR Ph text or a small picture; anything else is dropped. At most four.
  const pay = B.normalizePayments([
    { label: "GCash", qr: "00020101021127830012com.p2pqrpay0111GXCHPHM2" },
    { label: "Maya", qr: "<script>alert(1)</script>\u0000" },
    { label: "BPI", img: "data:image/svg+xml;base64,PHN2Zz4=" },
    { label: "BDO", img: "data:image/png;base64,iVBORw0KGgo=" }
  ]);
  assert.deepEqual(pay.map((p) => p.label), ["GCash", "BDO"]);
  assert.equal(B.guessPaymentLabel("0002010102112783...GXCHPHM2..."), "GCash");
  assert.equal(B.isPaymentQr("000201..."), true);
  assert.equal(B.imageData("data:image/jpeg;base64," + "A".repeat(300 * 1024)), "", "big pictures refused");
  assert.equal(B.bankSlug("Jethro Frane & Friends!"), "jethro-frane-friends");
  const links = B.socialLinks({ ...s, email: "me@x.co" }).map((l) => l.kind);
  assert.deepEqual(links, ["instagram", "tiktok", "facebook", "youtube", "website", "email"]);
  const file = B.buildBankFile(B.normalizeProfile({ name: "Jethro", socials: s, payments: pay }), [{ id: "s1", title: "A", inBank: true, body: "G" }], () => "G");
  assert.equal(file.v, 3);
  assert.equal(file.title, "Jethro's Song Bank");
  assert.deepEqual(B.parseBankFile(JSON.parse(JSON.stringify(file))).payments, pay);
});

test("Song Bank v3: theme, readable accent, gigs and payee", async () => {
  const B = await import("../js/core/bank.js");
  // Theme: unknown values fall back, colors must be #rrggbb, pictures must be small images.
  assert.deepEqual(B.normalizeTheme(null), { preset: "auto", accent: "", font: "modern", cover: "" });
  const t = B.normalizeTheme({ preset: "stage", accent: "#E11D48", font: "classic", cover: "data:image/svg+xml;base64,AAAA" });
  assert.deepEqual(t, { preset: "stage", accent: "#e11d48", font: "classic", cover: "" });
  assert.equal(B.normalizeTheme({ preset: "<script>", accent: "red", font: "comic" }).preset, "auto");
  assert.equal(B.normalizeTheme({ accent: "url(javascript:1)" }).accent, "");
  // Accent is made readable on the page it sits on (4.5:1), darker on light pages and lighter on dark ones.
  for (const [accent, surface] of [["#ffee00", "#ffffff"], ["#111133", "#0d0d0f"], ["#3b5bdb", "#fffaf3"], ["#ff69b4", "#fff8fa"]]) {
    const r = B.readableAccent(accent, surface);
    assert.ok(B.contrast(r, surface) >= 4.5, `${accent} on ${surface} -> ${r}`);
  }
  assert.equal(B.readableAccent("#1d4ed8", "#ffffff"), "#1d4ed8", "already readable colors are kept");
  assert.equal(B.readableAccent("nope", "#ffffff"), "nope");
  assert.equal(B.inkOn("#ffee00"), "#111111");
  assert.equal(B.inkOn("#1d4ed8"), "#ffffff");
  // Every preset keeps text readable on its page and card.
  for (const [id, th] of Object.entries(B.THEMES)) if (th.bg) { assert.ok(B.contrast(th.text, th.bg) >= 7, id); assert.ok(B.contrast(th.text, th.surface) >= 7, id); }
  // Gigs: valid date and place needed, https links only, six at most, soonest first, past ones hidden by upcomingGigs.
  const g = B.normalizeGigs([
    { date: "2026-12-24", place: "Plaza", note: "Caroling", url: "http://example.com/x" },
    { date: "2026-11-20", time: "19:30", place: "Cafe Uno", url: "javascript:alert(1)" },
    { date: "2026-13-40", place: "Bad date" }, { date: "2026-11-01", place: "" }, { date: "2026-10-01", place: "Past" },
    ...Array.from({ length: 8 }, (_, i) => ({ date: `2027-01-0${i + 1}`, place: "P" + i }))
  ]);
  assert.equal(g.length, 6);
  assert.equal(g[0].place, "Past");
  assert.equal(g.find((x) => x.place === "Cafe Uno").url, "");
  assert.equal(g.find((x) => x.place === "Plaza").url, "https://example.com/x");
  assert.deepEqual(B.upcomingGigs(g, "2026-11-10").map((x) => x.place).slice(0, 2), ["Cafe Uno", "Plaza"]);
  assert.equal(B.normalizeGigs("x").length, 0);
  // Payee: the name written inside a QR Ph code, so a visitor can compare it with their own app.
  const code = "00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO83CHRN5204601653036085802PH5912JETHRO FRANE6011Quezon City6304ABCD";
  assert.deepEqual(B.paymentPayee(code), { name: "JETHRO FRANE", city: "Quezon City" });
  assert.equal(B.paymentPayee("hello"), null);
  assert.equal(B.paymentPayee("000201" + "5999X"), null, "broken length is refused");
  // Files: v3 round trip keeps theme and gigs; older files open with defaults.
  const prof = B.normalizeProfile({ name: "Ana", theme: { preset: "ocean", accent: "#0a7", font: "rounded" }, gigs: [{ date: "2027-02-14", place: "Hall" }] });
  assert.equal(prof.theme.preset, "ocean"); assert.equal(prof.theme.accent, "", "short hex is refused"); assert.equal(prof.gigs.length, 1);
  const file = B.buildBankFile(prof, [{ id: "x1", title: "A", inBank: true, body: "C" }], () => "C");
  assert.equal(file.v, 3);
  const back = B.parseBankFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.theme.preset, "ocean"); assert.equal(back.gigs[0].place, "Hall");
  const old = B.parseBankFile({ type: "sonata-bank", v: 2, title: "Old", songs: [] });
  assert.deepEqual(old.theme, { preset: "auto", accent: "", font: "modern", cover: "" }); assert.deepEqual(old.gigs, []);
});

test("Studio instrument samples: piano, guitar, ukulele and bass multi-samples exist and cover every register", async () => {
  const { statSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { SAMPLE_ANCHORS } = await import("../js/audio.js");
  for (const kind of /** @type {const} */ (["piano", "guitar", "uke", "bass"])) {
    const anchors = SAMPLE_ANCHORS[kind];
    assert.ok(anchors.length >= 9, `${kind} has multi-sample anchors`);
    for (let i = 0; i < anchors.length; i++) {
      const [midi, file] = anchors[i];
      if (i > 0) assert.equal(midi - anchors[i - 1][0], 3, `${kind} anchors spaced every minor 3rd`);
      const p = fileURLToPath(new URL(`../public/samples/${kind}/${file}`, import.meta.url));
      const st = statSync(p);
      assert.ok(st.size > 15000, `${kind}/${file} is a non-empty studio sample (${st.size} B)`);
    }
  }
});

test("Chord builder identification: names triads, 7ths, 9ths, 5th-omitted voicings and slash chords", () => {
  assert.equal(M.identifyChord([60, 64, 67, 71, 74], false), "Cmaj9");
  assert.equal(M.identifyChord([57, 60, 64, 67, 71], false), "Am9");
  assert.equal(M.identifyChord([55, 59, 65], false), "G7", "5th-omitted shell voicing G-B-F names G7");
  assert.equal(M.identifyChord([54, 57, 62], false), "D/F#", "1st-inversion D triad names D/F#");
  assert.equal(M.identifyChord([55, 60, 65, 69], false), "F/G", "upper triad F over G bass names F/G");
  assert.equal(M.DEGREE_FROM_SEMITONES[4], "3");
  assert.equal(M.DEGREE_FROM_SEMITONES[10], "♭7");
});

test("Key finder, smart raw chart analyzer, and DrumLooper presets", async () => {
  const kf = M.findKeysFromChords("G D/F# Em C");
  assert.ok(kf, "finds key from progression");
  assert.equal(kf.best.name, "G major");
  assert.equal(kf.relative.name, "E minor");
  assert.deepEqual(kf.progression.map((x) => x.roman), ["I", "V/7", "vi", "IV"]);

  const raw = "https://tabs.ultimate-guitar.com/tab/hillsong/oceans-chords-123\nTitle: Oceans\nArtist: Hillsong United\nCapo: 2\nBPM: 72\n[Intro]\nBm  A/C#  D  A  G\n[Verse 1]\nBm              A/C#            D\nYou call me out upon the waters";
  const parsed = analyzeRawChart(raw);
  assert.ok(parsed, "analyzes raw chord sheet + reference link");
  assert.equal(parsed.title, "Oceans");
  assert.equal(parsed.artist, "Hillsong United");
  assert.equal(parsed.capo, 2);
  assert.equal(parsed.bpm, 72);
  assert.equal(parsed.links.length, 1);
  assert.ok(parsed.body.includes("## Intro") && parsed.body.includes("## Verse 1"));
  assert.ok(parsed.chords.includes("Bm") && parsed.chords.includes("D"));

  const { DrumLooper, DRUM_PADS, DRUM_PRESETS } = await import("../js/audio.js");
  const dl = new DrumLooper();
  assert.equal(DRUM_PADS.length, 8);
  assert.equal(dl.sig, "4/4");
  assert.equal(dl.grid.kick.length, 16);
  assert.equal(dl.grid.kick[0], 1);
  dl.syncSignature("3/4");
  assert.equal(dl.sig, "3/4");
  assert.equal(dl.length, 12);
  dl.syncSignature("6/8");
  assert.equal(dl.sig, "6/8");
  assert.equal(dl.length, 12);
  assert.ok(Object.values(DRUM_PRESETS).some((p) => p.sig === "3/4"));
  assert.ok(Object.values(DRUM_PRESETS).some((p) => p.sig === "4/4"));
  assert.ok(Object.values(DRUM_PRESETS).some((p) => p.sig === "6/8"));
});

test("exports: accent is readable on white, timing marks are quiet, long charts flow onto pages", async () => {
  const { accentInk, chordRuns, flowRows, buildPdf: pdf } = await import("../js/lib/export.js");
  const lum = (rgb) => rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const hex of ["#8ea2ff", "#3b5bdb", "#ffffff", "#facc15"]) assert.ok(1.05 / (lum(accentInk(hex)) + 0.05) >= 4.5, `${hex} reads on white`);
  assert.deepEqual(chordRuns("A / - E/G# x2").map((r) => [r.i, r.mark]), [[0, false], [2, true], [4, true], [6, false], [11, true]]);
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ kind: "section", text: "VERSE" }, { kind: "chord", text: "G", keep: true }, { kind: "lyric", text: "words" }, { kind: "gap", text: "" });
  const flow = flowRows(rows, { size: 20, columns: 1, first: 1000, rest: 1200 });
  assert.ok(flow.pages.length > 1, "more than one page");
  for (const page of flow.pages) {
    const last = rows[page[page.length - 1].row];
    assert.ok(last.kind !== "section" && !last.keep, "no page ends on a section name or a chord line without its words");
    assert.ok(rows[page[0].row].kind !== "gap", "no page starts with a gap");
  }
  assert.equal(flow.pages.flat().filter((it) => rows[it.row].kind !== "gap").length, 120, "every line is placed once");
  const two = flowRows(rows.slice(0, 16), { size: 20, columns: 2, first: 1000, rest: 1200 });
  assert.ok(two.pages.length === 1 && two.pages[0].some((it) => it.col === 1), "a short chart balances across both columns");
  const text = await pdf([{ title: "Song", meta: "Key A", lines: buildLines("Verse:\nA / - E /\n\n" + "G  C\nline\n".repeat(80), { key: M.parseKey("A") }) }]).text();
  assert.ok(text.includes("(VERSE)") && !text.includes("(Verse:)"), "a plain 'Verse:' line prints as a section name");
  assert.ok((text.match(/\/Type \/Page /g) || []).length > 1 && text.includes("Page 2 of"), "a long chart continues on more pages");
});
