// Reads a live setlist from the leader's Google Drive and passes it to the band's link.
// Nothing is stored. Only files that are Sonata setlists are passed on, so this can't be
// used to read other Drive files.
import { loadPublic } from "./bank.js";
import { parseSetFile } from "../js/core/share.js";

/** @param {string} id */
export const loadSet = (id) => loadPublic(id, parseSetFile, "not a setlist");

export default async function handler(req, res) {
  const url = new URL(req.url, "https://sonata.jethrofrane.xyz");
  const out = await loadSet(String(url.searchParams.get("id") || ""));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  // Short shared cache: a whole band opening the link at once makes one Drive request.
  res.setHeader("Cache-Control", out.status === 200 ? "public, max-age=15, s-maxage=30, stale-while-revalidate=120" : "no-store");
  res.status(out.status).send(JSON.stringify(out.status === 200 ? { ...out.file, type: "sonata-set", v: 1 } : { error: out.error }));
}
