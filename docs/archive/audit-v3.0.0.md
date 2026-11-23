# Sonata v3.0.0 re-audit (2026-11-04)

Scope: the v3.0.0 rebuild (new interface, Vite + Workbox, security headers). Facts below were checked on this date; items under "Not verified" were not.

## Verified

- Unit tests 11/11, browser tests 31/31, route/layout tests 53/53 (no horizontal overflow at 320, 390 and 768 px on every route), TypeScript check 0 errors.
- Production build: one JS bundle 154 KB (54 KB gzip), one CSS file 60 KB (14 KB gzip), offline precache 17 files / 413 KB. QR (13 KB) and PDF/PNG export (8 KB) load only when used.
- Vercel preview: `/`, `/songs`, `/play/metronome` 200; `/tools` redirects; shared-song links get the song title from `api/page.js`; hashed assets `max-age=31536000, immutable`; CSP and HSTS present; service worker active; no CSP errors from the app itself.
- Old data: `sonata:v12:*` libraries, v1 share links and old routes still load (covered by the browser tests).
- Share-link decoding refuses links over 64 KB and anything that inflates past 2 MB (client and server).

## Not verified

- Google sign-in and Drive sync on the live site under the new CSP (the policy allows `accounts.google.com/gsi/*` and `www.googleapis.com`, but a real sign-in was not done).
- Microphone tuner with a real instrument; audio by ear.
- iOS Safari and Android on physical phones (only desktop Chromium with phone viewports).
- Update flow from a phone that still runs the v2 service worker (expected: v2 fetches the new `sw.js`, then the "new version" prompt shows).
- Screen reader pass (VoiceOver/TalkBack).

## Known gaps and next iterations

1. **Real-device pass**: iPhone Safari (installed PWA and browser), Android Chrome, an iPad on a music stand. Check the bottom bar with the keyboard open, stage auto-scroll, wake lock.
2. **Drive under CSP**: sign in on production; if anything is blocked, the browser console names the exact directive to widen.
3. **Accessibility**: run axe or Lighthouse; check focus order in the editor toolbar and the instrument tabs' arrow-key support (tabs use `role="tab"` without arrow-key handling).
4. **Big files**: `index.html` (26 KB) still holds every screen; `sheets.js` (~500 lines) mixes eight dialogs. Splitting dialogs into their own modules would let them load on demand.
5. **Icons**: `icon-512.png` (155 KB) and `icon-maskable-512.png` (128 KB) can be compressed (excluded from the offline cache for now).
6. **Dev dependencies**: `npm audit` reports 10 moderate/low issues in build-only packages (Workbox build chain); 0 in what ships to users. Recheck on the next Workbox release.
7. **Setlist sharing from the Songs list** opens the same share sheet; consider a "print the whole setlist" shortcut on the setlist row.
8. **Sona** is hidden on the chart screen now (it covered the text). If tips there are wanted, show them in the quick-start bar instead.
