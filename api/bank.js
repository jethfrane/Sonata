// Reads a musician's public song bank from their Google Drive and passes it to the page.
// Nothing is stored: each request fetches the file the musician shared ("anyone with the
// link can view") and returns it. Only files that are Sonata song banks are passed on, so
// this can't be used to read other Drive files.
import { parseBankFile, validBankId, MAX_BANK } from "../js/core/bank.js";

/** Google's addresses for downloading a publicly shared file (no sign-in, no API key). */
const SOURCES = (id) => [
  process.env.GOOGLE_API_KEY ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${process.env.GOOGLE_API_KEY}` : "",
  `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${id}`
].filter(Boolean);

/** Read at most MAX_BANK bytes. @param {Response} r */
async function capped(r) {
  const reader = r.body?.getReader();
  if (!reader) return "";
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BANK) { await reader.cancel().catch(() => {}); throw new Error("too large"); }
    parts.push(value);
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p))).toString("utf8");
}

/** @param {string} id */
export async function loadBank(id) {
  if (!validBankId(id)) return { status: 400, error: "bad id" };
  for (const url of SOURCES(id)) {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Sonata song bank reader" } });
      if (!r.ok) continue;
      if (/text\/html/i.test(r.headers.get("content-type") || "")) continue; // a sign-in or warning page, not the file
      const bank = parseBankFile(JSON.parse(await capped(r)));
      if (bank) return { status: 200, bank };
      return { status: 404, error: "not a song bank" };
    } catch { /* try the next address */ }
  }
  return { status: 404, error: "not shared or not found" };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "https://sonata.jethrofrane.xyz");
  const out = await loadBank(String(url.searchParams.get("id") || ""));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  // A short shared cache: many listeners scanning the same QR at a gig make one Drive request a minute.
  res.setHeader("Cache-Control", out.status === 200 ? "public, max-age=30, s-maxage=60, stale-while-revalidate=300" : "no-store");
  res.status(out.status).send(JSON.stringify(out.status === 200 ? out.bank : { error: out.error }));
}
