# Sonata v3.2.0 audit and overhaul (2026-11-09, on v3.1.2 at 54362b2)

## Method

1. Baseline: `npm run check` (unit 18/18, typecheck 0, build OK), e2e browser 31, a11y 22, regression 26: all green.
2. New `tests/audit.mjs`: opens 25 screens/states at 6 viewports (360×740, 390×844, landscape phone 844×390, 768×1024, 1024×768 touch, 1440×900) = 150 captures. For each it saves a screenshot and checks: page wider than the screen, controls outside the screen, touch targets under 44 px (touch viewports), clipped text, page errors, and axe-core (WCAG 2.x A/AA incl. contrast).
3. Read every screenshot, then probed the chord parser, chart builder, store and Drive sync in Node.
4. Every fix has a unit or browser test. Before/after numbers are at the end.

States: welcome (empty), Songs (40 songs), no search match, setlists, no setlists, Chart edit, Chart view, new song, Chart in a setlist, Theory, Play piano/guitar/tuner/metronome, stage, stage in a setlist, key sheet, Share & export, song details, Settings, Drive dialog, song menu, setlist editor, update prompt, offline.

Not testable here (needs Jethro): Google sign-in on live, real phones (iOS Safari/Android Chrome), mic tuner with an instrument, screen readers, real printing.

## Defects found

Severity: **High** = blocks a main job or breaks for many users. **Medium** = wrong result or real friction. **Low** = polish.

| # | Sev | Screen / width | Defect (repro) | Cause |
|---|---|---|---|---|
| 1 | High | Chart, landscape phone (844×390) | Only ~1 line of the chart is visible: sticky top bar (56) + title + toolbar + chord bar + bottom bar (60) fill the screen. | No short-screen layout. |
| 2 | High | Stage, landscape phone | Top bar and dock take ~130 of 390 px; 1–2 chart lines visible. Tapping to hide the controls does not give the space back. | Controls stay in the flex layout when "hidden" (only faded and moved). |
| 3 | High | Chart (phone ≤ 640) | Share, Present and Details buttons have **no accessible name** (screen readers say "button"). axe `button-name` critical. | The text label is `display:none` on phones. |
| 4 | Medium | New song, 360/390 | Page scrolls sideways by 44 px; textarea wider than the screen; bottom tab "Play" cut off. | Quick-start chip row forces the grid column wider (`1fr` min-content). |
| 5 | Medium | Chart, all widths | `aria-pressed` set on the Chart section and the pane container; clicks anywhere in the editor re-run the pane switch (extra re-render in View mode). axe `aria-allowed-attr` critical. | `setPane` selects every `[data-pane]` element, not only the buttons. |
| 6 | Medium | Stage, all widths | Page behind the stage stays reachable by Tab and screen reader (axe finds editor controls while on stage). | Background not made inert. |
| 7 | Medium | Stage in a setlist, phone | Previous/next song are small buttons in the top-left corner, far from the thumb. | Layout. |
| 8 | Medium | Chart parsing | `C6/9` (common in worship charts) is not a chord: the whole line is treated as lyrics and is not transposed. | `/9` read as a bass note. |
| 9 | Medium | Chart parsing | `Intro: G  C  G` and `Em C G D (repeat)` are treated as lyrics, so they are not transposed, not shown as chords, and break Numbers/Roman views. | Label and "(repeat)" tokens not allowed on chord lines. |
| 10 | Medium | Drive | After a failed sync (Drive 5xx/403 rate limit, flaky network) nothing retries until the next edit; the status stays "Sync issue". | No retry. |
| 11 | Medium | All touch widths | 90+ controls under 44 px on phone Songs (row buttons 36, segmented 34, chips 32–34, select 42, account 38). Key picker 36. | Desktop sizes on touch. |
| 12 | Medium | Tablet landscape 1024 | Sidebar (248 px) leaves ~360 px per chart pane: preview wraps mid-line ("how sweet the / G / sound"). | Fixed sidebar width. |
| 13 | Low | Chart, phone | Meta chips scroll sideways with no cue; the Key chip is cut by the Details button. Scroll region not keyboard-focusable (axe serious). | `overflow-x: auto` row. |
| 14 | Low | Theory | `aside.key-panel` inside the Theory region (axe `landmark-complementary-is-top-level`). | Markup. |
| 15 | Low | Chart | No `h1` on the Chart screen (title is an input). | Markup. |
| 16 | Low | Setlist editor, phone | Song picker: long artist names squeeze titles into 2–3 lines; rows uneven. | Title and artist side by side. |
| 17 | Low | Songs → Setlists | Sort menu (Recent/Title/Artist/Key) shows on the Setlists filter but does nothing there. | Not hidden. |
| 18 | Low | Songs → Favorites empty | "No favorites yet" has no action. | Empty state. |
| 19 | Low | Chart | Neutral marks (`N.C.`, `(x2)`, labels) drawn in chord colour. | `chordHtml` only knew bars and `x2`. |
| 20 | Low | Offline | No sign the app went offline (signed-out users) and offline could not be tested locally (service worker only on https). | — |
| 21 | Low | Phone chart title | Long titles truncate after ~12 characters at 360 px. | 23 px title beside 3 buttons. |

Checked and fine: no horizontal page scroll on any other state; dialogs fit (scroll inside) at all widths; colour contrast passes in light theme at every width; no page errors in any state; slash chords, flats/sharps spelling, rhythm slashes, `N.C.`, `|` bars, `(C)`, `B#`/`Cb`/`E#`/`Fb`, `m7b5`, `ø`, `°7`, `add9`, `sus`, `maj9#11` all parse and transpose correctly.

## Fixes (all 21 items)

| # | Fix | Test |
|---|---|---|
| 1 | Short screens (≤ 520 px high, < 1024 wide): the top bar scrolls away, the tab bar is 48 px with the label beside the icon, smaller titles and spacing (`css/touch.css`). While scrolling a chart, ~280 px of the 390 px stay for the chart instead of ~0. | regression "landscape phone" |
| 2 | Stage bars float over the chart (`position: absolute`); the chart is padded by their measured height (`measureChrome`, ResizeObserver). Tapping the chart now really frees the whole screen. Landscape: one slim top row, title only. | regression "stage chart uses the full height" |
| 3 | Phone icon-only buttons keep their text for screen readers (visually hidden, not `display: none`). | regression "keep their names"; axe |
| 4 | Grid columns `minmax(0, 1fr)`, chip row `min-width: 0`. | regression "no sideways scroll" |
| 5 | `setPane` / view-mode / filter code only touch `button[data-…]`. | regression "Edit/View switch"; axe |
| 6 | `#app` is `inert` while the stage is open. | regression "background inert" |
| 7 | Previous/next song moved to the two ends of the bottom dock; "1/4" shown under the title. | regression "next song in the bottom dock" |
| 8 | `6/9` read as one chord (`C6/9`, `Cm6/9`, `C6/9/E`, `C6/9///`); only 6/9, so `C7/9` stays invalid. | unit "6/9 chords" |
| 9 | Chord lines may start with a known label (`Intro:`, `Tag:`, `Turnaround:`, `Vamp:`, `Outro:`…) and contain `(repeat)`, `rpt`, `(x2)`, `(2x)`. Labels stay as written and are shown muted. | unit "labels and repeat marks" |
| 10 | Failed Drive sync retries by itself: 20 s, 40 s, 80 s… up to 10 min; also on `online`. Going offline shows "Offline" at once. Merge/tombstone logic untouched. | regression "busy drive" (fake Drive returns 503) |
| 10b | When the one-hour Google session ends, a toast offers **Reconnect** (one tap, so the popup is allowed). | manual (needs real Google) |
| 11 | Touch screens (`pointer: coarse` or < 1024 px): every control ≥ 44 × 44 px (buttons, icon buttons, segmented, chips, selects, inputs, key picker, swatches, stage buttons, toast action). Piano keys and fret cells keep their geometry. 320 px: key picker in rows of 4; stage tools fit one row. | audit: 0 small targets in 150 states |
| 12 | 1024–1279 px: sidebar 204 px (theme toggle there moves to Settings only), Theory panel min 340 px; chords of the key go to 2 rows when the panel is narrow (container query). | audit 1024 |
| 13 | Meta chips wrap instead of a hidden sideways strip. | axe |
| 14–15 | Key panel is a `div`; hidden `h1` with the song title on the Chart screen; chart preview is a focusable region. | axe |
| 16 | Setlist picker rows: title over artist, key badge, "Every song is in this setlist" / no-match message, live count "Songs in this setlist (3)". | audit screenshots |
| 17 | Sort menu hidden on the Setlists filter. | regression |
| 18 | Empty Favorites has **Show all songs**. | regression |
| 19 | Neutral marks drawn muted (`isNeutralToken`). | unit |
| 20 | "You're offline. Songs still save on this device." toast; local tests can install the service worker with `?sw` (only on localhost/127.0.0.1). Offline load verified at all 6 viewports. | audit "offline" |
| 21 | Phone title uses the xl size, so ~18 characters show at 360 px. | screenshots |

### Also fixed while testing

- **Large libraries**: the song list draws 200 rows, then **Show more (N left)**; search waits 120 ms for a pause when the library has > 300 songs. 2,000 songs: first render 726 → 109 ms (desktop Chromium; phones are slower, so the gain is bigger there). Regression tests at 450 songs.
- **Tuner**: clear messages for a busy microphone (`NotReadableError`, e.g. during a call), a browser without microphone access, and a microphone that stops mid-tune (track `ended`).
- The audit found its own first-draft bug: a `data-filter` attribute on the list was picked up by the filter-button code (aria-pressed on the list). Removed; selectors now name buttons.

## Before / after (same 150 states)

| Check | Before (v3.1.2) | After |
|---|---|---|
| States with sideways page scroll | 2 | 0 |
| Controls outside the screen | 4 | 0 |
| Touch targets < 44 px | 90+ on phone Songs alone (2,846 incl. piano/fret cells) | 0 (instrument surfaces excluded) |
| States with axe violations | 48 (60 critical, 32 serious) | 0 |
| Page errors | 0 | 0 |

The six offline "before" axe failures were partly a test limit (no service worker on http); the offline state now loads from the cache at all widths.

Screenshots: `docs/audit-v3.2.0/phone-360.png`, `phone-360-sheets.png`, `phone-landscape.png`, `tablet-1024.png` (before left, after right). Full sets: run `npm run build && npm run serve:dist`, then `OUT=/tmp/sonata-audit npm run test:audit`.

## Test results

`npm run check`: unit **20/20** (was 18), typecheck 0, build OK (main JS 47 KB gzip, CSS 14 KB gzip, precache 429 KB).
E2E: browser **31/31**, routes **53/53**, a11y **22/22**, regression **41/41** (was 26), audit **150/150** states clean (new `npm run test:audit`).

## Still open

1. **Needs Jethro on real devices**: Google sign-in + Drive on the live site (incl. the new Reconnect toast), iPhone Safari and Android Chrome (safe areas, landscape, wake lock, audio after lock screen), tuner with an instrument, VoiceOver/TalkBack, real printing.
2. Landscape phone, Chart **Edit**: the chart starts below the title, toolbar and chord bar; it is fully usable after a short scroll (top bar scrolls away), but the first screen is still mostly controls. A bigger change (collapsing the chord bar into the toolbar row on short screens) is possible.
3. Tablet two-pane Songs + Chart (list beside the chart at 768–1023 px) was **not** built: it changes the app's navigation model and deserves its own design pass. Current tablet layout is clean and passes every check.
4. From v3.1.1: deletion marks have no timestamps; CSP still needs `'unsafe-inline'` for styles.
5. `sheets.js` (27 KB chunk, lazy) not split; no measurable need found.
6. Stage text on phones is capped at 7 vw, so A+ stops growing past ~25 px at 360 px (existing behaviour).
