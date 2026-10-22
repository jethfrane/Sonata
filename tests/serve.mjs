// Tiny static server for local testing. Mirrors vercel.json: paths without a file
// extension fall back to index.html (so /song/<slug>, /play/piano and /share/<name> work).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = Number(process.argv[2] || 5391);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = extname(path) ? normalize(join(root, path)) : join(root, "index.html");
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, () => console.log(`Sonata test server on http://127.0.0.1:${port}/`));
