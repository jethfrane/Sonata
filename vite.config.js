// Sonata build: Vite bundles and hashes the app; Workbox precaches it for offline use.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: false,
    cssMinify: true,
    assetsInlineLimit: 0
  },
  server: { port: 5391 },
  preview: { port: 5391 },
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: false,
      manifest: false, // public/manifest.webmanifest is the source of truth
      filename: "sw.js",
      workbox: {
        cacheId: "sonata",
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,json,webmanifest}"],
        // Only the Latin font files are stored for offline use; the browser fetches other
        // scripts (Cyrillic, Greek, Vietnamese) on demand thanks to unicode-range.
        globIgnores: ["screenshots/**", "og/**", "icons/og-image.png", "icons/*-512.png", "**/*-{latin-ext,cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/_vercel\//, /\.[a-z0-9]+$/i],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ]
});
