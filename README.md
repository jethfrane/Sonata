# Sonata Master 🎵

Sonata is a modern, offline-first, cross-platform chord sheet editor and music toolkit designed specifically for musicians, worship leaders, bands, and song arrangers. It runs 100% in the browser with full offline capabilities, zero backend server dependencies, private Google Drive synchronization, and zero-friction team sharing.

---

## 📸 Screenshots & Interface Showcase

| 📝 Split Editor (Light Mode) | 🎹 Virtual Piano, Fretboard & Tuner |
| :---: | :---: |
| ![Split Chord Editor](screenshots/editor.png) | ![Virtual Instruments & Tuner](screenshots/play.png) |

| 📚 Song Library (Dark Mode) | 🎨 Custom Themes & Accents |
| :---: | :---: |
| ![Library in Dark Mode](screenshots/library_dark.png) | ![Custom Accent Themes](screenshots/editor_rose.png) |

| 📱 Mobile-First Live Preview | 📑 Slide-Out Drawer Navigation | 🎭 Stage Presentation Mode |
| :---: | :---: | :---: |
| ![Mobile Live Preview](screenshots/mobile_view.png) | ![Drawer Navigation](screenshots/sidebar_drawer.png) | ![Stage Presentation Mode](screenshots/presentation_mode.png) |

---

## 🌟 Why Sonata Was Built

Sonata was created by **Jeth Frane** to solve the real-world friction musicians, church bands, and worship teams face when managing chord charts, rehearsing, and performing live:

1. **🎸 Worship Team & Band Collaboration:** Share full, interactive song charts and multi-song setlists instantly via scannable QR codes or ultra-compressed direct URLs without requiring user accounts or external link shorteners.
2. **🔒 Privacy & 100% Offline-First:** Your data belongs to you. Sonata stores all songs and setlists locally in your browser's encrypted `localStorage` with optional private Google Drive background sync. No central tracking or server databases.
3. **⚡ Stage-Ready Presentation:** Fullscreen high-contrast presentation mode with adjustable auto-scroll, metronome indicators, and independent dark/stage themes keeps your eyes focused on the performance.
4. **🎹 Centralized Musical Toolkit:** Put away separate calculators and tuner apps—transposition, metronomes, key detection, Circle of Fifths, digital piano, and multi-instrument fretboards are built directly into your workspace.
5. **📱 Universal Cross-Device Responsiveness:** Whether on an iPhone, iPad, Android tablet, MacBook, or ultra-wide desktop monitor, Sonata dynamically adapts its toolbars, navigation, and editor panes for maximum efficiency.

---

## 🚀 Core Features & Capabilities

### 1. Advanced Song Editor & Markdown Engine
* **Chord Over Lyrics & Inline Chords:** Seamlessly handles traditional chord spacing (`G  C/G  G`) and inline chord brackets (`[G]Amazing [C]grace`).
* **Rich Markdown Syntax:** Use `# Header` for titles, `## Subheader` for sections (Verse, Chorus, Bridge), `---` for solid dividers, and `> Note` or `// Comment` for notes that never accidentally transpose.
* **Mobile & Tablet Mode Switcher:** Toggle between **Edit Mode** (full-screen writing), **Preview Mode** (formatted live chart), and **Split Mode** (stacked view) on any mobile or tablet screen.
* **Live Metadata Bar:** Real-time display of Author, Arranger, BPM, and detected Song Key right below the title.
* **Multi-Step Undo/Redo:** 50-level history stack with keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`).
* **View & Position Persistence:** Automatically remembers your active song and current tab across refreshes.

### 2. Music Theory & Virtual Instruments
* **Interactive Circle of 5ths:** Click any key to hear 3-note harmonic synthesis. Toggle Auto-Rotate to align the active root, and highlight the 7 diatonic chords in your key family with correct music theory spelling.
* **Virtual Piano Keyboard:** Touch-responsive, multi-octave digital piano with realistic key proportions, sustained release, and custom scale highlighting.
* **Interactive Multi-Instrument Fretboard:** Full chord and scale visualization supporting 6-String Guitar, 4-String Bass, 5-String Bass, and Ukulele.
* **Manual Key Override Lock:** Lock your custom key or mode on the Play page without automatic resets when switching tabs.
* **Capo & Transposition:** Select capo frets and semitone shifts to preview exact fingerings in real time.

### 3. Stage Presentation Mode
* **Immersive Fullscreen:** Strips away editor controls for distraction-free reading on stage.
* **Independent Stage Themes:** Choose Light, Dark, or Stage True-Black modes without conflicting with your main application theme.
* **Auto-Scroll & Metronome:** Smooth auto-scroll with adjustable speed and visual beat indicators.

### 4. Zero-Friction Sharing & QR Codes
* **Ultra-Compressed Direct Links:** Generates direct, self-contained URLs (`https://<username>.github.io/Sonata/?s=...`) using Deflate compression with no third-party URL dependencies.
* **Professional Link Previews:** Interactive import modal displays artist, key, arranger, setlist songs, and chord excerpts.
* **Scannable QR Codes:** Built-in QR card generation and camera scanner for rapid device-to-device imports.

### 5. Multi-Format Exporting
* **Vector PDF:** Clean multi-column PDF charts with embedded scannable QR codes and headers.
* **High-Res PNG:** Image charts with theme colors, metadata, and QR codes.
* **Plain Text TXT & Print:** Clean text downloads and browser print optimization.

### 6. Cloud Backup & Sync
* **Google Drive Sync:** Automatic background synchronization with Google Drive (`drive.file` scope).
* **Personalized Account Greeting:** Shows your first name (`Hi, [Name]!`) and profile avatar with local caching.
* **Offline Local Storage:** All library data is persisted locally in `localStorage`.

---

## 🌐 Versioning & Internationalization (i18n)

* **Version Tracking:** Active release is tracked in `version.json` and `update_log.json` and displayed in the navigation badge.
* **Multilingual UI:** Seamlessly switch between **English** and **Filipino** translations.

---

## 📦 Privacy & Security

Sonata does not track users or store songs on centralized database servers. Your chord sheets remain stored safely on your own device and private Google Drive account.

© 2026 Jeth Frane – Built for musicians.
