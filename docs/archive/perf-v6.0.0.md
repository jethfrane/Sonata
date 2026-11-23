# Sonata v6.0.0 — first-load size (2026-11-13)

Measured from the production build (`npm run build`), gzip sizes of the files the first screen needs. Not yet measured on the live site over a throttled network; the v5.0.1 figures in `perf-v5.0.1.md` were.

| Measure | v5.0.1 | v6.0.0 |
|---|---|---|
| First-load script | 64.6 kB (1 file) | 43.7 kB (entry + 5 shared chunks, preloaded) |
| First-load styles | 17.9 kB | 17.5 kB |
| Script not loaded until used | dialogs, Chords, Song Bank, QR, export | the same plus Play (9.6 kB), audio engine (6.5 kB), metronome (1.9 kB), Theory (3.8 kB), Stage (2.3 kB), Drive (2.9 kB), Backup (4.5 kB), Help and tour (6.5 kB) |

How

- `js/main.js` no longer imports Play, Theory, Stage, the audio engine or Drive. Each loads the first time its screen opens; a tab starts fetching its screen when the pointer or finger reaches it.
- The metronome and drum looper moved out of the shared context (`js/ui/ctx.js`) into `js/ui/sound.js`, so only screens that make sound pull in the audio engine.
- Drive loads at start only for someone who has signed in before; everyone else gets it when they open Backup.
- Help, the tour and Backup carry their own stylesheets, loaded with them.
- `npm run check` fails if the first-load script passes 50 kB gzip, the styles pass 19 kB, or any of the on-demand screens ends up in the first load.

Everything is still precached by the service worker, so every screen works offline after the first visit.
