# Changelog

All notable changes to **Sonata** are documented here, following [Semantic Versioning](https://semver.org/).

## [7.7.1] - 2026-11-26

### Added & Improved
- **Live Transposed-Key Editing & Per-Mode Chart Customization**: `#songBody` now displays and edits chords in the exact active transposed/capo key (`js/ui/editor.js`, `js/core/store.js`, `js/ui/ctx.js`) while preserving `sonata:v12:*` and `?s=` compatibility; non-Chords views (`Chords only`, `Numbers`, `Roman`, `Lyrics`) support optional independent edits (`Edit separately`) with 1-tap `Reset`.
- **Studio Audio Overhaul & Voice Choking**: Added natural per-instrument decay envelopes (`bass ~1.35s`, `uke ~1.55s`, `guitar ~2.15s`, `piano ~2.35s`), warmer balanced EQ, and clean voice choking on rapid chord taps (`js/audio.js`, `js/ui/chords.js`).
- **Chord Diagram Image Preview Fix**: Fixed `copyChordImage()` SVG selection (`svg.chord-box, svg.piano-keys, svg.neck-map`) and added a viewable preview sheet with `Copy image`, `Share`, and `Download PNG`.
- **Sitewide UI, Play, Tuner, Theory & Settings Polish**: Fixed dropdown vertical centering and native `::picker-icon` double arrows across the entire app, floated desktop song-row hover actions without shifting text, aligned Trash rows, capped expanded pagination at `50/page` with single-row mobile controls, removed mobile row BPM clutter, removed the redundant `.preview-head` bar, centered Tuner string buttons, compacted the Play instrument switcher, fixed mobile Circle of Fifths header stacking, removed the redundant `Key Finder` card from Tools Hub (preserving `/tools/key-finder`), and added clean spacing to Settings actions & footer.
- **Revamped Icons & Official Google Drive Branding**: Upgraded `ICONS` (`1.85` stroke Lucide geometry) and added the official multi-color Google Drive icon across the top bar/sidebar, Settings, and Backup & restore.

## [7.6.0] - 2026-11-25

### Added & Overhauled
- **Mobile-First High-Density UI (`<= 640px`)**: Slimmed mobile shell bars (`42px` top / `46px` bottom), turned Songs into crisp 2-line rows fitting 8 songs simultaneously on a phone screen, condensed Chart headers to 2 lines with a single Key/Transpose stepper so `Verse 1 + Chorus + Bridge` fit above the fold, and arranged `/tools` in a zero-scroll 2-column Bento grid with live song context pills.
- **Stage `Amber` Preset & Compact Controls**: Added warm `#0c0a08` Amber low-light Stage theme (`js/core/store.js`, `js/ui/stage.js`, `css/stage.css`), slimmed mobile Stage controls to `34px`, and locked the Stage title on one row beside Fullscreen and Exit.
- **CSS Architecture & WCAG 2.1 AA Polish**: Split `css/stage.css` and `css/bank.css` out of first-load CSS, calibrated light/dark contrast across all 5 accent themes (`blue`, `teal`, `violet`, `rose`, `amber`), reclaimed first-load JS headroom in `js/ui/dom.js`, and added a Help shortcut inside Settings.
- **Sharing, Assets & Release Log Consolidation**: Compacted the mobile Share/Export dialog (`repeat(3, 1fr)` export grid + compact QR), sleek mobile `.banner` for shared-link recipients, copy checkmark feedback on `Copy chart` and `Live link`, `/play/drums` link preview metadata, refreshed PWA icons/OG cards/screenshots, strictly user-focused copy, and consolidated all same-day changelog entries into one entry per date.

## [7.5.0] - 2026-11-24

### Added & Improved
- **Resilient Google Drive Sync**: Persists session tokens safely across reloads and service worker updates, attempts silent GIS background refresh (`prompt: "none"`) on expiry or `401` before showing Reconnect, and throttles reconnect toast notifications to at most once every 12 hours.
- **Setlist Tags, Favorites & Sorting**: Keeps `#librarySort` active on the Setlists tab (`Latest` first by default, plus `Title`, `Artist`, `Key`, `Oldest`), adds optional preset/custom tags (`Church`, `Worship`, `Gig`, `Performance`, `Rehearsal`, `Acoustic`), supports Favoriting setlists (also displayed in the `Favorites` tab), and uses floating `.ui-select-menu` popovers on per-slot Key/Capo selectors.
- **Rich Row Badges & Pagination**: Shows live/shared/setlist/pinned pills and `Updated ...` relative timestamps across `All`, `Favorites`, `Setlists`, and `Song Bank`, plus clean 12-item pagination bars with `Prev` / page numbers / `Next` / `Show all`.
- **Native App Experience**: Sidebar `Recent` list with pinned songs, artist/status subtext, and full relative time (`7 hours ago`, `days`, `months`, `years`), desktop hover quick-actions (`Present`, `Pin`, `Share`), and lazy-loaded native right-click context menus across songs, setlists, and sidebar items.

## [7.4.0] - 2026-11-23

### Added
- **Per-Setlist Key & Capo Overrides**: Each slot inside a setlist (`SetlistItem`) supports optional `key` and `capo` overrides in `Edit setlist` and `Key & capo` without mutating the base song's default key/capo, applied consistently across Chart, Stage, setlist pills, song switcher, live setlist sync, and PDF/PNG/TXT/ChordPro exports.
- **One-Tap Auto-Format & Blocked-Site Recovery**: Added `#autoFormatBtn` (`Format`) in the editor header to normalize raw pastes into canonical `## Section` headings, strip voicing legends, fix chord typos (`D/F#m` -> `D/F#`), collapse blank gaps, and wrap long lines cleanly; blocked imports offer a 1-tap `Paste chart text → Auto-Format` button plus `Open page ↗`.
- **ChordPro (`.cho`) Export, Mood/Tone Tags & Live Setlist Alerts**: Added `docChordPro` / `exportCho`, optional searchable `mood` tags beside Genre, broader Next.js/HTML table chord extraction, and non-intrusive 30s live Drive setlist update alerts.
- **Complete Filipino i18n Parity & Tools/MCP Upgrades**: Full English/Filipino key parity verification, 2-column tablet Tools Hub + mobile Key Finder/C4-centered piano improvements, modular dialog sheets (`sheets-*.js`), slate section pills, and 18 annotated MCP tools with `/llms-full.txt`.

## [7.2.0] - 2026-11-22

### Fixed & Added
- **Chords-Only View & Import Toggle**: View, Stage, Import preview, and PDF/PNG/TXT/Print exports support pure chord progression mode with tap-to-hear popups.
- **Sharper Chord & IV-Key Detection + 1-Tap Key/Capo**: Parses glued hyphens (`Bm///-`, `G-D`), slash-bass suffixes (`D/F#m`), `Verse 1:` prefixes, and `(hold)` cues without double-shifting Capo + Concert key; adds clickable Key/Capo chips under titles and overrides inside Import.
- **Quick Song Switcher, Multi-Page Setlist PNGs & Drive Live Setlists**: `Cmd/Ctrl+K` switcher, clean margins & scannable QR codes on multi-song 9:16/16:9 PNGs, direct Drive sign-in in Share, 4s auto-sync, named source links with 1-tap copy, and `/set/<id>` link previews.

## [7.0.0] - 2026-11-20

### Added
- 3-tab shell (`Songs · Chart · Tools`) with dedicated `/tools` hub and `/tools/key-finder`.
- Rearranged Minor Circle of Fifths ring (`Am` outer ring) and interactive Key Finder.
- Floating anchored popover dropdowns, 30-day Trash synced with Google Drive, and 17-tool Remote MCP + WebMCP (`navigator.modelContext`).
