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

test("Song Bank v4: a song list only; older files open with the removed fields ignored", async () => {
  const B = await import("../js/core/bank.js");
  const old = B.parseBankFile({ type: "sonata-bank", v: 3, title: "Old", name: "J", songs: [{ t: "A", k: "G" }], photo: "data:image/png;base64,iVBORw0KGgo=", socials: { instagram: "x" }, links: [{ label: "L", url: "https://x.co" }], payments: [{ label: "GCash", qr: "000201" }], contacts: { whatsapp: "+63917" } });
  assert.equal(old.title, "Old"); assert.equal(old.songs.length, 1);
  for (const k of ["photo", "socials", "links", "payments", "contacts"]) assert.ok(!(k in old), `${k} is not passed on`);
  for (const k of ["normalizeSocials", "normalizePayments", "socialLinks", "paymentPayee", "guessPaymentLabel", "requestTargets"]) assert.ok(!(k in B), `${k} is gone`);
  assert.equal(B.imageData("data:image/jpeg;base64," + "A".repeat(300 * 1024)), "", "big pictures refused");
  assert.equal(B.bankSlug("Jethro Frane & Friends!"), "jethro-frane-friends");
  const profile = B.normalizeProfile({ name: "Jethro", socials: { instagram: "x" }, payments: [{ label: "GCash", qr: "000201" }], photo: "data:image/png;base64,iVBORw0KGgo=" });
  for (const k of ["photo", "socials", "links", "payments"]) assert.ok(!(k in profile), `profile drops ${k}`);
  const file = B.buildBankFile(profile, [{ id: "s1", title: "A", inBank: true, body: "G" }], () => "G");
  assert.equal(file.v, 4);
  assert.equal(file.title, "Jethro's Song Bank");
  assert.ok(!("payments" in file) && !("socials" in file) && file.songs[0].b === "G");
});

test("Song Bank: theme, readable accent and gigs", async () => {
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
  // Files: v3 round trip keeps theme and gigs; older files open with defaults.
  const prof = B.normalizeProfile({ name: "Ana", theme: { preset: "ocean", accent: "#0a7", font: "rounded" }, gigs: [{ date: "2027-02-14", place: "Hall" }] });
  assert.equal(prof.theme.preset, "ocean"); assert.equal(prof.theme.accent, "", "short hex is refused"); assert.equal(prof.gigs.length, 1);
  const file = B.buildBankFile(prof, [{ id: "x1", title: "A", inBank: true, body: "C" }], () => "C");
  assert.equal(file.v, 4);
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

test("import: reads a chart out of a chord page and refuses unsafe addresses", async () => {
  const I = await import("../js/core/import.js");
  const page = `<html><head><title>Way Maker - Sinach Chords | SomeSite</title><style>.x{}</style></head><body><nav>Home Artists G C D</nav>
    <h1>Way Maker</h1><p>Posted by admin in Worship</p>
    <pre>Capo 2\n[Verse 1]\n<span class="chord">E</span>                 <span>B</span>\nYou are here, moving in our midst\nC#m            A\nI worship You\n\n[Chorus]\nE      B\nWay maker, miracle worker</pre>
    <footer>Copyright 2026. A B C.</footer><script>var chords = "G C D Em";</script></body></html>`;
  const got = I.extractChart(page);
  assert.equal(got.title, "Way Maker"); assert.equal(got.artist, "Sinach");
  assert.ok(got.text.startsWith("Capo 2\n[Verse 1]\nE                 B\nYou are here"), got.text);
  assert.ok(got.text.includes("C#m            A\nI worship You") && got.text.endsWith("Way maker, miracle worker"), "spacing and last lyric kept");
  assert.ok(!/Home Artists|Copyright|var chords/.test(got.text), "menus, footer and scripts are left out");
  // No <pre>: chords in spans inside divs, with entities.
  const divs = `<body><div class="menu">Login &amp; Register</div><div class="song"><div>[Intro]</div><div><b>G</b>&nbsp;&nbsp;&nbsp;<b>D/F#</b>&nbsp;&nbsp;<b>Em7</b></div><div>Here I am to worship</div><div><b>C</b>   <b>G</b></div><div>Here I am to bow down</div></div><div>Related songs: 10,000 Reasons</div></body>`;
  const d = I.extractChart(divs);
  assert.ok(d.text.startsWith("[Intro]\nG   D/F#  Em7\nHere I am to worship") && !d.text.includes("Related") && !d.text.includes("Login"), d.text);
  assert.equal(I.extractChart("<html><body><p>Just a blog post about a concert in G minor.</p></body></html>"), null, "a page with no chart");
  assert.ok(I.extractChart("{title: X}\n[G]Amazing [C]grace how [G]sweet\n[Em]the [D]sound", "text/plain").text.includes("[G]Amazing"), "plain ChordPro text");
  assert.deepEqual(I.splitTitle("Amazing Grace by Chris Tomlin - Guitar Chords"), { title: "Amazing Grace", artist: "Chris Tomlin" });
  assert.deepEqual(I.splitTitle("Way Maker Chords by Sinach"), { title: "Way Maker", artist: "Sinach" });
  assert.equal(I.extractChart("<body><p>B</p><p>A preview of the first page. Buy the chart to see more.</p></body>"), null, "a paid preview with one chord is not a chart");
  assert.equal(I.extractChart("<body><p>B</p><p>Available Keys</p><p> A,  Ab,  B,  Bb,  C,  C#,  D,  Db,  E,  Eb,  F,  F#,  G</p></body>"), null, "a list of keys is not a chart");
  assert.equal(I.chordsIn("Am I the only one").chordLine, false, "a lyric that starts with a chord-like word is not a chord line");
  assert.equal(I.chordsIn("A / - E/G# / - F#m x2").count, 3);
  for (const bad of ["http://localhost/x", "https://127.0.0.1/x", "https://192.168.1.4/x", "https://[::1]/x", "ftp://site.com/x", "https://user:pw@site.com/x", "https://site.com:8443/x", "https://intranet/x", "https://printer.local/x", "file:///etc/passwd", "javascript:alert(1)"]) assert.equal(I.publicUrl(bad), null, bad);
  assert.equal(I.publicUrl("http://site.com/song").href, "https://site.com/song", "plain http is upgraded");
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.9", "192.168.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) assert.equal(I.privateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "76.76.21.21", "2606:4700::1111"]) assert.equal(I.privateAddress(ip), false, ip);
  assert.equal(I.loneLink("https://sonata.jethrofrane.xyz/?s=abc"), "", "a Sonata share link is not a web page to read");
  assert.equal(I.loneLink("https://site.com/song\nG C D"), "", "a link with chords under it is a reference, not a page to read");
});

test("sharing: a share id travels with a song; live setlist files are checked", async () => {
  const S = await import("../js/core/share.js");
  const { normalizeSong, normalizeSetlist } = await import("../js/core/store.js");
  const { parsePath } = await import("../js/router.js");
  const packed = S.packSong({ id: "song-abc123def456", title: "A", body: "G C" });
  assert.equal(packed.i, "abc123def4".length === 10 ? S.shareId({ id: "song-abc123def456" }) : "");
  assert.equal(S.shareId({ id: "song-abc123def456" }), "c123def456".padStart(10, "b").slice(-10));
  assert.equal(S.shareId({ id: "song-zzz", origin: "c123def456" }), "c123def456", "a saved copy keeps the id of the song it came from");
  assert.equal(S.shareId({ id: "shared" }), "", "an unsaved preview has no id of its own");
  const round = S.unpackSong(S.fromCompact(JSON.parse(JSON.stringify(S.toCompact(packed)))));
  assert.equal(round.origin, packed.i); assert.equal(round.title, "A");
  assert.equal(S.unpackSong({ t: "Old link", b: "G" }).origin, "", "older links without an id still open");
  assert.equal(normalizeSong({ id: "x1", title: "A", body: "G", origin: "c123def456" }).origin, "c123def456");
  assert.ok(!("origin" in normalizeSong({ id: "x1", title: "A", body: "G" })), "songs written here carry no origin");
  const file = S.buildSetFile({ title: "Sunday", description: "9am" }, [{ id: "song-abc123def456", title: "A", body: "G C" }, { id: "song-2", title: "B", body: "[D]hi" }]);
  assert.equal(file.type, "sonata-set"); assert.equal(file.s.length, 2); assert.equal(file.s[0].i, packed.i);
  const back = S.parseSetFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.type, "set"); assert.equal(back.t, "Sunday"); assert.equal(back.s[1].t, "B");
  for (const bad of [null, [], { type: "sonata-bank", songs: [] }, { type: "sonata-set", s: [] }, { type: "sonata-set", s: [{ t: 1 }] }, { s: [{ t: "A", b: "G" }] }]) assert.equal(S.parseSetFile(bad), null);
  const set = normalizeSetlist({ id: "set-1", title: "S", items: [], liveId: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345", source: "<script>" });
  assert.equal(set.liveId, "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"); assert.ok(!("source" in set), "only real Drive file ids are kept");
  const r = parsePath("/set/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/sunday");
  assert.equal(r.view, "set"); assert.equal(r.raw, "1AbCdEfGhIjKlMnOpQrStUvWxYz012345", "the file id keeps its case");
});

test("backup files: checksum, limits, and going back to an earlier version", async () => {
  const { buildBackupFile, readBackupFile } = await import("../js/core/backupfile.js");
  const { validateBackup, BACKUP_LIMITS } = await import("../js/core/store.js");
  const { fingerprint } = await import("../js/core/snapshots.js");
  const st = freshStore();
  const a = st.createSong({ title: "A", body: "G C D G and some words" });
  const text = await buildBackupFile(st.snapshot());
  let r = await readBackupFile(text);
  assert.ok(r.ok && !r.damaged && r.songs === 1, "a fresh backup file reads back clean");
  r = await readBackupFile(text.replace("G C D G", "G C D A"));
  assert.ok(r.ok && r.damaged, "a backup changed after saving is flagged, not silently restored");
  r = await readBackupFile(JSON.stringify({ songs: [a], setlists: [] }));
  assert.ok(r.ok && !r.damaged, "older backups without a checksum still open");
  assert.equal((await readBackupFile("not json")).ok, false);
  assert.equal((await readBackupFile(JSON.stringify({ app: "other", songs: [] }))).ok, false, "a file from another app is refused");
  assert.equal(validateBackup({ songs: new Array(BACKUP_LIMITS.songs + 1).fill({}) }).ok, false, "an absurdly large backup is refused");

  // Going back: the earlier version of a song wins over a later edit; songs added since stay.
  const earlier = JSON.parse(JSON.stringify(st.snapshot()));
  st.update(st.song(a.id), { body: "changed later, by mistake" });
  const b = st.createSong({ title: "B", body: "added after the restore point" });
  st.importBackup(earlier, { prefer: true });
  assert.equal(st.song(a.id).body, "G C D G and some words", "the song is back to the earlier version");
  assert.ok(st.song(b.id), "a song added since is kept");
  // A plain restore from a file never overwrites newer work.
  st.update(st.song(a.id), { body: "newer than the file" });
  st.importBackup(earlier);
  assert.equal(st.song(a.id).body, "newer than the file");

  const lib = st.snapshot();
  assert.equal(fingerprint(lib), fingerprint({ ...lib, songs: lib.songs.map((x) => ({ ...x, lastOpenedAt: "2030-01-01T00:00:00.000Z" })) }), "opening a song is not a change worth a restore point");
  assert.notEqual(fingerprint(lib), fingerprint({ ...lib, songs: lib.songs.slice(1) }));
});
