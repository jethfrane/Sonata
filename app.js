    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.__deferredPrompt = e;
      const headerBtn = document.getElementById('headerInstallBtn');
      if (headerBtn) headerBtn.style.display = 'inline-flex';
      const settingsBtn = document.getElementById('installAppBtn');
      if (settingsBtn) settingsBtn.style.display = 'inline-flex';
    });

    let UI_FONT_OPTIONS = [], CHART_FONT_OPTIONS = [], ACCENT_THEMES = [], DEFAULT_SETTINGS = {}, FONT_STACKS = {}, STORAGE_KEYS = {};

    (() => {
      "use strict";
      UI_FONT_OPTIONS = [{ value: "system", label: "System" }, { value: "rounded", label: "Rounded" }, { value: "serif", label: "Serif" }, { value: "mono", label: "Mono" }];
      CHART_FONT_OPTIONS = [{ value: "mono", label: "Mono" }, { value: "system", label: "System" }, { value: "serif", label: "Serif" }];
      ACCENT_THEMES = [{ value: "blue", label: "Blue" }, { value: "teal", label: "Teal" }, { value: "rose", label: "Rose" }, { value: "amber", label: "Amber" }, { value: "violet", label: "Violet" }, { value: "graphite", label: "Graphite" }];
      DEFAULT_SETTINGS = { theme: "light", accentTheme: "blue", uiFontFamily: "system", chartFontFamily: "mono", appFontSize: 15, editorFontSize: 15, previewFontSize: 14, editorLineHeight: 1.6, presentationFontSize: 42, metronomeVolume: 0.55, presentationOrientation: "auto", metronomeBpm: 90, metronomeBeats: 4, uiSounds: true, haptics: true, autoScrollSpeed: 30, language: "en", autoFillArranger: true };
      FONT_STACKS = { system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', rounded: '"SF Pro Rounded", Nunito, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, Menlo, Consolas, monospace' };
      STORAGE_KEYS = { songs: "sonata:v12:songs", settings: "sonata:v12:settings", activeSong: "sonata:v12:active", setlists: "sonata:v12:setlists" };

      const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const FLAT_NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
      const KEY_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
      const MINOR_KEY_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
      const NOTE_TO_SEMITONE = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };
      const SCALE_INTERVALS = { major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10] };

      const CIRCLE_OF_FIFTHS = [
        { major: "C", minor: "A", dim: "B", offset: 0 }, { major: "G", minor: "E", dim: "F#", offset: 7 },
        { major: "D", minor: "B", dim: "C#", offset: 2 }, { major: "A", minor: "F#", dim: "G#", offset: 9 },
        { major: "E", minor: "C#", dim: "Eb", offset: 4 }, { major: "B", minor: "G#", dim: "Bb", offset: 11 },
        { major: "F#", minor: "Eb", dim: "F", offset: 6 }, { major: "C#", minor: "Bb", dim: "C", offset: 1 },
        { major: "G#", minor: "F", dim: "G", offset: 8 }, { major: "Eb", minor: "C", dim: "D", offset: 3 },
        { major: "Bb", minor: "G", dim: "A", offset: 10 }, { major: "F", minor: "D", dim: "E", offset: 5 }
      ];

      const DEMO_SONG = `# Amazing Grace (My Chains Are Gone)
## Verse 1 (Chords Above Lyrics)
G       C/G        G
Amazing grace how sweet the sound
      Em       D/F#     G
That saved a wretch like me

## Verse 2 (Inline Chords)
I [G]once was lost but [C/G]now I'm [G]found
Was [Em]blind but [D/F#]now I [G]see

---
## Chorus (Rhythm Slashes)
> The slashes below parse as pure rhythm, cleanly styled separately from normal slash chords.
C///  G/B///  C///  G/B///
My chains are gone I've been set free
C///  Em///   D///  G///
My God my Savior has ransomed me

## Bridge (Chords Only)
// Build up dynamically here
G  -  C/G  -  G  -  D/F#
Em -  C    -  G  -  D
`;

      const HELP_TEXTS = {
        library: "Your song library is securely saved entirely within this browser offline. Create Sets to group songs for worship.",
        keyOverride: "Forces the Roman Numeral and Nashville Number conversions to calculate based on this exact key.",
        capo: "Select the fret where you place your capo. The preview and exports will show the actual shapes you need to play.",
        transpose: "Shifts every chord in your song up or down. Your active key will dynamically update.",
        formats: "Change how your chart is displayed. 'Lyrics' instantly strips all chords for a clean vocal sheet.",
        export: "Creates a pristine, offline PDF or Image. 'Columns' will perfectly hard-wrap your text to fit multiple songs on a page.",
        circle: "The Circle of 5ths organizes keys mathematically. Toggle 'Highlight Family' to instantly reveal the 7 diatonic chords for your key.",
        piano: "Scroll horizontally to view more octaves. Touch and hold a key to sustain the note.",
        fretboard: "Visualize notes on a guitar, bass, or ukulele. Touch and hold the fret to sustain the note.",
        tuner: "Click the reference buttons to hear perfect pitches, or click Start to use your device's microphone for live tuning.",
        present: "Stage-ready presentation mode. Use the 'Sun/Moon' icon to cycle between Light, Dark, and True Black stage themes.",
        theoryKey: "Type a key like 'G' or 'C#m' to lock the theoretical view to that key. Leave empty to auto-detect from the editor.",
        setlist: "Create a setlist to easily share multiple songs at once and navigate between them seamlessly on stage."
      };

      const I18N_DICTS = {
        en: {
          brandSubtitle: "Offline tool for musicians",
          navEditor: "Editor",
          navLibrary: "Library",
          navTools: "Tools & Export",
          navTheory: "Theory",
          navPlay: "Play",
          navMobileEditor: "Editor",
          navMobileLibrary: "Library",
          navMobileTools: "Tools",
          navMobileTheory: "Theory",
          navMobilePlay: "Play",
          helpBtn: "Help",
          settingsBtn: "Settings",
          presentBtn: "Present",
          syncBtn: "Drive Sync",
          installBtn: "Install App",
          libraryHeading: "Song Library",
          manageLibraryBtn: "Manage",
          newSongButton: "New Song",
          songSearchPlaceholder: "Search title or lyrics...",
          librarySortRecent: "Recent",
          librarySortTitle: "Title",
          librarySortAuthor: "Author",
          librarySortArranger: "Arranger",
          librarySortKey: "Key",
          libraryFilterAll: "All",
          libraryFilterFav: "Favorites",
          libraryFilterSet: "Setlists",
          editorSave: "Save",
          editorUndo: "Undo",
          editorRedo: "Redo",
          editorSaveToLibrary: "Save to Library",
          editorDetails: "Details",
          editorDemo: "Demo",
          editorClosePreview: "Close Preview",
          editorTabSong: "Song",
          editorTabTransposed: "Transposed",
          editorTabRoman: "Roman",
          editorTabNashville: "Nashville",
          editorTabLyrics: "Lyrics",
          editorPaneEditor: "CHORD & LYRIC EDITOR",
          editorPanePreview: "LIVE CHART PREVIEW",
          editorPlaceholderTitle: "Welcome to Sonata!",
          editorPlaceholderP1: "Type your chords and lyrics below, or click <strong>Demo</strong> above to instantly load a fully formatted example.",
          editorPlaceholderL1: "Header (e.g., # Verse 1)",
          editorPlaceholderL2: "Subheader (e.g., ## Build)",
          editorPlaceholderL3: "Creates a solid divider line",
          editorPlaceholderL4: "Creates inline chords",
          editorPlaceholderL5: "Creates a safe comment/note",
          toolsHeading: "Music Analysis & Transposition",
          toolsMetricDetected: "Detected Key",
          toolsMetricActive: "Active Key",
          toolsMetricChords: "Chords",
          toolsMetricTranspose: "Transpose",
          toolsKeyOverride: "Key override",
          toolsCapo: "Capo (Plays in)",
          toolsTransposeSemi: "Transpose semitones",
          toolsApplyTranspose: "Apply Transpose",
          toolsReset: "Reset",
          metronomeTitle: "Metronome",
          metronomeStart: "Start",
          metronomeStop: "Stop",
          metronomeTap: "Tap Tempo",
          exportHeading: "Export & Sharing",
          exportOrientation: "Page Orientation",
          exportColumns: "Columns",
          exportTxt: "Export TXT",
          exportPng: "Export PNG",
          exportPdf: "Export PDF",
          exportPrint: "Print Chart",
          exportCopy: "Copy Text",
          exportShare: "Share Link / QR",
          theoryHeading: "Circle of 5th's",
          theoryActiveKeyLabel: "Active Key (Type or Select)",
          theoryRotateLabel: "Auto-Rotate to Key",
          theoryHighlightLabel: "Highlight Key Family",
          theoryHowItWorks: "<strong>How it works:</strong> The Circle organizes keys mathematically. Toggle 'Highlight Key Family' to instantly reveal the 7 diatonic chords (I, ii, iii, IV, V, vi, vii°) that naturally belong in your active song.",
          pianoHeading: "Virtual Piano",
          pianoScrollText: "Scroll horizontally to view more octaves. Touch and hold keys to sustain the note.",
          fretboardHeading: "Fretboard",
          fretboardScrollText: "The leftmost column is the open string (nut). Touch and hold frets to sustain the note.",
          tunerHeading: "Reference Tuner",
          tunerSubtext: "Click to hear reference pitch",
          tunerMicBtnStart: "Start Microphone Tuner",
          tunerMicBtnStop: "Stop Microphone Tuner",
          tunerCents: "cents",
          presentationExit: "Exit",
          presentationScroll: "Auto-Scroll",
          presentationSpeed: "SPD",
          modalCancel: "Cancel",
          modalConfirm: "Done",
          aboutTitle: "About Sonata",
          aboutConfirm: "Close",
          aboutHtml: `<div style="color:var(--text); font-size:0.88rem; line-height:1.6;"><p><strong>Sonata</strong> (/səˈnɑːtə/) comes from Latin <em>sonare</em>, meaning "to sound" or "a piece played."</p><p>Created by <strong>Jethro Frane</strong>, a church musician, Sonata was built to help church musicians and bands collaborate seamlessly and eliminate stage friction.</p><p style="margin-bottom:6px; font-weight:700;">Core Objectives:</p><ul style="padding-left:20px; margin-top:0; color:var(--muted); font-size: 0.85rem;"><li><strong>100% Offline:</strong> Works on stages with zero Wi-Fi or cellular coverage.</li><li><strong>Centralized Hub:</strong> Charts, metronomes, and theory tools in one app.</li><li><strong>Instant Transposition:</strong> Adapt to any vocal range on the fly.</li><li><strong>Number Systems:</strong> Master Nashville Numbers and Roman Numerals effortlessly.</li><li><strong>Zero-Friction Sharing:</strong> Share configurations via QR codes—no accounts.</li><li><strong>Stage Ready:</strong> True-black presentation modes that save battery and reduce glare.</li><li><strong>Robust Exports:</strong> Multi-column PDF and PNG generation.</li><li><strong>Theory Tools:</strong> Interactive Circle of 5ths and Virtual Fretboard.</li><li><strong>Setlists:</strong> Compile songs and share entire sets securely.</li><li><strong>Privacy First:</strong> Your library stays securely local on your device.</li></ul><p style="margin-top:16px; font-style:italic; font-weight:700; text-align:center; color:var(--accent); font-size:0.9rem;">"So whether you eat or drink or whatever you do, do it all for the glory of God." <br>— 1 Corinthians 10:31 (NIV)</p></div>`,
          
          settingsTitle: "Settings",
          settingsConfirm: "Save Settings",
          settingsHeadingAppearance: "Appearance",
          settingsTheme: "Theme",
          settingsThemeLight: "Light",
          settingsThemeDark: "Dark",
          settingsAccentTheme: "Color theme",
          settingsUiFont: "Interface font",
          settingsChartFont: "Song chart font",
          settingsUiFontSize: "Interface text size",
          settingsEditorFontSize: "Editor text size",
          settingsPreviewFontSize: "Preview text size",
          settingsLineSpacing: "Song line spacing",
          settingsHeadingMusic: "Music & Interactivity",
          settingsMetronomeVol: "Metronome Tick Volume",
          settingsUiSounds: "UI Sounds",
          settingsHaptics: "Haptic Feedback",
          settingsOn: "On",
          settingsOff: "Off",
          settingsHeadingBackup: "Data & Backup",
          settingsExportBackup: "Export Backup",
          settingsImportBackup: "Import Backup",
          settingsHeadingSync: "Google Drive Sync",
          settingsRestoreDefaults: "Restore Default Settings",
          settingsRestoreConfirm: "Reset all appearance settings?",
          settingsInstallBtn: "Install App to Device",
          settingsIosInstallTip: "To install on iOS/Mac: Tap Share then 'Add to Home Screen'.",
          accent_blue: "Blue",
          accent_teal: "Teal",
          accent_rose: "Rose",
          accent_amber: "Amber",
          accent_violet: "Violet",
          accent_graphite: "Graphite",
          font_system: "System",
          font_rounded: "Rounded",
          font_serif: "Serif",
          font_mono: "Mono",
          
          switchedTo: "Switched to ",
          themeSaved: "Theme saved",
          themeUpdated: "Theme updated: ",
          languageSaved: "Language saved",
          saved: "Saved",
          songSavedToast: "Song saved to Library",
          undoToast: "Undo",
          redoToast: "Redo",
          savedToLibraryToast: "Saved to Library",
          loadDemoTitle: "Load Demo",
          loadDemoMessage: "Load demo song? This will replace your current song content.",
          loadDemoConfirm: "Load Demo",
          demoLoadedToast: "Demo song loaded",
          sortedToast: "Sorted: ",
          filterToast: "Filter: ",
          newSongReadyToast: "New song ready",
          
          applyTransposeTitle: "Apply Transpose",
          applyTransposeMessage: "Permanently rewrite chords in editor?",
          applyTransposeConfirm: "Apply",
          applyTransposeToast: "Chords transposed permanently",
          applyTransposeToastNoSelect: "No transpose selected",
          
          resetModificationsTitle: "Reset Modifications",
          resetModificationsMessage: "Reset Capo and Transpose?",
          resetModificationsConfirm: "Reset",
          resetModificationsToast: "Reset",
          
          deleteSongTitle: "Delete Song",
          deleteSongMessage: "Delete this song?",
          deleteSongConfirm: "Delete",
          deleteSongToast: "Deleted",
          
          deleteSetlistTitle: "Delete Setlist",
          deleteSetlistMessage: "Delete this setlist?",
          deleteSetlistConfirm: "Delete",
          deleteSetlistToast: "Setlist Deleted"
        },
        fil: {
          brandSubtitle: "Kasangkapan para sa musikero",
          navEditor: "Editor",
          navLibrary: "Aklatan",
          navTools: "Kasangkapan",
          navTheory: "Teorya",
          navPlay: "Tugtugin",
          navMobileEditor: "Editor",
          navMobileLibrary: "Aklatan",
          navMobileTools: "Kasangkapan",
          navMobileTheory: "Teorya",
          navMobilePlay: "Tugtugin",
          helpBtn: "Tulong",
          settingsBtn: "Setting",
          presentBtn: "Ipakita",
          syncBtn: "Drive Sync",
          installBtn: "I-install",
          libraryHeading: "Aklatan ng Kanta",
          manageLibraryBtn: "Pamahalaan",
          newSongButton: "Bagong Kanta",
          songSearchPlaceholder: "Maghanap ng pamagat o liriko...",
          librarySortRecent: "Kamakailan",
          librarySortTitle: "Pamagat",
          librarySortAuthor: "May-akda",
          librarySortArranger: "Tagapag-ayos",
          librarySortKey: "Tono/Key",
          libraryFilterAll: "Lahat",
          libraryFilterFav: "Mga Paborito",
          libraryFilterSet: "Mga Setlist",
          editorSave: "I-save",
          editorUndo: "I-undo",
          editorRedo: "I-redo",
          editorSaveToLibrary: "I-save sa Aklatan",
          editorDetails: "Detalye",
          editorDemo: "Demo",
          editorClosePreview: "Isara ang Preview",
          editorTabSong: "Kanta",
          editorTabTransposed: "Nalipat",
          editorTabRoman: "Romano",
          editorTabNashville: "Nashville",
          editorTabLyrics: "Liriko Lamang",
          editorPaneEditor: "EDITOR NG CHORD at LIRIKO",
          editorPanePreview: "PREVIEW NG KANTA",
          editorPlaceholderTitle: "Maligayang pagdating sa Sonata!",
          editorPlaceholderP1: "I-type ang iyong mga chords at liriko sa ibaba, o i-click ang <strong>Demo</strong> sa itaas para mag-load ng halimbawa.",
          editorPlaceholderL1: "Header (hal., # Berso 1)",
          editorPlaceholderL2: "Subheader (hal., ## Koro)",
          editorPlaceholderL3: "Gumagawa ng linya ng paghahati",
          editorPlaceholderL4: "Gumagawa ng chord sa loob ng linya",
          editorPlaceholderL5: "Gumagawa ng tala o komento",
          toolsHeading: "Pagsusuri at Paglilipat ng Tono (Transpose)",
          toolsMetricDetected: "Nakita na Tono",
          toolsMetricActive: "Aktibong Tono",
          toolsMetricChords: "Mga Chord",
          toolsMetricTranspose: "Lipat-Tono",
          toolsKeyOverride: "I-override ang Key",
          toolsCapo: "Capo (Posisyon sa Fret)",
          toolsTransposeSemi: "Semitone ng Transpose",
          toolsApplyTranspose: "Ilapat ang Transpose",
          toolsReset: "I-reset",
          metronomeTitle: "Metronomo",
          metronomeStart: "Simulan",
          metronomeStop: "Ihinto",
          metronomeTap: "Tap Tempo",
          exportHeading: "Pag-export at Pagbahagi",
          exportOrientation: "Oryentasyon ng Pahina",
          exportColumns: "Mga Hanay (Columns)",
          exportTxt: "I-export sa TXT",
          exportPng: "I-export sa PNG",
          exportPdf: "I-export sa PDF",
          exportPrint: "I-print ang Kanta",
          exportCopy: "Kopyahin ang Teksto",
          exportShare: "Ibahagi ang Link / QR",
          theoryHeading: "Circle ng 5th's",
          theoryActiveKeyLabel: "Aktibong Tono (I-type o Piliin)",
          theoryRotateLabel: "Awtomatikong Paikutin",
          theoryHighlightLabel: "I-highlight ang Key Family",
          theoryHowItWorks: "<strong>Paano ito gumagana:</strong> Inoorganisa ng Circle ang mga key sa matematikal na paraan. I-toggle ang 'I-highlight ang Key Family' upang makita ang 7 diatonic chords (I, ii, iii, IV, V, vi, vii°) na kabilang sa iyong aktibong kanta.",
          pianoHeading: "Virtual Piano",
          pianoScrollText: "Mag-scroll nang pahalang upang makita ang iba pang mga octave. Pindutin nang matagal ang mga key upang mapanatili ang tunog.",
          fretboardHeading: "Fretboard",
          fretboardScrollText: "Ang pinakakaliwang hanay ay ang bukas na string (nut). Pindutin nang matagal ang mga fret upang mapanatili ang tunog.",
          tunerHeading: "Reference Tuner",
          tunerSubtext: "I-click upang marinig ang tono",
          tunerMicBtnStart: "Simulan ang Microphone Tuner",
          tunerMicBtnStop: "Ihinto ang Microphone Tuner",
          tunerCents: "cents",
          presentationExit: "Lumabas",
          presentationScroll: "Awtomatikong Scroll",
          presentationSpeed: "SPD",
          modalCancel: "Kanselahin",
          modalConfirm: "Tapos na",
          aboutTitle: "Tungkol sa Sonata",
          aboutConfirm: "Isara",
          aboutHtml: `<div style="color:var(--text); font-size:0.88rem; line-height:1.6;"><p>Ang <strong>Sonata</strong> (/səˈnɑːtə/) ay nagmula sa salitang Latin na <em>sonare</em>, na ang ibig sabihin ay "tumunog" o "isang tinutugtog."</p><p>Nilikha ni <strong>Jethro Frane</strong>, isang musikero sa simbahan, ang Sonata ay binuo upang tulungan ang mga musikero at banda na magtulungan nang walang aberya at maiwasan ang kalituhan sa entablado.</p><p style="margin-bottom:6px; font-weight:700;">Pangunahing Layunin:</p><ul style="padding-left:20px; margin-top:0; color:var(--muted); font-size: 0.85rem;"><li><strong>100% Offline:</strong> Gumagana sa entablado kahit walang Wi-Fi o signal.</li><li><strong>Sentralisadong Hub:</strong> Mga chart, metronomo, at teorya sa isang app.</li><li><strong>Mabilisang Transposition:</strong> Madaling baguhin ang tono para sa sinumang mang-aawit.</li><li><strong>Number Systems:</strong> Madaling matutunan ang Nashville Numbers at Roman Numerals.</li><li><strong>Mabilisang Pagbabahagi:</strong> Ibahagi ang mga kanta gamit ang QR code—walang account na kailangan.</li><li><strong>Handa sa Entablado:</strong> May presentation mode na madilim para makatipid sa baterya at hindi nakakasilaw.</li><li><strong>Maasahang Export:</strong> Gumawa ng PDF at PNG na may maraming column.</li><li><strong>Mga Teorya ng Musika:</strong> Interactive na Circle of 5ths at Virtual Fretboard.</li><li><strong>Mga Setlist:</strong> Pagsamahin ang mga kanta at ibahagi ang buong set nang ligtas.</li><li><strong>Protektadong Data:</strong> Ang iyong aklatan ay ligtas na nakaimbak lamang sa iyong device.</li></ul><p style="margin-top:16px; font-style:italic; font-weight:700; text-align:center; color:var(--accent); font-size:0.9rem;">"Kaya nga, kung kayo'y kumakain, o umiinom, o anuman ang inyong ginagawa, gawin ninyo ang lahat sa ikaluluwalhati ng Diyos." <br>— 1 Corinto 10:31 (MBBTAG)</p></div>`,
          
          settingsTitle: "Setting",
          settingsConfirm: "I-save ang mga Setting",
          settingsHeadingAppearance: "Anyo",
          settingsTheme: "Tema",
          settingsThemeLight: "Maliwanag",
          settingsThemeDark: "Madilim",
          settingsAccentTheme: "Tema ng Kulay",
          settingsUiFont: "Font ng Interface",
          settingsChartFont: "Font ng Kanta",
          settingsUiFontSize: "Laki ng Teksto ng Interface",
          settingsEditorFontSize: "Laki ng Teksto sa Editor",
          settingsPreviewFontSize: "Laki ng Teksto sa Preview",
          settingsLineSpacing: "Espasyo sa pagitan ng Linya",
          settingsHeadingMusic: "Musika at Interaktibidad",
          settingsMetronomeVol: "Lakas ng Tunog ng Metronomo",
          settingsUiSounds: "Mga Tunog ng UI",
          settingsHaptics: "Vibration Feedback",
          settingsOn: "Bukas",
          settingsOff: "Patay",
          settingsHeadingBackup: "Data at Backup",
          settingsExportBackup: "I-export ang Backup",
          settingsImportBackup: "I-import ang Backup",
          settingsHeadingSync: "Google Drive Sync",
          settingsRestoreDefaults: "I-restore ang Default na Setting",
          settingsRestoreConfirm: "I-reset ang lahat ng setting ng anyo?",
          settingsInstallBtn: "I-install ang App sa Device",
          settingsIosInstallTip: "Upang i-install sa iOS/Mac: I-tap ang Share pagkatapos ay 'Idagdag sa Home Screen'.",
          accent_blue: "Asul",
          accent_teal: "Teal",
          accent_rose: "Rosas",
          accent_amber: "Amber",
          accent_violet: "Lila",
          accent_graphite: "Graphite",
          font_system: "System",
          font_rounded: "Mabilog",
          font_serif: "Serif",
          font_mono: "Mono",
          
          switchedTo: "Pumunta sa ",
          themeSaved: "Nai-save ang Tema",
          themeUpdated: "Na-update ang Tema: ",
          languageSaved: "Nai-save ang Wika",
          saved: "Nai-save",
          songSavedToast: "Nai-save ang kanta sa Aklatan",
          undoToast: "I-undo",
          redoToast: "I-redo",
          savedToLibraryToast: "Nai-save sa Aklatan",
          loadDemoTitle: "Mag-load ng Demo",
          loadDemoMessage: "Mag-load ng demo na kanta? Mapapalitan nito ang kasalukuyang nilalaman.",
          loadDemoConfirm: "I-load ang Demo",
          demoLoadedToast: "Nailagay na ang demo na kanta",
          sortedToast: "Nakaayos ayon sa: ",
          filterToast: "Filter: ",
          newSongReadyToast: "Handa na ang bagong kanta",
          
          applyTransposeTitle: "Ilapat ang Transpose",
          applyTransposeMessage: "Permanenteng i-transposed ang chords sa editor?",
          applyTransposeConfirm: "Ilapat",
          applyTransposeToast: "Permanenteng nabago ang chords",
          applyTransposeToastNoSelect: "Walang napiling transpose",
          
          resetModificationsTitle: "I-reset ang mga Pagbabago",
          resetModificationsMessage: "I-reset ang Capo at Transpose?",
          resetModificationsConfirm: "I-reset",
          resetModificationsToast: "Na-reset na",
          
          deleteSongTitle: "Burahin ang Kanta",
          deleteSongMessage: "Burahin ang kantang ito?",
          deleteSongConfirm: "Burahin",
          deleteSongToast: "Nabura na",
          
          deleteSetlistTitle: "Burahin ang Setlist",
          deleteSetlistMessage: "Burahin ang setlist na ito?",
          deleteSetlistConfirm: "Burahin",
          deleteSetlistToast: "Nabura na ang Setlist",
          
          help_library: "Ang iyong library ng kanta ay ligtas na nakaimbak sa browser na ito offline. Gumawa ng Setlists upang pagsama-samahin ang mga kanta para sa worship.",
          help_keyOverride: "Pinipilit ang Roman Numeral at Nashville Number na kalkulahin base sa partikular na tono na ito.",
          help_capo: "Piliin ang fret kung saan mo ilalagay ang capo. Ang preview at export ay magpapakita ng aktwal na posisyon ng chords na kailangan mong tugtugin.",
          help_transpose: "Inililipat ang bawat chord ng kanta pataas o pababa. Awtomatikong mag-a-update ang iyong aktibong tono.",
          help_formats: "Baguhin kung paano ipinapakita ang iyong chart. Ang 'Liriko Lamang' ay agad na nag-aalis ng lahat ng chords para sa malinis na kopya ng boses.",
          help_export: "Gumagawa ng malinaw na offline na PDF o Larawan. Ang 'Columns' ay awtomatikong mag-aayos ng teksto para magkasya ang kanta sa pahina.",
          help_circle: "Ang Circle ng 5ths ay nag-oorganisa ng mga tono sa matematikal na paraan. I-toggle ang 'I-highlight ang Key Family' upang makita ang 7 chords na kabilang sa tono.",
          help_piano: "Mag-scroll nang pahalang upang makita ang iba pang mga octave. Pindutin nang matagal ang mga key upang mapanatili ang tunog.",
          help_fretboard: "Tingnan ang mga nota sa guitar, bass, o ukulele. Pindutin nang matagal ang fret upang mapanatili ang tunog.",
          help_tuner: "I-click ang mga reference button upang marinig ang tamang pitch, o i-click ang Simulan upang gamitin ang microphone para sa live tuning.",
          help_present: "Presentation mode na handa sa entablado. Gamitin ang 'Sun/Moon' icon upang pumili ng Light, Dark, o True Black na tema.",
          help_theoryKey: "I-type ang tono tulad ng 'G' o 'C#m' para i-lock ang theoretical view sa tono na iyon. Iwanang blangko para sa awtomatikong pag-detect mula sa editor.",
          help_setlist: "Gumawa ng setlist upang madaling maibahagi ang maraming kanta nang sabay-sabay at madaling mag-navigate sa pagitan ng mga ito sa entablado."
        }
      };

      const t = (key, fallback) => {
        const lang = StateManager.state?.settings?.language || "en";
        return I18N_DICTS[lang]?.[key] || fallback || key;
      };
      window.t = t;

      const Util = {
        uid() { return "song-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); },
        now() { return new Date().toISOString(); },
        clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); },
        mod(value, size) { return ((value % size) + size) % size; },
        debounce(fn, delay) { let timer = 0; return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), delay); }; },
        formatDate(iso) {
          if (!iso) return "";
          const d = new Date(iso);
          if (isNaN(d)) return "";
          return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + " • " + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        },
        titleOf(song) { return (song && song.title && song.title.trim()) || "Untitled Song"; },
        slug(text) { return (text || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "song"; },
        escapeHtml(text) { return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
        download(name, type, content) {
          const blob = content instanceof Blob ? content : new Blob([content], { type });
          const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name;
          document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 800);
        },
        drawSimpleQrPattern(ctx, x, y, size) {
          const cells = 21;
          const cellSize = size / cells;
          ctx.fillStyle = "#111111";
          const drawFinder = (r0, c0) => {
            for (let r = 0; r < 7; r++) {
              for (let c = 0; c < 7; c++) {
                if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                  ctx.fillRect(x + (c0 + c) * cellSize, y + (r0 + r) * cellSize, cellSize + 0.3, cellSize + 0.3);
                }
              }
            }
          };
          drawFinder(0, 0);
          drawFinder(0, 14);
          drawFinder(14, 0);
          for (let i = 8; i <= 12; i += 2) {
            ctx.fillRect(x + i * cellSize, y + 6 * cellSize, cellSize, cellSize);
            ctx.fillRect(x + 6 * cellSize, y + i * cellSize, cellSize, cellSize);
          }
          const pattern = [
            [0,8],[2,8],[3,8],[5,8],[7,8],[8,0],[8,2],[8,4],[8,7],[8,8],
            [9,9],[9,11],[9,13],[10,8],[10,10],[10,12],[10,14],[11,9],[11,11],[11,13],
            [12,8],[12,10],[12,12],[12,14],[13,9],[13,11],[13,13],[14,8],[14,10],[14,12],
            [15,9],[15,11],[15,13],[15,15],[16,8],[16,10],[16,12],[16,14],[17,9],[17,11],
            [18,8],[18,10],[18,12],[18,14],[18,16],[19,9],[19,11],[19,13],[19,15],[20,8],
            [8,15],[8,17],[8,19],[8,20],[9,16],[9,18],[9,20],[10,17],[10,19],[11,16],[11,18],
            [12,17],[12,19],[13,16],[13,18],[13,20],[14,17],[14,19],[15,16],[15,18],[16,17]
          ];
          pattern.forEach(([r, c]) => {
            ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize + 0.3, cellSize + 0.3);
          });
        }
      };

      const QRCode = (() => {
        const MODE_8BIT_BYTE = 1 << 2;
        const ECL = { L: 1, M: 0, Q: 3, H: 2 };
        const EXP_TABLE = new Array(256);
        const LOG_TABLE = new Array(256);
        for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
        for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

        function glog(n) { if (n < 1) throw new Error("glog(" + n + ")"); return LOG_TABLE[n]; }
        function gexp(n) { while (n < 0) n += 255; while (n >= 255) n -= 255; return EXP_TABLE[n]; }

        class Polynomial {
          constructor(num, shift) {
            let offset = 0;
            while (offset < num.length && num[offset] === 0) offset++;
            this.num = new Array(num.length - offset + shift);
            for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
          }
          get(index) { return this.num[index]; }
          getLength() { return this.num.length; }
          multiply(e) {
            const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
            for (let i = 0; i < this.getLength(); i++) {
              for (let j = 0; j < e.getLength(); j++) {
                num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
              }
            }
            return new Polynomial(num, 0);
          }
          mod(e) {
            if (this.getLength() - e.getLength() < 0) return this;
            const ratio = glog(this.get(0)) - glog(e.get(0));
            const num = new Array(this.getLength());
            for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
            for (let i = 0; i < e.getLength(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
            return new Polynomial(num, 0).mod(e);
          }
        }

        const RS_BLOCK_TABLE = [
          [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
          [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
          [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
          [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
          [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
          [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
          [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
          [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
          [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
          [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
          [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
          [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
          [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
          [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
          [5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13],
          [5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
          [1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
          [5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
          [3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
          [3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
          [4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
          [2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
          [4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
          [6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
          [8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
          [10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
          [8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
          [3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
          [7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
          [5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
          [13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
          [17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
          [17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
          [13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
          [12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
          [6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
          [17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
          [4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
          [20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
          [19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
        ];

        function getRSBlocks(typeNumber, errorCorrectLevel) {
          const rsBlock = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + errorCorrectLevel];
          if (!rsBlock) throw new Error("bad rs block: " + typeNumber + "/" + errorCorrectLevel);
          const length = rsBlock.length / 3;
          const list = [];
          for (let i = 0; i < length; i++) {
            const count = rsBlock[i * 3 + 0];
            const totalCount = rsBlock[i * 3 + 1];
            const dataCount = rsBlock[i * 3 + 2];
            for (let j = 0; j < count; j++) list.push({ totalCount, dataCount });
          }
          return list;
        }

        function getErrorCorrectPolynomial(errorCorrectLength) {
          let a = new Polynomial([1], 0);
          for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
          return a;
        }

        function getLengthInBits(mode, type) {
          if (1 <= type && type < 10) return 8;
          return 16;
        }

        const PATTERN_POSITION_TABLE = [
          [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
          [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
          [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
          [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94],
          [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
          [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
          [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
          [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
        ];

        class BitBuffer {
          constructor() { this.buffer = []; this.length = 0; }
          get(index) { const bufIndex = Math.floor(index / 8); return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1; }
          put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); }
          getLengthInBits() { return this.length; }
          putBit(bit) {
            const bufIndex = Math.floor(this.length / 8);
            if (this.buffer.length <= bufIndex) this.buffer.push(0);
            if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
            this.length++;
          }
        }

        function utf8Encode(str) {
          const bytes = [];
          for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
              const next = str.charCodeAt(i + 1);
              if (next >= 0xDC00 && next <= 0xDFFF) {
                code = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000;
                i++;
              }
            }
            if (code < 128) bytes.push(code);
            else if (code < 2048) {
              bytes.push((code >> 6) | 192);
              bytes.push((code & 63) | 128);
            } else if (code < 65536) {
              bytes.push((code >> 12) | 224);
              bytes.push(((code >> 6) & 63) | 128);
              bytes.push((code & 63) | 128);
            } else {
              bytes.push((code >> 18) | 240);
              bytes.push(((code >> 12) & 63) | 128);
              bytes.push(((code >> 6) & 63) | 128);
              bytes.push((code & 63) | 128);
            }
          }
          return bytes;
        }

        class QR8bitByte {
          constructor(data) { this.mode = MODE_8BIT_BYTE; this.data = data; this.bytes = utf8Encode(data); }
          getLength() { return this.bytes.length; }
          write(buffer) { for (let i = 0; i < this.bytes.length; i++) buffer.put(this.bytes[i], 8); }
        }

        class QRCodeModel {
          constructor(typeNumber, errorCorrectLevel) {
            this.typeNumber = typeNumber;
            this.errorCorrectLevel = errorCorrectLevel;
            this.modules = null;
            this.moduleCount = 0;
            this.dataCache = null;
            this.dataList = [];
          }
          addData(data) { this.dataList.push(new QR8bitByte(data)); this.dataCache = null; }
          isDark(row, col) {
            if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + "," + col);
            return this.modules[row][col];
          }
          getModuleCount() { return this.moduleCount; }
          make() {
            if (this.typeNumber < 1) {
              let typeNumber = 1;
              for (typeNumber = 1; typeNumber < 40; typeNumber++) {
                const rsBlocks = getRSBlocks(typeNumber, this.errorCorrectLevel);
                const buffer = new BitBuffer();
                let totalDataCount = 0;
                for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
                for (let i = 0; i < this.dataList.length; i++) {
                  const data = this.dataList[i];
                  buffer.put(data.mode, 4);
                  buffer.put(data.getLength(), getLengthInBits(data.mode, typeNumber));
                  data.write(buffer);
                }
                if (buffer.getLengthInBits() <= totalDataCount * 8) break;
              }
              this.typeNumber = typeNumber;
            }
            this.makeImpl(false, this.getBestMaskPattern());
          }
          makeImpl(test, maskPattern) {
            this.moduleCount = this.typeNumber * 4 + 17;
            this.modules = new Array(this.moduleCount);
            for (let row = 0; row < this.moduleCount; row++) {
              this.modules[row] = new Array(this.moduleCount).fill(null);
            }
            this.setupPositionProbePattern(0, 0);
            this.setupPositionProbePattern(this.moduleCount - 7, 0);
            this.setupPositionProbePattern(0, this.moduleCount - 7);
            this.setupPositionAdjustPattern();
            this.setupTimingPattern();
            this.setupTypeInfo(test, maskPattern);
            if (this.typeNumber >= 7) this.setupTypeNumber(test);
            if (this.dataCache === null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
            this.mapData(this.dataCache, maskPattern);
          }
          setupPositionProbePattern(row, col) {
            for (let r = -1; r <= 7; r++) {
              if (row + r <= -1 || this.moduleCount <= row + r) continue;
              for (let c = -1; c <= 7; c++) {
                if (col + c <= -1 || this.moduleCount <= col + c) continue;
                if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                    (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                    (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
          getBestMaskPattern() {
            let minLostPoint = 0;
            let pattern = 0;
            for (let i = 0; i < 8; i++) {
              this.makeImpl(true, i);
              const lostPoint = this.getLostPoint();
              if (i === 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
              }
            }
            return pattern;
          }
          setupTimingPattern() {
            for (let r = 8; r < this.moduleCount - 8; r++) {
              if (this.modules[r][6] !== null) continue;
              this.modules[r][6] = (r % 2 === 0);
            }
            for (let c = 8; c < this.moduleCount - 8; c++) {
              if (this.modules[6][c] !== null) continue;
              this.modules[6][c] = (c % 2 === 0);
            }
          }
          setupPositionAdjustPattern() {
            const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1];
            if (!pos) return;
            for (let i = 0; i < pos.length; i++) {
              for (let j = 0; j < pos.length; j++) {
                const row = pos[i];
                const col = pos[j];
                if (this.modules[row][col] !== null) continue;
                for (let r = -2; r <= 2; r++) {
                  for (let c = -2; c <= 2; c++) {
                    if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
                      this.modules[row + r][col + c] = true;
                    } else {
                      this.modules[row + r][col + c] = false;
                    }
                  }
                }
              }
            }
          }
          setupTypeNumber(test) {
            const bits = QRCodeModel.getBCHTypeNumber(this.typeNumber);
            for (let i = 0; i < 18; i++) {
              const mod = (!test && ((bits >> i) & 1) === 1);
              this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
              this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
            }
          }
          setupTypeInfo(test, maskPattern) {
            const data = (this.errorCorrectLevel << 3) | maskPattern;
            const bits = QRCodeModel.getBCHTypeInfo(data);
            for (let i = 0; i < 15; i++) {
              const mod = (!test && ((bits >> i) & 1) === 1);
              if (i < 6) this.modules[i][8] = mod;
              else if (i < 8) this.modules[i + 1][8] = mod;
              else this.modules[this.moduleCount - 15 + i][8] = mod;

              if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
              else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
              else this.modules[8][15 - i - 1] = mod;
            }
            this.modules[this.moduleCount - 8][8] = (!test);
          }
          mapData(data, maskPattern) {
            let inc = -1;
            let row = this.moduleCount - 1;
            let bitIndex = 7;
            let byteIndex = 0;
            const mask = QRCodeModel.getMask(maskPattern);
            for (let col = this.moduleCount - 1; col > 0; col -= 2) {
              if (col === 6) col--;
              while (true) {
                for (let c = 0; c < 2; c++) {
                  if (this.modules[row][col - c] === null) {
                    let dark = false;
                    if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
                    const maskBit = mask(row, col - c);
                    if (maskBit) dark = !dark;
                    this.modules[row][col - c] = dark;
                    bitIndex--;
                    if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
                  }
                }
                row += inc;
                if (row < 0 || this.moduleCount <= row) {
                  row -= inc;
                  inc = -inc;
                  break;
                }
              }
            }
          }
          getLostPoint() {
            const moduleCount = this.moduleCount;
            let lostPoint = 0;
            for (let row = 0; row < moduleCount; row++) {
              for (let col = 0; col < moduleCount; col++) {
                let sameCount = 0;
                const dark = this.modules[row][col];
                for (let r = -1; r <= 1; r++) {
                  if (row + r < 0 || moduleCount <= row + r) continue;
                  for (let c = -1; c <= 1; c++) {
                    if (col + c < 0 || moduleCount <= col + c) continue;
                    if (r === 0 && c === 0) continue;
                    if (dark === this.modules[row + r][col + c]) sameCount++;
                  }
                }
                if (sameCount > 5) lostPoint += (3 + sameCount - 5);
              }
            }
            for (let row = 0; row < moduleCount - 1; row++) {
              for (let col = 0; col < moduleCount - 1; col++) {
                let count = 0;
                if (this.modules[row][col]) count++;
                if (this.modules[row + 1][col]) count++;
                if (this.modules[row][col + 1]) count++;
                if (this.modules[row + 1][col + 1]) count++;
                if (count === 0 || count === 4) lostPoint += 3;
              }
            }
            for (let row = 0; row < moduleCount; row++) {
              for (let col = 0; col < moduleCount - 6; col++) {
                if (this.modules[row][col] && !this.modules[row][col + 1] && this.modules[row][col + 2] && this.modules[row][col + 3] && this.modules[row][col + 4] && !this.modules[row][col + 5] && this.modules[row][col + 6]) {
                  lostPoint += 40;
                }
              }
            }
            for (let col = 0; col < moduleCount; col++) {
              for (let row = 0; row < moduleCount - 6; row++) {
                if (this.modules[row][col] && !this.modules[row + 1][col] && this.modules[row + 2][col] && this.modules[row + 3][col] && this.modules[row + 4][col] && !this.modules[row + 5][col] && this.modules[row + 6][col]) {
                  lostPoint += 40;
                }
              }
            }
            let darkCount = 0;
            for (let col = 0; col < moduleCount; col++) {
              for (let row = 0; row < moduleCount; row++) {
                if (this.modules[row][col]) darkCount++;
              }
            }
            const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
            lostPoint += ratio * 10;
            return lostPoint;
          }
        }

        QRCodeModel.createData = function(typeNumber, errorCorrectLevel, dataList) {
          const rsBlocks = getRSBlocks(typeNumber, errorCorrectLevel);
          const buffer = new BitBuffer();
          for (let i = 0; i < dataList.length; i++) {
            const data = dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), getLengthInBits(data.mode, typeNumber));
            data.write(buffer);
          }
          let totalDataCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
          if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("code length overflow: " + buffer.getLengthInBits() + " > " + (totalDataCount * 8));
          if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
          while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
          while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(0xEC, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(0x11, 8);
          }
          return QRCodeModel.createBytes(buffer, rsBlocks);
        };

        QRCodeModel.createBytes = function(buffer, rsBlocks) {
          let offset = 0;
          let maxDcCount = 0;
          let maxEcCount = 0;
          const dcdata = new Array(rsBlocks.length);
          const ecdata = new Array(rsBlocks.length);
          for (let r = 0; r < rsBlocks.length; r++) {
            const dcCount = rsBlocks[r].dataCount;
            const ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xFF & buffer.buffer[i + offset];
            offset += dcCount;
            const rsPoly = getErrorCorrectPolynomial(ecCount);
            const rawPoly = new Polynomial(dcdata[r], rsPoly.getLength() - 1);
            const modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (let i = 0; i < ecdata[r].length; i++) {
              const modIndex = i + modPoly.getLength() - ecdata[r].length;
              ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
            }
          }
          let totalCodeCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
          const data = new Array(totalCodeCount);
          let index = 0;
          for (let i = 0; i < maxDcCount; i++) {
            for (let r = 0; r < rsBlocks.length; r++) {
              if (i < dcdata[r].length) data[index++] = dcdata[r][i];
            }
          }
          for (let i = 0; i < maxEcCount; i++) {
            for (let r = 0; r < rsBlocks.length; r++) {
              if (i < ecdata[r].length) data[index++] = ecdata[r][i];
            }
          }
          return data;
        };

        QRCodeModel.getBCHTypeInfo = function(data) {
          let d = data << 10;
          while (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(1335) >= 0) {
            d ^= (1335 << (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(1335)));
          }
          return ((data << 10) | d) ^ 21522;
        };

        QRCodeModel.getBCHTypeNumber = function(data) {
          let d = data << 12;
          while (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(7973) >= 0) {
            d ^= (7973 << (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(7973)));
          }
          return (data << 12) | d;
        };

        QRCodeModel.getBCHDigit = function(data) {
          let digit = 0;
          while (data !== 0) { digit++; data >>>= 1; }
          return digit;
        };

        QRCodeModel.getMask = function(maskPattern) {
          switch (maskPattern) {
            case 0: return (i, j) => (i + j) % 2 === 0;
            case 1: return (i, j) => i % 2 === 0;
            case 2: return (i, j) => j % 3 === 0;
            case 3: return (i, j) => (i + j) % 3 === 0;
            case 4: return (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
            case 5: return (i, j) => (i * j) % 2 + (i * j) % 3 === 0;
            case 6: return (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0;
            case 7: return (i, j) => ((i * j) % 3 + (i + j) % 2) % 2 === 0;
            default: throw new Error("bad mask: " + maskPattern);
          }
        };

        return {
          generate(text, errorCorrectionLevel = 'L') {
            const ecl = ECL[errorCorrectionLevel] !== undefined ? ECL[errorCorrectionLevel] : ECL.L;
            const qr = new QRCodeModel(0, ecl);
            qr.addData(text);
            qr.make();
            return qr;
          },
          draw(ctx, text, x, y, width, height, options = {}) {
            try {
              const qr = this.generate(text, options.ecc || 'L');
              const count = qr.getModuleCount();
              const margin = options.margin !== undefined ? options.margin : 2;
              const totalModules = count + margin * 2;
              const cellSize = Math.min(width, height) / totalModules;
              const startX = x + (width - totalModules * cellSize) / 2 + margin * cellSize;
              const startY = y + (height - totalModules * cellSize) / 2 + margin * cellSize;

              if (options.background !== 'transparent') {
                ctx.fillStyle = options.background || '#ffffff';
                ctx.fillRect(x, y, width, height);
              }

              ctx.fillStyle = options.foreground || '#000000';
              for (let r = 0; r < count; r++) {
                for (let c = 0; c < count; c++) {
                  if (qr.isDark(r, c)) {
                    ctx.fillRect(
                      Math.round(startX + c * cellSize),
                      Math.round(startY + r * cellSize),
                      Math.ceil(cellSize),
                      Math.ceil(cellSize)
                    );
                  }
                }
              }
              return true;
            } catch (e) {
              console.error("QR Code Generation Error:", e);
              return false;
            }
          }
        };
      })();

      const PopoverManager = {
        popover: null,
        show(target, text) {
          if (this.popover) this.popover.remove();
          this.popover = document.createElement('div'); this.popover.className = 'help-popover'; this.popover.textContent = text;
          const host = document.fullscreenElement || document.body; host.appendChild(this.popover);
          const rect = target.getBoundingClientRect(); this.popover.style.top = (rect.bottom + 8) + 'px';
          let left = rect.left + (rect.width / 2) - 140; if (left < 10) left = 10; if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
          this.popover.style.left = left + 'px';
          setTimeout(() => { const rem = (e) => { if (this.popover && !this.popover.contains(e.target)) { this.popover.remove(); document.removeEventListener('click', rem); document.removeEventListener('touchstart', rem); } }; document.addEventListener('click', rem); document.addEventListener('touchstart', rem, { passive: true }); }, 50);
        }
      };

      const Icon = {
        paths: {
          "cloud": '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>',
          "arrow-up": '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
          "arrow-left": '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
          "arrow-right": '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
          aperture: '<circle cx="12" cy="12" r="10"></circle><path d="m14.31 8 5.74 9.94"></path><path d="M9.69 8h11.48"></path><path d="m7.38 12 5.74-9.94"></path><path d="M9.69 16 3.95 6.06"></path><path d="M14.31 16H2.83"></path><path d="m16.62 12-5.74 9.94"></path>',
          clipboard: '<rect x="8" y="4" width="8" height="4" rx="1"></rect><path d="M16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"></path>',
          copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect>',
          download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
          edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
          file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path>',
          "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
          pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M9 18v-6h2a2 2 0 0 1 0 4H9"></path><path d="M14 18v-6h3"></path><path d="M14 15h2"></path>',
          facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>',
          instagram: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>',
          tiktok: '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5v3a3 3 0 0 1-3-3v11a7 7 0 1 1-7-7v3a4 4 0 0 0 0 8 4 4 0 0 0 4-4"></path>',
          "share-native": '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
          help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>',
          image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8" cy="10" r="2"></circle><path d="m21 16-5-5L5 19"></path>',
          info: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
          library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>',
          list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
          metronome: '<path d="M5 20h14"></path><path d="M7 20 11 4h2l4 16"></path><path d="m14 9-4 4"></path><path d="M12 4v4"></path>',
          minus: '<path d="M5 12h14"></path>',
          moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path>',
          sun: '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
          music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
          play: '<path d="m8 5 11 7-11 7Z"></path>', pause: '<path d="M8 5v14"></path><path d="M16 5v14"></path>',
          plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
          presentation: '<path d="M3 4h18v12H3z"></path><path d="M12 16v4"></path><path d="m8 20 4-4 4 4"></path>',
          print: '<path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 14h12v8H6z"></path>',
          rotate: '<path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path>',
          "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>',
          save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
          settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8-2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path>',
          share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4"></path><path d="m15.4 6.5-6.8 4"></path>',
          sliders: '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
          sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path><path d="M19 8h2"></path><path d="M20 7v2"></path><path d="M19 16h2"></path><path d="M20 15v2"></path>',
          star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5-4.7-4.6 6.5-.9Z"></path>',
          "star-filled": '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5-4.7-4.6 6.5-.9Z" fill="currentColor"></path>',
          tap: '<path d="M9 11V6a2 2 0 1 1 4 0v5"></path><path d="M13 10V8a2 2 0 1 1 4 0v6"></path><path d="M17 12a2 2 0 1 1 4 0v2a8 8 0 0 1-16 0v-1"></path>',
          trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
          "type-minus": '<path d="M4 7V4h12v3"></path><path d="M10 20V4"></path><path d="M7 20h6"></path><path d="M16 14h6"></path>',
          "type-plus": '<path d="M4 7V4h12v3"></path><path d="M10 20V4"></path><path d="M7 20h6"></path><path d="M19 11v6"></path><path d="M16 14h6"></path>',
          scroll: '<path d="M8 21h8"></path><path d="M12 17V3"></path><path d="m7 8 5-5 5 5"></path><path d="m7 12 5 5 5-5"></path>',
          menu: '<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>',
          camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
          qr: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
          wand: '<path d="m15 4 5 5"></path><path d="M14 5 3 16l5 5L19 10Z"></path><path d="M9 6 8 3"></path><path d="M18 14l3 1"></path>',
          x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
        },
        svg(name) { return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (this.paths[name] || this.paths.file) + '</svg>'; },
        apply(button, name, label, iconOnly) { if (!button) return; const text = label || button.textContent.trim() || button.getAttribute("aria-label") || "Action"; button.innerHTML = this.svg(name) + '<span class="' + (iconOnly ? "visually-hidden " : "") + 'button-label">' + text + '</span>'; button.dataset.icon = name; button.setAttribute("aria-label", text); button.title = button.title || text; },
        set(button, name, label, iconOnly) { this.apply(button, name, label, iconOnly); },
        decorateAll(root) { (root || document).querySelectorAll("[data-icon]").forEach(b => this.apply(b, b.dataset.icon, b.textContent.trim() || b.getAttribute("aria-label"), b.classList.contains("icon-button"))); (root || document).querySelectorAll("[data-inline-icon]").forEach(n => { n.innerHTML = this.svg(n.dataset.inlineIcon); }); }
      };

      const GoogleDriveSync = {
        CLIENT_ID: "158653989463-6dicjrekd70pp2mh39scp05skr6ilcl6.apps.googleusercontent.com",
        SCOPES: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",

        FILENAME: "sonata_library.json",
        tokenClient: null, accessToken: null, fileId: null, isSyncing: false, uploadTimer: null,
        userEmail: null, userName: null, resolveSignIn: null,

        init() {
          try {
            const cachedProfile = JSON.parse(localStorage.getItem('sonata_user_profile') || 'null');
            if (cachedProfile) {
              this.userName = cachedProfile.userName || null;
              this.userGivenName = cachedProfile.userGivenName || null;
              this.userEmail = cachedProfile.userEmail || null;
              this.userPicture = cachedProfile.userPicture || null;
            }
          } catch(e) {}
          this.updateProfileUI();
          this.loadCachedToken();
          setTimeout(() => {
            if (window.google?.accounts?.oauth2) {
              try {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                  client_id: this.CLIENT_ID,
                  scope: this.SCOPES,
                  callback: (tokenResponse) => {
                    if (tokenResponse.error !== undefined) {
                      console.error("OAuth Error:", tokenResponse);
                      this.updateUI("Auth Failed", "danger");
                      if (this.resolveSignIn) this.resolveSignIn(false);
                      return;
                    }
                    this.accessToken = tokenResponse.access_token;
                    const expiresInMs = (Number(tokenResponse.expires_in) || 3599) * 1000;
                    sessionStorage.setItem('sonata_google_token', this.accessToken);
                    sessionStorage.setItem('sonata_google_token_expiry', String(Date.now() + expiresInMs));
                    this.fetchUserInfo().then(() => {
                      this.performSync().then(() => {
                        if (this.resolveSignIn) this.resolveSignIn(true);
                      });
                    });
                  },
                });
              } catch (err) {
                console.error("GIS TokenClient Init Error:", err);
              }
            }
          }, 200);

          const btn = document.getElementById('googleSyncButton');
          btn?.addEventListener('click', () => {
            AudioEngine.playClick();
            if (this.accessToken) {
              this.performSync();
            } else {
              this.signIn();
            }
          });
        },

        loadCachedToken() {
          const token = sessionStorage.getItem('sonata_google_token');
          const expiry = Number(sessionStorage.getItem('sonata_google_token_expiry') || '0');
          if (token && expiry > Date.now()) {
            this.accessToken = token;
            this.fetchUserInfo().then(() => {
              this.updateUI("● Synced", "primary");
            });
          }
        },

        async fetchUserInfo() {
          if (!this.accessToken) return;
          try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            if (resp.ok) {
              const data = await resp.json();
              this.userEmail = data.email || null;
              this.userGivenName = data.given_name || null;
              this.userName = data.name || data.given_name || null;
              this.userPicture = data.picture || null;
              localStorage.setItem('sonata_user_profile', JSON.stringify({
                userEmail: this.userEmail,
                userGivenName: this.userGivenName,
                userName: this.userName,
                userPicture: this.userPicture
              }));
              this.updateProfileUI();
            }
          } catch (e) {
            console.error("Fetch user info error:", e);
          }
        },

        updateProfileUI() {
          let name = 'Musician';
          if (this.userGivenName) {
            name = this.userGivenName;
          } else if (this.userName && !this.userName.includes('@')) {
            const parts = this.userName.trim().split(/[\s,]+/);
            name = parts[0];
          } else if (this.userEmail) {
            const prefix = this.userEmail.split('@')[0].toLowerCase();
            if (prefix.includes('jethro')) {
              name = 'Jethro';
            } else {
              const clean = prefix.split('.')[0].replace(/[0-9_]/g, '');
              if (clean) name = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
          }
          const greetingText = `Hi, ${name}!`;
          const emptySvg = 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" fill="%2394a3b8" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6z"/></svg>';
          const pic = (this.accessToken || this.userName || this.userEmail) ? (this.userPicture || emptySvg) : emptySvg;
          
          if (UIManager.dom.sidebarProfileContainer) {
            UIManager.dom.sidebarProfileContainer.hidden = false;
            if (UIManager.dom.sidebarUserGreeting) UIManager.dom.sidebarUserGreeting.textContent = greetingText;
            if (UIManager.dom.sidebarUserAvatar) UIManager.dom.sidebarUserAvatar.src = pic;
          }
          if (UIManager.dom.topbarProfileContainer) {
            UIManager.dom.topbarProfileContainer.hidden = false;
            if (UIManager.dom.topbarUserGreeting) {
              UIManager.dom.topbarUserGreeting.textContent = greetingText;
              UIManager.dom.topbarUserGreeting.style.display = 'inline';
            }
            if (UIManager.dom.topbarUserAvatar) UIManager.dom.topbarUserAvatar.src = pic;
          }
          if (UIManager.dom.mobileUserAvatar) {
            UIManager.dom.mobileUserAvatar.hidden = false;
            UIManager.dom.mobileUserAvatar.src = pic;
          }
        },

        signIn() {
          return new Promise((resolve) => {
            if (this.tokenClient) {
              this.resolveSignIn = resolve;
              this.updateUI("Connecting...", "secondary");
              this.tokenClient.requestAccessToken({ prompt: '' });
            } else {
              UIManager.toast("Google Identity Services loading...");
              resolve(false);
            }
          });
        },

        disconnect() {
          if (this.accessToken) {
            try {
              google.accounts.oauth2.revoke(this.accessToken, () => { });
            } catch (e) { }
          }
          this.accessToken = null;
          this.userEmail = null;
          this.fileId = null;
          sessionStorage.removeItem('sonata_google_token');
          sessionStorage.removeItem('sonata_google_token_expiry');
          this.updateUI("Drive Sync", "secondary");
          UIManager.toast("Disconnected from Google Drive");
        },

        get lastSyncedTime() {
          return localStorage.getItem('sonata:v12:last_synced') || null;
        },
        set lastSyncedTime(val) {
          localStorage.setItem('sonata:v12:last_synced', val);
        },

        updateUI(text, styleClass) {
          const btn = UIManager.dom.googleSyncButton || document.getElementById('googleSyncButton');
          if (!btn) return;
          btn.className = `button ${styleClass}`;
          Icon.set(btn, "cloud", text, false);
          this.updateProfileUI();
        },

        async performSync() {
          if (this.isSyncing) return;
          if (!this.accessToken) {
            await this.signIn();
            return;
          }
          this.isSyncing = true;
          this.updateUI("Syncing...", "secondary");
          UIManager.toast("Syncing with Google Drive...");

          try {
            // Use direct fetch instead of gapi.client.drive (discovery doc can fail silently)
            const headers = { 'Authorization': `Bearer ${this.accessToken}` };

            // Search for existing file
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${this.FILENAME}' and trashed=false`)}&fields=files(id,name,modifiedTime)&spaces=drive`;
            const listResp = await fetch(listUrl, { headers });

            if (listResp.status === 401) {
              this.accessToken = null;
              sessionStorage.removeItem('sonata_google_token');
              UIManager.toast("Session expired. Please sync again.");
              this.updateUI("Drive Sync", "secondary");
              this.isSyncing = false;
              return;
            }
            if (!listResp.ok) throw new Error(`List files HTTP ${listResp.status}`);

            const listData = await listResp.json();
            const files = listData.files || [];

            if (files.length > 0) {
              this.fileId = files[0].id;
              const getResp = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, { headers });
              if (!getResp.ok) throw new Error(`Get file HTTP ${getResp.status}`);
              let cloudData = await getResp.json();
              if (cloudData && typeof cloudData === 'object') {
                this.mergeAndSave(cloudData);
              } else {
                await this.uploadLocalData(false);
              }
            } else {
              await this.uploadLocalData(true);
            }
            this.lastSyncedTime = Util.now();
            this.updateUI("● Synced", "primary");
            UIManager.toast("Drive Sync Complete");
          } catch (err) {
            console.error("Sync error:", err);
            UIManager.toast("Drive Sync Failed: " + (err.message || "Unknown error"));
            this.updateUI("Sync Failed", "danger");
          } finally {
            this.isSyncing = false;
          }
        },

        mergeAndSave(cloudData) {
          const mergeArrays = (localArr, cloudArr, timeKey) => {
            const map = new Map();
            (cloudArr || []).forEach(item => { if (item && item.id) map.set(item.id, item); });
            (localArr || []).forEach(item => {
              if (!item || !item.id) return;
              const cloudItem = map.get(item.id);
              if (cloudItem) {
                const localTime = new Date(item[timeKey] || item.updatedAt || item.createdAt || 0).getTime();
                const cloudTime = new Date(cloudItem[timeKey] || cloudItem.updatedAt || cloudItem.createdAt || 0).getTime();
                if (localTime >= cloudTime) {
                  map.set(item.id, item);
                }
              } else {
                map.set(item.id, item);
              }
            });
            return Array.from(map.values());
          };

          const mergedSongs = mergeArrays(StateManager.state.songs, cloudData.songs || [], 'updatedAt');
          const mergedSets = mergeArrays(StateManager.state.setlists, cloudData.setlists || [], 'updatedAt');

          StateManager.state.songs = mergedSongs.map(s => StorageManager.normalizeSong(s));
          StateManager.state.setlists = mergedSets;
          if (cloudData.settings) {
            StateManager.state.settings = { ...cloudData.settings, ...StateManager.state.settings };
          }

          StorageManager.saveSongs(StateManager.state.songs);
          StorageManager.saveSetlists(StateManager.state.setlists);
          StorageManager.saveSettings(StateManager.state.settings);

          Editor.loadActiveSong();
          UIManager.renderAll();
          this.uploadLocalData(false);
        },

        scheduleUpload() {
          if (this.uploadTimer) clearTimeout(this.uploadTimer);
          this.uploadTimer = setTimeout(() => {
            if (this.accessToken) this.uploadLocalData(false);
          }, 2500);
        },

        async uploadLocalData(isCreate = false) {
          if (!this.accessToken) return;
          const data = {
            songs: StateManager.state.songs,
            setlists: StateManager.state.setlists,
            settings: StateManager.state.settings,
            lastSynced: Util.now()
          };
          const metadata = {
            name: this.FILENAME,
            parents: undefined
          };

          const boundary = '-------314159265358979323846';
          const delimiter = "\r\n--" + boundary + "\r\n";
          const close_delim = "\r\n--" + boundary + "--";

          const multipartRequestBody =
            delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
            delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(data) + close_delim;

          try {
            const isPost = isCreate || !this.fileId;
            const url = isPost
              ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
              : `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=multipart`;

            const resp = await fetch(url, {
              method: isPost ? 'POST' : 'PATCH',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
              },
              body: multipartRequestBody
            });

            if (!resp.ok) {
              throw new Error(`HTTP ${resp.status}`);
            }

            const resData = await resp.json();
            if (resData.id) this.fileId = resData.id;
            this.lastSyncedTime = Util.now();
            this.updateUI("● Synced", "primary");
          } catch (err) {
            console.error("Upload error:", err);
            this.updateUI("Sync Error", "danger");
          }
        },

        renderSettingsUI() {
          const container = document.getElementById('settingsDriveSyncStatus');
          if (!container) return;
          if (this.accessToken) {
            container.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:8px;">
                <p style="font-size:0.85rem; color:var(--text); font-weight:600; margin:0;">Signed in as: <span style="color:var(--accent);">${this.userEmail || "Connected"}</span></p>
                <p style="font-size:0.75rem; color:var(--muted); margin:0;">Last Synced: <strong>${Util.formatDate(this.lastSyncedTime)}</strong></p>
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <button class="button primary" id="settingsSyncNowBtn" type="button" style="flex:1;">Sync Now</button>
                  <button class="button secondary" id="settingsDisconnectBtn" type="button">Disconnect</button>
                </div>
              </div>
            `;
            document.getElementById('settingsSyncNowBtn')?.addEventListener('click', async (e) => {
              e.preventDefault();
              await this.performSync();
              this.renderSettingsUI();
            });
            document.getElementById('settingsDisconnectBtn')?.addEventListener('click', (e) => {
              e.preventDefault();
              this.disconnect();
              this.renderSettingsUI();
            });
          } else {
            container.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:8px;">
                <p style="font-size:0.85rem; color:var(--muted); margin:0;">Backup and sync your library to Google Drive.</p>
                <button class="button primary" id="settingsSignInBtn" type="button" style="width:100%;">Sign in with Google</button>
              </div>
            `;
            document.getElementById('settingsSignInBtn')?.addEventListener('click', async (e) => {
              e.preventDefault();
              await this.signIn();
              this.renderSettingsUI();
            });
          }
        }
      };

      window.AudioEngine = {
        ctx: null,
        masterGain: null,
        init() {
          if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
              try {
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 1.0;
                this.masterGain.connect(this.ctx.destination);
              } catch (e) { }
            }
          }
          if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => { });
        },
        setupListeners() {
          const r = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
          document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r(); });
          document.addEventListener('touchstart', r, { passive: true });
          document.addEventListener('click', r, { passive: true });
        },
        midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },
        playGuitarNote(freq, vol = 0.65) {
          this.init();
          if (!this.ctx || this.ctx.state !== "running") return { stop: () => { } };
          try {
            const t = this.ctx.currentTime;
            const dest = this.masterGain || this.ctx.destination;
            const decayTime = Math.max(2.4, Math.min(6.5, 5.8 - Math.log2(Math.max(40, freq) / 82) * 0.75));

            const voiceGain = this.ctx.createGain();
            voiceGain.gain.setValueAtTime(0.0001, t);
            voiceGain.gain.linearRampToValueAtTime(vol, t + 0.006);
            voiceGain.gain.exponentialRampToValueAtTime(vol * 0.48, t + 0.22);
            voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + decayTime);

            // Guitar wood body formants (soundhole resonance ~108Hz & body soundboard ~230Hz)
            const bodyFilter1 = this.ctx.createBiquadFilter();
            bodyFilter1.type = 'peaking';
            bodyFilter1.frequency.value = 108;
            bodyFilter1.Q.value = 2.4;
            bodyFilter1.gain.value = 4.5;

            const bodyFilter2 = this.ctx.createBiquadFilter();
            bodyFilter2.type = 'peaking';
            bodyFilter2.frequency.value = 230;
            bodyFilter2.Q.value = 2.0;
            bodyFilter2.gain.value = 3.8;

            // Dynamic string lowpass filter (bright pluck initial transient tapering into warm sustain)
            const stringFilter = this.ctx.createBiquadFilter();
            stringFilter.type = 'lowpass';
            stringFilter.frequency.setValueAtTime(Math.min(13500, freq * 9), t);
            stringFilter.frequency.exponentialRampToValueAtTime(Math.min(4200, freq * 3.2), t + 0.16);
            stringFilter.frequency.exponentialRampToValueAtTime(Math.max(160, freq * 1.4), t + decayTime);

            // Pick attack transient impulse
            const pickNoiseBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.02), this.ctx.sampleRate);
            const pickData = pickNoiseBuf.getChannelData(0);
            for (let i = 0; i < pickData.length; i++) pickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.0035));
            const pickSource = this.ctx.createBufferSource();
            pickSource.buffer = pickNoiseBuf;
            const pickFilter = this.ctx.createBiquadFilter();
            pickFilter.type = 'bandpass';
            pickFilter.frequency.value = Math.min(3800, freq * 3.0);
            pickFilter.Q.value = 3.2;
            const pickGain = this.ctx.createGain();
            pickGain.gain.setValueAtTime(vol * 0.45, t);
            pickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
            pickSource.connect(pickFilter).connect(pickGain).connect(stringFilter);
            pickSource.start(t);

            // String Harmonic Oscillators (sawtooth + triangle + sines)
            const osc1 = this.ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(freq, t);

            const osc2 = this.ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(freq * 2, t);

            const osc3 = this.ctx.createOscillator();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(freq * 3, t);

            const g1 = this.ctx.createGain(); g1.gain.value = 0.55;
            const g2 = this.ctx.createGain(); g2.gain.value = 0.32;
            const g3 = this.ctx.createGain(); g3.gain.value = 0.16;
            g3.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

            osc1.connect(g1).connect(stringFilter);
            osc2.connect(g2).connect(stringFilter);
            osc3.connect(g3).connect(stringFilter);

            stringFilter.connect(bodyFilter1);
            bodyFilter1.connect(bodyFilter2);
            bodyFilter2.connect(voiceGain);
            voiceGain.connect(dest);

            osc1.start(t); osc2.start(t); osc3.start(t);
            osc1.stop(t + decayTime + 0.1); osc2.stop(t + decayTime + 0.1); osc3.stop(t + decayTime + 0.1);

            return {
              stop: () => {
                try {
                  const stopT = this.ctx.currentTime;
                  voiceGain.gain.cancelScheduledValues(stopT);
                  voiceGain.gain.setValueAtTime(voiceGain.gain.value, stopT);
                  voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopT + 0.08);
                  setTimeout(() => {
                    try { osc1.stop(); osc2.stop(); osc3.stop(); } catch (e) { }
                  }, 100);
                } catch (e) { }
              }
            };
          } catch (e) { return { stop: () => { } }; }
        },
        playPianoNote(freq, vol = 0.55) {
          this.init();
          if (!this.ctx || this.ctx.state !== "running") return { stop: () => { } };
          try {
            const t = this.ctx.currentTime;
            const dest = this.masterGain || this.ctx.destination;
            const decayTime = Math.max(2.0, Math.min(8.0, 7.2 - Math.log2(Math.max(30, freq) / 55) * 0.85));

            const voiceGain = this.ctx.createGain();
            voiceGain.gain.setValueAtTime(0.0001, t);
            voiceGain.gain.linearRampToValueAtTime(vol, t + 0.007);
            voiceGain.gain.exponentialRampToValueAtTime(vol * 0.45, t + 0.32);
            voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + decayTime);

            // Soundboard warmth filter
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(Math.min(12500, freq * 8.5), t);
            filter.frequency.exponentialRampToValueAtTime(Math.min(4800, freq * 2.8), t + 0.4);
            filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.2), t + decayTime);

            // Multi-harmonic additive oscillators with slight unison chorus
            const harmonics = [
              { mult: 1.000, gain: 0.65, detune: 0 },
              { mult: 1.000, gain: 0.32, detune: 1.1 },
              { mult: 1.000, gain: 0.32, detune: -1.1 },
              { mult: 2.001, gain: 0.40, detune: 0.4 },
              { mult: 3.003, gain: 0.20, detune: -0.7 },
              { mult: 4.006, gain: 0.10, detune: 0.2 },
              { mult: 5.010, gain: 0.05, detune: 0 }
            ];

            const oscNodes = [];
            harmonics.forEach(h => {
              const hFreq = freq * h.mult;
              if (hFreq > 18000) return;
              const osc = this.ctx.createOscillator();
              const hGain = this.ctx.createGain();
              osc.type = h.mult <= 2 ? 'sine' : (h.mult === 3 ? 'triangle' : 'sine');
              osc.frequency.setValueAtTime(hFreq, t);
              if (h.detune) osc.detune.setValueAtTime(h.detune, t);
              hGain.gain.setValueAtTime(h.gain, t);
              if (h.mult > 2) {
                hGain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.4, decayTime * (0.8 / h.mult)));
              }
              osc.connect(hGain);
              hGain.connect(filter);
              osc.start(t);
              osc.stop(t + decayTime + 0.1);
              oscNodes.push(osc);
            });

            // Hammer felt strike transient
            const hammerNoiseBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.016), this.ctx.sampleRate);
            const noiseData = hammerNoiseBuf.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.004));
            const hammerSource = this.ctx.createBufferSource();
            hammerSource.buffer = hammerNoiseBuf;
            const hammerFilter = this.ctx.createBiquadFilter();
            hammerFilter.type = 'bandpass';
            hammerFilter.frequency.value = Math.min(3000, freq * 2.8);
            hammerFilter.Q.value = 2.2;
            const hammerGain = this.ctx.createGain();
            hammerGain.gain.setValueAtTime(vol * 0.30, t);
            hammerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
            hammerSource.connect(hammerFilter).connect(hammerGain).connect(filter);
            hammerSource.start(t);

            filter.connect(voiceGain);
            voiceGain.connect(dest);

            return {
              stop: () => {
                try {
                  const stopT = this.ctx.currentTime;
                  voiceGain.gain.cancelScheduledValues(stopT);
                  voiceGain.gain.setValueAtTime(voiceGain.gain.value, stopT);
                  voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopT + 0.03);
                  setTimeout(() => {
                    oscNodes.forEach(o => { try { o.stop(); } catch (e) { } });
                  }, 50);
                } catch (e) { }
              }
            };
          } catch (e) { return { stop: () => { } }; }
        },
        playChord(midiBase, quality = 'major') {
          const root = this.midiToFreq(midiBase);
          let third = this.midiToFreq(midiBase + (quality === 'minor' || quality === 'diminished' ? 3 : 4));
          let fifth = this.midiToFreq(midiBase + (quality === 'diminished' ? 6 : 7));
          const n1 = this.playPianoNote(root, 0.45);
          let n2, n3;
          setTimeout(() => { n2 = this.playPianoNote(third, 0.38); }, 15);
          setTimeout(() => { n3 = this.playPianoNote(fifth, 0.38); }, 30);
          return { stop: () => { if (n1) n1.stop(); if (n2) n2.stop(); if (n3) n3.stop(); } };
        },
        playMetronome(accent) { this.init(); if (!this.ctx || this.ctx.state !== "running") return; try { const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); const vol = Util.clamp(StateManager.state.settings.metronomeVolume, 0, 1); osc.type = 'square'; osc.frequency.value = accent ? 1320 : 880; gain.gain.setValueAtTime(0.001, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(vol * (accent ? 0.35 : 0.2), this.ctx.currentTime + 0.005); gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + 0.065); } catch (e) { } },
        playClick() { if (!StateManager.state.settings.uiSounds) return; this.init(); if (!this.ctx || this.ctx.state !== "running") return; try { const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(600, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05); gain.gain.setValueAtTime(0.1, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + 0.05); } catch (e) { } },
        vibrate(duration = 10) { if (StateManager.state.settings.haptics && navigator.vibrate) try { navigator.vibrate(duration); } catch (e) { } }
      };

      const StorageManager = {
        loadSongs() { try { const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.songs) || "[]"); return Array.isArray(p) ? p.map(this.normalizeSong) : []; } catch (e) { return []; } },
        saveSongs(songs) { localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(songs)); },
        loadSetlists() { try { const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.setlists) || "[]"); return Array.isArray(p) ? p : []; } catch (e) { return []; } },
        saveSetlists(setlists) { localStorage.setItem(STORAGE_KEYS.setlists, JSON.stringify(setlists)); },
        loadSettings() { try { const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}"); return Object.assign({}, DEFAULT_SETTINGS, p || {}); } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); } },
        saveSettings(settings) { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings)); },
        loadActiveId() { return localStorage.getItem(STORAGE_KEYS.activeSong); },
        saveActiveId(id) { localStorage.setItem(STORAGE_KEYS.activeSong, id); },
        normalizeSong(s) { const now = Util.now(); return { id: s.id || Util.uid(), title: s.title || "Untitled", artist: s.artist || "", description: s.description || "", links: Array.isArray(s.links) ? s.links : [], creator: s.creator || "", body: s.body || "", savedSnapshot: s.savedSnapshot || s.body || "", manualKey: s.manualKey || "auto", isFavorite: s.isFavorite || false, createdAt: s.createdAt || now, updatedAt: s.updatedAt || now, lastOpenedAt: s.lastOpenedAt || s.updatedAt || now }; }
      };

      const StateManager = {
        state: { songs: [], setlists: [], activeId: null, sharedSong: null, activeSetlist: { id: null, index: 0 }, settings: Object.assign({}, DEFAULT_SETTINGS), capo: 0, query: "", libraryFilter: "all", previewMode: "original", circleFormat: "roman", transposeDelta: 0, detectedKey: null, dirty: false },
        init() { this.state.settings = StorageManager.loadSettings(); this.state.songs = StorageManager.loadSongs(); this.state.setlists = StorageManager.loadSetlists(); const sId = StorageManager.loadActiveId(); this.state.activeId = this.state.songs.some(s => s.id === sId) ? sId : (this.state.songs[0]?.id || null); },
        activeSong() { return this.state.activeId === 'shared' && this.state.sharedSong ? this.state.sharedSong : (this.state.songs.find(s => s.id === this.state.activeId) || this.state.songs[0] || null); },
        touch(song) { if (!song || song.readonly) return; song.updatedAt = Util.now(); this.state.dirty = true; App.scheduleSave(); GoogleDriveSync.scheduleUpload(); },
        saveNow(msg) {
          const a = this.activeSong();
          if (a && !a.readonly) a.savedSnapshot = a.body;
          StorageManager.saveSongs(this.state.songs);
          StorageManager.saveSetlists(this.state.setlists);
          StorageManager.saveSettings(this.state.settings);
          if (this.state.activeId && this.state.activeId !== 'shared') StorageManager.saveActiveId(this.state.activeId);
          this.state.dirty = false;
          UIManager.setStatus(msg || "Saved");
          if (typeof GoogleDriveSync !== 'undefined' && GoogleDriveSync.accessToken) {
            GoogleDriveSync.scheduleUpload();
          }
        },
        setActive(id) { if (id === 'shared') return; const song = this.state.songs.find(i => i.id === id); if (!song) return; this.state.activeId = id; song.lastOpenedAt = Util.now(); this.state.sharedSong = null; StorageManager.saveActiveId(id); this.saveNow("Opened"); },
        createSong() { const now = Util.now(); const autoName = (StateManager.state.settings.autoFillArranger && GoogleDriveSync.userName) ? GoogleDriveSync.userName : ""; const s = { id: Util.uid(), title: "", artist: "", description: "", links: [], creator: autoName, body: "", savedSnapshot: "", manualKey: "auto", isFavorite: false, createdAt: now, updatedAt: now, lastOpenedAt: now }; this.state.songs.unshift(s); this.state.activeId = s.id; this.state.transposeDelta = 0; this.state.capo = 0; this.state.sharedSong = null; this.exitSetlist(); this.saveNow("New song created"); return s; },
        loadDemo() { const s = this.activeSong(); if (!s || s.readonly) return; Object.assign(s, { title: "Amazing Grace (My Chains Are Gone)", body: DEMO_SONG, artist: "John Newton", creator: "Chris Tomlin / Trad.", description: "Classic hymn arranged for contemporary worship. Build on Chorus 2.", links: [{ name: "YouTube", url: "https://youtu.be/Jbe7OruLk8I" }], manualKey: "G:major" }); this.state.capo = 0; this.state.transposeDelta = 0; this.touch(s); this.saveNow("Demo loaded"); return s; },
        deleteActive() { const a = this.activeSong(); if (!a || a.readonly) return; this.state.songs = this.state.songs.filter(s => s.id !== a.id); if (!this.state.songs.length) this.createSong(); else this.state.activeId = this.state.songs[0].id; this.saveNow("Deleted"); },
        revertActive() { const a = this.activeSong(); if (!a || a.readonly) return; a.body = a.savedSnapshot || ""; this.touch(a); this.saveNow("Restored"); Editor.loadActiveSong(); UIManager.renderAll(); },
        importShared() { if (!this.state.sharedSong) return; const s = { ...this.state.sharedSong, id: Util.uid(), readonly: false }; this.state.songs.unshift(s); this.state.sharedSong = null; this.state.activeId = s.id; this.saveNow("Saved to Library"); return s; },
        exitShared() { this.state.sharedSong = null; this.state.activeId = this.state.songs[0]?.id || null; if (!this.state.activeId) this.createSong(); },
        playSetlist(id, index = 0) { const set = this.state.setlists.find(s => s.id === id); if (!set || !set.items.length) return; this.state.activeSetlist = { id, index }; this.state.sharedSong = null; this.setActive(set.items[index].songId); UIManager.updateSetlistNav(); },
        exitSetlist() { this.state.activeSetlist = { id: null, index: 0 }; UIManager.updateSetlistNav(); }
      };

      const ChordParser = {
        parse(input) {
          if (typeof input !== "string") return null; const text = input.trim(); if (!text || text === "-" || /^-+$/.test(text)) return null;
          const matchRhythm = text.match(/^([a-gA-G][^\/]*?(?:\/[a-gA-G][^\/]*)?)(\/+)$/i) || text.match(/^(.*?)(\/+)$/);
          let chordPart = text; let trailingSlashes = "";
          if (matchRhythm) { chordPart = matchRhythm[1]; trailingSlashes = matchRhythm[2]; }
          const slashIndex = chordPart.indexOf("/"); const main = slashIndex >= 0 ? chordPart.slice(0, slashIndex) : chordPart; const bass = slashIndex >= 0 ? chordPart.slice(slashIndex + 1) : "";
          const match = main.match(/^([a-gA-G](?:#|b|B)?)(.*)$/); if (!match) return null;
          let root = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(); if (root.length === 2 && root[1] === 'B') root = root[0] + 'b';
          const quality = match[2] || ""; if (!NOTE_TO_SEMITONE.hasOwnProperty(root)) return null;
          let normalizedBass = ""; if (bass) { normalizedBass = bass.charAt(0).toUpperCase() + bass.slice(1).toLowerCase(); if (normalizedBass.length === 2 && normalizedBass[1] === 'B') normalizedBass = normalizedBass[0] + 'b'; if (!NOTE_TO_SEMITONE.hasOwnProperty(normalizedBass)) return null; }
          if (!this.isSupportedQuality(quality)) return null;
          return { raw: text, root, quality, bass: normalizedBass, rootValue: NOTE_TO_SEMITONE[root], bassValue: normalizedBass ? NOTE_TO_SEMITONE[normalizedBass] : null, trailingSlashes };
        },
        isSupportedQuality(q) { return !q || /^([mM](?:aj|in)?|dim|aug|sus|add|o|-|\+)?\d*(?:[#b+\-]\d+)*(?:[mM](?:aj|in)?|dim|aug|sus|add)*\d*$/i.test(q); },
        classify(chord) { const q = (typeof chord === "string" ? chord : chord.quality || "").replace(/\u00b0/g, "dim").toLowerCase(); if (q.startsWith("dim")) return "diminished"; if (q.startsWith("aug") || q === "+") return "augmented"; if (q.startsWith("sus") || q.includes("sus")) return "suspended"; if (q === "5") return "power"; if (/^(m|min)(?!aj)/.test(q)) return "minor"; return "major"; },
        unwrapToken(token) { const match = token.match(/^([|()[\]{}<>"'.,;:\-]*)(.*?)([|()[\]{}<>"'.,;:\-]*)$/); return match ? { leading: match[1], core: match[2], trailing: match[3] } : { leading: "", core: token, trailing: "" }; },
        parseToken(token) { const parts = this.unwrapToken(token); const chord = this.parse(parts.core); return chord ? { ...parts, ...chord } : null; },
        isChordLine(line) {
          const t = line.trim(); if (!t || t.startsWith('#') || t.startsWith('---') || t.startsWith('>') || t.startsWith('//') || /\[[^\]]+\]/.test(line)) return false;
          if (/^(verse|chorus|bridge|intro|outro|interlude|tag|v\d|c\d)[:]?$/i.test(t)) return false;
          const tokens = t.split(/\s+/); let chords = 0, invalid = 0;
          for (const token of tokens) {
            const stripped = token.replace(/[|:.,;()[\]{}<>"'\-]/g, ""); if (!stripped || /^-+$/.test(stripped)) continue;
            if (/^\d+x$/i.test(stripped) || /^x\d+$/i.test(stripped)) continue;
            if (this.parseToken(token)) chords++; else invalid++;
          }
          return chords > 0 && invalid === 0;
        },
        extractChords(text) {
          const chords = [];
          (text || "").split("\n").forEach((line, lineIndex) => {
            if (line.trim().startsWith('#') || line.trim().startsWith('-') || line.trim().startsWith('>') || line.trim().startsWith('//')) return;
            const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g));
            if (bracketMatches.length) { bracketMatches.forEach(m => { const p = this.parse(m[1].trim()); if (p) chords.push({ lineIndex, ...p }); }); return; }
            if (this.isChordLine(line)) { line.trim().split(/\s+/).forEach(t => { if (!/^-+$/.test(t)) { const p = this.parseToken(t); if (p) chords.push({ lineIndex, ...p }); } }); }
          });
          return chords;
        }
      };

      const TransposeEngine = {
        transposeText(text, steps, key) {
          if (!steps) return text || "";
          return (text || "").split("\n").map(line => {
            if (line.trim().startsWith('>') || line.trim().startsWith('//')) return line;
            if (/\[[^\]]+\]/.test(line)) return line.replace(/\[([^\]]+)\]/g, (match, inner) => { const c = ChordParser.parse(inner.trim()); return c ? "[" + this.transposeChord(c, steps, key) + "]" : match; });
            if (!ChordParser.isChordLine(line)) return line;
            return line.replace(/\S+/g, token => {
              if (/^-+$/.test(token) || token === "-") return token;
              const p = ChordParser.parseToken(token); return p ? p.leading + this.transposeChord(p, steps, key) + p.trailing : token;
            });
          }).join("\n");
        },
        transposeChord(chord, steps, key) {
          const rootVal = Util.mod(chord.rootValue + steps, 12);
          const rootName = FLAT_NOTES[rootVal];
          let bassName = "";
          if (chord.bass) {
            const bassVal = Util.mod(chord.bassValue + steps, 12);
            bassName = "/" + FLAT_NOTES[bassVal];
          }
          return rootName + chord.quality + bassName + (chord.trailingSlashes || "");
        },
        preferFlats(chord, key) { return false; }
      };

      const KeyDetector = {
        detect(textOrChords) {
          const chords = Array.isArray(textOrChords) ? textOrChords : ChordParser.extractChords(textOrChords || "");
          if (!chords.length) return { root: "C", mode: "major", name: "Unknown", confidence: 0 };
          const cands = []; for (let t = 0; t < 12; t++) { cands.push(this.score(chords, t, "major")); cands.push(this.score(chords, t, "minor")); }
          cands.sort((a, b) => b.score - a.score); const best = cands[0];
          return { ...best, root: this.nameFor(best.tonic, best.mode), name: this.nameFor(best.tonic, best.mode) + " " + best.mode, confidence: Math.round(Util.clamp((best.score - (cands[1]?.score || 0) + 1) * 12, 0, 99)) };
        },
        score(chords, tonic, mode) {
          const prof = mode === "major" ? { 0: 3, 2: 1.35, 4: 1.2, 5: 1.55, 7: 2.25, 9: 1.45, 11: 0.65, 3: 0.45, 8: 0.35, 10: 0.5 } : { 0: 3, 2: 0.7, 3: 1.75, 5: 1.45, 7: 1.55, 8: 1.45, 10: 1.35, 11: 0.55 };
          let score = 0;
          chords.forEach((c, index) => {
            const diff = Util.mod(c.rootValue - tonic, 12); const q = ChordParser.classify(c);
            let w = 1 + (index === 0 ? 0.45 : 0) + (index === chords.length - 1 ? 0.7 : 0);
            score += (prof[diff] || -0.35) * w;
            if (mode === "major") {
              if ([0, 5, 7].includes(diff) && ["major", "suspended", "power"].includes(q)) score += 1.05 * w;
              if ([2, 4, 9].includes(diff) && q === "minor") score += 0.95 * w;
              if (diff === 11 && q === "diminished") score += 0.8 * w;
            } else {
              if ([0, 5].includes(diff) && q === "minor") score += 1.1 * w;
              if (diff === 7 && ["minor", "major", "suspended", "power"].includes(q)) score += 0.8 * w;
              if (diff === 2 && q === "diminished") score += 0.7 * w;
            }
          });
          return { tonic, mode, score };
        },
        nameFor(s, m) { return m === "minor" ? MINOR_KEY_ROOTS[s] : KEY_ROOTS[s]; },
        parseKey(value) { if (!value || value === "auto") return null; const parts = value.split(":"); return NOTE_TO_SEMITONE.hasOwnProperty(parts[0]) ? { root: parts[0], mode: parts[1], tonic: NOTE_TO_SEMITONE[parts[0]], name: parts[0] + " " + parts[1] } : null; },
        activeKey(song, detected) { return this.parseKey(song?.manualKey) || detected || { root: "C", mode: "major", tonic: 0, name: "C major" }; }
      };

      const FormatEngine = {
        majorMap: { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" },
        minorMap: { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" },
        rMajorMap: { 0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV", 6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII" },
        rMinorMap: { 0: "I", 1: "bII", 2: "II", 3: "III", 4: "#III", 5: "IV", 6: "#IV", 7: "V", 8: "VI", 9: "bVII", 10: "VII", 11: "#VII" },
        convert(text, key, type) {
          if (!key) return text || "";
          return (text || "").split("\n").map(line => {
            if (line.trim().startsWith('>') || line.trim().startsWith('//')) return line;
            if (/\[[^\]]+\]/.test(line)) return line.replace(/\[([^\]]+)\]/g, (match, inner) => { const c = ChordParser.parse(inner.trim()); return c ? "[" + (type === 'roman' ? this.romanChord(c, key) : this.nashChord(c, key)) + "]" : match; });
            if (!ChordParser.isChordLine(line)) return line;
            return line.replace(/\S+/g, token => {
              if (/^-+$/.test(token) || token === "-") return token;
              const p = ChordParser.parseToken(token); return p ? p.leading + (type === 'roman' ? this.romanChord(p, key) : this.nashChord(p, key)) + p.trailing : token;
            });
          }).join("\n");
        },
        romanChord(c, key) { const base = (key.mode === "minor" ? this.rMinorMap : this.rMajorMap)[Util.mod(c.rootValue - key.tonic, 12)] || "?"; const q = ChordParser.classify(c); let num = base.replace(/[IVX]+/g, m => (q === "minor" || q === "diminished") ? m.toLowerCase() : m.toUpperCase()) + this.rSuffix(c.quality, q); if (c.bass) num += "/" + ((key.mode === "minor" ? this.rMinorMap : this.rMajorMap)[Util.mod(c.bassValue - key.tonic, 12)] || "?"); return num + (c.trailingSlashes || ""); },
        nashChord(c, key) { let num = (key.mode === "minor" ? this.minorMap : this.majorMap)[Util.mod(c.rootValue - key.tonic, 12)] || "?"; num += this.nSuffix(c.quality); if (c.bass) num += "/" + ((key.mode === "minor" ? this.minorMap : this.majorMap)[Util.mod(c.bassValue - key.tonic, 12)] || "?"); return num + (c.trailingSlashes || ""); },
        rSuffix(q, className) { const lower = (q || "").replace(/\u00b0/g, "dim").toLowerCase(); if (!q || lower === "m" || lower === "min" || lower === "maj") return ""; if (className === "diminished" && lower === "dim") return "dim"; if (className === "augmented" && (lower === "aug" || q === "+")) return "aug"; if (/^(m|min)(6|7|9|11|13)/.test(lower)) return lower.replace(/^(m|min)/, ""); return q === "M7" ? "maj7" : q === "M9" ? "maj9" : q; },
        nSuffix(q) { const lower = (q || "").replace(/\u00b0/g, "dim").toLowerCase(); if (!q || lower === "maj") return ""; if (lower === "min") return "m"; return q === "M7" ? "maj7" : q === "M9" ? "maj9" : q; }
      };

      const InstrumentManager = {
        manualOverride: false,
        init() {
          this.renderCircle();
          // Populate instrument key root dropdown
          const rootSel = UIManager.dom.instrumentKeyRoot;
          if (rootSel && rootSel.options.length === 0) {
            KEY_ROOTS.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; rootSel.appendChild(o); });
          }
          // Sync key selectors to current song key
          this.syncKeySelectors(true);
          this.renderPiano();
          this.renderFretboard('guitar');
          this.bind();
        },
        syncKeySelectors(force = false) {
          if (this.manualOverride && !force) return;
          if (force) this.manualOverride = false;
          const song = StateManager.activeSong();
          const baseAk = KeyDetector.activeKey(song, StateManager.state.detectedKey);
          if (baseAk) {
            let tonic = baseAk.tonic;
            if (StateManager.state.transposeDelta) {
              tonic = Util.mod(tonic + StateManager.state.transposeDelta, 12);
            }
            if (UIManager.dom.instrumentKeyRoot) {
              UIManager.dom.instrumentKeyRoot.value = KEY_ROOTS[tonic] || 'C';
            }
            if (UIManager.dom.instrumentKeyMode) {
              UIManager.dom.instrumentKeyMode.value = baseAk.mode || 'major';
            }
            if (UIManager.dom.theoryKeyInput) {
              const rootName = KEY_ROOTS[tonic] || 'C';
              UIManager.dom.theoryKeyInput.value = `${rootName} ${baseAk.mode || 'major'}`;
            }
            this.renderPiano();
            this.renderFretboard(UIManager.dom.fretboardTuning?.value || 'guitar');
          }
        },
        getScaleSet() {
          const rootEl = UIManager.dom.instrumentKeyRoot;
          const modeEl = UIManager.dom.instrumentKeyMode;
          const rootName = rootEl?.value || 'C';
          const mode = modeEl?.value || 'major';
          let tonic = NOTE_TO_SEMITONE[rootName] ?? 0;
          const intervals = SCALE_INTERVALS[mode] || SCALE_INTERVALS.major;
          const scaleSet = new Set(intervals.map(i => (tonic + i) % 12));
          return { tonic, scaleSet };
        },
        bind() {
          UIManager.dom.circleRotateToggle?.addEventListener('change', () => this.renderCircle());
          UIManager.dom.circleHighlightToggle?.addEventListener('change', () => this.renderCircle());
          UIManager.dom.fretboardTuning?.addEventListener('change', (e) => this.renderFretboard(e.target.value));
          UIManager.dom.micTunerBtn?.addEventListener('click', () => Tuner.toggle());
          // Key selector re-renders
          UIManager.dom.instrumentKeyRoot?.addEventListener('change', () => {
            this.manualOverride = true;
            this.renderPiano();
            this.renderFretboard(UIManager.dom.fretboardTuning?.value || 'guitar');
          });
          UIManager.dom.instrumentKeyMode?.addEventListener('change', () => {
            this.manualOverride = true;
            this.renderPiano();
            this.renderFretboard(UIManager.dom.fretboardTuning?.value || 'guitar');
          });
        },
        wedgePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
          const startRad = (startAngle - 90) * Math.PI / 180; const endRad = (endAngle - 90) * Math.PI / 180;
          const x1 = cx + rOuter * Math.cos(startRad); const y1 = cy + rOuter * Math.sin(startRad);
          const x2 = cx + rOuter * Math.cos(endRad); const y2 = cy + rOuter * Math.sin(endRad);
          const x3 = cx + rInner * Math.cos(endRad); const y3 = cy + rInner * Math.sin(endRad);
          const x4 = cx + rInner * Math.cos(startRad); const y4 = cy + rInner * Math.sin(startRad);
          const largeArc = endAngle - startAngle > 180 ? 1 : 0;
          return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
        },
        renderCircle() {
          const container = UIManager.dom.circleContainer; if (!container) return;
          const autoRotate = UIManager.dom.circleRotateToggle?.checked ?? true;
          const highlight = UIManager.dom.circleHighlightToggle?.checked ?? true;
          const activeKey = KeyDetector.activeKey(StateManager.activeSong(), StateManager.state.detectedKey);
          const isMinorSelected = activeKey && activeKey.mode === 'minor';

          let baseRotation = 0, targetIndex = -1;
          if (activeKey) { targetIndex = CIRCLE_OF_FIFTHS.findIndex(k => NOTE_TO_SEMITONE[isMinorSelected ? k.minor : k.major] === activeKey.tonic); if (targetIndex >= 0 && autoRotate) baseRotation = -(targetIndex * 30); }

          let svg = `<svg viewBox="0 0 360 360" width="100%" height="100%" style="transform: rotate(${baseRotation}deg); transition: transform 0.5s ease;">`;
          svg += `<style>.slice{cursor:pointer;stroke:var(--line);stroke-width:1px;transition:fill 0.2s, opacity 0.3s;} .slice-major{fill:color-mix(in srgb, var(--accent) 15%, var(--surface-2));} .slice-minor{fill:color-mix(in srgb, var(--accent-2) 15%, var(--surface-3));} .slice-dim{fill:color-mix(in srgb, var(--warning) 15%, var(--surface-3));} .slice:hover{filter:brightness(0.9);} html[data-theme="dark"] .slice:hover{filter:brightness(1.2);} .slice.active-key.slice-major{fill:var(--accent);} .slice.active-key.slice-minor{fill:var(--accent-2);} .slice.active-key.slice-dim{fill:var(--warning);} .slice-text{font-family:var(--ui-font);text-anchor:middle;dominant-baseline:middle;fill:var(--text);font-weight:600;pointer-events:none;} .slice-num{fill:var(--muted);font-weight:700;} .active-key + .slice-text, .active-key + .slice-text .slice-num{fill:#fff !important;} .dimmed{opacity:0.15;}</style>`;

          const cx = 180, cy = 180;
          const outerWedge = this.wedgePath(cx, cy, 178, 122, -15, 15);
          const midWedge = this.wedgePath(cx, cy, 122, 75, -15, 15);
          const innerWedge = this.wedgePath(cx, cy, 75, 42, -15, 15);

          const isDiatonic = (i, type) => {
            if (!highlight || targetIndex === -1) return true;
            let diff = i - targetIndex; if (diff < -6) diff += 12; if (diff > 5) diff -= 12;
            if (type === 'major' || type === 'minor') return diff >= -1 && diff <= 1;
            if (type === 'dim') return diff === 0;
            return false;
          };

          CIRCLE_OF_FIFTHS.forEach((key, i) => {
            const rot = i * 30; const textRot = -(rot + baseRotation);
            const outerKeyStr = isMinorSelected ? key.minor : key.major; const outerType = isMinorSelected ? 'minor' : 'major';
            const midKeyStr = isMinorSelected ? key.major : key.minor; const midType = isMinorSelected ? 'major' : 'minor';

            const isOutActive = activeKey.tonic === NOTE_TO_SEMITONE[outerKeyStr] && activeKey.mode === outerType;
            const isMidActive = activeKey.tonic === NOTE_TO_SEMITONE[midKeyStr] && activeKey.mode === midType;

            const fmt = StateManager.state.circleFormat === 'roman' ? 'romanChord' : 'nashChord';
            const rOut = FormatEngine[fmt]({ rootValue: NOTE_TO_SEMITONE[outerKeyStr], quality: outerType === 'minor' ? "m" : "" }, activeKey);
            const rMid = FormatEngine[fmt]({ rootValue: NOTE_TO_SEMITONE[midKeyStr], quality: midType === 'minor' ? "m" : "" }, activeKey);
            const rDim = FormatEngine[fmt]({ rootValue: NOTE_TO_SEMITONE[key.dim], quality: "dim" }, activeKey);

            svg += `<g transform="rotate(${rot}, 180, 180)">
                      <path class="slice slice-${outerType} ${isOutActive ? 'active-key' : ''} ${!isDiatonic(i, outerType) ? 'dimmed' : ''}" d="${outerWedge}" data-midi="${60 + key.offset + (isMinorSelected ? -3 : 0)}" data-quality="${outerType}" />
                      <text x="180" y="30" class="slice-text ${!isDiatonic(i, outerType) ? 'dimmed' : ''}" style="font-size:16px;" transform="rotate(${textRot}, 180, 30)"><tspan x="180" dy="-2">${outerKeyStr}${isMinorSelected ? 'm' : ''}</tspan><tspan x="180" dy="16" class="slice-num" style="font-size:11px;">${rOut}</tspan></text>
                  </g>`;
            svg += `<g transform="rotate(${rot}, 180, 180)">
                      <path class="slice slice-${midType} ${isMidActive ? 'active-key' : ''} ${!isDiatonic(i, midType) ? 'dimmed' : ''}" d="${midWedge}" data-midi="${60 + key.offset + (isMinorSelected ? 0 : -3)}" data-quality="${midType}" />
                      <text x="180" y="80" class="slice-text ${!isDiatonic(i, midType) ? 'dimmed' : ''}" style="font-size:14px;" transform="rotate(${textRot}, 180, 80)"><tspan x="180" dy="-2">${midKeyStr}${isMinorSelected ? '' : 'm'}</tspan><tspan x="180" dy="14" class="slice-num" style="font-size:10px;">${rMid}</tspan></text>
                  </g>`;
            svg += `<g transform="rotate(${rot}, 180, 180)">
                      <path class="slice slice-dim ${!isDiatonic(i, 'dim') ? 'dimmed' : ''}" d="${innerWedge}" data-midi="${60 + key.offset - 1}" data-quality="diminished" />
                      <text x="180" y="118.5" class="slice-text ${!isDiatonic(i, 'dim') ? 'dimmed' : ''}" style="font-size:9.5px;" transform="rotate(${textRot}, 180, 118.5)"><tspan x="180" dy="-2.5">${key.dim}°</tspan><tspan x="180" dy="11" class="slice-num" style="font-size:7px;">${rDim}</tspan></text>
                  </g>`;
          });
          svg += `<circle cx="180" cy="180" r="42" fill="var(--surface)" stroke="var(--line)" /></svg>`;
          container.innerHTML = svg;
          container.querySelectorAll('.slice').forEach(s => {
            let activeNode = null;
            const play = (e) => { e.preventDefault(); AudioEngine.vibrate(10); if (activeNode) activeNode.stop(); activeNode = AudioEngine.playChord(parseInt(s.dataset.midi, 10), s.dataset.quality); };
            const stop = (e) => { e.preventDefault(); };
            s.addEventListener('mousedown', play); s.addEventListener('touchstart', play, { passive: false }); s.addEventListener('mouseup', stop); s.addEventListener('mouseleave', stop); s.addEventListener('touchend', stop);
          });
        },
        renderPiano() {
          const keyboard = UIManager.dom.pianoKeyboard; if (!keyboard) return; keyboard.innerHTML = '';
          const { tonic, scaleSet } = this.getScaleSet();
          const notes = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
          for (let octave = 3; octave <= 5; octave++) {
            for (let i = 0; i < 12; i++) {
              const isBlack = notes[i].includes('#') || notes[i].includes('b');
              const pc = i; // pitch class 0-11
              const key = document.createElement('div');
              let cls = `piano-key ${isBlack ? 'piano-key-black' : 'piano-key-white'}`;
              if (pc === tonic) cls += ' key-root';
              else if (scaleSet.has(pc)) cls += ' key-in-scale';
              key.className = cls;
              const label = document.createElement('span');
              label.className = 'key-label';
              label.textContent = notes[i];
              key.appendChild(label);
              const midi = (octave * 12) + i + 12;
              let activeNode = null;
              const play = (e) => {
                if (e.type === 'touchstart') e.preventDefault();
                key.classList.add('active');
                if (activeNode) activeNode.stop();
                activeNode = AudioEngine.playPianoNote(AudioEngine.midiToFreq(midi), 0.6);
              };
              const stop = (e) => {
                if (e.type === 'touchend') e.preventDefault();
                key.classList.remove('active');
              };
              key.addEventListener('mousedown', play);
              key.addEventListener('touchstart', play, { passive: false });
              key.addEventListener('mouseup', stop);
              key.addEventListener('mouseleave', stop);
              key.addEventListener('touchend', stop);
              keyboard.appendChild(key);
            }
          }
          if (!this._pianoScrolled) {
            this._pianoScrolled = true;
            setTimeout(() => {
              const container = document.querySelector('.piano-container');
              if (container && keyboard.scrollWidth > container.clientWidth) {
                container.scrollLeft = (keyboard.scrollWidth - container.clientWidth) / 2;
              }
            }, 80);
          }
        },
        renderFretboard(instrument) {
          const tunings = {
            guitar: {
              strings: [{ n: 'e', f: 329.63, m: 64 }, { n: 'B', f: 246.94, m: 59 }, { n: 'G', f: 196.00, m: 55 }, { n: 'D', f: 146.83, m: 50 }, { n: 'A', f: 110.00, m: 45 }, { n: 'E', f: 82.41, m: 40 }],
              gauges: [1.2, 1.8, 2.3, 2.9, 3.4, 4.0],
              woundIdx: 3
            },
            bass: {
              strings: [{ n: 'G', f: 98.00, m: 43 }, { n: 'D', f: 73.42, m: 38 }, { n: 'A', f: 55.00, m: 33 }, { n: 'E', f: 41.20, m: 28 }],
              gauges: [3.2, 4.0, 5.0, 6.2],
              woundIdx: 0
            },
            bass5: {
              strings: [{ n: 'G', f: 98.00, m: 43 }, { n: 'D', f: 73.42, m: 38 }, { n: 'A', f: 55.00, m: 33 }, { n: 'E', f: 41.20, m: 28 }, { n: 'B', f: 30.87, m: 23 }],
              gauges: [3.2, 4.0, 5.0, 6.2, 7.5],
              woundIdx: 0
            },
            ukulele: {
              strings: [{ n: 'A', f: 440.00, m: 69 }, { n: 'E', f: 329.63, m: 64 }, { n: 'C', f: 261.63, m: 60 }, { n: 'G', f: 392.00, m: 67 }],
              gauges: [1.3, 1.7, 2.2, 1.5],
              woundIdx: 4
            }
          };
          const grid = UIManager.dom.fretboardGrid; if (!grid) return; grid.innerHTML = '';
          const tuningData = tunings[instrument] || tunings.guitar;
          const strings = tuningData.strings;
          const totalStrings = strings.length;
          const midRow = Math.floor((totalStrings - 1) / 2);

          const refBtns = UIManager.dom.tunerReferenceButtons;
          if (refBtns) {
            refBtns.innerHTML = '';
            [...strings].reverse().forEach(note => {
              const btn = document.createElement('button');
              btn.className = 'button secondary';
              btn.type = 'button';
              btn.title = note.n;
              btn.textContent = note.n;
              let refNode = null;
              const play = (e) => {
                if (e.cancelable) e.preventDefault();
                if (refNode) refNode.stop();
                refNode = AudioEngine.playGuitarNote(note.f, 0.8);
                btn.classList.add('active');
              };
              const stop = (e) => {
                if (e.cancelable) e.preventDefault();
                btn.classList.remove('active');
              };
              btn.addEventListener('mousedown', play);
              btn.addEventListener('touchstart', play, { passive: false });
              btn.addEventListener('mouseup', stop);
              btn.addEventListener('mouseleave', stop);
              btn.addEventListener('touchend', stop);
              refBtns.appendChild(btn);
            });
          }

          const { tonic, scaleSet } = this.getScaleSet();
          strings.forEach((stringData, stringIdx) => {
            const row = document.createElement('div');
            row.className = 'fret-string';
            const gauge = tuningData.gauges[stringIdx] || 2.0;
            const isWound = stringIdx >= tuningData.woundIdx;
            row.style.setProperty('--string-gauge', gauge + 'px');
            row.style.setProperty('--string-color', isWound ? 'linear-gradient(to bottom, #d8ba72, #9a803c, #5c4c1e)' : 'linear-gradient(to bottom, #fcfcfc, #c0c0c0, #727272)');

            for (let fret = 0; fret <= 15; fret++) {
              const cell = document.createElement('div');
              const pc = (stringData.m + fret) % 12;
              cell.className = 'fret-cell' + (pc === tonic ? ' fret-root' : scaleSet.has(pc) ? ' fret-in-scale' : '');
              if (fret === 0) {
                cell.style.flex = "0 0 44px";
                cell.style.width = "44px";
              } else {
                const ratio = Math.pow(0.944, fret - 1).toFixed(4);
                cell.style.flex = `${ratio} 1 0px`;
              }

              if (stringIdx === midRow && [3, 5, 7, 9, 15].includes(fret)) {
                const dot = document.createElement('div');
                dot.className = 'fret-dot';
                cell.appendChild(dot);
              } else if (stringIdx === midRow && fret === 12) {
                const dot1 = document.createElement('div');
                dot1.className = 'fret-dot';
                dot1.style.top = '-9px';
                const dot2 = document.createElement('div');
                dot2.className = 'fret-dot';
                dot2.style.bottom = '-9px';
                cell.appendChild(dot1);
                cell.appendChild(dot2);
              }

              const midi = stringData.m + fret;
              const marker = document.createElement('div');
              marker.className = 'fret-note-marker';
              marker.textContent = FLAT_NOTES[midi % 12];
              cell.appendChild(marker);

              let activeNode = null;
              const play = (e) => {
                if (e.type === 'touchstart') e.preventDefault();
                if (activeNode) activeNode.stop();
                activeNode = AudioEngine.playGuitarNote(AudioEngine.midiToFreq(midi), 0.8);
                cell.classList.add('active');
              };
              const stop = (e) => {
                if (e.type === 'touchend') e.preventDefault();
                cell.classList.remove('active');
              };
              cell.addEventListener('mousedown', play);
              cell.addEventListener('touchstart', play, { passive: false });
              cell.addEventListener('mouseup', stop);
              cell.addEventListener('mouseleave', stop);
              cell.addEventListener('touchend', stop);
              row.appendChild(cell);
            }
            grid.appendChild(row);
          });
        }
      };

      const Tuner = {
        active: false, stream: null, timer: null, smoothedCents: null,
        async toggle() {
          if (this.active) { this.stop(); return; }
          try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); AudioEngine.init();
            const source = AudioEngine.ctx.createMediaStreamSource(this.stream); const analyser = AudioEngine.ctx.createAnalyser();
            analyser.fftSize = 2048; source.connect(analyser); this.active = true;
            UIManager.dom.micTunerBtn.innerHTML = '<span data-inline-icon="music" style="margin-right:6px;"></span> Stop Microphone Tuner'; UIManager.dom.micTunerBtn.classList.replace("secondary", "danger"); UIManager.dom.tunerDisplay.style.display = "block"; Icon.decorateAll(UIManager.dom.micTunerBtn);
            const buffer = new Float32Array(analyser.fftSize);
            const update = () => {
              if (!this.active) return; analyser.getFloatTimeDomainData(buffer); const pitch = this.autoCorrelate(buffer, AudioEngine.ctx.sampleRate); this.updateUI(pitch); this.timer = requestAnimationFrame(update);
            };
            update();
          } catch (e) { UIManager.toast("Microphone access denied."); }
        },
        stop() {
          this.active = false; cancelAnimationFrame(this.timer); if (this.stream) this.stream.getTracks().forEach(t => t.stop());
          this.smoothedCents = null;
          UIManager.dom.micTunerBtn.innerHTML = '<span data-inline-icon="music" style="margin-right:6px;"></span> Start Microphone Tuner'; UIManager.dom.micTunerBtn.classList.replace("danger", "secondary"); UIManager.dom.tunerDisplay.style.display = "none"; Icon.decorateAll(UIManager.dom.micTunerBtn);
        },
        autoCorrelate(buf, sampleRate) {
          let SIZE = buf.length, rms = 0; for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]; if (Math.sqrt(rms / SIZE) < 0.01) return -1;
          let r1 = 0, r2 = SIZE - 1, thres = 0.2; for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; } for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
          buf = buf.slice(r1, r2); SIZE = buf.length; let c = new Array(SIZE).fill(0);
          for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];
          let d = 0; while (c[d] > c[d + 1]) d++; let maxval = -1, maxpos = -1;
          for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
          let T0 = maxpos, x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1]; let a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2; if (a) T0 = T0 - b / (2 * a);
          return sampleRate / T0;
        },
        updateUI(pitch) {
          if (pitch === -1) { this.smoothedCents = null; UIManager.dom.tunerNote.textContent = "--"; UIManager.dom.tunerCents.textContent = "Waiting..."; return; }
          const noteNum = 12 * (Math.log(pitch / 440) / Math.log(2)); const midi = Math.round(noteNum) + 69; const expectedFreq = 440 * Math.pow(2, (midi - 69) / 12); const rawCents = 1200 * Math.log(pitch / expectedFreq) / Math.log(2);
          if (this.smoothedCents === null) this.smoothedCents = rawCents; else this.smoothedCents = this.smoothedCents * 0.85 + rawCents * 0.15;
          const cents = Math.round(this.smoothedCents);
          UIManager.dom.tunerNote.textContent = SHARP_NOTES[midi % 12];
          UIManager.dom.tunerCents.textContent = `${cents} cents (${cents < -5 ? 'Flat' : cents > 5 ? 'Sharp' : 'In Tune'})`;
          UIManager.dom.tunerNeedle.style.left = `calc(50% + ${Util.clamp(cents, -50, 50)}%)`; UIManager.dom.tunerNeedle.style.backgroundColor = Math.abs(cents) < 5 ? "var(--accent-2)" : "var(--accent)";
        }
      };

      const ScrollManager = {
        frame: 0, lastTime: 0, running: false, target: "presentation",
        start(target) { if (this.running) return; this.target = target || "presentation"; this.running = true; this.lastTime = performance.now(); UIManager.updateScrollControls(); this.frame = requestAnimationFrame(this.tick.bind(this)); },
        stop() { this.running = false; cancelAnimationFrame(this.frame); UIManager.updateScrollControls(); },
        toggle(target) { if (this.running && this.target === target) this.stop(); else { this.stop(); this.start(target); } },
        tick(time) { if (!this.running) return; const stage = UIManager.dom.presentationStage; if (!stage) { this.stop(); return; } const delta = Math.min(64, time - this.lastTime) / 1000; this.lastTime = time; stage.scrollTop += (StateManager.state.settings.autoScrollSpeed || 30) * delta; if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2) { this.stop(); return; } this.frame = requestAnimationFrame(this.tick.bind(this)); }
      };

      const MetronomeManager = {
        timer: 0, running: false, beatIndex: 0, tapTimes: [],
        start() { if (this.running) return; this.running = true; this.beatIndex = 0; this.tick(); this.timer = window.setInterval(() => this.tick(), this.intervalMs()); this.updateUi(); UIManager.toast("Metronome started (" + StateManager.state.settings.metronomeBpm + " BPM)"); },
        stop() { this.running = false; window.clearInterval(this.timer); this.beatIndex = 0; this.updateUi(); UIManager.toast("Metronome stopped"); },
        toggle() { this.running ? this.stop() : this.start(); },
        setBpm(value) { StateManager.state.settings.metronomeBpm = Util.clamp(value, 30, 500); if (this.running) { window.clearInterval(this.timer); this.timer = window.setInterval(() => this.tick(), this.intervalMs()); } StateManager.saveNow("Metronome saved"); this.updateUi(); },
        setBeats(value) { StateManager.state.settings.metronomeBeats = Util.clamp(value, 2, 7); this.beatIndex = 0; StateManager.saveNow("Metronome saved"); this.renderBeats(); this.updateUi(); UIManager.toast(value + "/4 Time Signature"); },
        tap() { const now = performance.now(); this.tapTimes = this.tapTimes.filter(t => now - t < 3000); this.tapTimes.push(now); if (this.tapTimes.length >= 2) { const intervals = []; for (let i = 1; i < this.tapTimes.length; i++) intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]); const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length; const newBpm = Math.round(60000 / avg); this.setBpm(newBpm); UIManager.toast("Tap Tempo: " + newBpm + " BPM"); } else this.flashBeat(0); },
        intervalMs() { return 60000 / Util.clamp(StateManager.state.settings.metronomeBpm, 30, 500); },
        tick() { const beats = Util.clamp(StateManager.state.settings.metronomeBeats, 2, 7); const current = this.beatIndex % beats; AudioEngine.playMetronome(current === 0); this.flashBeat(current); this.beatIndex = (this.beatIndex + 1) % beats; },
        renderBeats() { const beats = Util.clamp(StateManager.state.settings.metronomeBeats, 2, 7);[UIManager.dom.beatRow, UIManager.dom.presBeatRow].forEach(row => { if (!row) return; row.textContent = ""; row.style.gridTemplateColumns = "repeat(" + beats + ", minmax(0, 1fr))"; for (let i = 0; i < beats; i++) row.appendChild(Object.assign(document.createElement("span"), { className: "beat-dot" })); }); },
        flashBeat(index) { [UIManager.dom.beatRow, UIManager.dom.presBeatRow].forEach(row => { if (!row) return; Array.from(row.children || []).forEach((dot, i) => { dot.classList.toggle("active", i === index); dot.classList.toggle("downbeat", i === index && index === 0); }); window.setTimeout(() => { Array.from(row.children || []).forEach(dot => { dot.classList.remove("active", "downbeat"); }); }, 105); }); },
        updateUi() { const s = StateManager.state.settings; if (UIManager.dom.metronomeBpmRange) UIManager.dom.metronomeBpmRange.value = s.metronomeBpm; if (UIManager.dom.metronomeBpmInput) UIManager.dom.metronomeBpmInput.value = s.metronomeBpm; if (UIManager.dom.metronomeBeats) UIManager.dom.metronomeBeats.value = s.metronomeBeats; if (UIManager.dom.metronomeStatus) UIManager.dom.metronomeStatus.textContent = this.running ? s.metronomeBpm + " BPM" : "Stopped"; if (UIManager.dom.metronomeToggle) Icon.set(UIManager.dom.metronomeToggle, this.running ? "pause" : "play", this.running ? "Stop" : "Start", false); if (UIManager.dom.presMetronomeToggle) Icon.set(UIManager.dom.presMetronomeToggle, this.running ? "pause" : "metronome", this.running ? "Stop" : "Metronome", true); }
      };

      const PresentationManager = {
        idleTimer: null, themes: ["stage", "dark", "light"], themeIndex: 0,
        open() { const song = StateManager.activeSong(); if (!song) return; UIManager.dom.presentationTitle.textContent = Util.titleOf(song); UIManager.dom.presentationText.innerHTML = UIManager.previewText(song, KeyDetector.activeKey(song, StateManager.state.detectedKey), false); UIManager.dom.presentation.hidden = false; UIManager.dom.presentationStage.scrollTop = 0; this.applySettings(); this.startIdleTimer(); const req = UIManager.dom.presentation.requestFullscreen || UIManager.dom.presentation.webkitRequestFullscreen; if (req) { try { const res = req.call(UIManager.dom.presentation); if (res && typeof res.catch === "function") res.catch(() => { }); } catch (e) { } } },
        close() { ScrollManager.stop(); UIManager.dom.presentation.hidden = true; clearTimeout(this.idleTimer); UIManager.dom.presentation.classList.remove("idle"); if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(() => { }); } },
        changeFont(delta) { StateManager.state.settings.presentationFontSize = Util.clamp(StateManager.state.settings.presentationFontSize + delta, 16, 140); this.applySettings(); StateManager.saveNow("Font saved"); UIManager.toast("Font Size: " + StateManager.state.settings.presentationFontSize + "px"); },
        setOrientation(value) { StateManager.state.settings.presentationOrientation = value; this.applySettings(); StateManager.saveNow("Orientation saved"); },
        cycleTheme() { this.themeIndex = (this.themeIndex + 1) % this.themes.length; UIManager.dom.presentation.dataset.presTheme = this.themes[this.themeIndex]; UIManager.toast("Theme: " + this.themes[this.themeIndex].charAt(0).toUpperCase() + this.themes[this.themeIndex].slice(1)); },
        applySettings() { const s = StateManager.state.settings; document.documentElement.style.setProperty("--presentation-font", s.presentationFontSize + "px"); UIManager.dom.presentationOrientation.value = s.presentationOrientation; UIManager.dom.presentation.classList.toggle("orientation-portrait", s.presentationOrientation === "portrait"); UIManager.dom.presentation.classList.toggle("orientation-landscape", s.presentationOrientation === "landscape"); },
        startIdleTimer() { clearTimeout(this.idleTimer); UIManager.dom.presentation.classList.remove("idle"); this.idleTimer = setTimeout(() => { UIManager.dom.presentation.classList.add("idle"); }, 3000); }
      };

      const ExportManager = {
        wrapLines(text, cols, isLandscape) { const limits = isLandscape ? { 1: 120, 2: 55, 3: 35 } : { 1: 90, 2: 42, 3: 26 }; const limit = limits[cols] || limits[1]; const result = []; text.split('\n').forEach(line => { if (!line) { result.push(""); return; } let rem = line; while (rem.length > 0) { result.push(rem.substring(0, limit)); rem = rem.substring(limit); } }); return result; },
        setlistPayloads() {
          if (StateManager.state.activeSetlist.id) {
            const set = StateManager.state.setlists.find(s => s.id === StateManager.state.activeSetlist.id);
            if (set && set.items.length) {
              return set.items.map(item => this.buildPayload(StateManager.state.songs.find(s => s.id === item.songId), StateManager.state.capo));
            }
          }
          return [this.buildPayload(StateManager.activeSong(), StateManager.state.capo)];
        },
        buildPayload(song, capo) {
          if (!song) return { title: "Untitled", artist: "", links: [], creator: "", body: "", rawBody: "", chordLineIndices: new Set(), text: "", bpm: "120", keyInfo: "Unknown", modeName: "Song", capo: 0 };
          const activeKey = KeyDetector.activeKey(song, StateManager.state.detectedKey);
          const exportBody = UIManager.previewText(song, activeKey, true);
          const originalLines = song.body.split('\n'); const chordLineIndices = new Set();
          originalLines.forEach((l, i) => { if (ChordParser.isChordLine(l)) chordLineIndices.add(i); });

          let modeName = "Standard Chart"; if (StateManager.state.previewMode === "transposed") modeName = "Transposed Chart"; if (StateManager.state.previewMode === "roman") modeName = "Roman Numerals"; if (StateManager.state.previewMode === "nashville") modeName = "Nashville Numbers"; if (StateManager.state.previewMode === "lyrics") modeName = "Lyrics Only"; if (capo > 0 && StateManager.state.previewMode !== 'original' && StateManager.state.previewMode !== 'lyrics') modeName += ` (Capo ${capo})`;
          let textBase = Util.titleOf(song) + (capo > 0 && StateManager.state.previewMode !== 'lyrics' ? ` [Capo ${capo}]` : "") + "\n"; if (song.artist) textBase += `By: ${song.artist}\n`; if (song.creator) textBase += `Arranged by: ${song.creator}\n`; if (song.links?.length) song.links.forEach(l => textBase += `Ref [${l.name}]: ${l.url}\n`); textBase += "\n" + exportBody;
          return { title: Util.titleOf(song), artist: song.artist || "", links: song.links || [], creator: song.creator || "", body: exportBody, rawBody: song.body, chordLineIndices, text: textBase, bpm: StateManager.state.settings.metronomeBpm, keyInfo: activeKey.name || "Unknown", modeName: modeName, capo: capo };
        },
        exportTxt() { const p = this.setlistPayloads()[0]; Util.download(Util.slug(p.title) + ".txt", "text/plain;charset=utf-8", p.text); UIManager.toast("TXT exported"); },
        exportPng() { const p = this.setlistPayloads()[0]; Util.download(Util.slug(p.title) + ".png", "image/png", this.renderPng(p)); UIManager.toast("PNG exported"); },
        renderPng(payload) {
          const columns = parseInt(UIManager.dom.exportColumns.value, 10) || 1;
          const orientation = UIManager.dom.exportOrientation.value;
          const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
          const style = getComputedStyle(document.documentElement);
          const bgColor = style.getPropertyValue('--bg').trim() || "#f6f7f9";
          const surfaceColor = style.getPropertyValue('--surface').trim() || "#ffffff";
          const textColor = style.getPropertyValue('--text').trim() || "#16181d";
          const mutedColor = style.getPropertyValue('--muted').trim() || "#667085";
          const lineColor = style.getPropertyValue('--line').trim() || "#d8dde6";
          const accentColor = style.getPropertyValue('--accent').trim() || "#1967d2";
          const fontFamily = style.getPropertyValue('--chart-font').trim() || "monospace";
          const uiFont = style.getPropertyValue('--ui-font').trim() || "sans-serif";
          const textSize = parseInt(StateManager.state.settings.editorFontSize, 10) || 14;
          const lineHeight = textSize * 1.6;
          const padding = 40;
          const hasArtist = Boolean(payload.artist);
          const headerHeight = hasArtist ? 136 : 116;
          const footerHeight = 64;

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = `${textSize}px ${fontFamily}`;

          // Filter out duplicate top title line if identical to payload.title
          const rawLines = payload.body.split('\n');
          let cleanLines = [];
          let skippedFirstHeader = false;
          for (let idx = 0; idx < rawLines.length; idx++) {
            const l = rawLines[idx];
            if (!skippedFirstHeader && l.trim().startsWith('# ') && l.trim().substring(2).trim().toLowerCase() === payload.title.trim().toLowerCase()) {
              skippedFirstHeader = true;
              continue;
            }
            cleanLines.push({ text: l, origIdx: idx });
          }

          let wrappedLines = [];
          let originIndexMap = [];
          cleanLines.forEach((item) => {
            const limits = orientation === 'landscape' ? { 1: 120, 2: 55, 3: 35 } : { 1: 90, 2: 42, 3: 26 };
            const limit = limits[columns] || limits[1];
            const line = item.text;
            if (!line) {
              wrappedLines.push("");
              originIndexMap.push(item.origIdx);
              return;
            }
            let rem = line;
            while (rem.length > 0) {
              wrappedLines.push(rem.substring(0, limit));
              originIndexMap.push(item.origIdx);
              rem = rem.substring(limit);
            }
          });

          let maxLineWidth = 0;
          wrappedLines.forEach(l => {
            maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l || " ").width);
          });

          // Measure title to avoid header overflow
          ctx.font = `700 28px ${uiFont}`;
          const titleMeasurement = ctx.measureText(payload.title).width;
          const qrBoxSize = 60;
          const minHeaderWidth = Math.max(580, titleMeasurement + (padding * 2) + 60 + qrBoxSize + 40);
          const columnWidth = Math.max(380, maxLineWidth + 36);
          const linesPerColumn = Math.ceil(wrappedLines.length / columns);
          const contentWidth = (columnWidth * columns) - (columns > 1 ? 16 : 0);
          const width = Math.max(minHeaderWidth, (padding * 2) + contentWidth);
          const height = headerHeight + footerHeight + (linesPerColumn * lineHeight) + padding;

          canvas.width = width * scale;
          canvas.height = height * scale;
          ctx.scale(scale, scale);

          // Background & Header Surface
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = surfaceColor;
          ctx.fillRect(0, 0, width, headerHeight);
          ctx.fillStyle = lineColor;
          ctx.fillRect(0, headerHeight, width, 1);

          // Draw Official Logo
          const logoSize = 42;
          const logoX = padding;
          const logoY = 26;
          const brandImg = document.querySelector('.brand-logo');
          let drawnLogo = false;
          if (brandImg && brandImg.complete && brandImg.naturalWidth > 0) {
            try {
              ctx.save();
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(logoX, logoY, logoSize, logoSize, 9);
              else ctx.rect(logoX, logoY, logoSize, logoSize);
              ctx.clip();
              ctx.drawImage(brandImg, logoX, logoY, logoSize, logoSize);
              ctx.restore();
              drawnLogo = true;
            } catch (e) { drawnLogo = false; }
          }
          if (!drawnLogo) {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(logoX, logoY, logoSize, logoSize, 9);
            else ctx.rect(logoX, logoY, logoSize, logoSize);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = `800 20px ${uiFont}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("S", logoX + (logoSize / 2), logoY + (logoSize / 2));
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
          }

          // Draw QR Code in Header Right
          const qrX = width - padding - qrBoxSize;
          const qrY = 22;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(qrX, qrY, qrBoxSize, qrBoxSize, 8);
          else ctx.rect(qrX, qrY, qrBoxSize, qrBoxSize);
          ctx.fill();
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Render QR pattern
          Util.drawSimpleQrPattern(ctx, qrX + 5, qrY + 5, qrBoxSize - 10);

          ctx.fillStyle = mutedColor;
          ctx.font = `600 9px ${uiFont}`;
          ctx.textAlign = "center";
          ctx.fillText("Scan Chart", qrX + (qrBoxSize / 2), qrY + qrBoxSize + 14);
          ctx.textAlign = "left";

          // Title with dynamic scaling to fit (never overlaps QR code or logo)
          let titleSize = 28;
          ctx.font = `700 ${titleSize}px ${uiFont}`;
          const maxTitleArea = width - (padding * 2) - logoSize - qrBoxSize - 40;
          while (ctx.measureText(payload.title).width > maxTitleArea && titleSize > 18) {
            titleSize -= 2;
            ctx.font = `700 ${titleSize}px ${uiFont}`;
          }
          ctx.fillStyle = textColor;
          ctx.fillText(payload.title, padding + logoSize + 14, 56);

          // Metadata rows
          let yOffset = 84;
          if (hasArtist) {
            ctx.font = `600 15px ${uiFont}`;
            ctx.fillStyle = mutedColor;
            ctx.fillText(`By ${payload.artist}`, padding, yOffset);
            yOffset += 24;
          }
          ctx.font = `600 13px ${uiFont}`;
          ctx.fillStyle = mutedColor;
          ctx.fillText(`Key: ${payload.keyInfo}   •   BPM: ${payload.bpm}   •   Layout: ${payload.modeName}`, padding, yOffset);

          // Song body lines
          ctx.font = `${textSize}px ${fontFamily}`;
          wrappedLines.forEach((line, i) => {
            const x = padding + (Math.floor(i / linesPerColumn) * columnWidth);
            const y = headerHeight + padding + ((i % linesPerColumn) * lineHeight) + (textSize * 0.8);
            if (line.startsWith('---')) {
              ctx.beginPath();
              ctx.moveTo(x, y - (lineHeight / 2));
              ctx.lineTo(x + columnWidth - 20, y - (lineHeight / 2));
              ctx.strokeStyle = lineColor;
              ctx.stroke();
            } else if (line.startsWith('# ')) {
              ctx.fillStyle = accentColor;
              ctx.font = `bold ${textSize * 1.25}px ${uiFont}`;
              ctx.fillText(line.substring(2), x, y);
              ctx.font = `${textSize}px ${fontFamily}`;
              ctx.fillStyle = textColor;
            } else if (line.startsWith('## ')) {
              ctx.fillStyle = textColor;
              ctx.font = `bold ${textSize * 1.08}px ${uiFont}`;
              ctx.fillText(line.substring(3), x, y);
              ctx.font = `${textSize}px ${fontFamily}`;
              ctx.fillStyle = textColor;
            } else if (line.startsWith('> ') || line.startsWith('// ')) {
              ctx.fillStyle = mutedColor;
              ctx.font = `italic ${textSize * 0.9}px ${uiFont}`;
              ctx.fillText(line.substring(2), x, y);
              ctx.font = `${textSize}px ${fontFamily}`;
              ctx.fillStyle = textColor;
            } else if (payload.chordLineIndices.has(originIndexMap[i]) && StateManager.state.previewMode !== 'lyrics') {
              ctx.fillStyle = accentColor;
              ctx.font = `bold ${textSize}px ${fontFamily}`;
              ctx.fillText(line || "", x, y);
              ctx.font = `${textSize}px ${fontFamily}`;
              ctx.fillStyle = textColor;
            } else if (line.includes('[') && line.includes(']') && StateManager.state.previewMode !== 'lyrics') {
              const parts = line.split(/(\[[^\]]+\])/g);
              let currentX = x;
              parts.forEach(part => {
                if (!part) return;
                if (part.startsWith('[') && part.endsWith(']')) {
                  ctx.fillStyle = accentColor;
                  ctx.font = `bold ${textSize}px ${fontFamily}`;
                  ctx.fillText(part, currentX, y);
                  currentX += ctx.measureText(part).width;
                } else {
                  ctx.fillStyle = textColor;
                  ctx.font = `${textSize}px ${fontFamily}`;
                  ctx.fillText(part, currentX, y);
                  currentX += ctx.measureText(part).width;
                }
              });
            } else {
              ctx.fillStyle = textColor;
              ctx.font = `${textSize}px ${fontFamily}`;
              ctx.fillText(line || "", x, y);
            }
          });

          // Footer with smart wrapping
          ctx.fillStyle = mutedColor;
          ctx.font = `12px ${uiFont}`;
          ctx.textAlign = "center";
          let footerParts = ["Generated with Sonata Master"];
          if (payload.creator) footerParts.push(`Arranged by: ${payload.creator}`);
          if (payload.links?.length) footerParts.push(`Ref: ${payload.links[0].url}`);
          const fullFooter = footerParts.join("   •   ");
          if (ctx.measureText(fullFooter).width > (width - (padding * 2))) {
            ctx.fillText(footerParts[0] + (footerParts[1] ? "   •   " + footerParts[1] : ""), width / 2, height - 32);
            if (footerParts[2]) ctx.fillText(footerParts[2], width / 2, height - 16);
          } else {
            ctx.fillText(fullFooter, width / 2, height - 24);
          }

          const byteString = atob(canvas.toDataURL("image/png").split(",")[1]);
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
          return new Blob([bytes], { type: "image/png" });
        },
        exportPdf() { const payloads = this.setlistPayloads(); const name = payloads.length > 1 ? (StateManager.state.setlists.find(s => s.id === StateManager.state.activeSetlist.id)?.title || 'Setlist') : payloads[0].title; Util.download(Util.slug(name) + ".pdf", "application/pdf", this.createPdf(payloads)); UIManager.toast("PDF exported"); },
        createPdf(payloads) {
          const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || "#1967d2";
          let r = 0, g = 0.35, b = 0.82;
          try {
            let h = accentHex;
            if (h.startsWith('#')) h = h.substring(1);
            if (h.length === 3) h = h.split('').map(x => x + x).join('');
            const num = parseInt(h, 16);
            r = ((num >> 16) & 255) / 255;
            g = ((num >> 8) & 255) / 255;
            b = (num & 255) / 255;
          } catch (e) { }

          const columns = parseInt(UIManager.dom.exportColumns.value, 10) || 1;
          const orientation = UIManager.dom.exportOrientation.value;
          const pageWidth = orientation === "landscape" ? 792 : 612;
          const pageHeight = orientation === "landscape" ? 612 : 792;
          const margin = 44;
          const colGap = columns > 1 ? 20 : 0;
          const usableWidth = pageWidth - (margin * 2) - ((columns - 1) * colGap);
          const columnWidth = usableWidth / columns;

          const fontSize = columns === 3 ? 9 : 10;
          const charWidth = fontSize * 0.6;
          const lineHeight = fontSize + 4.5;
          const maxChars = Math.max(12, Math.floor(columnWidth / charWidth));

          const pages = [];
          const pageHeaderData = [];
          let currentPayload = null;
          let ops = [];
          let col = 0;

          const startY = (p) => pageHeight - (p && p.artist ? 104 : 88);
          const bottomY = 58;
          let y = startY(payloads[0]);

          const pushPage = () => {
            pages.push(ops.join("\n"));
            pageHeaderData.push(currentPayload);
            ops = [];
            col = 0;
            y = startY(currentPayload);
          };

          const textLine = (text, x, font, size, r, g, b) => {
            ops.push(`${r} ${g} ${b} rg\nBT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.pdfEscape(text)}) Tj ET`);
            y -= lineHeight;
          };

          const wrapText = (text, limit) => {
            if (!text || text.length <= limit) return [text || ""];
            const res = [];
            let cur = "";
            const tokens = text.split(/(\s+|\[[^\]]+\]|[^\s\[]+)/g).filter(Boolean);
            for (const token of tokens) {
              if ((cur + token).length <= limit) {
                cur += token;
              } else {
                if (cur.length > 0) {
                  res.push(cur);
                  cur = "";
                }
                if (token.length > limit) {
                  let rem = token;
                  while (rem.length > limit) {
                    res.push(rem.substring(0, limit));
                    rem = rem.substring(limit);
                  }
                  cur = rem;
                } else {
                  cur = token.trimStart();
                }
              }
            }
            if (cur.length > 0) res.push(cur);
            return res.length ? res : [""];
          };

          payloads.forEach((payload, index) => {
            if (index > 0 && (ops.length > 0 || col > 0)) {
              pushPage();
            }
            currentPayload = payload;
            y = startY(currentPayload);
            col = 0;

            const lines = (payload.body || "").split('\n');
            const processedLines = [];

            lines.forEach((line, origIdx) => {
              const isChord = payload.chordLineIndices?.has(origIdx) && StateManager.state.previewMode !== 'lyrics';
              const isHeader1 = line.startsWith('# ');
              const isHeader2 = line.startsWith('## ');
              const isDivider = line.startsWith('---');
              const isComment = line.startsWith('> ') || line.startsWith('// ');

              if (!line) {
                processedLines.push({ type: 'empty', text: '', origIdx });
                return;
              }

              if (isDivider) {
                processedLines.push({ type: 'divider', text: line, origIdx });
                return;
              }

              const wrapped = wrapText(line, maxChars);
              wrapped.forEach(wLine => {
                if (isHeader1) {
                  processedLines.push({ type: 'h1', text: wLine.replace(/^#\s*/, ''), origIdx });
                } else if (isHeader2) {
                  processedLines.push({ type: 'h2', text: wLine.replace(/^##\s*/, ''), origIdx });
                } else if (isComment) {
                  processedLines.push({ type: 'comment', text: wLine.replace(/^[>/]{1,2}\s*/, ''), origIdx });
                } else if (isChord) {
                  processedLines.push({ type: 'chord', text: wLine, origIdx });
                } else if (wLine.includes('[') && wLine.includes(']') && StateManager.state.previewMode !== 'lyrics') {
                  processedLines.push({ type: 'inlineChord', text: wLine, origIdx });
                } else {
                  processedLines.push({ type: 'lyric', text: wLine, origIdx });
                }
              });
            });

            processedLines.forEach(item => {
              if (y < bottomY) {
                col++;
                if (col >= columns) {
                  pushPage();
                } else {
                  y = startY(payload);
                }
              }

              const colX = margin + (col * (columnWidth + colGap));

              if (item.type === 'empty') {
                y -= (lineHeight * 0.75);
              } else if (item.type === 'divider') {
                ops.push(`q 0.86 0.88 0.90 RG 1 w ${colX.toFixed(2)} ${(y + 3).toFixed(2)} m ${(colX + columnWidth).toFixed(2)} ${(y + 3).toFixed(2)} l S Q`);
                y -= lineHeight;
              } else if (item.type === 'h1') {
                textLine(item.text, colX, "F3", fontSize + 2, r, g, b);
              } else if (item.type === 'h2') {
                textLine(item.text, colX, "F3", fontSize + 0.5, 0.15, 0.18, 0.22);
              } else if (item.type === 'comment') {
                textLine(item.text, colX, "F2", fontSize - 0.5, 0.45, 0.45, 0.5);
              } else if (item.type === 'chord') {
                textLine(item.text, colX, "F4", fontSize, r, g, b);
              } else if (item.type === 'inlineChord') {
                const parts = item.text.split(/(\[[^\]]+\])/g);
                let currentX = colX;
                parts.forEach(part => {
                  if (!part) return;
                  if (part.startsWith('[') && part.endsWith(']')) {
                    ops.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg\nBT /F4 ${fontSize} Tf ${currentX.toFixed(2)} ${y.toFixed(2)} Td (${this.pdfEscape(part)}) Tj ET`);
                  } else {
                    ops.push(`0 0 0 rg\nBT /F1 ${fontSize} Tf ${currentX.toFixed(2)} ${y.toFixed(2)} Td (${this.pdfEscape(part)}) Tj ET`);
                  }
                  currentX += part.length * charWidth;
                });
                y -= lineHeight;
              } else {
                textLine(item.text, colX, "F1", fontSize, 0, 0, 0);
              }
            });
          });

          if (ops.length > 0 || pages.length === 0) {
            pushPage();
          }

          const objects = [];
          const add = value => { objects.push(value); return objects.length; };
          const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
          const pagesId = add("");
          const fontIds = `<< /F1 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")} 0 R /F2 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")} 0 R /F3 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")} 0 R /F4 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>")} 0 R >>`;
          const pageIds = [];
          const generated = new Date().toLocaleDateString();

          pages.forEach((pageOps, index) => {
            const p = pageHeaderData[index] || payloads[0] || { title: "Chart", keyInfo: "Unknown", bpm: "120", modeName: "Standard" };
            let footerStr = `Page ${index + 1} of ${pages.length}  •  Generated ${generated} by Sonata`;
            if (p.creator) footerStr += `  |  Arr: ${p.creator}`;
            if (p.links?.length) footerStr += `  |  Ref: ${p.links[0].url}`;

            const headerHeight = p.artist ? 88 : 74;
            const headerY = pageHeight - headerHeight;

            let chrome = `q 0.96 0.96 0.98 rg 0 ${headerY} ${pageWidth} ${headerHeight} re f Q\n` +
              `q 0.88 0.90 0.92 RG 1 w 0 ${headerY} m ${pageWidth} ${headerY} l S Q\n` +
              `q ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${margin} ${pageHeight - 38} 24 24 re f Q\n` +
              `q 1 1 1 rg BT /F3 14 Tf ${(margin + 6.5).toFixed(2)} ${(pageHeight - 21.5).toFixed(2)} Td (S) Tj ET Q\n` +
              `0 g BT /F3 18 Tf ${margin + 36} ${pageHeight - 32} Td (${this.pdfEscape(this.pdfTruncate(p.title, 42))}) Tj ET\n`;
            if (p.artist) {
              chrome += `0.38 0.40 0.45 rg BT /F2 10.5 Tf ${margin + 36} ${pageHeight - 50} Td (By: ${this.pdfEscape(this.pdfTruncate(p.artist, 48))}) Tj ET\n` +
                `0.48 0.50 0.55 rg BT /F2 9.5 Tf ${margin + 36} ${pageHeight - 66} Td (Key: ${this.pdfEscape(p.keyInfo)}  |  BPM: ${this.pdfEscape(p.bpm)}  |  Layout: ${this.pdfEscape(p.modeName)}) Tj ET\n`;
            } else {
              chrome += `0.48 0.50 0.55 rg BT /F2 9.5 Tf ${margin + 36} ${pageHeight - 52} Td (Key: ${this.pdfEscape(p.keyInfo)}  |  BPM: ${this.pdfEscape(p.bpm)}  |  Layout: ${this.pdfEscape(p.modeName)}) Tj ET\n`;
            }

            // Top-right QR Code Block in PDF
            const qrBoxX = pageWidth - margin - 46;
            const qrBoxY = pageHeight - 62;
            chrome += `q 1 1 1 rg 0.84 0.86 0.90 RG 0.75 w ${qrBoxX} ${qrBoxY} 44 44 re B Q\n` +
              `q ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg\n` +
              `${qrBoxX + 4} ${qrBoxY + 28} 12 12 re f\n` +
              `${qrBoxX + 28} ${qrBoxY + 28} 12 12 re f\n` +
              `${qrBoxX + 4} ${qrBoxY + 4} 12 12 re f\n` +
              `1 1 1 rg\n` +
              `${qrBoxX + 6} ${qrBoxY + 30} 8 8 re f\n` +
              `${qrBoxX + 30} ${qrBoxY + 30} 8 8 re f\n` +
              `${qrBoxX + 6} ${qrBoxY + 6} 8 8 re f\n` +
              `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg\n` +
              `${qrBoxX + 8} ${qrBoxY + 32} 4 4 re f\n` +
              `${qrBoxX + 32} ${qrBoxY + 32} 4 4 re f\n` +
              `${qrBoxX + 8} ${qrBoxY + 8} 4 4 re f\n` +
              `${qrBoxX + 18} ${qrBoxY + 18} 6 6 re f\n` +
              `${qrBoxX + 26} ${qrBoxY + 12} 8 4 re f\n` +
              `${qrBoxX + 18} ${qrBoxY + 6} 6 6 re f\n` +
              `Q\n` +
              `q 0.45 0.48 0.52 rg BT /F3 6.5 Tf ${qrBoxX + 2} ${qrBoxY - 8} Td (Live Chart QR) Tj ET Q\n`;

            chrome += `q 0.88 0.90 0.92 RG 1 w ${margin} 44 m ${pageWidth - margin} 44 l S Q\n` +
              `0.48 0.50 0.55 rg BT /F2 9 Tf ${margin} 28 Td (${this.pdfEscape(this.pdfTruncate(footerStr, 110))}) Tj ET\n0 g`;

            const content = chrome + "\n0 g\n" + pageOps;
            const contentId = add("<< /Length " + content.length + " >>\nstream\r\n" + content + "\r\nendstream");
            pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font ${fontIds} >> /Contents ${contentId} 0 R >>`));
          });

          objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => id + " 0 R").join(" ")}] >>`;
          objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

          let pdf = "%PDF-1.4\r\n";
          const offsets = [0];
          objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += (index + 1) + " 0 obj\r\n" + object + "\r\nendobj\r\n";
          });
          const xref = pdf.length;
          pdf += "xref\r\n0 " + (objects.length + 1) + "\r\n0000000000 65535 f \r\n";
          offsets.slice(1).forEach(offset => {
            pdf += String(offset).padStart(10, "0") + " 00000 n \r\n";
          });
          pdf += `trailer\r\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\r\nstartxref\r\n${xref}\r\n%%EOF`;
          return new Blob([pdf], { type: "application/pdf" });
        },
        pdfTruncate(text, max) { const value = String(text || ""); return value.length > max ? value.slice(0, Math.max(0, max - 3)) + "..." : value; },
        pdfEscape(text) {
          if (text === null || text === undefined) return "";
          let str = String(text)
            .replace(/♯/g, "#")
            .replace(/♭/g, "b")
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/[–—]/g, "-")
            .replace(/•/g, "*")
            .replace(/…/g, "...")
            .replace(/[\r\n\t]/g, " ")
            .replace(/[^\x20-\x7E]/g, " ");
          return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        },
        print() { const p = this.setlistPayloads()[0]; UIManager.dom.printTitle.textContent = p.title; UIManager.dom.printBody.innerHTML = p.body.replace(/\n/g, '<br>'); UIManager.dom.printFooter.textContent = `Key: ${p.keyInfo} | BPM: ${p.bpm} | Layout: ${p.modeName}`; UIManager.dom.printBody.style.columnCount = parseInt(UIManager.dom.exportColumns.value, 10) || 1; UIManager.dom.printBody.style.columnGap = "40px"; window.setTimeout(() => window.print(), 60); UIManager.toast("Print dialog opened"); },
        async copyText(text) { try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { } try { const helper = document.createElement("textarea"); helper.value = text; helper.style.position = "fixed"; helper.style.opacity = "0"; document.body.appendChild(helper); helper.select(); const success = document.execCommand("copy"); helper.remove(); return success; } catch (e) { return false; } },
        async copy() { const success = await this.copyText(UIManager.dom.previewOutput.innerText || UIManager.dom.previewOutput.textContent); if (success) UIManager.toast("Copied visible chart"); },
        cleanSongData(song) {
          if (!song) return null;
          const title = (song.title || song.t || "").trim() || "Untitled Song";
          const rawBody = song.body !== undefined ? song.body : (song.b || "");
          let cleanBody = "";
          if (typeof rawBody === "string") {
            cleanBody = rawBody
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .split("\n")
              .map(line => line.trimEnd())
              .join("\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          }
          const sData = { t: title, b: cleanBody };
          const key = song.manualKey || song.k;
          if (key && key !== "auto" && key.trim()) sData.k = key.trim();
          const capo = Number(song.capo || song.c);
          if (capo && capo > 0) sData.c = capo;
          const artist = (song.artist || song.a || "").trim();
          if (artist) sData.a = artist;
          const creator = (song.creator || song.cr || "").trim();
          if (creator) sData.cr = creator;
          const desc = (song.description || song.d || "").trim();
          if (desc) sData.d = desc;
          const rawLinks = song.links || song.l || [];
          if (Array.isArray(rawLinks)) {
            const validLinks = rawLinks
              .filter(l => (l.name && l.name.trim()) || (l.url && l.url.trim()))
              .map(l => ({ name: (l.name || "").trim(), url: (l.url || "").trim() }));
            if (validLinks.length > 0) sData.l = validLinks;
          }
          return sData;
        },

        cleanSetlistData(set, songs) {
          const title = (set.title || set.t || "").trim() || "Untitled Setlist";
          const sData = { type: 'set', t: title };
          const desc = (set.description || set.d || "").trim();
          if (desc) sData.d = desc;
          const rawLinks = set.links || set.l || [];
          if (Array.isArray(rawLinks)) {
            const validLinks = rawLinks
              .filter(l => (l.name && l.name.trim()) || (l.url && l.url.trim()))
              .map(l => ({ name: (l.name || "").trim(), url: (l.url || "").trim() }));
            if (validLinks.length > 0) sData.l = validLinks;
          }
          const songList = Array.isArray(songs) ? songs : (Array.isArray(set.s) ? set.s : []);
          sData.s = songList.map(s => this.cleanSongData(s)).filter(Boolean);
          return sData;
        },

        async compressData(obj) {
          let cleanObj = null;
          if (obj && obj.type === 'set') {
            cleanObj = this.cleanSetlistData(obj, obj.s);
          } else {
            cleanObj = this.cleanSongData(obj);
          }
          const str = "v3." + JSON.stringify(cleanObj);
          if (!window.CompressionStream) {
            return encodeURIComponent(btoa(unescape(encodeURIComponent(str))));
          }
          try {
            const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            const buffer = await new Response(stream).arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          } catch (e) {
            console.error("Compression error:", e);
            return encodeURIComponent(btoa(unescape(encodeURIComponent(str))));
          }
        },

        async decompressData(raw) {
          if (!raw) return "";
          try {
            let cleanBase64 = String(raw).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '+');
            while (cleanBase64.length % 4 !== 0) {
              cleanBase64 += '=';
            }
            const binary = atob(cleanBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            let text = '';
            if (window.DecompressionStream) {
              try {
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                text = await new Response(stream).text();
              } catch(e) {
                text = new TextDecoder().decode(bytes);
              }
            } else {
              text = new TextDecoder().decode(bytes);
            }
            return text.startsWith("v3.") ? text.substring(3) : text.startsWith("v2.") ? text.substring(3) : text.startsWith("v1.") ? text.substring(3) : text;
          } catch (e) {
            try {
              const fallback = decodeURIComponent(escape(atob(decodeURIComponent(String(raw)).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '+'))));
              return fallback.startsWith("v3.") ? fallback.substring(3) : fallback.startsWith("v2.") ? fallback.substring(3) : fallback.startsWith("v1.") ? fallback.substring(3) : fallback;
            } catch(err2) {
              console.error("Decompress error:", err2);
              return "";
            }
          }
        },

        drawQrCard(canvas, { titleText, isSet, shareData, directUrl }) {
          canvas.width = 460;
          canvas.height = 600;
          const ctx = canvas.getContext("2d");
          const activeAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || "#1967d2";

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 460, 600);
          ctx.fillStyle = activeAccent;
          ctx.fillRect(0, 0, 460, 100);

          // Draw official logo or emblem in QR card header
          const brandImg = document.querySelector('.brand-logo');
          let drawnHeaderLogo = false;
          if (brandImg && brandImg.complete && brandImg.naturalWidth > 0) {
            try {
              ctx.save();
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(144, 28, 44, 44, 10);
              else ctx.rect(144, 28, 44, 44);
              ctx.clip();
              ctx.drawImage(brandImg, 144, 28, 44, 44);
              ctx.restore();
              drawnHeaderLogo = true;
            } catch(e) {}
          }
          if (!drawnHeaderLogo) {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(144, 30, 40, 40, 10);
            else ctx.rect(144, 30, 40, 40);
            ctx.fill();
            ctx.fillStyle = activeAccent;
            ctx.font = "bold 24px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("S", 164, 52);
          }
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 32px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("Sonata", 198, 50);
          ctx.textBaseline = "alphabetic";
          ctx.textAlign = "center";

          ctx.fillStyle = "#667085";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText((isSet ? "SETLIST" : "SONG"), 230, 140);
          ctx.fillStyle = "#16181d";
          ctx.font = "bold 28px sans-serif";
          ctx.fillText(this.pdfTruncate(titleText, 25), 230, 172);

          if (!isSet && shareData.a) {
            ctx.fillStyle = "#667085";
            ctx.font = "italic 16px sans-serif";
            ctx.fillText("By " + shareData.a, 230, 195);
          } else if (isSet && shareData.s) {
            ctx.fillStyle = "#667085";
            ctx.font = "15px sans-serif";
            ctx.fillText(`${shareData.s.length} Songs included`, 230, 195);
          }

          // 100% Offline Client-Side QR Generation
          const qrDrawn = QRCode.draw(ctx, directUrl, 80, 210, 300, 300, {
            ecc: 'L',
            foreground: '#111827',
            background: '#ffffff',
            margin: 2
          });

          if (!qrDrawn) {
            ctx.fillStyle = "#667085";
            ctx.font = "16px sans-serif";
            ctx.fillText("[ QR Code Unavailable ]", 230, 360);
          }

          if (!isSet) {
            let detailsStr = `Key: ${shareData.k || 'Auto'}`;
            if (shareData.c) detailsStr += `  •  Capo: ${shareData.c}`;
            if (StateManager.state?.settings?.metronomeBpm) detailsStr += `  •  BPM: ${StateManager.state.settings.metronomeBpm}`;
            ctx.fillStyle = "#16181d";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(detailsStr, 230, 532);
          } else if (shareData.s && shareData.s.length > 0) {
            let songNames = shareData.s.map(s => s.t).join("  •  ");
            if (songNames.length > 50) songNames = songNames.substring(0, 47) + "...";
            ctx.fillStyle = "#16181d";
            ctx.font = "13px sans-serif";
            ctx.fillText(songNames, 230, 532);
          }

          ctx.fillStyle = activeAccent;
          ctx.font = "bold 14px sans-serif";
          ctx.fillText("Scan to import securely offline", 230, 565);
        },

        async shortenUrl(url) {
          try {
            const resp = await fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(5000) });
            if (!resp.ok) return null;
            const short = (await resp.text()).trim();
            return (short.startsWith('https://tinyurl.com/') || short.startsWith('http://tinyurl.com/')) ? short : null;
          } catch (e) {
            return null;
          }
        },

        async share(isSetlist = false) {
          let shareData = {}; let titleText = ""; let isSet = isSetlist;

          if (isSet) {
            const set = StateManager.state.setlists.find(s => s.id === StateManager.state.activeSetlist.id);
            if (!set) return;
            titleText = set.title || "Setlist";
            const setSongs = (set.items || []).map(item => StateManager.state.songs.find(s => s.id === item.songId)).filter(Boolean);
            shareData = this.cleanSetlistData(set, setSongs);
          } else {
            const song = StateManager.activeSong();
            if (!song) return;
            titleText = song.title || "Untitled Song";
            shareData = this.cleanSongData(song);
          }

          const compressed = await this.compressData(shareData);
          const directUrl = window.location.origin + window.location.pathname + "?s=" + compressed;
          let shareUrl = directUrl; // will be replaced with short URL once resolved

          UIManager.openModal({
            title: "Share " + (isSet ? "Setlist" : "Song"),
            confirmText: "Copy Link & Close",
            fields: [{ type: "custom", id: "share-content", html: `<div id="shareWrapper" style="display:flex;flex-direction:column;align-items:center;width:100%;"><p style="color:var(--muted);font-size:0.9rem;padding:24px 0;">Generating link...</p></div>` }],
            onConfirm: async () => { if (await this.copyText(shareUrl)) UIManager.toast("Share link copied!"); }
          });

          const wrapper = document.getElementById('shareWrapper');
          if (!wrapper) return;
          wrapper.innerHTML = '';

          // QR always uses full data URL (works offline when scanned)
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "display:block; margin: 0 auto 15px; border-radius: 8px; border: 1px solid var(--line); box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 240px; height: auto;";
          this.drawQrCard(canvas, { titleText, isSet, shareData, directUrl });

          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'button secondary';
          downloadBtn.type = 'button';
          downloadBtn.style.cssText = "width:100%; margin-bottom:12px;";
          downloadBtn.innerHTML = `<span data-inline-icon="image" style="width:16px;height:16px;margin-right:6px;"></span>Download QR Card`;
          downloadBtn.addEventListener('click', () => {
            canvas.toBlob(b => Util.download('Sonata-QR-' + Util.slug(titleText) + '.png', 'image/png', b));
            UIManager.toast("Profile Card Downloaded!");
          });

          const urlInput = document.createElement('input');
          urlInput.className = 'input';
          urlInput.readOnly = true;
          urlInput.value = 'Shortening link...';
          urlInput.style.cssText = "margin-bottom:12px; font-size: 0.85rem; text-align:center; font-weight:600; color:var(--accent);";
          urlInput.addEventListener('click', () => urlInput.select());

          const nativeShare = async () => {
            try {
              if (navigator.share) {
                await navigator.share({
                  title: titleText,
                  text: `Check out this ${isSet ? 'Setlist' : 'Song'}: "${titleText}"`,
                  url: shareUrl
                });
              } else {
                UIManager.toast("Native sharing not supported on this device/browser.");
              }
            } catch (e) { }
          };

          const shareBtn = document.createElement('button');
          shareBtn.className = 'button primary';
          shareBtn.type = 'button';
          shareBtn.style.cssText = "width: 100%; margin-bottom:12px;";
          shareBtn.innerHTML = `<span data-inline-icon="share-native" style="width:18px; height:18px; margin-right:6px;"></span> Share via Messaging / App`;
          shareBtn.addEventListener('click', nativeShare);

          const noteText = document.createElement('p');
          noteText.style.cssText = "font-size:0.75rem; color:var(--muted); text-align:center; margin:4px 0 0;";
          noteText.textContent = "QR works offline. Link shortened with TinyURL.";

          wrapper.append(canvas, downloadBtn, urlInput, shareBtn, noteText);
          Icon.decorateAll(wrapper);

          // Shorten URL in background — swap input value when ready
          this.shortenUrl(directUrl).then(short => {
            shareUrl = short || directUrl;
            urlInput.value = shareUrl;
            if (!short) noteText.textContent = "QR works offline. (Short link unavailable — using direct link)";
          });
        }
      };

      const createLinkManager = (containerId, initialLinks) => {
        let links = JSON.parse(JSON.stringify(initialLinks || []));
        const render = () => {
          const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
          if (links.length === 0) {
            const p = document.createElement('p'); p.style.cssText = "color:var(--muted); font-size:0.8rem; margin:0 0 8px;"; p.textContent = "No references added."; c.appendChild(p);
          } else {
            links.forEach((l, i) => {
              const row = document.createElement('div'); row.style.cssText = "display:flex; gap:6px; margin-bottom:6px;";
              const nameIn = document.createElement('input'); nameIn.className = 'input'; nameIn.style.flex = '1'; nameIn.placeholder = 'Name (e.g. YouTube)'; nameIn.value = l.name;
              nameIn.addEventListener('input', (e) => links[i].name = e.target.value);
              const urlIn = document.createElement('input'); urlIn.className = 'input'; urlIn.style.flex = '2'; urlIn.placeholder = 'URL'; urlIn.value = l.url;
              urlIn.addEventListener('input', (e) => links[i].url = e.target.value);
              const delBtn = document.createElement('button'); delBtn.className = 'button danger'; delBtn.type = 'button'; delBtn.textContent = 'X';
              delBtn.addEventListener('click', () => { links.splice(i, 1); render(); });
              row.append(nameIn, urlIn, delBtn); c.appendChild(row);
            });
          }
        };
        return { getLinks: () => links.filter(l => l.name.trim() || l.url.trim()), render, addLink: () => { links.push({ name: '', url: '' }); render(); } };
      };

      const UIManager = {
        dom: {}, modalAction: null,
        renderLibrarySoon() { SongLibrary.render(); },
        updateAnalysisSoon() { this.updateAnalysis(); },
        cache() { ["brandVersion", "googleSyncButton", "headerInstallBtn", "themeToggle", "settingsButton", "helpButton", "presentationButton", "songSearch", "librarySortSelect", "libraryList", "songTitle", "songBody", "saveSongButton", "undoSongButton", "redoSongButton", "manageLibraryBtn", "scanQrBtn", "sidebarScanQrBtn", "importSharedButton", "infoSongButton", "loadDemoButton", "exitSharedButton", "saveStatus", "wordCount", "detectedKey", "activeKey", "chordCount", "transposeLabel", "keySelect", "capoSelect", "transposeDown", "transposeSelect", "transposeUp", "applyTransposeButton", "resetTransposeButton", "metronomeBpmRange", "metronomeBpmInput", "metronomeDown", "metronomeBeats", "metronomeUp", "beatRow", "metronomeToggle", "tapTempoButton", "metronomeStatus", "previewOutput", "copyLiveChartBtn", "exportOrientation", "exportColumns", "exportTxtButton", "exportPngButton", "exportPdfButton", "printButton", "copyButton", "shareButton", "modalHost", "modalBackdrop", "modalTitle", "modalMessage", "modalFields", "modalCancel", "modalConfirm", "toastHost", "presentation", "presentationTitle", "presentationFontDown", "presentationFontUp", "presentationOrientation", "presentationExit", "presentationStage", "presentationText", "presThemeToggle", "presMetronomeToggle", "presBeatRow", "presScrollToggle", "presScrollSpeed", "presScrollSpeedLabel", "printArea", "printTitle", "printBody", "printFooter", "circleRotateToggle", "circleHighlightToggle", "circleContainer", "fretboardTuning", "fretboardGrid", "theoryKeyInput", "theoryKeyOptions", "pianoKeyboard", "tunerReferenceButtons", "micTunerBtn", "tunerDisplay", "tunerNote", "tunerCents", "tunerNeedle", "setlistNav", "slPrev", "slTitle", "slNext", "slExit", "newSongButton", "langSelect", "langSelectSidebar", "appVersion", "sidebarVersion", "capoLabel", "menuToggleBtn", "sidebarDrawer", "sidebarBackdrop", "sidebarCloseBtn", "sidebarDriveSyncBtn", "sidebarHelpBtn", "sidebarSettingsBtn", "sidebarPresentBtn", "sidebarInstallBtn", "themeToggleMobile", "presentationButtonMobile", "instrumentKeyRoot", "instrumentKeyMode", "sidebarProfileContainer", "sidebarUserAvatar", "sidebarUserGreeting", "topbarProfileContainer", "topbarUserAvatar", "topbarUserGreeting", "mobileUserAvatar"].forEach(id => { const el = document.getElementById(id); if (el) this.dom[id] = el; }); },
        init() { this.cache(); Icon.decorateAll(document); this.populateKeySelect(); this.populateTransposeSelect(); this.bind(); InstrumentManager.init(); if (this.dom.langSelect) { this.dom.langSelect.value = StateManager.state.settings.language || "en"; } this.applyLanguage(); },
        switchView(viewName) {
          const workspace = document.querySelector(".workspace");
          if (workspace) workspace.dataset.view = viewName;
          // Sync active state for all [data-view] buttons (top-nav, mobile-switcher, sidebar)
          document.querySelectorAll("[data-view]").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.view === viewName);
          });
          try { localStorage.setItem('sonata_active_view', viewName); } catch(e) {}
          if (viewName === "theory") InstrumentManager.renderCircle();
          if (viewName === "instruments") {
            InstrumentManager.renderPiano();
            InstrumentManager.renderFretboard(document.getElementById("fretboardTuning")?.value || "guitar");
          }
          // Close sidebar if open
          this.closeSidebar();
        },
        openSidebar() {
          this.dom.sidebarDrawer?.classList.add('open');
          this.dom.sidebarBackdrop?.classList.add('open');
          this.dom.menuToggleBtn?.setAttribute('aria-expanded', 'true');
          document.body.style.overflow = 'hidden';
        },
        closeSidebar() {
          this.dom.sidebarDrawer?.classList.remove('open');
          this.dom.sidebarBackdrop?.classList.remove('open');
          this.dom.menuToggleBtn?.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        },
        applyLanguage() {
          const lang = StateManager.state?.settings?.language || "en";
          const d = I18N_DICTS[lang] || I18N_DICTS.en;
          const add = (el, type, fn) => el?.addEventListener(type, fn);

          const setLabel = (sel, text) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const lbl = el.querySelector(".button-label");
            if (lbl) lbl.textContent = text;
            else el.textContent = text;
          };

          const setText = (sel, text) => {
            const el = document.querySelector(sel);
            if (el) el.textContent = text;
          };

          const setHtml = (sel, html) => {
            const el = document.querySelector(sel);
            if (el) el.innerHTML = html;
          };

          const setPlaceholder = (sel, text) => {
            const el = document.querySelector(sel);
            if (el) el.setAttribute("placeholder", text);
          };

          // Brand & Nav
          setText(".brand-subtitle", d.brandSubtitle);
          setLabel('header .top-nav-btn[data-view="editor"]', d.navEditor);
          setLabel('header .top-nav-btn[data-view="library"]', d.navLibrary);
          setLabel('header .top-nav-btn[data-view="tools"]', d.navTools);
          setLabel('header .top-nav-btn[data-view="theory"]', d.navTheory);
          setLabel('header .top-nav-btn[data-view="instruments"]', d.navPlay);

          setLabel('.mobile-view-switcher .tab-button[data-view="editor"]', d.navMobileEditor);
          setLabel('.mobile-view-switcher .tab-button[data-view="library"]', d.navMobileLibrary);
          setLabel('.mobile-view-switcher .tab-button[data-view="tools"]', d.navMobileTools);
          setLabel('.mobile-view-switcher .tab-button[data-view="theory"]', d.navMobileTheory);
          setLabel('.mobile-view-switcher .tab-button[data-view="instruments"]', d.navMobilePlay);

          setLabel("#helpButton", d.helpBtn);
          setLabel("#settingsButton", d.settingsBtn);
          setLabel("#presentationButton", d.presentBtn);
          setLabel("#googleSyncButton", d.syncBtn);
          setLabel("#headerInstallBtn", d.installBtn);

          // Library
          setHtml(".library-panel .panel-heading h2", `${d.libraryHeading} <button class="help-icon" data-help="library" type="button">?</button>`);
          setLabel("#manageLibraryBtn", d.manageLibraryBtn);
          setLabel("#newSongButton", d.newSongButton);
          setPlaceholder("#songSearch", d.songSearchPlaceholder);
          
          // Sort Options
          const sortSelect = document.getElementById("librarySortSelect");
          if (sortSelect) {
            sortSelect.options[0].text = d.librarySortRecent;
            sortSelect.options[1].text = d.librarySortTitle;
            sortSelect.options[2].text = d.librarySortAuthor;
            sortSelect.options[3].text = d.librarySortArranger;
            sortSelect.options[4].text = d.librarySortKey;
          }

          // Library Filters
          setLabel('.library-panel [data-library-filter="all"]', d.libraryFilterAll);
          setLabel('.library-panel [data-library-filter="favorites"]', d.libraryFilterFav);
          setLabel('.library-panel [data-library-filter="setlists"]', d.libraryFilterSet);

          // Editor Toolbar
          setLabel("#saveSongButton", d.editorSave);
          setLabel("#undoSongButton", d.editorUndo);
          setLabel("#redoSongButton", d.editorRedo);
          setLabel("#importSharedButton", d.editorSaveToLibrary);
          setLabel("#infoSongButton", d.editorDetails);
          setLabel("#loadDemoButton", d.editorDemo);
          setLabel("#exitSharedButton", d.editorClosePreview);

          // Preview mode switcher tabs
          setLabel('.editor-panel [data-preview-mode="original"]', d.editorTabSong);
          setLabel('.editor-panel [data-preview-mode="transposed"]', d.editorTabTransposed);
          setLabel('.editor-panel [data-preview-mode="roman"]', d.editorTabRoman);
          setLabel('.editor-panel [data-preview-mode="nashville"]', d.editorTabNashville);
          setLabel('.editor-panel [data-preview-mode="lyrics"]', d.editorTabLyrics);

          // Editor Panels
          setText(".editor-pane-left .pane-header .pane-tag", d.editorPaneEditor);
          setText(".editor-pane-right .pane-header .pane-tag", d.editorPanePreview);

          // Editor placeholders
          const placeholderContainer = document.querySelector(".editor-placeholder");
          if (placeholderContainer) {
            placeholderContainer.innerHTML = `
              <h3>${d.editorPlaceholderTitle}</h3>
              <p>${d.editorPlaceholderP1}</p>
              <ul>
                <li><code># </code> ${d.editorPlaceholderL1}</li>
                <li><code>## </code> ${d.editorPlaceholderL2}</li>
                <li><code>---</code> ${d.editorPlaceholderL3}</li>
                <li><code>[G]</code> ${d.editorPlaceholderL4}</li>
                <li><code>&gt; </code> ${d.editorPlaceholderL5}</li>
              </ul>
            `;
          }

          // Analysis Panel
          setHtml(".tools-panel .tool-dashboard-card:nth-child(1) .panel-heading h2", `${d.toolsHeading}`);
          // Metrics
          setHtml(".tools-panel .metric:nth-child(1) span", d.toolsMetricDetected);
          setHtml(".tools-panel .metric:nth-child(2) span", d.toolsMetricActive);
          setHtml(".tools-panel .metric:nth-child(3) span", d.toolsMetricChords);
          setHtml(".tools-panel .metric:nth-child(4) span", d.toolsMetricTranspose);
          
          setHtml('.tools-panel label[for="keySelect"]', `${d.toolsKeyOverride} <button class="help-icon" data-help="keyOverride" type="button">?</button>`);
          // For Capo select:
          setHtml('#capoLabel', d.toolsCapo);
          setHtml('.tools-panel label[for="transposeSelect"]', `${d.toolsTransposeSemi} <button class="help-icon" data-help="transpose" type="button">?</button>`);
          
          setLabel("#applyTransposeButton", d.toolsApplyTranspose);
          setLabel("#resetTransposeButton", d.toolsReset);

          // Metronome Panel
          setHtml(".tools-panel .tool-dashboard-card:nth-child(2) .tool-card-header .tool-card-title", `<span data-inline-icon="metronome"></span>${d.metronomeTitle}`);
          setLabel("#metronomeToggle", MetronomeManager.running ? d.metronomeStop : d.metronomeStart);
          setLabel("#tapTempoButton", d.metronomeTap);

          // Export Panel
          setHtml(".tools-panel .tool-dashboard-card:nth-child(3) .panel-heading h2", `${d.exportHeading} <button class="help-icon" data-help="export" type="button">?</button>`);
          setHtml('.tools-panel label[for="exportOrientation"]', d.exportOrientation);
          setHtml('.tools-panel label[for="exportColumns"]', d.exportColumns);
          setLabel("#exportTxtButton", d.exportTxt);
          setLabel("#exportPngButton", d.exportPng);
          setLabel("#exportPdfButton", d.exportPdf);
          setLabel("#printButton", d.exportPrint);
          setLabel("#copyButton", d.exportCopy);
          setLabel("#shareButton", d.exportShare);

          // Theory Panel
          setHtml(".theory-panel .panel-heading h2", d.theoryHeading);
          setHtml('.theory-panel label[for="theoryKeyInput"] span', d.theoryActiveKeyLabel);
          setHtml('.theory-panel label[for="circleRotateToggle"]', d.theoryRotateLabel);
          setHtml('.theory-panel label[for="circleHighlightToggle"]', d.theoryHighlightLabel);
          setHtml(".theory-panel .explanation-text", d.theoryHowItWorks);

          // Instruments Panel
          setHtml(".instrument-panel .panel-heading:nth-of-type(1) h2", `${d.pianoHeading}<button class="help-icon" data-help="piano" type="button">?</button>`);
          setHtml(".instrument-panel .explanation-text:nth-of-type(1)", d.pianoScrollText);
          setHtml(".instrument-panel .panel-heading:nth-of-type(2) h2", `${d.fretboardHeading} <button class="help-icon" data-help="fretboard" type="button">?</button>`);
          setHtml(".instrument-panel .explanation-text:nth-of-type(2)", d.fretboardScrollText);
          setHtml(".instrument-panel .panel-heading:nth-of-type(3) h2", `${d.tunerHeading}<button class="help-icon" data-help="tuner" type="button">?</button>`);
          setHtml(".instrument-panel .tool-card p", d.tunerSubtext);
          setHtml("#micTunerBtn", `<span data-inline-icon="music" style="margin-right:6px;"></span> ${TunerManager.isListening ? d.tunerMicBtnStop : d.tunerMicBtnStart}`);

          // Presentation Panel
          setLabel("#presentationExit", d.presentationExit);
          setLabel("#presScrollToggle", ScrollManager.running ? "pause" : "scroll", ScrollManager.running ? "Pause" : d.presentationScroll, true);
          setHtml(".presentation-controls-bottom span:nth-of-type(1)", d.presentationSpeed);
          
          // Modals
          setText("#modalCancel", d.modalCancel);
          setText("#modalConfirm", d.modalConfirm);

          // Re-decorate icons
          Icon.decorateAll(document);

          // Update help-icon listeners to use localized values
          document.querySelectorAll(".help-icon").forEach(btn => {
            const cloned = btn.cloneNode(true);
            btn.parentNode.replaceChild(cloned, btn);
            add(cloned, 'click', (e) => {
              e.stopPropagation();
              AudioEngine.playClick();
              const key = "help_" + cloned.dataset.help;
              const text = t(key, HELP_TEXTS[cloned.dataset.help]);
              if (text) PopoverManager.show(cloned, text);
            });
          });
        },
        bind() {
          const add = (el, type, fn) => el?.addEventListener(type, fn);
          add(this.dom.themeToggle, "click", () => { AudioEngine.playClick(); StateManager.state.settings.theme = StateManager.state.settings.theme === "dark" ? "light" : "dark"; StateManager.saveNow(t("themeSaved", "Theme saved")); ThemeManager.apply(); this.toast(t("themeUpdated", "Theme updated: ") + StateManager.state.settings.theme); });
          add(this.dom.settingsButton, "click", () => { AudioEngine.playClick(); this.openSettings(); });
          add(this.dom.helpButton, "click", () => {
            AudioEngine.playClick();
            const aboutHtml = t("aboutHtml", `<div style="color:var(--text); font-size:0.88rem; line-height:1.6;"><p><strong>Sonata</strong> comes from Latin <em>sonare</em>, meaning "to sound."</p><p>Created by <strong>Jethro Frane</strong>, Sonata was built to help church musicians collaborate seamlessly and eliminate stage friction.</p><ul style="padding-left:20px; margin-top:0; color:var(--muted); font-size:0.85rem;"><li><strong>100% Offline</strong></li><li><strong>Centralized Hub</strong></li><li><strong>Instant Transposition</strong></li><li><strong>Number Systems</strong></li><li><strong>Zero-Friction Sharing</strong></li><li><strong>Stage Ready</strong></li><li><strong>Robust Exports</strong></li><li><strong>Theory Tools</strong></li></ul><p style="margin-top:16px;font-style:italic;font-weight:700;text-align:center;color:var(--accent);font-size:0.9rem;">"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Cor 10:31</p></div>`);
            const changelogHtml = '<div id="changelogSection" style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px;"><p style="font-weight:700;font-size:0.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Release Notes</p><div id="changelogContent" style="color:var(--muted);font-size:0.82rem;">Loading...</div></div>';
            this.openModal({ title: t("aboutTitle", "About Sonata"), confirmText: t("aboutConfirm", "Close"), fields: [{ type: "custom", html: aboutHtml + changelogHtml }] });
            fetch('update_log.json').then(r => r.json()).then(logs => {
              const el = document.getElementById('changelogContent'); if (!el) return;
              el.innerHTML = logs.map(v => `<details style="margin-bottom:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden;"><summary style="padding:8px 12px;cursor:pointer;font-weight:700;font-size:0.83rem;background:var(--surface-2);color:var(--text);display:flex;justify-content:space-between;list-style:none;"><span>v${v.version}</span><span style="color:var(--muted);font-weight:400;">${v.date}</span></summary><p style="font-style:italic;color:var(--accent);margin:8px 14px 4px;font-size:0.82rem;">${v.whatsNew||''}</p><ul style="padding:0 14px 8px 28px;margin:0;line-height:1.8;">${(v.changes||[]).map(c=>`<li>${c}</li>`).join('')}</ul></details>`).join('');
            }).catch(() => { const el = document.getElementById('changelogContent'); if (el) el.textContent = 'No release notes available offline.'; });
          });
          add(this.dom.presentationButton, "click", () => { AudioEngine.playClick(); PresentationManager.open(); });
          add(this.dom.langSelect, "change", () => { AudioEngine.playClick(); StateManager.state.settings.language = this.dom.langSelect.value; StateManager.saveNow(t("languageSaved", "Language saved")); this.applyLanguage(); });
          
          // Sidebar open/close
          add(this.dom.menuToggleBtn, 'click', () => { AudioEngine.playClick(); this.openSidebar(); });
          add(this.dom.sidebarCloseBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); });
          add(this.dom.sidebarBackdrop, 'click', () => { this.closeSidebar(); });
          add(this.dom.googleSyncButton, "click", () => GoogleDriveSync.performSync());
          add(this.dom.sidebarDriveSyncBtn, "click", () => { this.closeSidebar(); GoogleDriveSync.performSync(); });
          ['topbarUserAvatar', 'sidebarUserAvatar', 'mobileUserAvatar', 'topbarProfileContainer', 'sidebarProfileContainer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) add(el, "click", () => GoogleDriveSync.performSync());
          });
          // Sidebar action buttons (mirror desktop buttons)
          add(this.dom.sidebarDriveSyncBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); this.dom.googleSyncButton?.click(); });
          add(this.dom.sidebarHelpBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); this.dom.helpButton?.click(); });
          add(this.dom.sidebarSettingsBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); this.dom.settingsButton?.click(); });
          add(this.dom.sidebarPresentBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); PresentationManager.open(); });
          add(this.dom.headerInstallBtn, 'click', () => { AudioEngine.playClick(); this.showInstallPrompt(); });
          add(this.dom.sidebarInstallBtn, 'click', () => { AudioEngine.playClick(); this.closeSidebar(); this.showInstallPrompt(); });
          // Mobile topbar quick-action duplicates
          add(this.dom.themeToggleMobile, 'click', () => { this.dom.themeToggle?.click(); });
          add(this.dom.presentationButtonMobile, 'click', () => { AudioEngine.playClick(); PresentationManager.open(); });
          // Sidebar language selector (mirrors #langSelect)
          if (this.dom.langSelectSidebar) {
            this.dom.langSelectSidebar.value = StateManager.state.settings.language || 'en';
            add(this.dom.langSelectSidebar, 'change', () => {
              AudioEngine.playClick();
              StateManager.state.settings.language = this.dom.langSelectSidebar.value;
              if (this.dom.langSelect) this.dom.langSelect.value = this.dom.langSelectSidebar.value;
              StateManager.saveNow(t('languageSaved', 'Language saved'));
              this.applyLanguage();
            });
          }
          document.querySelectorAll("[data-view]").forEach(b => add(b, "click", () => { AudioEngine.playClick(); this.switchView(b.dataset.view); }));
          add(this.dom.copyLiveChartBtn, "click", () => { AudioEngine.playClick(); ExportManager.copy(); });
 
          add(this.dom.saveSongButton, "click", () => { AudioEngine.playClick(); StateManager.saveNow(t("saved", "Saved")); this.toast(t("songSavedToast", "Song saved to Library")); });
          add(this.dom.undoSongButton, "click", () => { AudioEngine.playClick(); Editor.undo(); this.toast(t("undoToast", "Undo")); });
          add(this.dom.redoSongButton, "click", () => { AudioEngine.playClick(); Editor.redo(); this.toast(t("redoToast", "Redo")); });
          add(this.dom.importSharedButton, "click", () => { AudioEngine.playClick(); StateManager.importShared(); Editor.loadActiveSong(); this.renderAll(); this.toast(t("savedToLibraryToast", "Saved to Library")); });
          add(this.dom.exitSharedButton, "click", () => { AudioEngine.playClick(); StateManager.exitShared(); Editor.loadActiveSong(); this.renderAll(); });
          add(this.dom.infoSongButton, "click", () => { AudioEngine.playClick(); this.openSongInfo(); });
          add(this.dom.loadDemoButton, "click", () => {
            AudioEngine.playClick();
            this.openModal({
              title: t("loadDemoTitle", "Load Demo"),
              message: t("loadDemoMessage", "Load demo song? This will replace your current song content."),
              confirmText: t("loadDemoConfirm", "Load Demo"),
              onConfirm: () => {
                StateManager.loadDemo();
                Editor.loadActiveSong();
                this.renderAll();
                this.toast(t("demoLoadedToast", "Demo song loaded"));
              }
            });
          });
          add(this.dom.manageLibraryBtn, "click", () => { AudioEngine.playClick(); this.openManageLibrary(); });
          add(this.dom.scanQrBtn, "click", () => { AudioEngine.playClick(); QrScannerManager.startScan(); });
          add(this.dom.sidebarScanQrBtn, "click", () => { AudioEngine.playClick(); this.closeSidebar(); QrScannerManager.startScan(); });
 
          add(this.dom.songSearch, "input", () => { StateManager.state.query = this.dom.songSearch.value; this.renderLibrarySoon(); });
          add(this.dom.librarySortSelect, "change", () => { this.renderLibrarySoon(); this.toast(t("sortedToast", "Sorted: ") + this.dom.librarySortSelect.options[this.dom.librarySortSelect.selectedIndex].text); });
          document.querySelectorAll("[data-library-filter]").forEach(b => add(b, "click", () => { AudioEngine.playClick(); StateManager.state.libraryFilter = b.dataset.libraryFilter; document.querySelectorAll("[data-library-filter]").forEach(i => i.classList.toggle("active", i === b)); this.renderLibrarySoon(); this.toast(t("filterToast", "Filter: ") + b.textContent); }));
          add(this.dom.newSongButton, "click", () => { AudioEngine.playClick(); if (StateManager.state.libraryFilter === 'setlists') { this.openSetlistModal(); return; } StateManager.createSong(); Editor.loadActiveSong(); this.switchView('editor'); this.renderAll(); this.toast(t("newSongReadyToast", "New song ready")); });

          add(this.dom.slPrev, "click", () => { AudioEngine.playClick(); const s = StateManager.state.activeSetlist; StateManager.playSetlist(s.id, Math.max(0, s.index - 1)); Editor.loadActiveSong(); this.renderAll(); });
          add(this.dom.slNext, "click", () => { AudioEngine.playClick(); const s = StateManager.state.activeSetlist; const set = StateManager.state.setlists.find(x => x.id === s.id); StateManager.playSetlist(s.id, Math.min(set.items.length - 1, s.index + 1)); Editor.loadActiveSong(); this.renderAll(); });
          add(this.dom.slExit, "click", () => { AudioEngine.playClick(); StateManager.exitSetlist(); Editor.loadActiveSong(); this.renderAll(); });

          document.querySelectorAll("[data-preview-mode]").forEach(b => add(b, "click", () => { AudioEngine.playClick(); StateManager.state.previewMode = b.dataset.previewMode; document.querySelectorAll("[data-preview-mode]").forEach(i => i.classList.toggle("active", i === b)); this.updateAnalysis(); this.toast("Layout: " + b.textContent); }));
          document.querySelectorAll("[data-mobile-editor-pane]").forEach(btn => {
            add(btn, "click", () => {
              AudioEngine.playClick();
              const pane = btn.dataset.mobileEditorPane;
              const editorPanel = document.querySelector(".editor-panel");
              if (editorPanel) editorPanel.dataset.mobilePane = pane;
              document.querySelectorAll("[data-mobile-editor-pane]").forEach(b => b.classList.toggle("active", b === btn));
              try { localStorage.setItem("sonata_mobile_editor_pane", pane); } catch(e) {}
            });
          });
          const savedMobilePane = localStorage.getItem("sonata_mobile_editor_pane") || "edit";
          const editorPanel = document.querySelector(".editor-panel");
          if (editorPanel) editorPanel.dataset.mobilePane = savedMobilePane;
          document.querySelectorAll("[data-mobile-editor-pane]").forEach(b => {
            b.classList.toggle("active", b.dataset.mobileEditorPane === savedMobilePane);
          });
          document.querySelectorAll("[data-circle-format]").forEach(b => add(b, "click", () => { AudioEngine.playClick(); StateManager.state.circleFormat = b.dataset.circleFormat; document.querySelectorAll("[data-circle-format]").forEach(i => i.classList.toggle("active", i === b)); InstrumentManager.renderCircle(); }));

          add(this.dom.keySelect, "change", () => { const song = StateManager.activeSong(); if (!song || song.readonly) { this.updateAnalysis(); return; } song.manualKey = this.dom.keySelect.value; StateManager.touch(song); StateManager.saveNow(t("keySaved", "Key saved")); this.updateAnalysis(); InstrumentManager.renderCircle(); InstrumentManager.syncKeySelectors(); });
          add(this.dom.theoryKeyInput, "change", (e) => { const match = e.target.value.trim().match(/^([A-Ga-g][#bB]?)\s*(m|min|minor|maj|major|)?$/i); if (match) { let root = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(); if (root.length === 2 && root[1] === 'B') root = root[0] + 'b'; let mode = (match[2] && match[2].toLowerCase().startsWith('m') && !match[2].toLowerCase().startsWith('maj')) ? 'minor' : 'major'; if (NOTE_TO_SEMITONE.hasOwnProperty(root)) { const song = StateManager.activeSong(); if (song && !song.readonly) { song.manualKey = `${root}:${mode}`; StateManager.touch(song); StateManager.saveNow(t("keyUpdated", "Key updated")); this.renderAll(); InstrumentManager.syncKeySelectors(); this.toast(t("keySetTo", "Key set to ") + `${root} ${mode}`); return; } } } this.toast(t("invalidKeyToast", "Invalid key. Try format 'G' or 'C#m'")); InstrumentManager.syncKeySelectors(); });

          add(this.dom.capoSelect, "change", () => { StateManager.state.capo = parseInt(this.dom.capoSelect.value, 10); this.updateAnalysis(); this.toast(t("capoToast", "Capo ") + StateManager.state.capo); });
          add(this.dom.transposeSelect, "change", () => { StateManager.state.transposeDelta = Util.clamp(parseInt(this.dom.transposeSelect.value, 10) || 0, -24, 24); this.updateAnalysis(); InstrumentManager.syncKeySelectors(); });
          add(this.dom.transposeDown, "click", () => { AudioEngine.playClick(); this.bumpTranspose(-1); }); add(this.dom.transposeUp, "click", () => { AudioEngine.playClick(); this.bumpTranspose(1); });
          add(this.dom.applyTransposeButton, "click", () => { AudioEngine.playClick(); const song = StateManager.activeSong(); if (!song || song.readonly) return; const delta = StateManager.state.transposeDelta; if (!delta) { this.toast(t("applyTransposeToastNoSelect", "No transpose selected")); return; } this.openModal({ title: t("applyTransposeTitle", "Apply Transpose"), message: t("applyTransposeMessage", "Permanently rewrite chords in editor?"), confirmText: t("applyTransposeConfirm", "Apply"), onConfirm: () => { song.body = TransposeEngine.transposeText(song.body, delta, KeyDetector.activeKey(song, StateManager.state.detectedKey || KeyDetector.detect(song.body))); StateManager.state.transposeDelta = 0; InstrumentManager.syncKeySelectors(); UIManager.renderAll(); this.toast(t("applyTransposeToast", "Chords transposed permanently")); } }); });
          add(this.dom.resetTransposeButton, "click", () => { AudioEngine.playClick(); this.openModal({ title: t("resetModificationsTitle", "Reset Modifications"), message: t("resetModificationsMessage", "Reset Capo and Transpose?"), confirmText: t("resetModificationsConfirm", "Reset"), onConfirm: () => { StateManager.state.transposeDelta = 0; if (this.dom.transposeSelect) this.dom.transposeSelect.value = "0"; StateManager.state.capo = 0; if (this.dom.capoSelect) this.dom.capoSelect.value = "0"; this.updateAnalysis(); InstrumentManager.syncKeySelectors(); this.toast(t("resetModificationsToast", "Reset")); } }); });

          add(this.dom.exportTxtButton, "click", () => { AudioEngine.playClick(); ExportManager.exportTxt(); }); add(this.dom.exportPngButton, "click", () => { AudioEngine.playClick(); ExportManager.exportPng(); }); add(this.dom.exportPdfButton, "click", () => { AudioEngine.playClick(); ExportManager.exportPdf(); }); add(this.dom.printButton, "click", () => { AudioEngine.playClick(); ExportManager.print(); }); add(this.dom.copyButton, "click", () => { AudioEngine.playClick(); ExportManager.copy(); });
          add(this.dom.shareButton, "click", () => { AudioEngine.playClick(); ExportManager.share(Boolean(StateManager.state.activeSetlist.id)); });
          add(this.dom.modalCancel, "click", () => { AudioEngine.playClick(); this.dom.modalHost.hidden = true; }); add(this.dom.modalBackdrop, "click", () => { this.dom.modalHost.hidden = true; }); add(this.dom.modalConfirm, "click", () => { AudioEngine.playClick(); if (!this.modalAction) return; const values = {}; this.dom.modalFields.querySelectorAll("[data-field-id]").forEach(input => { values[input.dataset.fieldId] = input.value; }); this.dom.modalHost.hidden = true; if (typeof this.modalAction.onConfirm === "function") this.modalAction.onConfirm(values); });

          add(this.dom.presentationExit, "click", () => { AudioEngine.playClick(); PresentationManager.close(); }); add(this.dom.presentationFontDown, "click", () => { AudioEngine.playClick(); PresentationManager.changeFont(-4); }); add(this.dom.presentationFontUp, "click", () => { AudioEngine.playClick(); PresentationManager.changeFont(4); }); add(this.dom.presentationOrientation, "change", () => PresentationManager.setOrientation(this.dom.presentationOrientation.value));
          add(this.dom.presThemeToggle, "click", () => { AudioEngine.playClick(); PresentationManager.cycleTheme(); }); add(this.dom.presMetronomeToggle, "click", () => { AudioEngine.playClick(); MetronomeManager.toggle(); });
          add(this.dom.presScrollToggle, "click", () => { AudioEngine.playClick(); ScrollManager.toggle("presentation"); }); add(this.dom.presScrollSpeed, "input", () => { StateManager.state.settings.autoScrollSpeed = Util.clamp(this.dom.presScrollSpeed.value, 0, 180); this.updateScrollControls(); StateManager.saveNow("Scroll speed saved"); });
          add(this.dom.presentation, "mousemove", () => PresentationManager.startIdleTimer()); add(this.dom.presentation, "touchstart", () => PresentationManager.startIdleTimer(), { passive: true });

          document.querySelectorAll(".help-icon").forEach(btn => add(btn, 'click', (e) => { e.stopPropagation(); AudioEngine.playClick(); if (HELP_TEXTS[btn.dataset.help]) PopoverManager.show(btn, HELP_TEXTS[btn.dataset.help]); }));

          add(this.dom.metronomeBpmRange, "input", () => MetronomeManager.setBpm(this.dom.metronomeBpmRange.value)); add(this.dom.metronomeBpmInput, "change", () => MetronomeManager.setBpm(this.dom.metronomeBpmInput.value));
          add(this.dom.metronomeDown, "click", () => { AudioEngine.playClick(); MetronomeManager.setBpm(StateManager.state.settings.metronomeBpm - 1); }); add(this.dom.metronomeUp, "click", () => { AudioEngine.playClick(); MetronomeManager.setBpm(StateManager.state.settings.metronomeBpm + 1); }); add(this.dom.metronomeBeats, "change", () => MetronomeManager.setBeats(this.dom.metronomeBeats.value));
          add(this.dom.metronomeToggle, "click", () => { AudioEngine.playClick(); MetronomeManager.toggle(); }); add(this.dom.tapTempoButton, "click", () => { AudioEngine.playClick(); MetronomeManager.tap(); });
        },
        populateKeySelect() { if (!this.dom.keySelect || !this.dom.theoryKeyOptions) return; this.dom.keySelect.innerHTML = '<option value="auto">Auto</option>'; this.dom.theoryKeyOptions.innerHTML = "";[{ mode: "major", roots: KEY_ROOTS }, { mode: "minor", roots: MINOR_KEY_ROOTS }].forEach(group => group.roots.forEach(root => { const label = root + " " + group.mode; this.dom.keySelect.innerHTML += `<option value="${root}:${group.mode}">${label}</option>`; this.dom.theoryKeyOptions.innerHTML += `<option value="${label}"></option>`; })); },
        populateTransposeSelect() { if (!this.dom.transposeSelect) return; this.dom.transposeSelect.innerHTML = ""; for (let value = -24; value <= 24; value += 1) this.dom.transposeSelect.innerHTML += `<option value="${value}">${value > 0 ? "+" + value : value}</option>`; },
        updateScrollControls() { const speed = StateManager.state.settings.autoScrollSpeed; if (this.dom.presScrollSpeed) this.dom.presScrollSpeed.value = speed; if (this.dom.presScrollSpeedLabel) this.dom.presScrollSpeedLabel.textContent = speed; if (this.dom.presScrollToggle) Icon.set(this.dom.presScrollToggle, ScrollManager.running ? "pause" : "scroll", ScrollManager.running ? "Pause" : "Scroll", true); },
        updateSetlistNav() {
          const n = this.dom.setlistNav; if (!n) return; const s = StateManager.state.activeSetlist;
          if (!s.id) { n.style.display = 'none'; if (this.dom.exportPdfButton) Icon.set(this.dom.exportPdfButton, "pdf", "PDF", false); return; }
          const set = StateManager.state.setlists.find(x => x.id === s.id); if (!set) return;
          n.style.display = 'flex'; this.dom.slPrev.disabled = s.index <= 0; this.dom.slNext.disabled = s.index >= set.items.length - 1; this.dom.slTitle.textContent = `${set.title} (${s.index + 1}/${set.items.length})`;
          if (this.dom.exportPdfButton) Icon.set(this.dom.exportPdfButton, "pdf", "Set PDF", false);
        },
        renderAll() { const song = StateManager.activeSong(); if (this.dom.keySelect) this.dom.keySelect.value = song?.manualKey || "auto"; if (this.dom.transposeSelect) this.dom.transposeSelect.value = String(StateManager.state.transposeDelta); if (this.dom.capoSelect) this.dom.capoSelect.value = String(StateManager.state.capo); MetronomeManager.renderBeats(); MetronomeManager.updateUi(); this.updateScrollControls(); this.updateSetlistNav(); this.updateAnalysis(); InstrumentManager.renderCircle(); SongLibrary.render(); },
        updateAnalysis() {
          const song = StateManager.activeSong(); if (!song) return; const chords = ChordParser.extractChords(song.body);
          let active = { root: "C", mode: "major", tonic: 0, name: "C major" }, detected = active;

          if (StateManager.state.previewMode === "original" || StateManager.state.previewMode === "lyrics") { detected = KeyDetector.detect(chords); active = KeyDetector.parseKey(song.manualKey) || detected; } else { detected = KeyDetector.detect(chords); active = KeyDetector.activeKey(song, detected); StateManager.state.detectedKey = detected; }

          if (this.dom.wordCount) this.dom.wordCount.textContent = (song.body || "").split("\n").length + " lines";
          const delta = StateManager.state.transposeDelta;
          if (this.dom.detectedKey) { const transposedDetected = delta !== 0 ? KeyDetector.nameFor(Util.mod(detected.tonic + delta, 12), detected.mode) + " " + detected.mode : detected.name; this.dom.detectedKey.innerHTML = detected.name === "Unknown" ? "Unknown" : (delta !== 0 ? `${transposedDetected} <span style="color:var(--muted); font-size:0.7em;">(Orig: ${detected.name})</span>` : `${detected.name} ${detected.confidence}%`); }
          if (this.dom.activeKey) { const transposedActive = delta !== 0 ? KeyDetector.nameFor(Util.mod(active.tonic + delta, 12), active.mode) + " " + active.mode : active.name; this.dom.activeKey.innerHTML = delta !== 0 ? `${transposedActive} <span style="color:var(--muted); font-size:0.7em;">(Orig: ${active.name})</span>` : (active.name || "Auto"); }
          if (this.dom.chordCount) this.dom.chordCount.textContent = String(chords.length);
          if (this.dom.transposeLabel) this.dom.transposeLabel.textContent = delta > 0 ? "+" + delta : String(delta);
          if (this.dom.previewOutput) this.dom.previewOutput.innerHTML = this.previewText(song, active, false);
        },
        previewText(song, activeKey, rawTextOnly) {
          const body = song.body || ""; const lines = body.split('\n'); const mode = StateManager.state.previewMode; const effectiveTranspose = StateManager.state.transposeDelta - StateManager.state.capo;
          let resultLines = [];
          lines.forEach(originalLine => {
            const isChordLine = ChordParser.isChordLine(originalLine);
            if (mode === 'lyrics' && isChordLine) return;
            let processedLine = originalLine;
            if (mode === 'lyrics') { processedLine = processedLine.replace(/\[[^\]]+\]/g, ''); } else if (mode === 'transposed') { processedLine = TransposeEngine.transposeText(originalLine, effectiveTranspose, activeKey); } else if (mode === 'roman') { processedLine = FormatEngine.convert(originalLine, activeKey, 'roman'); } else if (mode === 'nashville') { processedLine = FormatEngine.convert(originalLine, activeKey, 'nashville'); }
            if (rawTextOnly) { resultLines.push(processedLine); return; }

            let htmlLine = Util.escapeHtml(processedLine);
            if (htmlLine.startsWith('---')) htmlLine = `<hr class="md-divider">`;
            else if (htmlLine.startsWith('# ')) htmlLine = `<span class="md-header">${htmlLine.substring(2)}</span>`;
            else if (htmlLine.startsWith('## ')) htmlLine = `<span class="md-subheader">${htmlLine.substring(3)}</span>`;
            else if (htmlLine.startsWith('&gt; ') || htmlLine.startsWith('// ')) htmlLine = `<span class="md-note">${htmlLine.substring(htmlLine.indexOf(' ') + 1)}</span>`;
            else if (isChordLine) { htmlLine = `<span class="md-chord-line">${htmlLine.split(/(\s+)/).map(t => { if (!t.trim() || /^-+$/.test(t) || t === "-") return t; const slashMatch = t.match(/^(.*?)(\/+)$/); if (slashMatch) return `<strong class="md-chord">${slashMatch[1]}</strong><span class="md-slash">${slashMatch[2]}</span>`; return `<strong class="md-chord">${t}</strong>`; }).join('')}</span>`; }
            else if (mode !== 'lyrics') { htmlLine = htmlLine.replace(/\[(.*?)\]/g, (match, inner) => { const slashMatch = inner.match(/^(.*?)(\/+)$/); if (slashMatch) return `[<strong class="md-chord">${slashMatch[1]}</strong><span class="md-slash">${slashMatch[2]}</span>]`; return `[<strong class="md-chord">${inner}</strong>]`; }); }
            resultLines.push(htmlLine);
          });
          return resultLines.join('\n');
        },
        bumpTranspose(delta) { const next = Util.clamp((parseInt(StateManager.state.transposeDelta, 10) || 0) + delta, -24, 24); StateManager.state.transposeDelta = next; if (this.dom.transposeSelect) this.dom.transposeSelect.value = String(next); this.updateAnalysis(); InstrumentManager.syncKeySelectors(); },
        setStatus(message) { if (!this.dom.saveStatus) return; this.dom.saveStatus.innerHTML = StateManager.activeSong()?.readonly ? '<span class="badge">Read Only</span> Preview' : message; window.clearTimeout(this.statusTimer); this.statusTimer = window.setTimeout(() => { if (this.dom.saveStatus) this.dom.saveStatus.innerHTML = StateManager.activeSong()?.readonly ? '<span class="badge">Read Only</span> Preview' : (StateManager.state.dirty ? "Autosaving" : "Ready"); }, 1800); },

        openManageLibrary() {
          const songs = StateManager.state.songs;
          let tableRows = '';
          songs.forEach(song => {
            const key = KeyDetector.activeKey(song, StateManager.state.detectedKey);
            const keyStr = key ? (key.root + (key.mode === 'minor' ? 'm' : '')) : '-';
            tableRows += `
              <tr class="manage-song-row" data-song-id="${song.id}" style="border-bottom:1px solid var(--line);">
                <td style="padding:10px; text-align:center;"><input type="checkbox" class="manage-song-checkbox" value="${song.id}" style="width:16px; height:16px; cursor:pointer;"></td>
                <td style="padding:10px; font-weight:600; color:var(--text);">${Util.escapeHtml(Util.titleOf(song))}</td>
                <td style="padding:10px; color:var(--muted);">${Util.escapeHtml(song.artist || '-')}</td>
                <td style="padding:10px; color:var(--muted);">${Util.escapeHtml(song.creator || '-')}</td>
                <td style="padding:10px; font-weight:600; color:var(--accent);">${keyStr}</td>
                <td style="padding:10px; color:var(--muted);">${Util.formatDate(song.updatedAt)}</td>
              </tr>
            `;
          });

          this.openModal({
            title: "Manage Library",
            confirmText: "Close",
            fields: [{
              type: "custom",
              html: `
                <div style="display:flex; flex-direction:column; gap:12px; width:100%; min-width:320px; max-width:800px; max-height:70vh; overflow:hidden;">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--line); padding-bottom:10px;">
                    <div style="display:flex; gap:8px;">
                      <button class="button danger" id="bulkDeleteBtn" type="button" disabled style="padding: 0 12px; min-height:34px;">Delete Selected</button>
                      <button class="button primary" id="bulkShareBtn" type="button" disabled style="padding: 0 12px; min-height:34px;">Share Selected</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end;">
                      <input class="input" type="search" id="manageLibSearch" placeholder="Filter songs..." style="max-width:200px; height:34px; margin:0;">
                      <span id="selectedCountLabel" style="font-size:0.8rem; color:var(--muted); font-weight:600; white-space:nowrap;">0 selected</span>
                    </div>
                  </div>
                  <div style="overflow-y:auto; flex:1; border:1px solid var(--line); border-radius:6px; background:var(--surface-2);">
                    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem; background:var(--surface);">
                      <thead>
                        <tr style="background:var(--surface-2); border-bottom:1px solid var(--line); font-weight:600; color:var(--muted); position:sticky; top:0; z-index:1;">
                          <th style="padding:10px; width:40px; text-align:center;"><input type="checkbox" id="selectAllSongsCheckbox" style="width:16px; height:16px; cursor:pointer;"></th>
                          <th style="padding:10px;">Title</th>
                          <th style="padding:10px;">Author</th>
                          <th style="padding:10px;">Arranger</th>
                          <th style="padding:10px; width:70px;">Key</th>
                          <th style="padding:10px; width:110px;">Updated</th>
                        </tr>
                      </thead>
                      <tbody id="manageLibTableBody">
                        ${tableRows || '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--muted);">No songs in library.</td></tr>'}
                      </tbody>
                    </table>
                  </div>
                </div>
              `
            }],
            onConfirm: () => { }
          });

          const selectAll = document.getElementById('selectAllSongsCheckbox');
          const checkboxes = document.querySelectorAll('.manage-song-checkbox');
          const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
          const bulkShareBtn = document.getElementById('bulkShareBtn');
          const selectedLabel = document.getElementById('selectedCountLabel');
          const searchInput = document.getElementById('manageLibSearch');

          const updateActions = () => {
            const checked = document.querySelectorAll('.manage-song-checkbox:checked');
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = checked.length === 0;
            if (bulkShareBtn) bulkShareBtn.disabled = checked.length === 0;
            if (selectedLabel) selectedLabel.textContent = `${checked.length} selected`;
          };

          selectAll?.addEventListener('change', () => {
            checkboxes.forEach(cb => {
              if (cb.closest('tr').style.display !== 'none') {
                cb.checked = selectAll.checked;
              }
            });
            updateActions();
          });

          checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
              updateActions();
            });
          });

          searchInput?.addEventListener('keyup', () => {
            const q = searchInput.value.toLowerCase();
            document.querySelectorAll('#manageLibTableBody tr').forEach(tr => {
              const text = tr.textContent.toLowerCase();
              tr.style.display = text.includes(q) ? '' : 'none';
            });
          });

          bulkDeleteBtn?.addEventListener('click', () => {
            const checkedIds = Array.from(document.querySelectorAll('.manage-song-checkbox:checked')).map(cb => cb.value);
            if (checkedIds.length === 0) return;
            this.openModal({
              title: "Confirm Bulk Deletion",
              message: `Are you sure you want to delete the ${checkedIds.length} selected songs? This action cannot be undone.`,
              confirmText: "Delete Songs",
              destructive: true,
              onConfirm: () => {
                StateManager.state.songs = StateManager.state.songs.filter(s => !checkedIds.includes(s.id));
                if (!StateManager.state.songs.length) StateManager.createSong();
                else if (checkedIds.includes(StateManager.state.activeId)) StateManager.state.activeId = StateManager.state.songs[0].id;
                StateManager.saveNow("Bulk Deleted");
                this.toast(`Deleted ${checkedIds.length} songs`);
                this.closeModal();
                this.openManageLibrary();
                this.renderAll();
              }
            });
          });

          bulkShareBtn?.addEventListener('click', async () => {
            const checkedIds = Array.from(document.querySelectorAll('.manage-song-checkbox:checked')).map(cb => cb.value);
            if (checkedIds.length === 0) return;

            const selectedSongs = StateManager.state.songs.filter(s => checkedIds.includes(s.id));
            const rawSet = { title: `${selectedSongs.length} Shared Songs`, description: "Custom selection shared from Sonata", links: [] };
            const shareData = ExportManager.cleanSetlistData(rawSet, selectedSongs);
            const titleText = `${selectedSongs.length} Songs`;

            this.openModal({
              title: `Share ${selectedSongs.length} Songs`,
              confirmText: "Copy Link & Close",
              fields: [{
                type: "custom",
                id: "share-content",
                html: `<div id="bulkShareWrapper" style="display:flex;flex-direction:column;align-items:center;width:100%;"><p style="color:var(--muted);font-size:0.9rem;padding:20px 0;">Generating secure share link...</p></div>`
              }],
              onConfirm: async () => {
                const urlInput = document.getElementById('bulkShareUrl');
                const urlToCopy = urlInput ? urlInput.value : finalUrl;
                if (await ExportManager.copyText(urlToCopy)) UIManager.toast("Share link copied!");
              }
            });

            const compressed = await ExportManager.compressData(shareData);
            const finalUrl = window.location.origin + window.location.pathname + "?s=" + compressed;
            let shareUrl = finalUrl; // replaced with TinyURL once resolved

            const wrapper = document.getElementById('bulkShareWrapper');
            if (!wrapper) return;
            wrapper.innerHTML = '';

            const canvas = document.createElement("canvas");
            canvas.style.cssText = "display:block; margin: 0 auto 15px; border-radius: 8px; border: 1px solid var(--line); box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 240px; height: auto;";
            ExportManager.drawQrCard(canvas, { titleText, isSet: true, shareData, directUrl: finalUrl });

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'button secondary';
            downloadBtn.type = 'button';
            downloadBtn.style.cssText = "width:100%; margin-bottom:12px;";
            downloadBtn.innerHTML = `<span data-inline-icon="image" style="width:16px;height:16px;margin-right:6px;"></span>Download QR Card`;
            downloadBtn.addEventListener('click', () => {
              canvas.toBlob(b => Util.download('Sonata-Selection-' + selectedSongs.length + '-Songs.png', 'image/png', b));
              UIManager.toast("Profile Card Downloaded!");
            });

            const urlInput = document.createElement('input');
            urlInput.className = 'input';
            urlInput.id = 'bulkShareUrl';
            urlInput.readOnly = true;
            urlInput.value = 'Shortening link...';
            urlInput.style.cssText = "margin-bottom:12px; font-size: 0.85rem; text-align:center; font-weight:600; color:var(--accent);";
            urlInput.addEventListener('click', () => urlInput.select());

            const shareBtn = document.createElement('button');
            shareBtn.className = 'button primary';
            shareBtn.type = 'button';
            shareBtn.style.cssText = "width: 100%; margin-bottom:12px;";
            shareBtn.innerHTML = `<span data-inline-icon="share-native" style="width:18px; height:18px; margin-right:6px;"></span> Share via Messaging / App`;
            shareBtn.addEventListener('click', async () => {
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: `Sonata: ${selectedSongs.length} Songs Shared`,
                    text: `Import ${selectedSongs.length} songs in Sonata:`,
                    url: shareUrl
                  });
                } else {
                  UIManager.toast("Native sharing not supported on this browser.");
                }
              } catch (e) { }
            });

            const noteText = document.createElement('p');
            noteText.style.cssText = "font-size:0.75rem; color:var(--muted); text-align:center; margin:4px 0 0;";
            noteText.textContent = "QR works offline. Link shortened with TinyURL.";

            wrapper.append(canvas, downloadBtn, urlInput, shareBtn, noteText);
            Icon.decorateAll(wrapper);

            // Shorten in background — swap URL once ready
            ExportManager.shortenUrl(finalUrl).then(short => {
              shareUrl = short || finalUrl;
              urlInput.value = shareUrl;
              if (!short) noteText.textContent = "QR works offline. (Short link unavailable — using direct link)";
            });
          });
        },

        openSongInfo() {
          const song = StateManager.activeSong(); if (!song || song.readonly) return;
          this.openModal({
            title: "Song Details", confirmText: "Save Info", fields: [
              { id: "title", label: "Title", type: "text", value: Util.titleOf(song) },
              { id: "artist", label: "Artist (Optional)", type: "text", value: song.artist },
              { id: "creator", label: "Arranger (Optional)", type: "text", value: song.creator },
              { type: "heading", label: "Reference Links" },
              { type: "custom", id: "songLinksContainer", html: `<div id="songLinksArea"></div><button id="songAddLinkBtn" class="button secondary" type="button" style="margin-top:6px;">+ Add Link</button>` },
              { type: "heading", label: "Description / Notes" },
              { type: "custom", html: `<textarea id="modal-description" class="textarea" style="min-height:120px; font-family:var(--ui-font); font-size:0.85rem; z-index:2; position:relative;" placeholder="Add setlist notes">${Util.escapeHtml(song.description || "")}</textarea>` }
            ],
            onConfirm: (values) => {
              song.title = values.title; song.artist = values.artist; song.creator = values.creator;
              if (window.__songLinkManager) song.links = window.__songLinkManager.getLinks();
              const descEl = document.getElementById('modal-description');
              if (descEl) song.description = descEl.value;
              StateManager.touch(song); StateManager.saveNow("Info Saved"); delete window.__songLinkManager; this.renderAll();
            }
          });

          window.__songLinkManager = createLinkManager('songLinksArea', song.links);
          window.__songLinkManager.render();
          document.getElementById('songAddLinkBtn').addEventListener('click', window.__songLinkManager.addLink);
        },
        showInstallPrompt() {
          if (window.__deferredPrompt) {
            window.__deferredPrompt.prompt();
            window.__deferredPrompt.userChoice.then((choice) => {
              if (choice.outcome === 'accepted') {
                window.__deferredPrompt = null;
                const headerBtn = document.getElementById('headerInstallBtn');
                if (headerBtn) headerBtn.style.display = 'none';
              }
            });
            return;
          }
          const isIOS = /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
          const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
          if (isStandalone) {
            this.toast(t("appAlreadyInstalled", "Sonata is already running as an installed app."));
            return;
          }
          if (isIOS) {
            this.openModal({
              title: t("settingsInstallBtn", "Install Sonata on iOS"),
              confirmText: t("modalConfirm", "Got it"),
              fields: [{
                type: "custom",
                html: `<div style="color:var(--text); font-size:0.9rem; line-height:1.6; text-align:center;">
                         <p style="margin-bottom:12px;">To install this app on your iPhone/iPad:</p>
                         <ol style="text-align:left; padding-left:20px; display:inline-block; margin-bottom:12px;">
                           <li>Tap the <strong>Share</strong> button <span style="font-size:1.2rem;">⎋</span> in your Safari toolbar.</li>
                           <li>Scroll down and select <strong>Add to Home Screen</strong> <span style="font-size:1.2rem;">⊞</span>.</li>
                           <li>Tap <strong>Add</strong> in the top-right corner to finish.</li>
                         </ol>
                         <p style="font-size:0.75rem; color:var(--muted);">Note: Web App installation on iOS requires the Safari browser.</p>
                       </div>`
              }]
            });
          } else {
            this.openModal({
              title: "Install Sonata App",
              confirmText: "Got it",
              fields: [{
                type: "custom",
                html: `<div style="color:var(--text); font-size:0.9rem; line-height:1.6; text-align:center;">
                         <p style="margin-bottom:12px;">Sonata works 100% offline as an installed app on any device!</p>
                         <ol style="text-align:left; padding-left:20px; display:inline-block; margin-bottom:12px;">
                           <li><strong>Chrome / Edge (Desktop):</strong> Click the <strong>Install</strong> icon in the address bar (or Menu &gt; Cast, save & share &gt; Install Sonata).</li>
                           <li><strong>Android:</strong> Tap the 3 dots in Chrome and select <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                           <li><strong>Mac Safari:</strong> Select <strong>File &gt; Add to Dock</strong>.</li>
                         </ol>
                         <p style="font-size:0.75rem; color:var(--muted);">Once installed, Sonata launches instantly from your home screen / desktop even without Wi-Fi or data.</p>
                       </div>`
              }]
            });
          }
        },
        openSettings() {
          const s = StateManager.state.settings;
          this.openModal({
            title: t("settingsTitle", "Settings"), confirmText: t("settingsConfirm", "Save Settings"), fields: [
              { type: "heading", label: t("settingsHeadingAppearance", "Appearance") },
              { id: "theme", label: t("settingsTheme", "Theme"), type: "select", value: s.theme, options: [{ value: "light", label: t("settingsThemeLight", "Light") }, { value: "dark", label: t("settingsThemeDark", "Dark") }] },
              { id: "accentTheme", label: t("settingsAccentTheme", "Color theme"), type: "select", value: s.accentTheme, options: ACCENT_THEMES.map(o => ({ value: o.value, label: t("accent_" + o.value, o.label) })) },
              { id: "uiFontFamily", label: t("settingsUiFont", "Interface font"), type: "select", value: s.uiFontFamily, options: UI_FONT_OPTIONS.map(o => ({ value: o.value, label: t("font_" + o.value, o.label) })) },
              { id: "chartFontFamily", label: t("settingsChartFont", "Song chart font"), type: "select", value: s.chartFontFamily, options: CHART_FONT_OPTIONS.map(o => ({ value: o.value, label: t("font_" + o.value, o.label) })) },
              { id: "appFontSize", label: t("settingsUiFontSize", "Interface text size"), type: "range", value: s.appFontSize, min: 10, max: 24, step: 1, suffix: "px" },
              { id: "editorFontSize", label: t("settingsEditorFontSize", "Editor text size"), type: "range", value: s.editorFontSize, min: 8, max: 64, step: 1, suffix: "px" },
              { id: "previewFontSize", label: t("settingsPreviewFontSize", "Preview text size"), type: "range", value: s.previewFontSize, min: 8, max: 48, step: 1, suffix: "px" },
              { id: "editorLineHeight", label: t("settingsLineSpacing", "Song line spacing"), type: "range", value: s.editorLineHeight, min: 1.2, max: 2.8, step: 0.02, suffix: "x" },
              { type: "heading", label: t("settingsHeadingMusic", "Music & Interactivity") },
              { id: "metronomeVolume", label: t("settingsMetronomeVol", "Metronome Tick Volume"), type: "range", value: Math.round(s.metronomeVolume * 100), min: 0, max: 100, step: 5, suffix: "%" },
              { id: "uiSounds", label: t("settingsUiSounds", "UI Sounds"), type: "select", value: s.uiSounds ? "true" : "false", options: [{ value: "true", label: t("settingsOn", "On") }, { value: "false", label: t("settingsOff", "Off") }] },
              { id: "haptics", label: t("settingsHaptics", "Haptic Feedback"), type: "select", value: s.haptics ? "true" : "false", options: [{ value: "true", label: t("settingsOn", "On") }, { value: "false", label: t("settingsOff", "Off") }] },
              { type: "heading", label: t("settingsHeadingBackup", "Data & Backup") },
              { type: "custom", html: `<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="button" onclick="const d = { songs: StateManager.state.songs, setlists: StateManager.state.setlists, settings: StateManager.state.settings }; Util.download('sonata-backup.json', 'application/json', JSON.stringify(d, null, 2)); UIManager.toast(t('backupExported', 'Backup exported'));" type="button">${t("settingsExportBackup", "Export Backup")}</button><label class="button" style="margin:0;cursor:pointer;"><input type="file" accept=".json" style="display:none;" onchange="const r = new FileReader(); r.onload = (e) => { try { const d = JSON.parse(e.target.result); if (d.songs) StorageManager.saveSongs(d.songs); if (d.setlists) StorageManager.saveSetlists(d.setlists); if (d.settings) StorageManager.saveSettings(d.settings); UIManager.toast(t('backupRestored', 'Backup restored!')); setTimeout(() => window.location.reload(), 1000); } catch(err) { UIManager.toast(t('invalidBackup', 'Invalid backup file')); } }; if(this.files.length) r.readAsText(this.files[0]);">${t("settingsImportBackup", "Import Backup")}</label></div>` },
              { type: "heading", label: t("settingsHeadingSync", "Google Drive Sync") },
              { type: "custom", html: '<div id="settingsDriveSyncStatus" style="padding: 4px 0;"></div>' },
              { id: "installAppContainer", type: "custom", html: `<button class="button primary" id="installAppBtn" style="width:100%; margin-top:8px;" type="button">${t("settingsInstallBtn", "Install App to Device")}</button>` },
              { type: "custom", html: `<button class="button danger" id="restoreDefaultsBtn" type="button" style="width:100%; margin-top: 14px;">${t("settingsRestoreDefaults", "Restore Default Settings")}</button>` }
            ], onConfirm: v => { s.theme = v.theme; s.accentTheme = v.accentTheme; s.uiFontFamily = v.uiFontFamily; s.chartFontFamily = v.chartFontFamily; s.appFontSize = v.appFontSize; s.editorFontSize = v.editorFontSize; s.previewFontSize = v.previewFontSize; s.editorLineHeight = v.editorLineHeight; s.metronomeVolume = v.metronomeVolume / 100; s.uiSounds = v.uiSounds === "true"; s.haptics = v.haptics === "true"; ThemeManager.apply(); Editor.applySettings(); PresentationManager.applySettings(); MetronomeManager.updateUi(); StateManager.saveNow(t("settingsSaved", "Settings saved")); this.toast(t("settingsSaved", "Settings saved")); }
          });
          const installBtn = document.getElementById('installAppBtn');
          if (installBtn) {
            installBtn.addEventListener('click', () => {
              this.showInstallPrompt();
            });
          }
          const restoreBtn = document.getElementById('restoreDefaultsBtn');
          if (restoreBtn) {
            restoreBtn.addEventListener('click', () => {
              if (confirm(t("settingsRestoreConfirm", "Reset all settings to default values?"))) {
                StateManager.state.settings = Object.assign({}, DEFAULT_SETTINGS);
                StorageManager.saveSettings(StateManager.state.settings);
                ThemeManager.apply();
                Editor.applySettings();
                PresentationManager.applySettings();
                MetronomeManager.updateUi();
                this.applyLanguage();
                this.closeModal();
                this.toast(t("settingsRestored", "Settings restored to defaults"));
              }
            });
          }
          GoogleDriveSync.renderSettingsUI();
        },
        openSetlistModal(editId = null) {
          const set = editId ? StateManager.state.setlists.find(s => s.id === editId) : { title: "", items: [], description: "", links: [] };
          let listHtml = `<div id="slList" style="max-height: 40vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; padding: 10px; display: grid; gap: 8px;">`;
          StateManager.state.songs.forEach(song => {
            const checked = set.items.some(i => i.songId === song.id) ? "checked" : "";
            listHtml += `<label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text);"><input type="checkbox" value="${song.id}" ${checked} style="width:18px;height:18px;accent-color:var(--accent);"> <span style="font-size:0.88rem;font-weight:600;">${Util.escapeHtml(song.title)}</span></label>`;
          });
          listHtml += `</div>`;
          this.openModal({
            title: editId ? "Edit Setlist" : "New Setlist", confirmText: "Save Setlist", fields: [
              { type: "custom", html: `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><label class="control-label" style="margin:0;">Setlist Title</label><button class="help-icon" data-help="setlist" type="button" onclick="event.stopPropagation(); PopoverManager.show(this, 'Create a setlist to easily share multiple songs at once and navigate between them seamlessly on stage.');">?</button></div>` },
              { id: "title", label: "", type: "text", value: set.title || "Sunday Worship" },
              { type: "heading", label: "Select Songs" },
              { type: "custom", html: `<input class="input" type="search" id="slSearch" placeholder="Search songs..." onkeyup="const q = this.value.toLowerCase(); document.querySelectorAll('#slList label').forEach(l => { l.style.display = l.textContent.toLowerCase().includes(q) ? 'flex' : 'none'; });" style="margin-bottom:8px;">` },
              { type: "custom", html: listHtml },
              { type: "heading", label: "Reference Links" },
              { type: "custom", id: "setLinksContainer", html: `<div id="setLinksArea"></div><button id="setAddLinkBtn" class="button secondary" type="button" style="margin-top:6px;">+ Add Link</button>` },
              { type: "heading", label: "Setlist Notes" },
              { type: "custom", html: `<textarea id="modal-set-desc" class="textarea" style="min-height:100px; font-family:var(--ui-font); font-size:0.85rem;" placeholder="Add setlist notes (e.g. Service order)">${Util.escapeHtml(set.description || "")}</textarea>` }
            ], onConfirm: values => {
              const selected = Array.from(document.getElementById('modalFields').querySelectorAll('input[type="checkbox"]:checked')).map(cb => ({ songId: cb.value }));
              if (!values.title.trim() || !selected.length) { this.toast("Setlist needs a title and songs."); return; }
              const links = window.__setLinkManager.getLinks(); const desc = document.getElementById('modal-set-desc').value.trim();
              if (editId) { const existing = StateManager.state.setlists.find(s => s.id === editId); existing.title = values.title; existing.items = selected; existing.links = links; existing.description = desc; }
              else { StateManager.state.setlists.unshift({ id: Util.uid(), title: values.title, date: Util.now(), items: selected, links: links, description: desc }); }
              StateManager.saveNow("Setlist Saved"); delete window.__setLinkManager; this.renderLibrarySoon();
            }
          });

          window.__setLinkManager = createLinkManager('setLinksArea', set.links);
          window.__setLinkManager.render();
          document.getElementById('setAddLinkBtn').addEventListener('click', window.__setLinkManager.addLink);
        },
        closeModal() {
          if (this.dom.modalHost) this.dom.modalHost.hidden = true;
          this.modalAction = null;
        },
        openModal(options) { this.modalAction = options; this.dom.modalTitle.textContent = options.title || ""; this.dom.modalMessage.textContent = options.message || ""; this.dom.modalFields.innerHTML = ""; (options.fields || []).forEach(f => { if (f.type === "custom") { const w = document.createElement("div"); w.innerHTML = f.html; this.dom.modalFields.appendChild(w); return; } if (f.type === "heading") { const h = document.createElement("div"); h.className = "settings-heading"; h.textContent = f.label; this.dom.modalFields.appendChild(h); return; } const w = document.createElement("div"); w.className = "settings-field"; if (f.label) { const l = document.createElement("label"); l.textContent = f.label; l.htmlFor = "modal-" + f.id; w.appendChild(l); } if (f.type === "select") { const s = document.createElement("select"); s.className = "select"; s.id = "modal-" + f.id; s.dataset.fieldId = f.id; (f.options || []).forEach(o => { const node = document.createElement("option"); node.value = o.value; node.textContent = o.label; s.appendChild(node); }); s.value = f.value; w.appendChild(s); } else if (f.type === "range") { const r = document.createElement("div"); r.className = "range-row"; const i = document.createElement("input"); i.type = "range"; i.id = "modal-" + f.id; i.dataset.fieldId = f.id; i.min = f.min; i.max = f.max; i.step = f.step || 1; i.value = f.value; const o = document.createElement("span"); o.className = "range-value"; const update = () => { o.textContent = i.value + (f.suffix || ""); }; i.addEventListener("input", update); update(); r.append(i, o); w.appendChild(r); } else { const i = document.createElement("input"); i.className = "input"; i.id = "modal-" + f.id; i.dataset.fieldId = f.id; i.type = f.type || "text"; i.value = f.value || ""; w.appendChild(i); } this.dom.modalFields.appendChild(w); }); this.dom.modalConfirm.textContent = options.confirmText || "Done"; this.dom.modalConfirm.classList.toggle("danger", Boolean(options.destructive)); this.dom.modalConfirm.classList.toggle("primary", !options.destructive); this.dom.modalHost.hidden = false; const focusable = this.dom.modalFields.querySelector("input, select, textarea") || this.dom.modalConfirm; setTimeout(() => focusable.focus(), 30); },
        toast(message) { const node = document.createElement("div"); node.className = "toast"; node.textContent = message; this.dom.toastHost.appendChild(node); setTimeout(() => { node.style.opacity = "0"; node.style.transform = "translateY(8px)"; }, 2200); setTimeout(() => node.remove(), 2800); }
      };

      const Editor = {
        undoStack: [],
        redoStack: [],
        lastValue: "",
        historyDebounced: null,

        initHistory() {
          this.undoStack = [];
          this.redoStack = [];
          this.lastValue = UIManager.dom.songBody ? UIManager.dom.songBody.value : "";
          this.updateUndoRedoButtons();
        },

        pushHistory(val) {
          if (val === this.lastValue) return;
          this.undoStack.push(this.lastValue);
          this.redoStack = [];
          this.lastValue = val;
          if (this.undoStack.length > 50) this.undoStack.shift();
          this.updateUndoRedoButtons();
        },

        scheduleHistory(val) {
          if (this.historyDebounced) clearTimeout(this.historyDebounced);
          this.historyDebounced = setTimeout(() => {
            this.pushHistory(val);
          }, 400);
        },

        undo() {
          if (this.undoStack.length === 0) return;
          const val = this.undoStack.pop();
          this.redoStack.push(this.lastValue);
          this.lastValue = val;

          const song = StateManager.activeSong();
          if (song && !song.readonly) {
            song.body = val;
            UIManager.dom.songBody.value = val;
            StateManager.touch(song);
            UIManager.updateAnalysisSoon();
            this.updateDemoButtonState();
          }
          this.updateUndoRedoButtons();
        },

        redo() {
          if (this.redoStack.length === 0) return;
          const val = this.redoStack.pop();
          this.undoStack.push(this.lastValue);
          this.lastValue = val;

          const song = StateManager.activeSong();
          if (song && !song.readonly) {
            song.body = val;
            UIManager.dom.songBody.value = val;
            StateManager.touch(song);
            UIManager.updateAnalysisSoon();
            this.updateDemoButtonState();
          }
          this.updateUndoRedoButtons();
        },

        updateUndoRedoButtons() {
          if (UIManager.dom.undoSongButton) {
            UIManager.dom.undoSongButton.disabled = this.undoStack.length === 0;
            UIManager.dom.undoSongButton.style.opacity = this.undoStack.length === 0 ? '0.5' : '1';
          }
          if (UIManager.dom.redoSongButton) {
            UIManager.dom.redoSongButton.disabled = this.redoStack.length === 0;
            UIManager.dom.redoSongButton.style.opacity = this.redoStack.length === 0 ? '0.5' : '1';
          }
        },

        updateMetadataBar() {
          const song = StateManager.activeSong();
          const bar = document.getElementById('editorMetadataBar');
          if (!bar) return;
          if (!song) { bar.style.display = 'none'; return; }
          const parts = [];
          if (song.artist) parts.push(`<strong>Author:</strong> ${Util.escapeHtml(song.artist)}`);
          if (song.creator) parts.push(`<strong>Arranger:</strong> ${Util.escapeHtml(song.creator)}`);

          const key = KeyDetector.activeKey(song, StateManager.state.detectedKey);
          if (key) {
            let keyStr = key.root + (key.mode === 'minor' ? 'm' : '');
            if (StateManager.state.capo) {
              keyStr += ` (Capo ${StateManager.state.capo})`;
            }
            parts.push(`<strong>Key:</strong> ${keyStr}`);
          }

          if (parts.length > 0) {
            bar.innerHTML = parts.join('  •  ');
            bar.style.display = 'flex';
          } else {
            bar.style.display = 'none';
          }
        },

        updateDemoButtonState() {
          const song = StateManager.activeSong();
          const demoBtn = UIManager.dom.loadDemoButton || document.getElementById('loadDemoButton');
          if (demoBtn) {
            const hasContent = song && song.body && song.body.trim().length > 0;
            demoBtn.disabled = hasContent;
            demoBtn.style.opacity = hasContent ? '0.5' : '1';
            demoBtn.style.pointerEvents = hasContent ? 'none' : 'auto';
          }
        },

        bind() {
          UIManager.dom.songTitle?.addEventListener("input", () => { const song = StateManager.activeSong(); if (!song || song.readonly) return; song.title = UIManager.dom.songTitle.value; StateManager.touch(song); UIManager.renderLibrarySoon(); UIManager.updateAnalysis(); });
          UIManager.dom.songTitle?.addEventListener("blur", () => { const song = StateManager.activeSong(); if (!song || song.readonly) return; if (!song.title.trim()) song.title = "Untitled Song"; UIManager.dom.songTitle.value = Util.titleOf(song); StateManager.touch(song); UIManager.renderAll(); });
          UIManager.dom.songBody?.addEventListener("input", () => { const song = StateManager.activeSong(); if (!song || song.readonly) return; song.body = UIManager.dom.songBody.value; StateManager.touch(song); UIManager.updateAnalysisSoon(); this.updateDemoButtonState(); this.scheduleHistory(UIManager.dom.songBody.value); });
          document.querySelector('.editor-placeholder')?.addEventListener('click', () => UIManager.dom.songBody?.focus());
          UIManager.dom.songBody?.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) this.redo(); else this.undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              this.redo();
            }
          });
        },
        loadActiveSong() {
          const song = StateManager.activeSong(); if (!song) return;
          if (UIManager.dom.songTitle) UIManager.dom.songTitle.value = Util.titleOf(song);
          if (UIManager.dom.songBody) UIManager.dom.songBody.value = song.body || "";
          if (UIManager.dom.keySelect) UIManager.dom.keySelect.value = song.manualKey || "auto";
          const isShared = Boolean(song.readonly);
          if (UIManager.dom.songTitle) UIManager.dom.songTitle.readOnly = isShared;
          if (UIManager.dom.songBody) UIManager.dom.songBody.readOnly = isShared;
          if (UIManager.dom.saveSongButton) UIManager.dom.saveSongButton.style.display = isShared ? 'none' : '';
          if (UIManager.dom.undoSongButton) UIManager.dom.undoSongButton.style.display = isShared ? 'none' : '';
          if (UIManager.dom.redoSongButton) UIManager.dom.redoSongButton.style.display = isShared ? 'none' : '';
          if (UIManager.dom.importSharedButton) UIManager.dom.importSharedButton.style.display = isShared ? '' : 'none';
          if (UIManager.dom.infoSongButton) UIManager.dom.infoSongButton.style.display = isShared ? 'none' : '';
          if (UIManager.dom.loadDemoButton) UIManager.dom.loadDemoButton.style.display = isShared ? 'none' : '';
          if (UIManager.dom.exitSharedButton) UIManager.dom.exitSharedButton.style.display = isShared ? '' : 'none';
          if (isShared) UIManager.setStatus("Read-only Preview");
          this.initHistory();
          this.updateMetadataBar();
          this.updateDemoButtonState();
        },
        applySettings() { const s = StateManager.state.settings; document.documentElement.style.setProperty("--ui-font", FONT_STACKS[s.uiFontFamily] || FONT_STACKS.system); document.documentElement.style.setProperty("--chart-font", FONT_STACKS[s.chartFontFamily] || FONT_STACKS.mono); document.documentElement.style.setProperty("--app-font-size", Util.clamp(s.appFontSize, 10, 24) + "px"); document.documentElement.style.setProperty("--editor-font", Util.clamp(s.editorFontSize, 8, 64) + "px"); document.documentElement.style.setProperty("--preview-font", Util.clamp(s.previewFontSize, 8, 48) + "px"); document.documentElement.style.setProperty("--editor-line", Util.clamp(s.editorLineHeight, 1.2, 2.8)); }
      };

      const ThemeManager = {
        apply() {
          const theme = StateManager.state.settings.theme;
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.accent = StateManager.state.settings.accentTheme || "blue";
          if (UIManager.dom.themeToggle) Icon.set(UIManager.dom.themeToggle, theme === "dark" ? "sun" : "moon", theme === "dark" ? "Light Mode" : "Dark Mode", true);
          if (UIManager.dom.themeToggleMobile) Icon.set(UIManager.dom.themeToggleMobile, theme === "dark" ? "sun" : "moon", theme === "dark" ? "Light Mode" : "Dark Mode", true);
          
          // Dynamically swap light / dark icon variants for brand logos and favicons
          const iconSrc = theme === "dark" ? "icon_dark.png" : "icon.png";
          document.querySelectorAll(".brand-logo").forEach(img => {
            if (img.getAttribute("src") !== iconSrc) img.src = iconSrc;
          });
          const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
          if (appleTouchIcon) appleTouchIcon.href = iconSrc;
          const favicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
          favicons.forEach(fav => fav.href = iconSrc);
        }
      };

      const SongLibrary = {
        render() {
          const list = UIManager.dom.libraryList || document.getElementById('libraryList');
          if (!list) return;
          const state = StateManager.state;
          const query = (state.query || "").trim().toLowerCase();
          list.innerHTML = '';

          try {
            if (state.libraryFilter === 'setlists') {
              if (!state.setlists || state.setlists.length === 0) {
                list.innerHTML = `<div class="empty-state">No Setlists found</div>`;
                return;
              }
              state.setlists.forEach(set => {
                const card = document.createElement('div');
                card.className = 'song-card' + (set.id === state.activeSetlist?.id ? ' active' : '');
                card.innerHTML = `<div><p class="song-card-title">${Icon.svg('list')} ${Util.escapeHtml(set.title || 'Untitled Setlist')}</p><p class="song-card-meta">${(set.items || []).length} songs • ${Util.formatDate(set.date || set.updatedAt)}</p></div><div class="song-card-actions" style="display:flex;gap:4px;"><button class="icon-button ghost" data-action="play" type="button" title="Play">${Icon.svg('play')}</button><button class="icon-button ghost" data-action="edit" type="button" title="Edit">${Icon.svg('edit')}</button><button class="icon-button ghost" data-action="share" type="button" title="Share">${Icon.svg('share')}</button><button class="icon-button ghost danger" data-action="delete" type="button" title="Delete">${Icon.svg('trash')}</button></div>`;
                card.addEventListener('click', (e) => {
                  const actionBtn = e.target.closest('button[data-action]');
                  if (actionBtn) {
                    e.stopPropagation();
                    const action = actionBtn.dataset.action;
                    if (action === 'delete') {
                      UIManager.openModal({
                        title: t("deleteSetlistTitle", "Delete Setlist"),
                        message: t("deleteSetlistMessage", "Delete this setlist?"),
                        confirmText: t("deleteSetlistConfirm", "Delete"),
                        destructive: true,
                        onConfirm: () => {
                          StateManager.state.setlists = StateManager.state.setlists.filter(s => s.id !== set.id);
                          StateManager.saveNow(t("deleteSetlistToast", "Setlist Deleted"));
                          if (state.activeSetlist?.id === set.id) StateManager.exitSetlist();
                          this.render();
                          UIManager.toast(t("deleteSetlistToast", "Setlist Deleted"));
                        }
                      });
                    }
                    if (action === 'edit') UIManager.openSetlistModal(set.id);
                    if (action === 'share') { StateManager.playSetlist(set.id); ExportManager.share(true); }
                    if (action === 'play') { StateManager.playSetlist(set.id); Editor.loadActiveSong(); UIManager.switchView('editor'); UIManager.renderAll(); UIManager.toast("Playing Setlist: " + (set.title || "Setlist")); }
                  } else {
                    StateManager.playSetlist(set.id);
                    Editor.loadActiveSong();
                    UIManager.switchView('editor');
                    UIManager.renderAll();
                    UIManager.toast("Playing Setlist: " + (set.title || "Setlist"));
                  }
                });
                list.appendChild(card);
              });
              return;
            }

            let songs = (state.songs || []).slice();
            const sortVal = UIManager.dom.librarySortSelect ? UIManager.dom.librarySortSelect.value : 'recent';
            if (state.libraryFilter === "favorites") {
              songs = songs.filter(s => s && s.isFavorite);
            }
            if (sortVal === 'title') {
              songs.sort((a, b) => Util.titleOf(a).localeCompare(Util.titleOf(b)));
            } else if (sortVal === 'author') {
              songs.sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));
            } else if (sortVal === 'arranger') {
              songs.sort((a, b) => (a.creator || "").localeCompare(b.creator || ""));
            } else if (sortVal === 'key') {
              songs.sort((a, b) => {
                const ka = KeyDetector.activeKey(a, null);
                const kb = KeyDetector.activeKey(b, null);
                const stra = ka ? (ka.root + (ka.mode === 'minor' ? 'm' : '')) : '';
                const strb = kb ? (kb.root + (kb.mode === 'minor' ? 'm' : '')) : '';
                return stra.localeCompare(strb);
              });
            } else {
              songs.sort((a, b) => new Date(b?.updatedAt || 0) - new Date(a?.updatedAt || 0));
            }

            if (query) {
              songs = songs.filter(s => Util.titleOf(s).toLowerCase().includes(query) || (s.body || "").toLowerCase().includes(query));
            }

            if (songs.length === 0) {
              list.innerHTML = `<div class="empty-state">${query ? 'No matching songs' : 'Library is empty'}</div>`;
              return;
            }

            songs.forEach(song => {
              if (!song) return;
              const card = document.createElement('div');
              card.className = 'song-card' + (song.id === StateManager.state.activeId ? ' active' : '');
              let metaText = Util.formatDate(song.updatedAt);
              if (sortVal === 'author' && song.artist) metaText = `${song.artist} • ${metaText}`;
              else if (sortVal === 'arranger' && song.creator) metaText = `${song.creator} • ${metaText}`;
              else if (sortVal === 'key') {
                const key = KeyDetector.activeKey(song, null);
                if (key) metaText = `Key: ${key.root}${key.mode === 'minor' ? 'm' : ''} • ${metaText}`;
              }
              card.innerHTML = `<div><p class="song-card-title">${Util.escapeHtml(Util.titleOf(song))}</p><p class="song-card-meta">${Util.escapeHtml(metaText)}</p></div><div class="song-card-actions" style="display:flex;gap:4px;"><button class="icon-button ghost ${song.isFavorite ? 'active' : ''}" data-action="fav" style="color:var(--warning);" type="button" title="Favorite">${song.isFavorite ? Icon.svg('star-filled') : Icon.svg('star')}</button><button class="icon-button ghost" data-action="view" type="button" title="View in Editor">${Icon.svg('file-text')}</button><button class="icon-button ghost" data-action="share" type="button" title="Share">${Icon.svg('share')}</button><button class="icon-button ghost danger" data-action="delete" type="button" title="Delete">${Icon.svg('trash')}</button></div>`;
              card.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('button[data-action]');
                if (actionBtn) {
                  e.stopPropagation();
                  const action = actionBtn.dataset.action;
                  if (action === 'fav') {
                    song.isFavorite = !song.isFavorite;
                    StateManager.saveNow(t("favoriteToggled", "Favorite Toggled"));
                    this.render();
                    UIManager.toast(song.isFavorite ? t("addedToFavorites", "Added to Favorites") : t("removedFromFavorites", "Removed from Favorites"));
                  }
                  if (action === 'delete') {
                    StateManager.setActive(song.id);
                    UIManager.openModal({
                      title: t("deleteSongTitle", "Delete Song"),
                      message: t("deleteSongMessage", "Delete this song?"),
                      confirmText: t("deleteSongConfirm", "Delete"),
                      destructive: true,
                      onConfirm: () => {
                        StateManager.deleteActive();
                        Editor.loadActiveSong();
                        UIManager.renderAll();
                        UIManager.toast(t("deleteSongToast", "Deleted"));
                      }
                    });
                  }
                  if (action === 'share') {
                    StateManager.setActive(song.id);
                    ExportManager.share(false);
                  }
                  if (action === 'view') {
                    StateManager.setActive(song.id);
                    Editor.loadActiveSong();
                    UIManager.switchView('editor');
                    UIManager.renderAll();
                    UIManager.toast("Opened: " + Util.titleOf(song));
                  }
                } else {
                  StateManager.setActive(song.id);
                  Editor.loadActiveSong();
                  UIManager.switchView('editor');
                  UIManager.renderAll();
                  UIManager.toast("Opened: " + Util.titleOf(song));
                }
              });
              list.appendChild(card);
            });
          } catch (e) {
            console.error("SongLibrary render error:", e);
            list.innerHTML = `<div class="empty-state">Error rendering library: ${Util.escapeHtml(e.message)}</div>`;
          }
        }
      };

      const QrScannerManager = {
        stream: null,
        scanning: false,
        detector: null,

        async startScan() {
          if ('BarcodeDetector' in window) {
            try {
              this.detector = new BarcodeDetector({ formats: ['qr_code'] });
            } catch (e) {
              this.detector = null;
            }
          }

          const modalHtml = `
            <div style="display:flex; flex-direction:column; align-items:center; width:100%; font-family:var(--ui-font);">
              <div style="position:relative; width:100%; max-width:320px; aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:#000; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px rgba(0,0,0,0.3); border:1px solid var(--line);">
                <video id="qrScannerVideo" playsinline autoplay muted style="width:100%; height:100%; object-fit:cover;"></video>
                <!-- Viewfinder Target Frame -->
                <div style="position:absolute; inset:28px; border:2px solid var(--accent); border-radius:12px; pointer-events:none; box-shadow:0 0 0 9999px rgba(0,0,0,0.45);">
                  <div style="position:absolute; top:0; left:0; width:100%; height:2px; background:linear-gradient(90deg, transparent, var(--accent), transparent); animation:qrScanLaser 2s ease-in-out infinite;"></div>
                </div>
                <div id="qrScannerLoading" style="position:absolute; color:#fff; font-size:0.85rem; font-weight:600; text-align:center; padding:12px;">Requesting camera access...</div>
              </div>

              <div style="display:flex; gap:8px; margin-top:14px; width:100%; max-width:320px;">
                <label class="button secondary" style="flex:1; cursor:pointer; text-align:center; font-size:0.82rem;">
                  <span data-inline-icon="image" style="margin-right:6px;"></span> Choose Photo / Screenshot
                  <input type="file" id="qrPhotoInput" accept="image/*" style="display:none;">
                </label>
              </div>
              <p id="qrScannerStatus" style="color:var(--muted); font-size:0.78rem; text-align:center; margin:10px 0 0;">Point your camera at any Sonata Chart QR code</p>
            </div>`;

          UIManager.openModal({
            title: "Scan Chart QR Code",
            fields: [{ type: "custom", html: modalHtml }],
            confirmText: "Close Scanner",
            onConfirm: () => this.stopScan()
          });

          // Wire file input for scanning from screenshot/photos
          const photoInput = document.getElementById('qrPhotoInput');
          if (photoInput) {
            photoInput.addEventListener('change', async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              this.processImageFile(file);
            });
          }

          // Start camera
          const video = document.getElementById('qrScannerVideo');
          const loadingEl = document.getElementById('qrScannerLoading');
          try {
            this.stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" } },
              audio: false
            });
            if (video) {
              video.srcObject = this.stream;
              video.onloadedmetadata = () => {
                video.play();
                if (loadingEl) loadingEl.style.display = 'none';
                this.scanning = true;
                this.scanLoop(video);
              };
            }
          } catch (err) {
            if (loadingEl) loadingEl.textContent = "Camera access unavailable. You can still choose a photo or screenshot.";
          }
        },

        async scanLoop(video) {
          if (!this.scanning || !video || video.paused || video.ended) return;

          if (this.detector) {
            try {
              const barcodes = await this.detector.detect(video);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                this.handleScanResult(barcodes[0].rawValue);
                return;
              }
            } catch (e) {}
          }

          if (this.scanning) {
            requestAnimationFrame(() => this.scanLoop(video));
          }
        },

        async processImageFile(file) {
          const statusEl = document.getElementById('qrScannerStatus');
          if (statusEl) statusEl.textContent = "Scanning image...";
          try {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = async () => {
              if (this.detector) {
                try {
                  const barcodes = await this.detector.detect(img);
                  if (barcodes.length > 0 && barcodes[0].rawValue) {
                    this.handleScanResult(barcodes[0].rawValue);
                    return;
                  }
                } catch (e) {}
              }
              if (statusEl) statusEl.textContent = "No valid QR code detected in this photo.";
            };
          } catch (e) {
            if (statusEl) statusEl.textContent = "Could not parse image.";
          }
        },

        handleScanResult(rawValue) {
          this.stopScan();
          AudioEngine.playClick();
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
          UIManager.closeModal();

          try {
            const url = new URL(rawValue);
            const params = new URLSearchParams(url.search);
            const sParam = params.get('s') || params.get('share');
            if (sParam) {
              ExportManager.decompressData(sParam).then(jsonStr => {
                const data = JSON.parse(jsonStr);
                App.handleImport(data);
              }).catch(err => {
                UIManager.toast("Invalid Sonata QR Code");
              });
              return;
            }
          } catch (e) {
            // Not a standard URL
            try {
              const data = JSON.parse(rawValue);
              if (data.t || data.type) {
                App.handleImport(data);
                return;
              }
            } catch (err2) {}
          }

          // Raw chord/song text fallback
          if (rawValue.trim()) {
            StateManager.createSong();
            const song = StateManager.activeSong();
            if (song) {
              song.title = "Scanned Song";
              song.body = rawValue;
              StateManager.touch(song);
              StateManager.saveNow("Scanned Song");
              Editor.loadActiveSong();
              UIManager.switchView('editor');
              UIManager.renderAll();
              UIManager.toast("Scanned content imported!");
            }
          }
        },

        stopScan() {
          this.scanning = false;
          if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
          }
        }
      };

      const App = {
        saveDebounced: Util.debounce(() => StateManager.saveNow("Autosaved"), 650), scheduleSave() { UIManager.setStatus("Autosaving"); this.saveDebounced(); },
        async handleImport(d) {
          if (d.type === 'set') {
            const newItems = [];
            d.s.forEach(sData => {
              const existing = StateManager.state.songs.find(s => s.title === sData.t); let sId = existing ? existing.id : Util.uid();
              if (!existing) { StateManager.state.songs.unshift({ id: sId, title: sData.t, artist: sData.a || "", creator: sData.cr || "", links: sData.l || [], description: sData.d || "", body: sData.b, manualKey: sData.k || "auto", isFavorite: false }); }
              newItems.push({ songId: sId });
            });
            const setlistId = Util.uid(); StateManager.state.setlists.unshift({ id: setlistId, title: d.t, description: d.d || "", links: d.l || [], date: Util.now(), items: newItems }); StateManager.state.libraryFilter = 'setlists'; StateManager.playSetlist(setlistId);
            setTimeout(() => UIManager.toast("Setlist Imported!"), 500);
          } else {
            StateManager.state.sharedSong = { id: 'shared', title: d.t, artist: d.a || "", creator: d.cr || "", links: d.l || [], description: d.d || "", body: d.b, manualKey: d.k || "auto", readonly: true, isFavorite: false };
            StateManager.state.activeId = 'shared'; setTimeout(() => UIManager.toast("Viewing Shared Song"), 500);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        },
        async init() {
          try {
            const isIOS = /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

            const headerBtn = document.getElementById('headerInstallBtn');
            if (headerBtn && !isStandalone) {
              headerBtn.style.display = 'inline-flex';
            }
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('./sw.js').catch(err => {
                console.warn('ServiceWorker registration error:', err);
              });
            }
            UIManager.cache(); StateManager.init(); AudioEngine.setupListeners(); GoogleDriveSync.init();
            // Populate version display + brand version + sidebar version
            const versionEl = UIManager.dom.appVersion;
            const brandVersionEl = UIManager.dom.brandVersion;
            const sidebarVersionEl = UIManager.dom.sidebarVersion;
            fetch("version.json")
              .then(res => res.json())
              .then(data => {
                const vStr = "v" + data.version;
                if (versionEl) versionEl.textContent = vStr;
                if (brandVersionEl) brandVersionEl.textContent = vStr;
                if (sidebarVersionEl) sidebarVersionEl.textContent = vStr;
              })
              .catch(() => {
                if (versionEl) versionEl.textContent = "v1.3.0";
                if (brandVersionEl) brandVersionEl.textContent = "v1.3.0";
                if (sidebarVersionEl) sidebarVersionEl.textContent = "v1.3.0";
              });
            // Populate sidebar language select options
            if (UIManager.dom.langSelectSidebar && UIManager.dom.langSelect) {
              UIManager.dom.langSelect.querySelectorAll('option').forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.textContent;
                if (opt.selected) o.selected = true;
                UIManager.dom.langSelectSidebar.appendChild(o);
              });
            }

            const params = new URLSearchParams(window.location.search);
            const shareParam = params.get("s") || params.get("share");
            const pasteParam = params.get("paste");
            if (shareParam || pasteParam) {
              try {
                let d = null;
                if (shareParam) {
                  d = JSON.parse(await ExportManager.decompressData(shareParam));
                } else if (pasteParam) {
                  const resp = await fetch(`https://dpaste.com/${pasteParam}.txt`);
                  if (resp.ok) {
                    let rawBase64 = (await resp.text()).trim();
                    if (rawBase64.includes('?s=')) rawBase64 = rawBase64.split('?s=')[1];
                    d = JSON.parse(await ExportManager.decompressData(rawBase64.trim()));
                  }
                }
                if (d) {
                  await this.handleImport(d);
                  // Professional Information Link Preview Modal
                  const isSet = d.type === 'set';
                  const title = d.t || 'Untitled';
                  const artist = d.a || '';
                  const arranger = d.cr || '';
                  const keyStr = d.k && d.k !== 'auto' ? d.k : 'Auto-detect';
                  const capoStr = d.c ? `Capo ${d.c}` : null;
                  const songsCount = isSet && d.s ? d.s.length : null;

                  let tracklistHtml = '';
                  if (isSet && d.s && d.s.length) {
                    tracklistHtml = `
                      <div style="margin-top:14px; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--surface-2);">
                        <div style="padding:8px 12px; font-weight:700; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); border-bottom:1px solid var(--line);">Included Songs (${d.s.length})</div>
                        <div style="max-height:160px; overflow-y:auto; padding:4px 0;">
                          ${d.s.map((s, i) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; font-size:0.86rem; border-bottom:1px solid color-mix(in srgb, var(--line) 40%, transparent);">
                              <span><strong>${i + 1}.</strong> ${Util.escapeHtml(s.t || 'Untitled')}</span>
                              <span style="font-size:0.75rem; color:var(--muted); font-weight:600;">${s.k ? s.k : ''} ${s.a ? '&middot; ' + Util.escapeHtml(s.a) : ''}</span>
                            </div>
                          `).join('')}
                        </div>
                      </div>`;
                  }

                  let previewExcerpt = '';
                  if (!isSet && d.b) {
                    const lines = d.b.split('\n').filter(l => l.trim()).slice(0, 8).join('\n');
                    previewExcerpt = `
                      <div style="margin-top:14px; border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--surface-2); font-family:var(--chart-font); font-size:0.82rem; color:var(--text); max-height:140px; overflow-y:auto; line-height:1.45; white-space:pre-wrap;">${Util.escapeHtml(lines)}</div>`;
                  }

                  const previewHtml = `
                    <div style="font-family:var(--ui-font); color:var(--text);">
                      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <span style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; font-weight:800; font-size:16px;">S</span>
                        <div>
                          <span style="display:inline-block; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding:2px 8px; border-radius:999px; background:color-mix(in srgb, var(--accent) 15%, var(--surface-2)); color:var(--accent);">${isSet ? 'Shared Setlist' : 'Shared Song'}</span>
                          <h2 style="margin:2px 0 0; font-size:1.25rem; font-weight:800; line-height:1.2;">${Util.escapeHtml(title)}</h2>
                        </div>
                      </div>
                      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; font-size:0.82rem;">
                        ${artist ? `<span style="color:var(--muted); font-weight:600;">By ${Util.escapeHtml(artist)}</span>` : ''}
                        ${arranger ? `<span style="color:var(--muted);">&bull; Arranged by ${Util.escapeHtml(arranger)}</span>` : ''}
                      </div>
                      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                        ${!isSet && keyStr ? `<span class="badge" style="font-size:0.75rem; padding:4px 8px; border-radius:6px; background:var(--surface-2); border:1px solid var(--line); font-weight:700;">Key: ${keyStr}</span>` : ''}
                        ${capoStr ? `<span class="badge" style="font-size:0.75rem; padding:4px 8px; border-radius:6px; background:var(--surface-2); border:1px solid var(--line); font-weight:700;">${capoStr}</span>` : ''}
                        ${songsCount ? `<span class="badge" style="font-size:0.75rem; padding:4px 8px; border-radius:6px; background:var(--surface-2); border:1px solid var(--line); font-weight:700;">${songsCount} Songs</span>` : ''}
                      </div>
                      ${d.d ? `<p style="font-size:0.85rem; color:var(--muted); margin:0 0 10px; font-style:italic;">${Util.escapeHtml(d.d)}</p>` : ''}
                      ${tracklistHtml}
                      ${previewExcerpt}
                    </div>`;

                  UIManager.openModal({
                    title: isSet ? 'Shared Setlist' : 'Shared Song',
                    fields: [{ type: 'custom', html: previewHtml }],
                    confirmText: 'Open & Play',
                    onConfirm: () => {
                      if (isSet) {
                        StateManager.state.libraryFilter = 'setlists';
                        UIManager.switchView('library');
                      } else {
                        UIManager.switchView('editor');
                      }
                    }
                  });
                }
              } catch (e) { console.error('Share import error', e); }
            }
            if (!StateManager.state.activeId && StateManager.state.songs.length === 0) StateManager.createSong();

            UIManager.init(); ThemeManager.apply(); Editor.applySettings(); PresentationManager.applySettings(); Editor.bind(); Editor.loadActiveSong();
            UIManager.renderAll();
            if (!shareParam && !pasteParam) {
              const savedView = localStorage.getItem('sonata_active_view') || 'editor';
              UIManager.switchView(savedView);
            }
            if (StateManager.state.activeId !== 'shared') StateManager.saveNow("Ready");
          } catch (e) { console.error("Boot Error:", e); }
        }
      };

      document.addEventListener("DOMContentLoaded", () => App.init());
    })();
