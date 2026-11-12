// Vercel functions: link previews (api/page.js) and the song bank reader (api/bank.js).
// Google Drive is faked by replacing fetch. Needs dist/index.html (npm run build first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { packSong, packSet, encodeShare, qrUrl } from "../js/core/share.js";

const BANK = { type: "sonata-bank", v: 1, title: "Jethro's Song Bank", name: "Jethro", bio: "", contacts: { whatsapp: "+639170000000" }, updatedAt: "2026-11-09", songs: [{ id: "a", t: "Buwan", a: "Juan Karlos", g: "OPM", k: "Am" }, { id: "b", t: "Perfect", a: "Ed Sheeran", g: "Pop", k: "G" }] };
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

/** Replace fetch with a fake Drive for one test. */
function fakeDrive(answer) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return answer(String(url)); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const json = (o, type = "application/json") => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": type } });

async function call(handler, url) {
  let status = 0, body = "";
  const headers = {};
  await handler({ url }, { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, send(b) { body = b; } });
  return { status, body, headers };
}

test("bank reader: passes on a Sonata song bank, refuses anything else", async () => {
  const { default: handler, loadBank } = await import("../api/bank.js");
  let d = fakeDrive(() => json(BANK));
  let r = await call(handler, `/api/bank?id=${ID}`);
  d.restore();
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).songs.length, 2);
  assert.match(r.headers["cache-control"], /s-maxage=60/);
  assert.ok(d.calls[0].includes(ID) && !d.calls[0].includes("key="), "uses the public download address");

  d = fakeDrive(() => json({ secret: "a spreadsheet" }));
  assert.equal((await loadBank(ID)).status, 404, "not a song bank → refused");
  d.restore();

  d = fakeDrive((u) => (u.includes("usercontent") ? new Response("<html>sign in</html>", { headers: { "content-type": "text/html" } }) : json(BANK)));
  assert.equal((await loadBank(ID)).status, 200, "skips a sign-in page and tries the next address");
  d.restore();

  d = fakeDrive(() => new Response("x".repeat(4 * 1024 * 1024), { headers: { "content-type": "application/json" } }));
  assert.equal((await loadBank(ID)).status, 404, "oversized file refused");
  d.restore();

  assert.equal((await loadBank("../../etc")).status, 400, "bad ids never reach Google");
});

test("link previews: shared songs, QR links, setlists, chords and song banks", { skip: !existsSync("dist/index.html") && "build first" }, async () => {
  const { default: handler } = await import("../api/page.js");
  const page = async (p, q = "") => (await call(handler, `/api/page?p=${encodeURIComponent(p)}${q}`)).body;
  const meta = (html, prop) => (html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)) || [])[1];

  const song = packSong({ title: "Here I Am to Worship", artist: "Tim Hughes", body: "G D", manualKey: "G:major" });
  let html = await page("/share/here-i-am", `&s=${await encodeShare(song)}`);
  assert.equal(meta(html, "og:title"), "Here I Am to Worship · Sonata");
  assert.match(meta(html, "og:description"), /by Tim Hughes in G/);
  assert.equal(meta(html, "og:image"), "https://sonata.jethrofrane.xyz/og/song.png");

  const q = (await qrUrl("https://sonata.jethrofrane.xyz", song)).split(".XYZ")[1];
  html = await page(q);
  assert.equal(meta(html, "og:title"), "Here I Am to Worship · Sonata", "QR links get the song's title too");

  html = await page("/share/sunday", `&s=${await encodeShare(packSet({ title: "Sunday" }, [song, song]))}`);
  assert.match(meta(html, "og:title"), /Sunday · Setlist/);
  assert.match(meta(html, "og:description"), /2 songs/);

  html = await page("/chords/D-over-F%23");
  assert.equal(meta(html, "og:title"), "D/F# chord · Sonata");
  assert.equal(meta(html, "og:image"), "https://sonata.jethrofrane.xyz/og/chords.png");

  for (const [path, img] of [["/theory", "theory"], ["/play/tuner", "tuner"], ["/play/metronome", "metronome"], ["/songs", "songs"], ["/chords", "chords"]]) {
    assert.equal(meta(await page(path), "og:image"), `https://sonata.jethrofrane.xyz/og/${img}.png`, path);
    assert.ok(existsSync(`public/og/${img}.png`), `image exists for ${path}`);
  }

  const d = fakeDrive(() => json(BANK));
  html = await page(`/bank/${ID}`);
  d.restore();
  assert.equal(meta(html, "og:title"), "Jethro's Song Bank · Sonata");
  assert.match(meta(html, "og:description"), /2 songs · OPM, Pop · Jethro/);
  assert.match(html, /<meta name="robots" content="noindex">/, "personal lists stay out of search engines");

  // A crafted title can't inject markup into the page head.
  html = await page("/share/x", `&s=${await encodeShare(packSong({ title: '"><script>alert(1)</script>', body: "G" }))}`);
  assert.ok(!html.includes("<script>alert(1)"));
});

test("import reader: fetches one public page, follows safe redirects only, returns chart text only", async () => {
  const { importPage, default: handler } = await import("../api/import.js");
  const html = "<html><head><title>Song - Artist chords</title></head><body><pre>G  C  D\nwords here\nEm  C\nmore words</pre></body></html>";
  const calls = [];
  const io = (routes, ips = {}) => ({
    resolve: async (host) => ips[host] || ["93.184.216.34"],
    fetch: async (url, init) => { calls.push({ url, init }); const r = routes[url]; if (!r) return new Response("", { status: 404 }); return typeof r === "function" ? r() : r; }
  });
  const page = (body = html, type = "text/html; charset=utf-8") => new Response(body, { status: 200, headers: { "content-type": type } });
  let r = await importPage("https://site.com/song", io({ "https://site.com/song": page() }));
  assert.equal(r.status, 200); assert.equal(r.title, "Song"); assert.equal(r.artist, "Artist");
  assert.ok(r.text.startsWith("G  C  D\nwords here") && !r.text.includes("<"), "chart text only");
  assert.equal(calls[0].init.redirect, "manual"); assert.equal(calls[0].init.credentials, "omit");
  r = await importPage("https://site.com/a", io({ "https://site.com/a": new Response("", { status: 302, headers: { location: "https://www.site.com/b" } }), "https://www.site.com/b": page() }));
  assert.equal(r.status, 200); assert.equal(r.source, "https://www.site.com/b");
  r = await importPage("https://site.com/a", io({ "https://site.com/a": new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }) }));
  assert.equal(r.error, "bad-url", "a redirect to a private address is refused");
  r = await importPage("https://rebind.example.org/x", io({ "https://rebind.example.org/x": page() }, { "rebind.example.org": ["10.0.0.5"] }));
  assert.equal(r.error, "bad-url", "a name that resolves to a private address is refused");
  assert.equal((await importPage("https://localhost/x", io({}))).error, "bad-url");
  assert.equal((await importPage("https://site.com/403", io({ "https://site.com/403": new Response("no", { status: 403 }) }))).error, "blocked");
  assert.equal((await importPage("https://site.com/pdf", io({ "https://site.com/pdf": page("%PDF", "application/pdf") }))).error, "not-a-page");
  assert.equal((await importPage("https://site.com/blog", io({ "https://site.com/blog": page("<html><body><p>No chart here.</p></body></html>") }))).error, "no-chords");
  assert.equal((await importPage("https://site.com/big", io({ "https://site.com/big": page("x".repeat(2 * 1024 * 1024)) }))).error, "too-large");
  let status = 0, body = "";
  await handler({ url: "/api/import?url=https://site.com/song", headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } }, { setHeader() {}, status(s) { status = s; return this; }, send(b) { body = b; } });
  assert.equal(status, 403, "other sites cannot use the reader");
  assert.equal(JSON.parse(body).error, "forbidden");
});

test("live setlist reader: passes on a Sonata setlist, refuses anything else", async () => {
  const { default: handler, loadSet } = await import("../api/set.js");
  const SET = { type: "sonata-set", v: 1, t: "Sunday", s: [{ t: "A", b: "G C", i: "abc1234567" }], updatedAt: "2026-11-13" };
  let d = fakeDrive(() => json(SET));
  let r = await call(handler, `/api/set?id=${ID}`);
  d.restore();
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.type, "sonata-set"); assert.equal(body.t, "Sunday"); assert.equal(body.s[0].i, "abc1234567");
  assert.ok(/s-maxage/.test(r.headers["cache-control"]));
  d = fakeDrive(() => json(BANK));
  assert.equal((await loadSet(ID)).status, 404, "a song bank is not a setlist");
  d.restore();
  d = fakeDrive(() => json({ secret: "private file" }));
  r = await call(handler, `/api/set?id=${ID}`);
  d.restore();
  assert.equal(r.status, 404); assert.ok(!r.body.includes("private file"), "other Drive files are never passed on");
  assert.equal((await call(handler, "/api/set?id=../etc")).status, 400);
});
