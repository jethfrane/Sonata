// Tiny static server for testing the built app. Mirrors vercel.json: paths without a file
// extension fall back to index.html (so /song/<slug>, /play/piano and /share/<name> work).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node tests/serve.mjs [port] [folder]   (folder defaults to dist/, the built app)
const project = join(fileURLToPath(import.meta.url), "..", "..");
const port = Number(process.argv[2] || 5391);
const root = join(project, process.argv[3] || "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

http.createServer(async (req, res) => {
  let path; try { path = decodeURIComponent((req.url || "/").split("?")[0]); } catch { path = "/"; }
  // Like Vercel's cleanUrls: /privacy is public/privacy.html. Every other extensionless path is the app.
  const file = extname(path) ? normalize(join(root, path)) : path === "/privacy" ? join(root, "privacy.html") : join(root, "index.html");
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, () => console.log(`Sonata test server on http://127.0.0.1:${port}/`));
