# Sonata v3.1.0 re-audit (2026-11-05)

Live: https://sonata.jethrofrane.xyz (version.json = 3.1.0, commit `fd9fe20`). Released through branch `v3.1.0` → Vercel preview → fast-forward `main`.

## What changed since v3.0.0

- **Accessibility:** arrow / Home / End keys on the Play instrument tabs (roving tabindex; focus follows). Darker muted-text token (`#5f5d66`) fixes 4.31:1 contrast in light mode. `aria-selected` was also being set on the Play view (it matched `[data-inst]`); now only on the tab buttons. Time-signature select has a label.
- **Speed:** dialogs (key, details, share, setlist editor, settings, account, import) load on demand through `js/ui/sheets-lazy.js`. Main JS 54 → 46 KB gzip (dialog chunk 27 KB raw, 9.7 KB gzip). Offline precache 19 files / 416 KB.
- **Icons:** `icon-512.png` 155 → 65 KB, `icon-maskable-512.png` 128 → 61 KB (palette-quantised with dithering, checked by eye).
- **Setlist:** the row menu has Print, which prints every song using the saved print layout.
- **Tests:** new `tests/a11y.e2e.mjs` (`npm run test:a11y`): axe-core (wcag2a/aa/21aa) on 7 routes in light and dark, tab keyboard, setlist print. 22/22.

## Verified (this date)

- Unit 11/11, typecheck 0 errors, browser e2e 31/31, routes e2e 53/53 (local build); a11y e2e 22/22 on local build, on the Vercel preview and on production.
- Production: `/`, `/songs`, `/theory`, `/play/metronome` 200; `version.json` 3.1.0; icon served at new size; `/tools` redirect works on preview; CSP, HSTS and COOP headers present on preview.
- The `window.__sonata` test hook is localhost-only, so `browser.e2e` and `routes.e2e` cannot run against Vercel (expected).

## Not verified (needs Jethro's devices/account)

1. Google sign-in + Drive sync on live under the CSP. Most important.
2. Mic tuner with a real instrument; audio by ear.
3. iPhone Safari (browser + installed PWA), Android Chrome, iPad; v2 → v3 → v3.1 service-worker update prompt on a phone.
4. Screen reader pass (VoiceOver / TalkBack). axe finds no serious or critical issues, but it covers only a part of WCAG.
5. Printing a setlist on a real printer or Save-as-PDF (the test stubs `window.print`).

## Next iterations

1. Real-device pass (items 1–3 above).
2. axe only ran on the default state of each page. Add runs with a sheet open (share, key, settings) and the stage view.
3. `index.html` is still 26 KB with every screen; sheets-lazy loads dialog code only. Moving dialog markup into templates would shrink first paint further.
4. Split `sheets.js` into one module per dialog if the 27 KB chunk matters on slow connections.
5. `npm audit`: 10 (2 low, 8 moderate), all in build-only Workbox chain; 0 in shipped code. Recheck on the next Workbox release.
6. Setlist print: no layout choice from the setlist menu (it uses the layout last saved in the Share sheet). Add a quick columns/landscape choice if needed.
7. Sona is hidden on the Chart screen; surface tips in the quick-start bar if wanted.
