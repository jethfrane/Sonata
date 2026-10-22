// Sonata service worker: works offline after the first visit.
// App files: network first (so updates show), cache as fallback.
// Fonts: cache first. Google APIs and analytics are never cached.
const VERSION = "2.0.2";
const CACHE = `sonata-v${VERSION}`;
const SHELL = [
  "/", "/index.html", "/css/app.css", "/manifest.webmanifest", "/version.json", "/update_log.json",
  "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
  "/js/main.js", "/js/audio.js", "/js/drive.js",
  "/js/core/music.js", "/js/core/chart.js", "/js/core/store.js", "/js/core/share.js", "/js/core/pitch.js",
  "/js/lib/qr.js", "/js/lib/export.js",
  "/js/ui/dom.js", "/js/ui/i18n.js", "/js/ui/ctx.js", "/js/ui/editor.js", "/js/ui/library.js", "/js/ui/sheets.js",
  "/js/ui/tools.js", "/js/ui/theory.js", "/js/ui/play.js", "/js/ui/tuner.js", "/js/ui/stage.js", "/js/ui/mascot.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "sonata-fonts").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("sonata-fonts").then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/_vercel/")) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match("/index.html")) || Response.error();
      return Response.error();
    }
  })());
});
