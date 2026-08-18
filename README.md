# Sonata Master 🎵

Sonata is a professional, offline-first, cross-platform chord sheet editor and musicians' toolkit designed specifically for musicians, worship leaders, bands, and song arrangers. It runs completely in the browser with 100% offline capabilities, zero backend server requirements, and instant Google Drive synchronization.

---

## 📸 Screenshots & Walkthrough

| 📝 Chord Sheet Editor | ⚙️ Music Theory & Circle of 5ths | 🎹 Virtual Instruments |
| :---: | :---: | :---: |
| ![Chord Sheet Editor](screenshots/editor.png) | ![Circle of 5ths](screenshots/theory.png) | ![Virtual Instruments](screenshots/play.png) |

---

## 🌟 Why Sonata Was Built

Sonata was created by **Jeth Frane** to provide musicians with a centralized, distraction-free environment for songwriting, rehearsal, and stage performance.

1. **Band Sync & Team Collaboration:** Share full, interactive song charts and multi-song setlists instantly via scannable QR codes or ultra-compressed direct URLs without requiring user accounts or external link shorteners.
2. **Centralized Musical Toolkit:** Put away separate calculators and theory apps—transposition, metronomes, key detection, circle of fifths, digital piano, and multi-instrument fretboards are built directly into your workspace.
3. **Stage-Ready Presentation:** High-contrast presentation mode with adjustable auto-scroll, metronome indicators, and independent dark/stage themes keeps your eyes focused on the music.
4. **100% Offline PWA Resilience:** Fully pre-cached Service Worker allows you to install Sonata to your Home Screen or Desktop and use every single tool on stage with zero Wi-Fi or cellular connection.
5. **Universal Formatting:** Paste any standard chord chart, and Sonata preserves spacing while enabling instant transposition, Roman Numerals (`I, ii, iii`), Nashville Numbers (`1, 2, 3`), and Lyrics-Only views.

---

## 🚀 Core Features & Capabilities

### 1. Advanced Song Editor
* **Chord Over Lyrics & Inline Chords:** Seamlessly handles traditional chord spacing (`G  C/G  G`) and inline chord brackets (`[G]Amazing [C]grace`).
* **Rich Markdown Support:** Use `# Header` for titles, `## Subheader` for verse/chorus sections, `---` for solid dividers, and `> Note` for comments that never transpose.
* **Mobile & Tablet Editor Switcher:** Toggle between **Edit Mode** (full-screen writing), **Preview Mode** (formatted live chart), and **Split Mode** (stacked view) on any mobile or tablet screen.
* **Metadata & References:** Store Song Title, Artist, Arranger, BPM, and multiple named reference links (e.g. YouTube tutorials).
* **Multi-Step Undo/Redo:** Full history stack (up to 50 levels) with keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`).
* **View & Position Persistence:** Automatically remembers your active song and current tab across refreshes.

### 2. Music Theory & Virtual Instruments
* **Interactive Circle of 5ths:** Click any key to hear 3-note harmonic synthesis. Toggle Auto-Rotate to align the active root, and highlight the 7 diatonic chords in your key family with correct music theory spelling.
* **Virtual Piano Keyboard:** Touch-responsive, multi-octave digital piano with realistic key proportions, sustained release, and scale highlighting.
* **Interactive Multi-String Fretboard:** Full chord visualization supporting 6-String Guitar, 4-String Bass, 5-String Bass, and Ukulele.
* **Manual Key Override Lock:** Lock your custom key or mode on the Play page without automatic resets when switching tabs.
* **Capo & Transposition:** Select capo frets and semitone shifts to preview exact fingerings in real time.

### 3. Stage Presentation Mode
* **Immersive Fullscreen:** Strips away editor controls for distraction-free reading on stage.
* **Independent Stage Themes:** Choose Light, Dark, or Stage True-Black modes.
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
