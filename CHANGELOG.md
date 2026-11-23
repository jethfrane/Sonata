# Changelog

All notable changes to **Sonata** are documented here, following [Semantic Versioning](https://semver.org/).

## [7.4.0] - 2026-11-23

### Added
- **Per-Setlist Key & Capo Overrides**: Each slot inside a setlist (`SetlistItem`) supports optional `key` and `capo` overrides in `Edit setlist` and `Key & capo` without mutating the base song's default key/capo, applied consistently across Chart, Stage, setlist pills, song switcher, live setlist sync, and PDF/PNG/TXT/ChordPro exports.
- **Blocked-Site Fallback (`Paste chart text → Auto-Format`)**: When `/api/import` cannot read a protected site (`blocked`, etc.), `openLinksImport` provides a 1-tap `Paste chart text → Auto-Format` button and `Open page ↗` helper that auto-formats clipboard/pasted chords while keeping the source link intact.
- **ChordPro (`.cho`) Export**: Added `docChordPro` and `exportCho` alongside PDF, PNG, TXT, and Print for single songs and full setlists.
- **Complete Filipino i18n Parity**: Added missing Filipino translations in `js/ui/i18n-fil.js` and automated test parity verification across `index.html` and `js/`.

### Changed & Cleaned
- Split monolithic `js/ui/sheets.js` into focused lazy-loaded modules (`sheets.js`, `sheets-share.js`, `sheets-setlist.js`, `sheets-settings.js`, `sheets-import.js`).
- Archived legacy `v3.x`–`v6.x` docs into `docs/archive/`, aligned version metadata to `7.4.0`, and removed unused legacy root clutter.

## [7.3.0] - 2026-11-23

### Added
- **Editor Auto-Format (`#autoFormatBtn`)**: One-tap raw-paste cleanup in the editor pane header that extracts metadata (`title`, `artist`, `key`, `capo`, `bpm`), converts messy section markers (`Verse 1:`, `[Chorus]`, `(Bridge)`) to canonical `## Section` headings, strips guitar voicing legends and tuning headers, repairs common chord typos (`D/F#m` -> `D/F#`), collapses stray blank gaps above lyrics, and wraps overly long lines cleanly while keeping undo history intact.
- **Expanded Chord Site Extraction**: Added support for Next.js `__NEXT_DATA__` payloads (ChordPro/chart timelines), HTML chord `<td>`/`<th>` table spacing, and broader chord site title/domain normalization (Chordify, LaCuerda, AZChords, UkuTabs, EssentialWorship, MultiTracks, WorshipChords, Tabs4Acoustic).
- **Optional Mood / Tone (`mood`)**: Optional lightweight field beside Genre in Song details (`Joyful`, `Solemn`, `Reflective`, `Anthemic`, `Intimate`, `Upbeat`), searchable across Songs and MCP `list_songs`, hidden cleanly when unset, and carried inside `?s=` share links.
- **Enhanced Google Drive Live Setlists**: Non-intrusive 30s focus/visibility check when viewing Chart or Stage on a followed live setlist, surfacing an inline `"Update"` toast banner, `.has-update` indicator on Sync, and last-checked timestamp badge with zero backend database.
- **Tools Hub Quick Builder Link & Mobile Polish**: Added `"Custom chord? Chord Builder"` shortcut in Chord Finder, mobile/tablet Key Finder first ordering (`/tools/key-finder`), tablet 2-column Tools Hub grid, and initial `C4` scroll centering on narrow piano viewports.
- **AI Agent & MCP `v7.3.0`**: Added public MCP tool `format_chord_chart` (now 7 public / 18 total), added `chords-only` view support in `transpose_chart`, added `genre`/`mood` filters to `list_songs`, tagged all 18 tools with MCP 2025-03-26 `annotations`, and published `/llms-full.txt`.

### Changed
- Tightened chart editor/preview header padding and moved Undo/Redo + Format into `.edit-head` to reclaim ~70-100px of vertical chart space.
- Shifted `## Section` badges in chart preview and stage view to neutral slate pills so blue highlights belong exclusively to chord symbols.
- Removed decorative glass gloss from `public/icons/icon.svg`, removed heavy `backdrop-filter` blur on mobile navigation bars, and removed the Bible verse from Settings → About and `README.md`.

## [7.2.0] - 2026-11-22

### Fixed & Added
- Sharper chord detection (`Bm///-`, `D/F#m`, `G-D`, `Verse 1:` prefixes, `Gsus`, `D2`, `G(add9)`, `(hold)` cues).
- Fixed IV-opening key scoring and concert Key + Capo double-transposition on import.
- 1-tap Key and Capo chips directly under song titles and Key/Capo overrides in Import preview.
- Smarter mobile Share text + URL extraction and named source links (`Ultimate Guitar`, `WorshipTogether`, etc.).

## [7.1.1] - 2026-11-22

### Added
- `Chords only` view mode in View, Stage, Import preview, and exports (PDF/PNG/TXT/Print).
- `Cmd/Ctrl+K` Quick Song Switcher across Chart, Setlists, and Stage.
- Side margins in Preview, Stage, and multi-song 9:16 / 16:9 PNG setlist exports with QR links.
- Streamlined Google Drive live setlist sharing & 4s auto-sync for published owners.

## [7.0.0] - 2026-11-20

### Added
- 3-tab shell (`Songs · Chart · Tools`) with dedicated `/tools` hub and `/tools/key-finder`.
- Rearranged Minor Circle of Fifths ring (`Am` outer ring) and interactive Key Finder.
- Floating anchored popover dropdowns, 30-day Trash synced with Google Drive, and 17-tool Remote MCP + WebMCP (`navigator.modelContext`).
