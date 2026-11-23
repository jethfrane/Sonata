# Sonata v5.0.1 — measured load and offline behaviour (2026-11-13)

Measured on the live site with Playwright: Pixel 7 profile, slow 4G (1.6 Mbps, 150 ms), 4x CPU slowdown. Script and styles sizes are over the network (compressed). Lighthouse was not run.

| Measure | v4.1.0 (2026-11-12) | v5.0.1 | Target |
|---|---|---|---|
| Home, largest paint | 1.18 s | 0.99 s | 1.5 s or less |
| Theory, largest paint | 1.74 s | 1.20 s | 1.5 s or less |
| Piano, largest paint | 1.30 s | 1.17 s | 1.5 s or less |
| Layout shift | 0 | 0 | 0 |
| First-load download (home) | 154 kB | 150 kB | 130 kB (not met) |
| First-load script | 75.8 kB | 72.3 kB | budget in `tests/size.mjs` |
| Repeat open (service worker) | 0.08 s | 0.07 s | under 0.15 s |
| Piano first visit, sounds fetched before a note is played | 1,184 kB | 229 kB | 150 kB (not met) |
| Instrument sounds kept for offline | none (bug) | on first play, or all at once from Settings | yes |

Notes

- The extra font on Theory is the chord (monospace) font, which that page needs. Nothing to fix.
- The audio engine still loads with the app. Loading it on first sound would save about 9 kB compressed but means rewriting seven modules that use it at start; not done.
- `npm run check` now fails if the first-load script passes 68 kB gzip or the styles pass 19 kB gzip.
