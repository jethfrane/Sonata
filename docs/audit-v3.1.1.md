# Sonata full code audit (2026-11-05, on v3.1.0 → fixes in v3.1.1 and v3.1.2)

Method: read every module (`core`, `ui`, `drive`, `audio`, `api/page.js`, `vercel.json`, `vite.config.js`), then reproduced each suspected bug in Node or Chromium before fixing it. Items marked **Fixed** have a regression test (`tests/core.test.mjs`, `tests/regression.e2e.mjs`).

## Fixed in v3.1.1

| # | Severity | Bug | Cause | Fix |
|---|---|---|---|---|
| 1 | High | **Deleting a setlist did nothing.** The confirm dialog resolved "cancel" by itself. | `openSheet` reuses one `<dialog>`; the late `close` event of the menu sheet fired on the new confirm sheet. | Sheets are tracked by identity; a stale `close` event is ignored. |
| 2 | High | **Undo (and backup restore) lost songs for Drive users.** After a delete had synced, the next sync deleted the restored song again. | Deletion marks (tombstones) live in the Drive file and win over edits. | Restored songs get new ids (`store.restoreSongs`, `importBackup`). |
| 3 | Medium | Empty starter songs came back from Drive. | `createSong` dropped them without a deletion mark. | `dropBlankSongs()` records them as deleted. |
| 4 | Medium | **Tuner left the microphone on** if Start was tapped twice (or Stop came while the permission prompt was open). | No guard; second stream overwrote the first. | `starting` flag + session counter; late streams are released. Idle redraw no longer runs every 45 ms. |
| 5 | Medium | **App stayed blank when the browser blocks storage** (strict cookie settings). | `window.localStorage` was read at import time without a guard. | Memory storage fallback, a toast, guarded editor read. |
| 6 | Medium | **A malformed URL escape (`/song/%E0%A4%A`) stopped the app** ("couldn't start"). | `decodeURIComponent` threw in `parsePath`. | Safe decode. |
| 7 | Medium | The Google Drive dialog replaced Settings/Share/other dialogs when a sync status event arrived. | Its listener was never removed; the dialog body is shared. | Removed on close. |
| 8 | Medium | Link previews broke for titles containing `$&`, `$'` etc. (page head filled with a copy of the page); a numeric `k` in a link crashed the function (500). | String replacement patterns; unchecked type. | Function replacement; type checks. |
| 9 | Low | Damaged `?s=` links (number, array, `{}`) opened a blank "Shared Song". | No shape check. | Must be a song or a setlist with songs, else the error toast. |
| 10 | Low | Space on a focused stage button toggled auto-scroll instead of pressing the button. | Global key handler. | Buttons and links keep Space/Enter. |
| 11 | Low | Beat dots lit after Stop. | Pending flash timers. | Cleared on Stop. |
| 12 | Low | Old tab after a release: dialogs silently did nothing (lazy chunk 404). | Hashed chunk gone. | Toast with Reload. |
| 13 | Low | Drive uploaded the whole library on every sync, even when identical. | No comparison. | Skip upload when Drive already matches (`libraryFingerprint`). A full or blocked storage no longer turns a good sync into an error. |
| 14 | Low | Personal `/song/<slug>` pages were indexable; the template fetch trusted the `Host` header. | — | `noindex`; only `VERCEL_URL`/own origin. |
| 15 | Low | QR card used a font Sonata no longer ships; backup import said "Restored N" when nothing was new. | — | Inter; accurate message. |

## Checked and fine

Share-link size caps (client and server), `safeHref`, HTML escaping of song/setlist/link/ids in every template, CSP/HSTS headers, merge-by-newest, transposition and spelling, key signature, roman/Nashville numerals, chord tone sets, YIN pitch range for guitar/bass/ukulele, metronome compound-meter timing, PDF string escaping, wake lock re-acquire, service-worker cache cleanup. A background Drive merge does **not** move the caret when the text is unchanged (tested).

## Remaining risks, fixed in the same release

| Risk | Fix |
|---|---|
| Two tabs overwrite each other | `Store.persist` merges what another tab saved before writing (`absorbOtherTabs`); objects keep identity (`applyMerged`). |
| Drive lost update | Version check (`md5Checksum`) before upload; merge again if it changed (3 rounds). |
| Duplicate Drive files | Oldest file wins (`orderBy=createdTime`); a newer duplicate is folded in and deleted. |
| Uploads on every song tap | `lastOpenedAt` is ignored by the unchanged-library check. |
| Deletion marks capped at 2,000 | Cap is 5,000; numeric timestamps are compared correctly. |
| Token in `localStorage` | Kept in `sessionStorage`; old copies are removed. |
| Lone lowercase letter = chord line | A single `a`–`g` is a word. |
| Metronome kept running after stage | Stops on leaving the stage unless you are on Play. |
| Unbounded plucked-string cache | Capped at 40 buffers. |
| Service worker answered file URLs with the app | Dotted paths are excluded from the fallback. |
| Unknown URLs indexable | `noindex` on anything except the home page and described pages. |
| Stage re-rendered on every speed step | Settings changes no longer re-render the chart. |

## Still open (need a person or a bigger change)

1. Deletion marks have no timestamps; a device offline for a very long time can bring back an old deletion.
2. Styles still need `'unsafe-inline'` in the CSP; no violation reporting endpoint.
3. Not verifiable here: Google sign-in/Drive on live (the sync logic is tested against a fake Drive), real phones, mic tuner with an instrument, screen readers, real printing.
