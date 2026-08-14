# Sonata Master 🎵

Sonata is a professional, offline-first, mobile-friendly chord sheet editor and music toolkit designed specifically for musicians, worship leaders, and bands. It runs entirely in the browser with no backend servers, no sign-ups, and no databases required.

The entire application lives in a single, lightning-fast static file (`index.html`) optimized for GitHub Pages and offline stage use.

## 🌟 Why Sonata Was Built

Sonata was created by Jeth Frane primarily to help church musicians and bands collaborate and stay synchronized during rehearsals and live services.

Preparing for a setlist often involves juggling scattered text files, unformatted lyric sheets, and manual transposition under pressure. Sonata eliminates this friction by centralizing all your tools into one distraction-free web app:

1. **Band Sync & Team Collaboration:** Share full, interactive song charts instantly via scannable QR codes or ultra-compressed links without needing user accounts.
2. **Centralized Preparation:** Put away the calculator and separate theory apps—transposition, metronomes, key detection, chord calculators, and instrument references are built directly into your editor view.
3. **Stage-Ready Presentation:** A high-contrast presentation mode with auto-scroll and independent stage themes keeps your eyes on the music, not the software.
4. **Offline Resilience:** Works completely offline in venues with zero Wi-Fi or cellular coverage.
5. **Universal Formatting:** Paste any standard chord chart, and Sonata preserves your spacing while instantly converting it into Roman Numerals, Nashville Numbers, or Lyrics-Only sheets.

## 🚀 Core Features & Capabilities

### 1. Advanced Song Editor
* **Chord Over Lyrics & Inline Chords:** Seamlessly handles traditional spacing (`G C/G G`) and bracketed inline chords (`[G]Amazing [C]grace`).
* **Rich Markdown Support:** Use `# Header` for large titles, `## Subheader` for sections, `---` for clean dividers, and `> Note` or `// Comment` for notes that will never accidentally transpose.
* **Metadata & References:** Store your Song Title, Artist, Arranger/Creator, and multiple named Reference Links (such as YouTube tutorial links).
* **Instant Revert:** Accidentally made a bad change? Instantly restore your sheet to its last saved state with a single tap.

### 2. Music Theory & Instruments Engine
* **Interactive Circle of 5th's:** Click any key to hear a 3-note synthesized chord. Toggle "Auto-Rotate" to spin your active key to the top, and toggle "Highlight Key Family" to dim non-diatonic chords and reveal the 7 chords belonging to your key. Intelligently swaps to relative minor layouts when a minor key is active.
* **Multi-Format Conversions:** Instantly view your sheet as Transposed Chords, Roman Numerals (`I, ii, iii`), Nashville Numbers (`1, 2, 3`), or Lyrics Only (stripping out all chords for clean vocal sheets).
* **Virtual Instruments:** Includes a scrollable multi-touch Digital Piano and an interactive Fretboard supporting 6-String Guitar, 4-String Bass, 5-String Bass, and Ukulele with native audio synthesis.
* **Capo Support:** Set your Capo fret, and Sonata instantly calculates the actual chord shapes you need to play while keeping your original key intact.

### 3. Stage Presentation Mode
* **Immersive Fullscreen:** Strips away all editor chrome for a clean, distraction-free stage view.
* **Isolated Stage Themes:** Switch between Light, Dark, and Stage (True Black) themes independently from your main editor background.
* **Built-in Auto-Scroll & Metronome:** Control auto-scroll speed on the fly with floating controls that fade out when idle.

### 4. Zero-Friction Sharing & QR Codes
* **Deflate Compression:** Compresses entire song payloads into ultra-short URLs.
* **QR Profile Cards:** Instantly generate and download a gorgeous branded QR Profile Card image complete with app branding, song title, and scan instructions.
* **Social Sharing:** Built-in sharing links for WhatsApp, Facebook, X, Email, and native device share sheets.
* **View-Only Import:** When scanning a shared QR code, friends view the chart instantly in a read-only state without cluttering their local browser library.

### 5. Professional Export System
* **Multi-Column Layouts:** Export your charts in 1, 2, or 3-column layouts with dynamic column spacing, custom gutters, and intelligent word & bracket wrapping to ensure chord markers never overflow columns.
* **Multiple Formats:** Export as pristine vector PDF, high-resolution PNG, plain text TXT, or direct browser Print. PDF exports automatically translate musical accidentals (♯, ♭) cleanly for universal PDF viewer compatibility, inherit active layouts (transposed, Roman, Nashville, lyrics-only), and style song metadata in the header and page counters in the footer.

### 6. Cloud Backup & Sync (Optional)
* **Google Drive Sync:** Seamlessly back up and restore your library using Google Identity Services (GIS) and GAPI. Changes are automatically merged based on `updatedAt` timestamps and uploaded to a secure, hidden `appDataFolder` on your personal Google Drive, keeping your staging layout and files synced across laptops, tablets, and phones.

## 🛠️ How to Publish on GitHub Pages

Because Sonata is a single-file static app, publishing it takes less than 60 seconds:

1. Create a new repository on GitHub (e.g., `sonata-master`).
2. Save the final code provided into a file named exactly `index.html`.
3. Upload `index.html` to the root of your repository.
4. Go to your repository **Settings > Pages**.
5. Under **Build and deployment**, set the Branch to `main` (or `master`) and `/ (root)` folder, then click **Save**.
6. Your app will be live globally at `https://<your-username>.github.io/<repository-name>/`!

## 📦 Data Privacy & Backup

Sonata stores all songs and settings securely in your browser's `localStorage` and optionally syncs with Google Drive's private app folder. Your data never leaves your device or your personal storage. To back up your library manually, simply go to Settings and click **Export Backup (.json)**. You can restore it anytime using **Import Backup**.

Created with ❤️ by Jeth Frane for musicians everywhere.
