# Sonata Master 🎵

Sonata is a modern, online collaboration tool and music toolkit designed specifically for musicians, worship leaders, bands, and song arrangers. It runs entirely in your browser with zero backend server dependencies, private Google Drive synchronization, and zero-friction team sharing.

**Best of all: Sonata is 100% free with no subscriptions.**

🌐 **Live Web Application:** [https://jethfrane-sonata.vercel.app](https://jethfrane-sonata.vercel.app)

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
2. **🔒 Completely Free & Secure:** Sonata is completely free with no paywalls or subscriptions. Your data belongs to you. Sonata stores all songs securely by syncing directly to your private Google Drive. We do not collect, track, or store any of your data on centralized databases.
3. **⚡ Stage-Ready Presentation:** Fullscreen high-contrast presentation mode with adjustable auto-scroll, metronome indicators, and independent dark/stage themes keeps your eyes focused on the performance.
4. **🎹 Centralized Musical Toolkit:** Put away separate calculators and tuner apps—transposition, metronomes, key detection, Circle of Fifths, digital piano, and multi-instrument fretboards are built directly into your workspace.
5. **📱 Universal Cross-Device Responsiveness:** Whether on an iPhone, iPad, Android tablet, MacBook, or ultra-wide desktop monitor, Sonata dynamically adapts its toolbars, navigation, and editor panes for maximum efficiency.
6. **📑 Universal Sidebar Drawer Navigation:** A unified slide-out navigation drawer is available across all device sizes (mobile, tablet, laptop, desktop) keeping the top header clean, spacious, and distraction-free while keeping secondary utilities (Drive Sync, Settings, Help, Language, App Install) one click away.

---

## 🚀 Core Features & Capabilities

### 1. Advanced Song Editor & Markdown Engine
* **Chord Over Lyrics & Inline Chords:** Seamlessly handles traditional chord spacing (`G  C/G  G`) and inline chord brackets (`[G]Amazing [C]grace`).
* **Rich Markdown Syntax:** Use `# Header` for titles, `## Subheader` for sections (Verse, Chorus, Bridge), `---` for solid dividers, and `> Note` or `// Comment` for notes that never accidentally transpose.
* **Mobile & Tablet Mode Switcher:** Toggle between **Edit Mode** (full-screen writing), **Preview Mode** (formatted live chart), and **Split Mode** (stacked view) on any mobile or tablet screen.
* **Live Metadata Bar:** Real-time display of Author, Arranger, BPM, and detected Song Key right below the title.
* **Multi-Step Undo/Redo:** 50-level history stack with keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`).

### 2. Music Theory & Virtual Instruments
* **Interactive Circle of 5ths:** Click any key to hear 3-note harmonic synthesis. Toggle Auto-Rotate to align the active root, and highlight the 7 diatonic chords in your key family with correct music theory spelling.
* **Virtual Piano Keyboard:** Touch-responsive, multi-octave digital piano with realistic key proportions, sustained release, and custom scale highlighting.
* **Interactive Multi-Instrument Fretboard:** Full chord and scale visualization supporting 6-String Guitar, 4-String Bass, 5-String Bass, and Ukulele.
* **Capo & Transposition:** Select capo frets and semitone shifts to preview exact fingerings in real time.

### 3. Stage Presentation Mode
* **Immersive Fullscreen:** Strips away editor controls for distraction-free reading on stage.
* **Independent Stage Themes:** Choose Light, Dark, or Stage True-Black modes without conflicting with your main application theme.
* **Auto-Scroll & Metronome:** Smooth auto-scroll with adjustable speed and visual beat indicators.

### 4. Zero-Friction Sharing & QR Codes
* **Shortened Share Links:** Generates direct TinyURL shortened links containing your ultra-compressed song data.
* **Scannable QR Codes:** Built-in dynamic QR code generation for rapid device-to-device sharing.

### 5. Multi-Format Exporting
* **Vector PDF:** Clean multi-column PDF charts featuring your custom logo and responsive headers.
* **High-Res PNG & Text:** Export as image charts with your logo or as clean text downloads.

### 6. Cloud Backup & Sync
* **Google Drive Sync:** Automatic background synchronization with your personal Google Drive account for ultimate privacy.

---

## 💻 Tech Stack & Deployment

* **Frontend:** Vanilla HTML5, Modern CSS3 (Glassmorphism, Flexbox, CSS Grid), Vanilla ES6+ JavaScript.
* **PWA & Offline:** Service Worker cache with offline capabilities and Installable PWA manifest.
* **Hosting & CI/CD:** Deployed on [Vercel](https://vercel.com) with automatic production builds via GitHub integration.

---

## 📦 Privacy & Security

Sonata is built with your privacy in mind. **The app is 100% free and collects zero user data.** We do not track users or store songs on centralized database servers. Your chord sheets remain stored safely on your own device and are only synced to your private Google Drive account.

---

© 2026 Jeth Frane – Built for musicians.
