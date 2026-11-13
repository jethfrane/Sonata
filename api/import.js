// Reads one chord page a person pasted into Sonata and passes on only the chart text.
// Nothing is stored. It fetches public https pages only: no private or local addresses,
// no cookies, a size cap and a time limit, and it follows at most three redirects, checking
// each one. Only this site may call it.
import { lookup } from "node:dns/promises";
import { extractChart, publicUrl, privateAddress } from "../js/core/import.js";

const MAX_PAGE = 1.5 * 1024 * 1024;
const SITE = "sonata.jethrofrane.xyz";

/**
 * A light brake so this can't be driven as a bulk page reader: each address gets a short burst,
 * then has to wait. Kept in memory per function instance (nothing is stored), so it slows abuse
 * down rather than stopping a determined one; the platform firewall is the place for hard limits.
 */
const RATE = { max: 20, windowMs: 60_000 };
/** @type {Map<string, number[]>} */
const hits = new Map();
/** True when this address has used up its requests for now. @param {string} who @param {number} [now] */
export function tooMany(who, now = Date.now()) {
  const recent = (hits.get(who) || []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(who, recent);
  // Don't let the table itself grow without bound.
  if (hits.size > 5000) for (const [k, v] of hits) { if (!v.some((t) => now - t < RATE.windowMs)) hits.delete(k); }
  return recent.length > RATE.max;
}

/** Read at most MAX_PAGE bytes. @param {Response} r */
async function capped(r) {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE) { await reader.cancel().catch(() => {}); throw new Error("too-large"); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/**
 * @param {string} raw the pasted link
 * @param {{ fetch?: typeof fetch, resolve?: (host: string) => Promise<string[]> }} [io] replaced in tests
 * @returns {Promise<{ status: number, error?: string, title?: string, artist?: string, text?: string, source?: string }>}
 */
export async function importPage(raw, io = {}) {
  const get = io.fetch || fetch;
  const resolve = io.resolve || (async (host) => (await lookup(host, { all: true })).map((a) => a.address));
  let url = publicUrl(raw);
  if (!url) return { status: 400, error: "bad-url" };
  try {
    for (let hop = 0; hop < 4; hop++) {
      const addresses = await resolve(url.hostname).catch(() => []);
      if (!addresses.length) return { status: 404, error: "not-found" };
      if (addresses.some(privateAddress)) return { status: 400, error: "bad-url" };
      const r = await get(url.href, {
        redirect: "manual", signal: AbortSignal.timeout(6000), credentials: "omit",
        headers: { "User-Agent": `SonataImport/1.0 (+https://${SITE})`, Accept: "text/html,text/plain;q=0.9", "Accept-Language": "en,fil;q=0.8" }
      });
      if (r.status >= 300 && r.status < 400) {
        const next = publicUrl(new URL(r.headers.get("location") || "", url).href);
        if (!next) return { status: 400, error: "bad-url" };
        url = next;
        continue;
      }
      if (r.status === 404 || r.status === 410) return { status: 404, error: "not-found" };
      if (!r.ok) return { status: 502, error: "blocked" };
      const type = r.headers.get("content-type") || "text/html";
      if (!/^(text\/(html|plain)|application\/xhtml\+xml)/i.test(type)) return { status: 415, error: "not-a-page" };
      const bytes = await capped(r);
      const charset = (type.match(/charset=([\w-]+)/i) || ["", "utf-8"])[1];
      let body = "";
      try { body = new TextDecoder(charset).decode(bytes); } catch { body = new TextDecoder().decode(bytes); }
      const chart = extractChart(body, type);
      if (!chart) return { status: 422, error: "no-chords" };
      return { status: 200, ...chart, source: url.href };
    }
    return { status: 502, error: "blocked" };
  } catch (e) {
    return /** @type {any} */ (e)?.message === "too-large" ? { status: 413, error: "too-large" } : { status: 502, error: "blocked" };
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${SITE}`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", "no-store");
  // Only Sonata's own pages may use this; it is not a general page reader for other sites.
  const site = String(req.headers?.["sec-fetch-site"] || "");
  const origin = String(req.headers?.origin || "");
  const allowed = (!site || site === "same-origin") && (!origin || /^https:\/\/sonata\.jethrofrane\.xyz$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  const who = String(req.headers?.["x-real-ip"] || String(req.headers?.["x-forwarded-for"] || "").split(",")[0] || "unknown").trim();
  const out = !allowed ? { status: 403, error: "forbidden" } : tooMany(who) ? { status: 429, error: "slow-down" } : await importPage(String(url.searchParams.get("url") || ""));
  if (out.status === 429) res.setHeader("Retry-After", "60");
  const { status, ...body } = out;
  res.status(status).send(JSON.stringify(body));
}
