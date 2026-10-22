// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/core/music.js";
import { buildLines, linesToText, pairSegments, uniqueChords } from "../js/core/chart.js";
import { Store, normalizeSong, mergeLibraries, validateBackup, KEYS } from "../js/core/store.js";
import { packSong, packSet, encodeShare, decodeShare, unpackSong } from "../js/core/share.js";
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
