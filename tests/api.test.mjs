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

async function call(handler, url, reqHeaders = {}) {
  let status = 0, body = "";
  const headers = {};
  await handler({ url, headers: reqHeaders }, { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, send(b) { body = b; } });
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

  const SET_PREVIEW = { type: "sonata-set", v: 1, t: "Sunday Morning", s: [{ t: "A", b: "G C" }, { t: "B", b: "D A" }] };
  const dSet = fakeDrive(() => json(SET_PREVIEW));
  html = await page(`/set/${ID}/sunday-morning`);
  dSet.restore();
  assert.equal(meta(html, "og:title"), "Sunday Morning · Setlist · Sonata");
  assert.match(meta(html, "og:description"), /2 songs/);
  assert.equal(meta(html, "og:image"), "https://sonata.jethrofrane.xyz/og/setlist.png");

  // A crafted title can't inject markup into the page head.
  html = await page("/share/x", `&s=${await encodeShare(packSong({ title: '"><script>alert(1)</script>', body: "G" }))}`);
  assert.ok(!html.includes("<script>alert(1)"));

  // Non-official *.vercel.app / *.github.io hosts redirect permanently to sonata.jethrofrane.xyz
  const redirVercel = await call(handler, "/api/page?p=/songs", { host: "sonata-jethros-projects-17cac66f.vercel.app" });
  assert.equal(redirVercel.status, 308);
  assert.equal(redirVercel.headers.location, "https://sonata.jethrofrane.xyz/songs");
  const redirGh = await call(handler, "/api/page?p=/chords/G", { "x-forwarded-host": "jethfrane.github.io" });
  assert.equal(redirGh.status, 308);
  assert.equal(redirGh.headers.location, "https://sonata.jethrofrane.xyz/chords/G");
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
  // A burst from one address is slowed down; other addresses and later requests are not.
  const { tooMany } = await import("../api/import.js");
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i++) assert.equal(tooMany("203.0.113.9", t0 + i), false);
  assert.equal(tooMany("203.0.113.9", t0 + 30), true, "the 21st request inside a minute is refused");
  assert.equal(tooMany("203.0.113.10", t0 + 30), false, "another address is unaffected");
  assert.equal(tooMany("203.0.113.9", t0 + 61_000), false, "and it clears after a minute");
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

// ---- OAuth 2.1 & Remote MCP ----

async function callApi(handler, { url, method = "GET", headers = {}, body } = {}) {
  let status = 0;
  let respBody = "";
  const respHeaders = {};
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers)) normHeaders[k.toLowerCase()] = v;
  const req = { url, method, headers: normHeaders, ...(body !== undefined ? { body } : {}) };
  await handler(req, {
    setHeader: (k, v) => { respHeaders[k.toLowerCase()] = v; },
    status(s) { status = s; return this; },
    send(b) { respBody = b; }
  });
  return { status, body: respBody, headers: respHeaders };
}

test("oauth helpers: AES-256-GCM seal/open, PKCE S256, redirect URI validation, metadata", async () => {
  const { createHash } = await import("node:crypto");
  const O = await import("../api/_lib/oauth.js");
  const secret = "test-mcp-secret-0123456789abcdef";

  const prm = O.protectedResourceMetadata();
  assert.equal(prm.resource, "https://sonata.jethrofrane.xyz/api/mcp");
  assert.deepEqual(prm.authorization_servers, ["https://sonata.jethrofrane.xyz"]);
  const asm = O.authorizationServerMetadata();
  assert.equal(asm.authorization_endpoint, "https://sonata.jethrofrane.xyz/api/oauth/authorize");
  assert.equal(asm.token_endpoint, "https://sonata.jethrofrane.xyz/api/oauth/token");
  assert.equal(asm.registration_endpoint, "https://sonata.jethrofrane.xyz/api/oauth/register");
  assert.deepEqual(asm.code_challenge_methods_supported, ["S256"]);

  // Token seal/open + tamper + kind mismatch + expiry
  const t0 = 1_700_000_000_000;
  const tok = O.seal("access", { ga: "ya29.abc", email: "j@example.com" }, 60, { secret, now: t0 });
  assert.ok(tok.startsWith("snt_a."));
  assert.deepEqual(O.open("access", tok, { secret, now: t0 + 10_000 }), { ga: "ya29.abc", email: "j@example.com" });
  assert.equal(O.open("refresh", tok, { secret, now: t0 + 10_000 }), null, "wrong token kind rejected");
  const tampered = tok.slice(0, -2) + (tok.endsWith("AA") ? "BB" : "AA");
  assert.equal(O.open("access", tampered, { secret, now: t0 + 10_000 }), null, "tampered token rejected");
  assert.equal(O.open("access", tok, { secret, now: t0 + 61_000 }), null, "expired token rejected");
  assert.equal(O.open("access", tok, { secret: "wrong-secret", now: t0 + 10_000 }), null, "wrong secret rejected");

  // PKCE S256
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  assert.equal(O.pkceMatches(verifier, challenge), true);
  assert.equal(O.pkceMatches(verifier + "x", challenge), false);
  assert.equal(O.pkceMatches("", challenge), false);

  // Redirect URI allowlist
  for (const good of [
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:3000/callback",
    "http://127.0.0.1:8765/cb",
    "http://[::1]:4000/cb",
    "cursor://anysphere.cursor/oauth/callback"
  ]) {
    assert.equal(O.isAllowedRedirectUri(good), true, `allows ${good}`);
  }
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "http://evil.example.com/callback",
    "https://claude.ai/cb#frag",
    "not a url"
  ]) {
    assert.equal(O.isAllowedRedirectUri(bad), false, `blocks ${bad}`);
  }
});

test("oauth endpoint: metadata, DCR, authorize 503/302, callback, token exchange & refresh", async () => {
  const { createHash } = await import("node:crypto");
  const { createOAuthHandler } = await import("../api/oauth.js");
  const secret = "test-mcp-secret-0123456789abcdef";
  const googleClientSecret = "test-google-secret";
  let clock = 1_700_000_000_000;

  // Unconfigured -> 503 on authorize
  const unconfigured = createOAuthHandler({ secret: "", googleClientSecret: "" });
  const r503 = await callApi(unconfigured, { url: "/api/oauth/authorize?client_id=x" });
  assert.equal(r503.status, 503);

  const mockFetch = async (url, init) => {
    const u = String(url);
    if (u === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(String(init?.body || ""));
      if (form.get("grant_type") === "authorization_code") {
        assert.equal(form.get("code"), "google-auth-code-1");
        assert.equal(form.get("client_secret"), googleClientSecret);
        return json({ access_token: "ya29.initial-google-token", refresh_token: "1//google-refresh-1", expires_in: 3600 });
      }
      if (form.get("grant_type") === "refresh_token") {
        assert.equal(form.get("refresh_token"), "1//google-refresh-1");
        return json({ access_token: "ya29.refreshed-google-token", expires_in: 3600 });
      }
    }
    if (u === "https://www.googleapis.com/oauth2/v3/userinfo") {
      return json({ email: "musician@example.com" });
    }
    return new Response("", { status: 404 });
  };

  const handler = createOAuthHandler({
    secret,
    googleClientSecret,
    fetch: mockFetch,
    now: () => clock
  });

  // Metadata routes
  const prm = await callApi(handler, { url: "/.well-known/oauth-protected-resource" });
  assert.equal(prm.status, 200);
  assert.equal(JSON.parse(prm.body).resource, "https://sonata.jethrofrane.xyz/api/mcp");

  const asm = await callApi(handler, { url: "/.well-known/oauth-authorization-server" });
  assert.equal(asm.status, 200);
  assert.equal(JSON.parse(asm.body).registration_endpoint, "https://sonata.jethrofrane.xyz/api/oauth/register");

  // DCR rejects bad redirect_uri
  const badReg = await callApi(handler, {
    url: "/api/oauth/register",
    method: "POST",
    body: { redirect_uris: ["http://remote.example.com/cb"] }
  });
  assert.equal(badReg.status, 400);

  // DCR registers public PKCE client
  const reg = await callApi(handler, {
    url: "/api/oauth/register",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test Client", redirect_uris: ["https://client.example.com/cb"], token_endpoint_auth_method: "none" })
  });
  assert.equal(reg.status, 201);
  const regData = JSON.parse(reg.body);
  assert.ok(regData.client_id.startsWith("snt_cl."));

  // Authorize -> 302 to Google OAuth
  const verifier = "verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const authUrl = `/api/oauth/authorize?client_id=${encodeURIComponent(regData.client_id)}&redirect_uri=${encodeURIComponent("https://client.example.com/cb")}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=client-xyz`;
  const authRes = await callApi(handler, { url: authUrl });
  assert.equal(authRes.status, 302);
  const googleLoc = new URL(authRes.headers.location);
  assert.equal(googleLoc.origin + googleLoc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(googleLoc.searchParams.get("access_type"), "offline");
  assert.equal(googleLoc.searchParams.get("prompt"), "consent");
  const sealedState = googleLoc.searchParams.get("state");
  assert.ok(sealedState?.startsWith("snt_st."));

  // Callback -> 302 back to client with snt_c.* code & client state
  const cbRes = await callApi(handler, {
    url: `/api/oauth/callback?state=${encodeURIComponent(sealedState)}&code=google-auth-code-1`
  });
  assert.equal(cbRes.status, 302);
  const cbLoc = new URL(cbRes.headers.location);
  assert.equal(cbLoc.origin + cbLoc.pathname, "https://client.example.com/cb");
  assert.equal(cbLoc.searchParams.get("state"), "client-xyz");
  const mcpCode = cbLoc.searchParams.get("code");
  assert.ok(mcpCode?.startsWith("snt_c."));

  // Wrong PKCE verifier rejected
  const badTok = await callApi(handler, {
    url: "/api/oauth/token",
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: regData.client_id,
      code: mcpCode,
      redirect_uri: "https://client.example.com/cb",
      code_verifier: "wrong-verifier-abcdefghijklmnopqrstuvwxyz"
    }).toString()
  });
  assert.equal(badTok.status, 400);

  // Valid token exchange
  const tokRes = await callApi(handler, {
    url: "/api/oauth/token",
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: regData.client_id,
      code: mcpCode,
      redirect_uri: "https://client.example.com/cb",
      code_verifier: verifier
    }).toString()
  });
  assert.equal(tokRes.status, 200);
  const tokJson = JSON.parse(tokRes.body);
  assert.ok(tokJson.access_token.startsWith("snt_a."));
  assert.ok(tokJson.refresh_token.startsWith("snt_r."));
  assert.equal(tokJson.token_type, "Bearer");

  // Refresh token exchange
  clock += 4_000_000;
  const refRes = await callApi(handler, {
    url: "/api/oauth/token",
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: regData.client_id,
      refresh_token: tokJson.refresh_token
    }).toString()
  });
  assert.equal(refRes.status, 200);
  const refJson = JSON.parse(refRes.body);
  assert.ok(refJson.access_token.startsWith("snt_a."));
  assert.notEqual(refJson.access_token, tokJson.access_token);
});

test("mcp endpoint: GET/SSE/OPTIONS, initialize, public vs auth tools, SSRF refusal, 401 WWW-Authenticate, Drive trash/restore", async () => {
  const { createMcpHandler } = await import("../api/mcp.js");
  const { seal } = await import("../api/_lib/oauth.js");
  const { decodeShare } = await import("../js/core/share.js");
  const secret = "test-mcp-secret-0123456789abcdef";
  const googleClientSecret = "test-google-secret";
  let nowMs = 1_700_000_000_000;

  // Mock Google Drive storage for sonata_library.json
  const drive = {
    fileId: "drv-file-1",
    version: 1,
    content: {
      songs: [
        { id: "song-drv-1", title: "Existing Song", artist: "Artist", body: "G C D", manualKey: "G:major", updatedAt: "2026-10-01T00:00:00.000Z" }
      ],
      setlists: [],
      trash: [],
      deletedIds: []
    },
    uploads: []
  };

  const mockFetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = (init.method || "GET").toUpperCase();
    if (u.href === "https://oauth2.googleapis.com/token") {
      return json({ access_token: "ya29.refreshed-tok", expires_in: 3600 });
    }
    if (u.hostname === "www.googleapis.com") {
      if (u.pathname === "/drive/v3/files") {
        return json({ files: drive.fileId ? [{ id: drive.fileId }] : [] });
      }
      if (u.pathname === `/drive/v3/files/${drive.fileId}` && u.searchParams.get("alt") === "media") {
        return json(drive.content);
      }
      if (u.pathname === `/drive/v3/files/${drive.fileId}` && u.searchParams.get("fields") === "md5Checksum,modifiedTime") {
        return json({ md5Checksum: `md5-${drive.version}`, modifiedTime: `2026-10-01T00:00:0${drive.version}Z` });
      }
      if (u.pathname.startsWith("/upload/drive/v3/files")) {
        const raw = String(init.body || "");
        const bodyPart = raw.split("\r\n\r\n")[2].split("\r\n--")[0];
        drive.content = JSON.parse(bodyPart);
        drive.version++;
        drive.uploads.push(drive.content);
        return json({ id: drive.fileId });
      }
    }
    return new Response("", { status: 404 });
  };

  const importIo = {
    resolve: async (host) => (host === "169.254.169.254" ? ["169.254.169.254"] : ["93.184.216.34"]),
    fetch: async (url) => {
      if (String(url) === "https://chords.example.com/good") {
        return new Response("<html><head><title>Ocean Song - Band Chords</title></head><body><pre>[Verse 1]\nG   C   D\nWords on the water\nEm  C   G\nMore lines here</pre></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      return new Response("", { status: 404 });
    }
  };

  const handler = createMcpHandler({
    secret,
    googleClientSecret,
    fetch: mockFetch,
    importIo,
    tooMany: () => false,
    now: () => nowMs
  });

  // OPTIONS CORS + GET health + GET SSE 405
  const opt = await callApi(handler, { url: "/api/mcp", method: "OPTIONS" });
  assert.equal(opt.status, 204);
  assert.equal(opt.headers["access-control-allow-origin"], "*");

  const getHealth = await callApi(handler, { url: "/api/mcp", method: "GET" });
  assert.equal(getHealth.status, 200);
  const health = JSON.parse(getHealth.body);
  assert.equal(health.tools, 18);
  assert.equal(health.publicTools, 7);
  assert.equal(health.version, "7.7.0");

  const getSse = await callApi(handler, { url: "/api/mcp", method: "GET", headers: { accept: "text/event-stream" } });
  assert.equal(getSse.status, 405);
  assert.match(getSse.headers.allow, /POST/);

  const rpc = (method, params = {}, headers = {}, id = 1) =>
    callApi(handler, {
      url: "/api/mcp",
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: { jsonrpc: "2.0", id, method, params }
    });

  // initialize
  const initRes = await rpc("initialize", { protocolVersion: "2025-03-26" });
  assert.equal(initRes.status, 200);
  assert.equal(JSON.parse(initRes.body).result.protocolVersion, "2025-03-26");

  // Unauthenticated tools/list -> 7 public tools, each with MCP annotations
  const anonList = await rpc("tools/list");
  assert.equal(anonList.status, 200);
  const anonTools = JSON.parse(anonList.body).result.tools;
  assert.equal(anonTools.length, 7);
  assert.ok(anonTools.every((t) => typeof t.annotations?.readOnlyHint === "boolean"), "all public tools include annotations");

  // Public tools: lookup_chord, format_chord_chart, transpose_chart (incl. chords-only), build_sonata_link, extract_chords_from_url + SSRF refusal
  const lookup = JSON.parse((await rpc("tools/call", { name: "lookup_chord", arguments: { chord: "Am7", instrument: "guitar" } })).body);
  assert.ok(!lookup.result.isError);
  const lookupData = JSON.parse(lookup.result.content[0].text);
  assert.deepEqual(lookupData.notes, ["A", "C", "E", "G"]);
  assert.ok(lookupData.guitar.length > 0);

  const formatted = JSON.parse((await rpc("tools/call", { name: "format_chord_chart", arguments: { rawChart: "Verse 1:\nG  D/F#m\n\nAmazing grace" } })).body);
  assert.ok(!formatted.result.isError);
  const fmtData = JSON.parse(formatted.result.content[0].text);
  assert.ok(fmtData.body.includes("## Verse 1") && fmtData.body.includes("D/F#") && !fmtData.body.includes("D/F#m"));

  const transposed = JSON.parse((await rpc("tools/call", { name: "transpose_chart", arguments: { body: "G C D", fromKey: "G", toKey: "A" } })).body);
  assert.equal(JSON.parse(transposed.result.content[0].text).text, "A D E");

  const chordsOnly = JSON.parse((await rpc("tools/call", { name: "transpose_chart", arguments: { body: "## Verse\nG C D\nAmazing grace", fromKey: "G", viewMode: "chords-only" } })).body);
  assert.ok(!chordsOnly.result.isError);
  const coText = JSON.parse(chordsOnly.result.content[0].text).text;
  assert.ok(coText.includes("G C D") && !coText.includes("Amazing grace"));

  const linkRes = JSON.parse((await rpc("tools/call", { name: "build_sonata_link", arguments: { title: "MCP Link", body: "G C" } })).body);
  const builtUrl = new URL(JSON.parse(linkRes.result.content[0].text).url);
  assert.equal((await decodeShare(builtUrl.searchParams.get("s"))).t, "MCP Link");

  const extGood = JSON.parse((await rpc("tools/call", { name: "extract_chords_from_url", arguments: { url: "https://chords.example.com/good" } })).body);
  assert.ok(!extGood.result.isError);
  assert.equal(JSON.parse(extGood.result.content[0].text).title, "Ocean Song");

  // resources & prompts
  const resList = JSON.parse((await rpc("resources/list")).body);
  assert.equal(resList.result.resources[0].uri, "sonata://format-guide");
  const resRead = JSON.parse((await rpc("resources/read", { uri: "sonata://format-guide" })).body);
  assert.match(resRead.result.contents[0].text, /Sonata Chord Chart Format/);
  const prList = JSON.parse((await rpc("prompts/list")).body);
  assert.equal(prList.result.prompts[0].name, "import_chords_from_link");
  const prGet = JSON.parse((await rpc("prompts/get", { name: "import_chords_from_link", arguments: { url: "https://chords.example.com/good" } })).body);
  assert.match(prGet.result.messages[0].content.text, /chords\.example\.com/);

  const ssrf = JSON.parse((await rpc("tools/call", { name: "extract_chords_from_url", arguments: { url: "http://169.254.169.254/latest/meta-data" } })).body);
  assert.equal(ssrf.result.isError, true);
  assert.match(ssrf.result.content[0].text, /bad-url/);

  // Unauthenticated library tool -> 401 + WWW-Authenticate
  const unauthLib = await rpc("tools/call", { name: "list_songs", arguments: {} });
  assert.equal(unauthLib.status, 401);
  assert.match(unauthLib.headers["www-authenticate"], /oauth-protected-resource/);

  // Invalid Bearer token -> 401 invalid_token
  const badBearer = await rpc("tools/list", {}, { authorization: "Bearer snt_a.tampered" });
  assert.equal(badBearer.status, 401);
  assert.match(badBearer.headers["www-authenticate"], /invalid_token/);

  // Authenticated tools/list (snt_a.* with near-expiry Google token that triggers auto-refresh!)
  const accessTok = seal("access", {
    client_id: "c1",
    scope: "sonata:library",
    email: "j@example.com",
    ga: "ya29.old",
    gr: "1//google-refresh-1",
    gexp: nowMs - 1000
  }, 3600, { secret, now: nowMs });

  const authList = await rpc("tools/list", {}, { authorization: `Bearer ${accessTok}` });
  assert.equal(authList.status, 200);
  assert.equal(JSON.parse(authList.body).result.tools.length, 18);

  // Authenticated read-only list_songs skips Drive upload
  const uploadsBefore = drive.uploads.length;
  const listRes = JSON.parse((await rpc("tools/call", { name: "list_songs", arguments: {} }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(listRes.result.content[0].text).total, 1);
  assert.equal(drive.uploads.length, uploadsBefore, "read-only tool skips upload");

  // Authenticated create_song with genre & mood -> merges & uploads to mocked Drive
  const createRes = JSON.parse((await rpc("tools/call", {
    name: "create_song",
    arguments: { title: "MCP Created", body: "C F G\nPraise", key: "C:major", genre: "Worship", mood: "Joyful" }
  }, { authorization: `Bearer ${accessTok}` })).body);
  assert.ok(!createRes.result.isError);
  const createdSong = JSON.parse(createRes.result.content[0].text).song;
  const createdId = createdSong.id;
  assert.equal(createdSong.mood, "Joyful");
  assert.equal(drive.uploads.length, uploadsBefore + 1);
  assert.ok(drive.content.songs.some((s) => s.id === createdId && s.title === "MCP Created" && s.mood === "Joyful"));

  // Filter list_songs by mood & genre and update_song mood
  const moodList = JSON.parse((await rpc("tools/call", { name: "list_songs", arguments: { mood: "joyful", genre: "worship" } }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(moodList.result.content[0].text).total, 1);
  const missMood = JSON.parse((await rpc("tools/call", { name: "list_songs", arguments: { mood: "solemn" } }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(missMood.result.content[0].text).total, 0);
  const updMood = JSON.parse((await rpc("tools/call", { name: "update_song", arguments: { id: createdId, mood: "Reflective" } }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(updMood.result.content[0].text).song.mood, "Reflective");

  // Authenticated trash_song -> moves song to trash in Drive (NOT deletedIds)
  const trashRes = JSON.parse((await rpc("tools/call", {
    name: "trash_song",
    arguments: { ids: [createdId] }
  }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(trashRes.result.content[0].text).trashedCount, 1);
  assert.ok(!drive.content.songs.some((s) => s.id === createdId));
  assert.ok(drive.content.trash.some((e) => e.id === createdId));
  assert.ok(!drive.content.deletedIds.includes(createdId));

  // Authenticated restore_from_trash -> restores song with same id to Drive
  const restRes = JSON.parse((await rpc("tools/call", {
    name: "restore_from_trash",
    arguments: { ids: [createdId] }
  }, { authorization: `Bearer ${accessTok}` })).body);
  assert.equal(JSON.parse(restRes.result.content[0].text).restoredSongs, 1);
  assert.ok(drive.content.songs.some((s) => s.id === createdId));
  assert.ok(!drive.content.trash.some((e) => e.id === createdId));
});
