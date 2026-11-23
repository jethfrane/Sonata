// @ts-check
// Isomorphic MCP tool schemas and executors for Sonata (runs in browser WebMCP,
// Vercel serverless /api/mcp, and local Node CLI/stdio MCP). Zero DOM, zero node:*.
import {
  parseKey, keyValue, keyShort, keyFromTonic, detectKey, transposeText,
  prefersFlats, mod12, noteName, SCALES, CHORD_TYPES, keySignature, relativeKey,
  diatonicChords, chordsForKey
} from "./music.js";
import { buildLines, linesToText, uniqueChords } from "./chart.js";
import { analyzeRawChart, autoFormatChart } from "./chart-format.js";
import { describeChord, voicings, TUNINGS, bassMap, pianoVoicing } from "./chords.js";
import { packSong, packSet, encodeShare, safeHref, MAX_LINK } from "./share.js";
import { songSlug } from "../router.js";

const DEFAULT_ORIGIN = "https://sonata.jethrofrane.xyz";
const TRASH_RETENTION_DAYS = 30;
const TRASH_TTL_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * @typedef {{ name: string, url: string }} Link
 * @typedef {import("./store.js").Song} Song
 * @typedef {import("./store.js").Setlist} Setlist
 * @typedef {import("./store.js").TrashEntry} TrashEntry
 * @typedef {import("./store.js").Store} LibraryStore
 * @typedef {{
 *   store?: LibraryStore,
 *   origin?: string,
 *   arranger?: string,
 *   fetchUrl?: (url: string) => Promise<{ status?: number, error?: string, title?: string, artist?: string, text?: string, body?: string, source?: string }|null>,
 *   onMutate?: (info: { tool: string, result?: any }) => void|Promise<void>
 * }} ToolContext
 * @typedef {{ readOnlyHint?: boolean, destructiveHint?: boolean, idempotentHint?: boolean, openWorldHint?: boolean }} ToolAnnotations
 * @typedef {{ name: string, description: string, inputSchema: Record<string, any>, annotations?: ToolAnnotations }} ToolDef
 */

export const SONATA_FORMAT_GUIDE = `# Sonata Chord Chart Format

Sonata charts are plain text / Markdown-inspired files designed for clean alignment across editor, stage view, print, and exports.

## Structure & Directives
- \`# Title\` — Optional heading (rarely needed when song title is set in metadata).
- \`## Section\` — Canonical section pill badge (e.g. \`## Verse 1\`, \`## Chorus\`, \`## Bridge\`, \`## Intro\`, \`## Outro\`). Use \`format_chord_chart\` to normalize messy pasted text and standard section headers automatically.
- \`> Note\` or \`// Note\` — Performance cue / arrangement note (hidden in Lyrics-only and Chords-only views).
- \`---\` — Visual divider between major parts.

## Writing Chords & View Modes
1. **Chords above lyrics** (keep spaces so chords line up over syllables):
   \`\`\`
   ## Verse 1
   G          D/F#     Em7        Cadd9
   Amazing grace how sweet the sound
   \`\`\`
2. **Inline bracketed chords**:
   \`\`\`
   [G]Amazing [D/F#]grace how [Em7]sweet the [Cadd9]sound
   \`\`\`
3. **Instrumental / rhythm notation**:
   - \`C///\` — C held for 4 beats (rhythm slashes).
   - Neutral rhythm marks on chord lines: \`|\`, \`/\`, \`%\`, \`N.C.\`, \`x2\`, \`Intro:\`, \`Tag:\`.
4. **View modes** (\`transpose_chart\`): \`chords\`, \`chords-only\` (progression + section pills with lyrics stripped), \`nashville\`, \`roman\`, or \`lyrics\`.

## Keys & Metadata
- \`manualKey\`: \`"auto"\` (auto-detected from chords) or canonical \`"<Root>:<mode>"\` such as \`"G:major"\`, \`"E:minor"\`, \`"Bb:major"\`, \`"F#:minor"\`.
- \`capo\`: integer \`0\`–\`11\` (fret number; shapes automatically reflect capo).
- \`transpose\`: non-destructive playback shift \`-11\` to \`+11\` semitones.
- \`bpm\`: integer \`30\`–\`300\` (or \`null\`).
- \`genre\` & \`mood\`: optional tags (e.g. \`genre: "Worship"\`, \`mood: "Joyful"\` or \`"Solemn"\`).
`;

const LINK_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Label for the link, e.g. YouTube or Chord reference." },
    url: { type: "string", description: "HTTP(S) URL." }
  },
  required: ["url"]
};

/** @type {ToolDef[]} */
export const PUBLIC_TOOL_DEFS = [
  {
    name: "extract_chords_from_url",
    description: "Fetch a public chord webpage URL, extract its chord chart, and analyze key, capo, BPM, chords, and Roman progression.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public HTTPS URL of a chord chart page." }
      },
      required: ["url"]
    }
  },
  {
    name: "analyze_chord_chart",
    description: "Parse raw pasted chord text (ChordPro, Ultimate Guitar, inline [G], or chord-over-lyric) into structured Sonata chart metadata, detected key, capo, BPM, and chords.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        rawChart: { type: "string", description: "Raw chord chart text." },
        sourceUrl: { type: "string", description: "Optional source reference URL to attach if missing." }
      },
      required: ["rawChart"]
    }
  },
  {
    name: "format_chord_chart",
    description: "Auto-format raw pasted chord text into canonical Sonata markdown (## Section headings, cleaned chords such as D/F#m -> D/F#, collapsed chord/lyric gaps, stripped voicing legends, balanced wrapped lines) plus extracted metadata.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        rawChart: { type: "string", description: "Raw chord chart text to format." },
        maxCols: { type: "integer", minimum: 36, maximum: 100, description: "Max line width before wrapping chord/lyric pairs (default: 58)." },
        wrap: { type: "boolean", description: "Wrap overly long chord/lyric lines cleanly (default: true)." },
        sourceUrl: { type: "string", description: "Optional source reference URL to attach if missing." }
      },
      required: ["rawChart"]
    }
  },
  {
    name: "build_sonata_link",
    description: "Build a compressed Sonata ?s= share/import URL for a single song or a full setlist.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Song or setlist title." },
        body: { type: "string", description: "Song chart body (for single-song links)." },
        artist: { type: "string" },
        creator: { type: "string", description: "Arranger / creator name." },
        key: { type: "string", description: "Key such as 'G', 'Em', 'G:major', or 'auto'." },
        capo: { type: "integer", minimum: 0, maximum: 11 },
        transpose: { type: "integer", minimum: -11, maximum: 11 },
        bpm: { type: "integer", minimum: 30, maximum: 300 },
        genre: { type: "string" },
        mood: { type: "string", description: "Optional tone/mood tag (e.g. Joyful, Solemn, Reflective)." },
        description: { type: "string" },
        links: { type: "array", items: LINK_SCHEMA },
        songs: {
          type: "array",
          description: "If provided, builds a setlist link containing these songs.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              artist: { type: "string" },
              creator: { type: "string" },
              key: { type: "string" },
              capo: { type: "integer", minimum: 0, maximum: 11 },
              transpose: { type: "integer", minimum: -11, maximum: 11 },
              bpm: { type: "integer", minimum: 30, maximum: 300 },
              genre: { type: "string" },
              mood: { type: "string" },
              description: { type: "string" },
              links: { type: "array", items: LINK_SCHEMA }
            },
            required: ["title"]
          }
        }
      },
      required: ["title"]
    }
  },
  {
    name: "lookup_chord",
    description: "Look up chord tones, interval formula, and playable voicings for guitar, ukulele, bass, and piano.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        chord: { type: "string", description: "Chord symbol such as 'G', 'F#m7', 'D/F#', 'Cmaj7', 'Bbadd9'." },
        instrument: {
          type: "string",
          enum: ["all", "guitar", "ukulele", "bass", "piano"],
          description: "Instrument diagrams/voicings to return (default: 'all')."
        }
      },
      required: ["chord"]
    }
  },
  {
    name: "transpose_chart",
    description: "Transpose a chord chart by semitone steps or between keys, and optionally render in chords-only, Nashville numbers, Roman numerals, or lyrics-only mode.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        body: { type: "string", description: "Chord chart text." },
        steps: { type: "integer", minimum: -11, maximum: 11, description: "Semitone shift (-11 to +11)." },
        fromKey: { type: "string", description: "Source key (e.g. 'G', 'Am')." },
        toKey: { type: "string", description: "Target key (e.g. 'A', 'Bm')." },
        viewMode: { type: "string", enum: ["chords", "chords-only", "nashville", "roman", "lyrics"], description: "Output view mode (default: 'chords')." },
        enharmonic: { type: "string", enum: ["auto", "sharp", "flat"], description: "Accidental spelling preference." }
      },
      required: ["body"]
    }
  },
  {
    name: "get_key_info",
    description: "Get scale notes, key signature, relative major/minor key, diatonic chords, and common chord progressions/families for a musical key.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Musical key such as 'G', 'Eb', 'F#m', 'A:minor'." }
      },
      required: ["key"]
    }
  }
];

/** @type {ToolDef[]} */
export const LIBRARY_TOOL_DEFS = [
  {
    name: "get_library_summary",
    description: "Return library counts (songs, setlists, favorites, inBank, trash) and recent song titles/ids.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "list_songs",
    description: "List compact song summaries from the user's Sonata library with optional search query, genre, and mood filters.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter by title, artist, creator, genre, mood, or lyrics/chords." },
        genre: { type: "string", description: "Filter by genre (case-insensitive substring match)." },
        mood: { type: "string", description: "Filter by mood/tone (case-insensitive substring match)." },
        favoritesOnly: { type: "boolean" },
        inBankOnly: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max songs to return (default 50)." },
        offset: { type: "integer", minimum: 0, description: "Pagination offset (default 0)." }
      }
    }
  },
  {
    name: "get_song",
    description: "Get the full song object (including body, links, and soundingKey) by song id or search query.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact song ID." },
        query: { type: "string", description: "Title/artist search query if id is not known." }
      }
    }
  },
  {
    name: "create_song",
    description: "Create and save a new song in the user's library (optionally parsing rawChart), returning the saved song and Sonata URLs.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        artist: { type: "string" },
        creator: { type: "string" },
        body: { type: "string" },
        rawChart: { type: "string", description: "Optional raw chart to auto-parse title, key, capo, bpm, links, and body." },
        key: { type: "string", description: "Key such as 'G', 'Em', 'G:major', or 'auto'." },
        capo: { type: "integer", minimum: 0, maximum: 11 },
        transpose: { type: "integer", minimum: -11, maximum: 11 },
        bpm: { type: "integer", minimum: 30, maximum: 300 },
        genre: { type: "string" },
        mood: { type: "string", description: "Optional mood/tone (e.g. Joyful, Solemn, Reflective)." },
        description: { type: "string" },
        links: { type: "array", items: LINK_SCHEMA },
        isFavorite: { type: "boolean" },
        inBank: { type: "boolean" }
      }
    }
  },
  {
    name: "import_song_from_url",
    description: "Import a song from a public chord URL or pasted rawChart, check for duplicates unless allowDuplicate is true, and save to the library.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public HTTPS URL of a chord page." },
        rawChart: { type: "string", description: "Pre-fetched/cleaned chord chart text (skips HTTP fetch when provided)." },
        title: { type: "string" },
        artist: { type: "string" },
        key: { type: "string" },
        capo: { type: "integer", minimum: 0, maximum: 11 },
        bpm: { type: "integer", minimum: 30, maximum: 300 },
        genre: { type: "string" },
        mood: { type: "string", description: "Optional mood/tone (e.g. Joyful, Solemn, Reflective)." },
        description: { type: "string" },
        allowDuplicate: { type: "boolean", description: "Save even if a song with matching title or link already exists." }
      }
    }
  },
  {
    name: "update_song",
    description: "Update an existing song's metadata or chart body, with optional permanent chord transposition via transposeBy.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Song ID to update." },
        title: { type: "string" },
        artist: { type: "string" },
        creator: { type: "string" },
        body: { type: "string" },
        key: { type: "string" },
        capo: { type: "integer", minimum: 0, maximum: 11 },
        transpose: { type: "integer", minimum: -11, maximum: 11 },
        transposeBy: { type: "integer", minimum: -11, maximum: 11, description: "Permanently transpose all chords in body by N semitones." },
        bpm: { type: ["integer", "null"], minimum: 30, maximum: 300 },
        genre: { type: "string" },
        mood: { type: "string", description: "Optional mood/tone (e.g. Joyful, Solemn, Reflective)." },
        description: { type: "string" },
        links: { type: "array", items: LINK_SCHEMA },
        isFavorite: { type: "boolean" },
        inBank: { type: "boolean" }
      },
      required: ["id"]
    }
  },
  {
    name: "trash_song",
    description: "Move one or more songs to Trash (30-day soft delete; safe and reversible via restore_from_trash).",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, description: "Song IDs to move to Trash." }
      },
      required: ["ids"]
    }
  },
  {
    name: "list_trash",
    description: "List all trashed songs and setlists with trashedAt and 30-day expiresAt timestamps.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "restore_from_trash",
    description: "Restore trashed songs or setlists back to the library, preserving IDs and restoring setlist memberships.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, description: "Trashed song or setlist IDs to restore." }
      },
      required: ["ids"]
    }
  },
  {
    name: "empty_trash",
    description: "Permanently purge items from Trash. Always returns a safe preview unless confirm: true is explicitly passed.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "Must be true to permanently delete items from Trash." },
        ids: { type: "array", items: { type: "string" }, description: "Optional specific Trash IDs to permanently delete; omits to empty all Trash." }
      }
    }
  },
  {
    name: "manage_setlists",
    description: "List, create, update, append songs to, or soft-delete (trash) setlists.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create", "update", "add_songs", "trash"] },
        id: { type: "string", description: "Setlist ID (required for update, add_songs, trash)." },
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags such as Church, Gig, Performance, Rehearsal." },
        isFavorite: { type: "boolean" },
        songIds: { type: "array", items: { type: "string" }, description: "Ordered song IDs for create/update/add_songs." }
      },
      required: ["action"]
    }
  }
];

/** @type {ToolDef[]} */
export const ALL_TOOL_DEFS = [...PUBLIC_TOOL_DEFS, ...LIBRARY_TOOL_DEFS];

export const PUBLIC_TOOL_NAMES = new Set(PUBLIC_TOOL_DEFS.map((t) => t.name));

/** Accent- and case-insensitive text folding. @param {unknown} s */
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** @param {unknown} v @param {number} lo @param {number} hi */
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v))));

/** @param {unknown} keyArg @returns {string} */
function normalizeManualKey(keyArg) {
  if (keyArg === undefined || keyArg === null || keyArg === "" || keyArg === "auto") return "auto";
  const parsed = parseKey(keyArg);
  if (!parsed) throw new Error(`Invalid key: "${String(keyArg)}"`);
  return keyValue(parsed);
}

/** @param {unknown} rawLinks @returns {Link[]} */
function cleanLinksInput(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  /** @type {Link[]} */
  const out = [];
  for (const l of rawLinks) {
    if (!l || typeof l !== "object") continue;
    const rawUrl = str(/** @type {any} */ (l).url).trim();
    const href = safeHref(rawUrl);
    if (!href) continue;
    const name = str(/** @type {any} */ (l).name).trim() || (/youtu\.?be|youtube\.com/i.test(href) ? "YouTube" : "Link");
    out.push({ name, url: href });
  }
  return out;
}

/** @param {Link[]} links @param {string} [sourceUrl] @returns {Link[]} */
function withSourceLink(links, sourceUrl) {
  const clean = links.slice();
  const href = sourceUrl ? safeHref(sourceUrl) : "";
  if (href && !clean.some((l) => normLinkUrl(l.url) === normLinkUrl(href))) {
    clean.push({ name: /youtu\.?be|youtube\.com/i.test(href) ? "YouTube" : "Chord reference", url: href });
  }
  return clean;
}

/** @param {{ body?: string, manualKey?: string, transpose?: number }} song */
function songSoundingKey(song) {
  const written = parseKey(song.manualKey) || (song.body?.trim() ? detectKey(song.body) : null) || keyFromTonic(0, "major");
  return keyFromTonic(written.tonic + (song.transpose || 0), written.mode);
}

/** @param {string} origin */
function cleanOrigin(origin) {
  return String(origin || DEFAULT_ORIGIN).replace(/\/+$/, "") || DEFAULT_ORIGIN;
}

/** @param {string} origin @param {any} song */
async function songUrls(origin, song) {
  const base = cleanOrigin(origin);
  const encoded = await encodeShare(packSong(song));
  return {
    sonataUrl: `${base}/song/${songSlug(song)}`,
    shareUrl: `${base}/?s=${encoded}`
  };
}

/** @param {number[]} frets */
function fretsToShape(frets) {
  return frets.map((f) => (f < 0 ? "x" : f < 10 ? String(f) : f.toString(36))).join("");
}

/** @param {string} url @param {ToolContext} ctx */
async function fetchAndAnalyzeUrl(url, ctx) {
  const cleanUrl = str(url).trim();
  if (!cleanUrl) throw new Error("url is required.");
  if (typeof ctx?.fetchUrl !== "function") {
    throw new Error("URL fetching is not configured in this context.");
  }
  const page = await ctx.fetchUrl(cleanUrl);
  if (!page || page.error || (typeof page.status === "number" && page.status >= 400)) {
    const code = page?.error || `status-${page?.status || "failed"}`;
    throw new Error(`Could not extract chart from URL (${code}).`);
  }
  const rawText = str(page.text ?? page.body ?? "");
  const source = str(page.source || cleanUrl).trim();
  const combined = [
    source,
    page.title ? `Title: ${str(page.title).trim()}` : "",
    page.artist ? `Artist: ${str(page.artist).trim()}` : "",
    rawText
  ].filter(Boolean).join("\n");
  const analyzed = analyzeRawChart(combined);
  if (!analyzed) {
    throw new Error("No chords found on that page (no-chords).");
  }
  return {
    ...analyzed,
    links: withSourceLink(analyzed.links, source),
    source
  };
}

/** @param {string} name @param {any} args @param {ToolContext} [ctx] */
export async function executePublicTool(name, args, ctx = {}) {
  const input = args && typeof args === "object" ? args : {};

  if (name === "extract_chords_from_url") {
    return await fetchAndAnalyzeUrl(input.url, ctx);
  }

  if (name === "analyze_chord_chart") {
    const rawChart = str(input.rawChart);
    if (!rawChart.trim()) throw new Error("rawChart is required.");
    const analyzed = analyzeRawChart(rawChart);
    if (!analyzed) throw new Error("No recognizable chords found in rawChart.");
    const sourceUrl = str(input.sourceUrl).trim();
    return {
      ...analyzed,
      links: withSourceLink(analyzed.links, sourceUrl)
    };
  }

  if (name === "format_chord_chart") {
    const rawChart = str(input.rawChart);
    if (!rawChart.trim()) throw new Error("rawChart is required.");
    const maxCols = input.maxCols !== undefined ? clampInt(input.maxCols, 36, 100) : 58;
    const wrap = input.wrap !== false;
    const sourceUrl = str(input.sourceUrl).trim();
    const formatted = autoFormatChart(rawChart, { maxCols, wrap });
    return {
      ...formatted,
      links: withSourceLink(formatted.links, sourceUrl)
    };
  }

  if (name === "build_sonata_link") {
    const origin = cleanOrigin(ctx?.origin || DEFAULT_ORIGIN);
    const isSet = Array.isArray(input.songs) && input.songs.length > 0;
    if (isSet) {
      const packedSongs = input.songs.map((/** @type {any} */ s) => packSong({
        title: str(s?.title).trim() || "Untitled Song",
        body: str(s?.body),
        artist: str(s?.artist),
        creator: str(s?.creator),
        manualKey: normalizeManualKey(s?.key ?? s?.manualKey),
        capo: s?.capo ?? 0,
        transpose: s?.transpose ?? 0,
        bpm: s?.bpm ?? null,
        genre: str(s?.genre),
        mood: str(s?.mood),
        description: str(s?.description),
        links: cleanLinksInput(s?.links)
      }));
      const setTitle = str(input.title).trim() || "Untitled Setlist";
      const packed = packSet({
        title: setTitle,
        description: str(input.description),
        links: cleanLinksInput(input.links)
      }, packedSongs);
      const encoded = await encodeShare(packed);
      if (encoded.length > MAX_LINK) throw new Error("Encoded setlist link exceeds maximum share length.");
      return {
        url: `${origin}/?s=${encoded}`,
        type: "setlist",
        title: setTitle,
        songCount: packedSongs.length
      };
    }
    const title = str(input.title).trim();
    const body = str(input.body);
    if (!title && !body.trim()) throw new Error("title or body is required.");
    const packed = packSong({
      title: title || "Untitled Song",
      body,
      artist: str(input.artist),
      creator: str(input.creator),
      manualKey: normalizeManualKey(input.key),
      capo: input.capo ?? 0,
      transpose: input.transpose ?? 0,
      bpm: input.bpm ?? null,
      genre: str(input.genre),
      mood: str(input.mood),
      description: str(input.description),
      links: cleanLinksInput(input.links)
    });
    const encoded = await encodeShare(packed);
    if (encoded.length > MAX_LINK) throw new Error("Encoded song link exceeds maximum share length.");
    return {
      url: `${origin}/?s=${encoded}`,
      type: "song",
      title: packed.t
    };
  }

  if (name === "lookup_chord") {
    const rawChord = str(input.chord).trim();
    if (!rawChord) throw new Error("chord is required.");
    const info = describeChord(rawChord);
    if (!info) throw new Error(`Unknown or invalid chord: "${rawChord}".`);
    const instrument = str(input.instrument || "all");
    if (!["all", "guitar", "ukulele", "bass", "piano"].includes(instrument)) {
      throw new Error(`Invalid instrument: "${instrument}".`);
    }
    /** @type {Record<string, any>} */
    const out = {
      name: info.name,
      root: info.root,
      quality: info.quality,
      label: info.label,
      slashBass: info.bass,
      notes: info.notes,
      bassNote: info.bassNote,
      formula: info.formula,
      intervals: info.intervals,
      pcs: info.pcs
    };
    const mapVoicing = (/** @type {import("./chords.js").Voicing} */ v) => ({
      ...v,
      shape: fretsToShape(v.frets)
    });
    if (instrument === "all" || instrument === "guitar") {
      out.guitar = voicings(info.name, TUNINGS.guitar.strings, { max: 6 }).map(mapVoicing);
    }
    if (instrument === "all" || instrument === "ukulele") {
      out.ukulele = voicings(info.name, TUNINGS.ukulele.strings, { max: 6 }).map(mapVoicing);
    }
    if (instrument === "all" || instrument === "bass") {
      out.bass = bassMap(info.name);
    }
    if (instrument === "all" || instrument === "piano") {
      const pv = pianoVoicing(info.name);
      const flats = info.root.includes("b") || info.notes.some((n) => n.includes("b"));
      out.piano = pv ? {
        ...pv,
        bassNote: noteName(pv.bass, flats),
        noteNames: pv.notes.map((m) => noteName(m, flats))
      } : null;
    }
    return out;
  }

  if (name === "transpose_chart") {
    const body = str(input.body);
    if (!body.trim()) throw new Error("body is required.");
    const viewMode = /** @type {"chords"|"chords-only"|"nashville"|"roman"|"lyrics"} */ (str(input.viewMode || "chords"));
    if (!["chords", "chords-only", "nashville", "roman", "lyrics"].includes(viewMode)) {
      throw new Error(`Invalid viewMode: "${viewMode}".`);
    }
    const enharmonic = /** @type {"auto"|"sharp"|"flat"} */ (str(input.enharmonic || "auto"));
    if (!["auto", "sharp", "flat"].includes(enharmonic)) {
      throw new Error(`Invalid enharmonic: "${enharmonic}".`);
    }
    const fk = input.fromKey ? parseKey(input.fromKey) : null;
    if (input.fromKey && !fk) throw new Error(`Invalid fromKey: "${String(input.fromKey)}".`);
    const tk = input.toKey ? parseKey(input.toKey) : null;
    if (input.toKey && !tk) throw new Error(`Invalid toKey: "${String(input.toKey)}".`);

    const refKey = fk || detectKey(body);
    let steps = 0;
    if (input.steps !== undefined && input.steps !== null) {
      steps = clampInt(input.steps, -11, 11);
    } else if (refKey && tk) {
      steps = mod12(tk.tonic - refKey.tonic);
    } else if (tk && !refKey) {
      throw new Error("Could not infer source key from chart; pass fromKey or steps.");
    }

    const spelling = enharmonic === "auto" && tk
      ? (prefersFlats(tk, "auto") ? "flat" : "sharp")
      : enharmonic;
    const transposedBody = transposeText(body, steps, refKey, spelling);
    const outKey = tk || (refKey ? keyFromTonic(refKey.tonic + steps, refKey.mode, spelling) : detectKey(transposedBody));
    const renderKey = outKey || keyFromTonic(0, "major", spelling);
    const text = viewMode === "chords"
      ? transposedBody
      : linesToText(buildLines(transposedBody, { key: renderKey, mode: viewMode, spelling }));
    const chords = viewMode === "lyrics" ? [] : uniqueChords(transposedBody, { key: renderKey, mode: "chords", spelling });
    return {
      text,
      fromKey: refKey ? refKey.name : null,
      toKey: outKey ? outKey.name : null,
      steps,
      viewMode,
      chords
    };
  }

  if (name === "get_key_info") {
    const rawKey = str(input.key).trim();
    if (!rawKey) throw new Error("key is required.");
    const k = parseKey(rawKey);
    if (!k) throw new Error(`Invalid key: "${rawKey}".`);
    const sig = keySignature(k);
    const rel = relativeKey(k);
    const flats = prefersFlats(k);
    const scale = SCALES[k.mode].map((s) => noteName(mod12(k.tonic + s), flats));
    /** @type {Record<string, { name: string, numeral: string, pc: number }[]>} */
    const families = {};
    for (const ct of CHORD_TYPES) {
      families[ct.id] = chordsForKey(k, ct.id);
    }
    return {
      key: k.name,
      value: keyValue(k),
      short: keyShort(k),
      root: k.root,
      mode: k.mode,
      signature: sig,
      relative: {
        name: rel.name,
        value: keyValue(rel),
        short: keyShort(rel)
      },
      scale,
      diatonic: diatonicChords(k),
      families
    };
  }

  throw new Error(`Unknown public tool: "${name}".`);
}

/** @param {unknown} raw @returns {string[]} */
function requireIds(raw) {
  if (!Array.isArray(raw)) throw new Error("ids must be a non-empty array of strings.");
  const ids = [...new Set(raw.map((x) => str(x).trim()).filter(Boolean))];
  if (!ids.length) throw new Error("ids must be a non-empty array of strings.");
  return ids;
}

/** @param {string} title @returns {string} */
const normTitle = (title) => str(title).trim().toLowerCase().replace(/\s+/g, " ");

/** @param {string} url @returns {string} */
function normLinkUrl(url) {
  try {
    const u = new URL(str(url).trim());
    return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch {
    return str(url).trim().toLowerCase();
  }
}

/** @param {string} name @param {any} args @param {ToolContext} ctx */
export async function executeLibraryTool(name, args, ctx) {
  if (PUBLIC_TOOL_NAMES.has(name)) {
    return await executePublicTool(name, args, ctx);
  }
  const store = ctx?.store;
  if (!store) throw new Error("Authenticated library store is required.");
  const input = args && typeof args === "object" ? args : {};
  const origin = cleanOrigin(ctx?.origin || DEFAULT_ORIGIN);
  const notify = async (/** @type {any} */ result) => {
    if (typeof ctx?.onMutate === "function") await ctx.onMutate({ tool: name, result });
  };

  if (name === "get_library_summary") {
    const ts = (/** @type {Song} */ s) => Date.parse(s.lastOpenedAt || s.updatedAt || "") || 0;
    const recentSongs = store.songs.slice().sort((a, b) => ts(b) - ts(a)).slice(0, 10).map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: keyShort(songSoundingKey(s)),
      updatedAt: s.updatedAt
    }));
    return {
      counts: {
        songs: store.songs.length,
        setlists: store.setlists.length,
        favorites: store.songs.filter((s) => s.isFavorite).length,
        inBank: store.songs.filter((s) => s.inBank).length,
        trash: Array.isArray(store.trash) ? store.trash.length : 0
      },
      recentSongs
    };
  }

  if (name === "list_songs") {
    let items = store.songs.slice().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    if (input.favoritesOnly) items = items.filter((s) => s.isFavorite);
    if (input.inBankOnly) items = items.filter((s) => s.inBank);
    const gf = fold(str(input.genre).trim());
    if (gf) items = items.filter((s) => fold(s.genre).includes(gf));
    const mf = fold(str(input.mood).trim());
    if (mf) items = items.filter((s) => fold(s.mood).includes(mf));
    const q = fold(str(input.query).trim());
    if (q) {
      items = items.filter((s) => fold(`${s.title} ${s.artist} ${s.creator} ${s.genre} ${s.mood || ""} ${s.body}`).includes(q));
    }
    const total = items.length;
    const offset = Math.max(0, Math.round(Number(input.offset) || 0));
    const limit = Math.min(200, Math.max(1, Math.round(Number(input.limit) || 50)));
    const songs = items.slice(offset, offset + limit).map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: keyShort(songSoundingKey(s)),
      bpm: s.bpm,
      capo: s.capo,
      genre: s.genre || "",
      mood: s.mood || "",
      isFavorite: s.isFavorite,
      inBank: s.inBank,
      updatedAt: s.updatedAt
    }));
    return { total, offset, limit, songs };
  }

  if (name === "get_song") {
    const id = str(input.id).trim();
    const q = fold(str(input.query).trim());
    /** @type {Song|null} */
    let song = id ? store.song(id) : null;
    if (!song && q) {
      song = store.songs.find((s) => fold(s.title) === q)
        || store.songs.find((s) => fold(`${s.title} ${s.artist}`).includes(q))
        || store.songs.find((s) => fold(s.body).includes(q))
        || null;
    }
    if (!song) throw new Error("Song not found.");
    const sounding = songSoundingKey(song);
    return {
      ...song,
      soundingKey: sounding.name,
      soundingKeyShort: keyShort(sounding)
    };
  }

  if (name === "create_song") {
    const rawChart = input.rawChart !== undefined ? str(input.rawChart) : "";
    const parsed = rawChart.trim() ? analyzeRawChart(rawChart) : null;
    /** @type {Partial<Song>} */
    const data = {
      title: parsed?.title || "",
      artist: parsed?.artist || "",
      manualKey: parsed?.manualKey || "auto",
      capo: parsed?.capo || 0,
      bpm: parsed?.bpm ?? null,
      links: parsed?.links || [],
      body: parsed?.body ?? (rawChart.trim() ? rawChart : "")
    };
    if (input.title !== undefined) data.title = str(input.title).trim() || "Untitled";
    if (input.artist !== undefined) data.artist = str(input.artist);
    if (input.creator !== undefined) data.creator = str(input.creator);
    if (input.body !== undefined) data.body = str(input.body);
    if (input.key !== undefined) data.manualKey = normalizeManualKey(input.key);
    if (input.capo !== undefined) data.capo = clampInt(input.capo, 0, 11);
    if (input.transpose !== undefined) data.transpose = clampInt(input.transpose, -11, 11);
    if (input.bpm !== undefined) data.bpm = input.bpm === null ? null : clampInt(input.bpm, 30, 300);
    if (input.genre !== undefined) data.genre = str(input.genre).trim().slice(0, 40);
    if (input.mood !== undefined) data.mood = str(input.mood).trim().slice(0, 30);
    if (input.description !== undefined) data.description = str(input.description);
    if (input.links !== undefined) data.links = cleanLinksInput(input.links);
    if (input.isFavorite !== undefined) data.isFavorite = Boolean(input.isFavorite);
    if (input.inBank !== undefined) data.inBank = Boolean(input.inBank);
    if (!data.title && !data.body?.trim()) throw new Error("Provide at least title, body, or rawChart.");
    const song = store.createSong(data, ctx?.arranger || "");
    const urls = await songUrls(origin, song);
    const res = { song, ...urls };
    await notify(res);
    return res;
  }

  if (name === "import_song_from_url") {
    const rawChart = input.rawChart !== undefined ? str(input.rawChart) : "";
    const sourceUrl = input.url !== undefined ? str(input.url).trim() : "";
    if (!rawChart.trim() && !sourceUrl) throw new Error("Provide url or rawChart.");
    let analyzed;
    if (rawChart.trim()) {
      analyzed = analyzeRawChart(rawChart);
      if (!analyzed) {
        analyzed = {
          title: "",
          artist: "",
          manualKey: "auto",
          capo: 0,
          bpm: null,
          links: [],
          body: rawChart.trim()
        };
      }
      analyzed.links = withSourceLink(analyzed.links, sourceUrl);
    } else {
      analyzed = await fetchAndAnalyzeUrl(sourceUrl, ctx);
    }

    const title = input.title !== undefined ? (str(input.title).trim() || "Untitled") : (analyzed.title || "Imported Song");
    const artist = input.artist !== undefined ? str(input.artist) : (analyzed.artist || "");
    const manualKey = input.key !== undefined ? normalizeManualKey(input.key) : (analyzed.manualKey || "auto");
    const capo = input.capo !== undefined ? clampInt(input.capo, 0, 11) : (analyzed.capo || 0);
    const bpm = input.bpm !== undefined ? (input.bpm === null ? null : clampInt(input.bpm, 30, 300)) : (analyzed.bpm ?? null);
    const genre = input.genre !== undefined ? str(input.genre).trim().slice(0, 40) : "";
    const mood = input.mood !== undefined ? str(input.mood).trim().slice(0, 30) : "";
    const description = input.description !== undefined ? str(input.description) : "";
    const links = analyzed.links || [];

    if (!input.allowDuplicate) {
      const targetTitle = normTitle(title);
      const targetUrls = new Set(links.map((l) => normLinkUrl(l.url)).concat(sourceUrl ? [normLinkUrl(sourceUrl)] : []).filter(Boolean));
      const existing = store.songs.find((s) =>
        (targetTitle && normTitle(s.title) === targetTitle)
        || (targetUrls.size > 0 && (s.links || []).some((l) => targetUrls.has(normLinkUrl(l.url))))
      );
      if (existing) {
        return {
          duplicate: true,
          existingSong: existing,
          message: `A matching song ("${existing.title}") is already in the library. Pass allowDuplicate: true to save another copy.`
        };
      }
    }

    const song = store.createSong({
      title,
      artist,
      manualKey,
      capo,
      bpm,
      genre,
      mood,
      description,
      links,
      body: analyzed.body
    }, ctx?.arranger || "");
    const urls = await songUrls(origin, song);
    const res = { song, ...urls };
    await notify(res);
    return res;
  }

  if (name === "update_song") {
    const id = str(input.id).trim();
    const song = store.song(id);
    if (!song) throw new Error(`Song not found: "${id}".`);
    if (song.readonly) throw new Error("Cannot modify a read-only shared song.");

    /** @type {Partial<Song>} */
    const patch = {};
    if (input.title !== undefined) patch.title = str(input.title).trim() || "Untitled";
    if (input.artist !== undefined) patch.artist = str(input.artist);
    if (input.creator !== undefined) patch.creator = str(input.creator);
    if (input.body !== undefined) patch.body = str(input.body);
    if (input.key !== undefined) patch.manualKey = normalizeManualKey(input.key);
    if (input.capo !== undefined) patch.capo = clampInt(input.capo, 0, 11);
    if (input.transpose !== undefined) patch.transpose = clampInt(input.transpose, -11, 11);
    if (input.bpm !== undefined) patch.bpm = input.bpm === null ? null : clampInt(input.bpm, 30, 300);
    if (input.genre !== undefined) patch.genre = str(input.genre).trim().slice(0, 40);
    if (input.mood !== undefined) patch.mood = str(input.mood).trim().slice(0, 30);
    if (input.description !== undefined) patch.description = str(input.description);
    if (input.links !== undefined) patch.links = cleanLinksInput(input.links);
    if (input.isFavorite !== undefined) patch.isFavorite = Boolean(input.isFavorite);
    if (input.inBank !== undefined) patch.inBank = Boolean(input.inBank);

    if (input.transposeBy !== undefined && input.transposeBy !== null) {
      const steps = clampInt(input.transposeBy, -11, 11);
      if (steps !== 0) {
        const baseBody = patch.body !== undefined ? patch.body : song.body;
        const fromKey = parseKey(song.manualKey) || (baseBody.trim() ? detectKey(baseBody) : null) || keyFromTonic(0, "major");
        const pref = /** @type {"auto"|"sharp"|"flat"} */ (store.settings?.enharmonicPref || "auto");
        patch.body = transposeText(baseBody, steps, fromKey, pref);
        if (input.key === undefined && song.manualKey && song.manualKey !== "auto") {
          patch.manualKey = keyValue(keyFromTonic(fromKey.tonic + steps, fromKey.mode, pref));
        }
      }
    }

    store.update(song, patch);
    if (store.activeId === song.id) store.emit("song-open", song);
    const res = { song };
    await notify(res);
    return res;
  }

  if (name === "trash_song") {
    const ids = requireIds(input.ids);
    if (typeof store.trashSongs !== "function") throw new Error("Trash API is unavailable on this store.");
    const moved = store.trashSongs(ids);
    const res = {
      trashedCount: moved.length,
      trashedIds: moved.map((e) => e.id),
      retentionDays: TRASH_RETENTION_DAYS
    };
    await notify(res);
    return res;
  }

  if (name === "list_trash") {
    const entries = Array.isArray(store.trash) ? store.trash : [];
    const items = entries.map((e) => {
      const trashedMs = Date.parse(e.trashedAt) || Date.now();
      return {
        id: e.id,
        kind: e.kind,
        title: str(e.item?.title || "Untitled"),
        ...(e.kind === "song" ? { artist: str(e.item?.artist || "") } : { songCount: Array.isArray(e.item?.items) ? e.item.items.length : 0 }),
        trashedAt: e.trashedAt,
        expiresAt: new Date(trashedMs + TRASH_TTL_MS).toISOString()
      };
    });
    return { count: items.length, retentionDays: TRASH_RETENTION_DAYS, items };
  }

  if (name === "restore_from_trash") {
    const ids = requireIds(input.ids);
    if (typeof store.restoreFromTrash !== "function") throw new Error("Trash API is unavailable on this store.");
    const restored = store.restoreFromTrash(ids);
    const res = {
      restoredSongs: restored.songs.length,
      restoredSetlists: restored.setlists.length,
      songs: restored.songs,
      setlists: restored.setlists
    };
    await notify(res);
    return res;
  }

  if (name === "empty_trash") {
    const entries = Array.isArray(store.trash) ? store.trash : [];
    const filterIds = Array.isArray(input.ids) ? input.ids.map((x) => str(x).trim()).filter(Boolean) : [];
    const target = filterIds.length ? entries.filter((e) => filterIds.includes(e.id)) : entries;
    if (input.confirm !== true) {
      return {
        requiresConfirmation: true,
        count: target.length,
        items: target.map((e) => ({ id: e.id, kind: e.kind, title: str(e.item?.title || "Untitled"), trashedAt: e.trashedAt })),
        message: target.length
          ? `This will permanently delete ${target.length} item(s) from Trash and cannot be undone. Re-run empty_trash with confirm: true only after user confirmation.`
          : "Trash is already empty."
      };
    }
    if (typeof store.purgeFromTrash !== "function" || typeof store.emptyTrash !== "function") {
      throw new Error("Trash API is unavailable on this store.");
    }
    const purgedCount = filterIds.length ? store.purgeFromTrash(filterIds) : store.emptyTrash();
    const res = {
      confirmed: true,
      purgedCount,
      remainingTrashCount: Array.isArray(store.trash) ? store.trash.length : 0
    };
    await notify(res);
    return res;
  }

  if (name === "manage_setlists") {
    const action = str(input.action);
    if (action === "list") {
      return {
        total: store.setlists.length,
        setlists: store.setlists.map((sl) => ({
          id: sl.id,
          title: sl.title,
          description: sl.description,
          tags: sl.tags || [],
          isFavorite: Boolean(sl.isFavorite),
          songCount: sl.items.length,
          songIds: sl.items.map((i) => i.songId),
          updatedAt: sl.updatedAt
        }))
      };
    }
    const cleanSongItems = (/** @type {unknown} */ rawIds) => {
      const seen = new Set();
      /** @type {{ songId: string }[]} */
      const items = [];
      if (!Array.isArray(rawIds)) return items;
      for (const x of rawIds) {
        const sid = str(x).trim();
        if (!sid || seen.has(sid) || !store.song(sid)) continue;
        seen.add(sid);
        items.push({ songId: sid });
      }
      return items;
    };
    if (action === "create") {
      const setlist = store.saveSetlist({
        title: str(input.title).trim() || "Untitled Setlist",
        description: str(input.description),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isFavorite !== undefined ? { isFavorite: Boolean(input.isFavorite) } : {}),
        items: cleanSongItems(input.songIds)
      });
      const res = { setlist };
      await notify(res);
      return res;
    }
    const id = str(input.id).trim();
    if (!id) throw new Error("Setlist id is required.");
    const existing = store.setlists.find((x) => x.id === id);
    if (!existing) throw new Error(`Setlist not found: "${id}".`);

    if (action === "update") {
      /** @type {Partial<Setlist>} */
      const patch = { id: existing.id };
      if (input.title !== undefined) patch.title = str(input.title).trim() || "Untitled Setlist";
      if (input.description !== undefined) patch.description = str(input.description);
      if (input.tags !== undefined) patch.tags = input.tags;
      if (input.isFavorite !== undefined) patch.isFavorite = Boolean(input.isFavorite);
      if (input.songIds !== undefined) patch.items = cleanSongItems(input.songIds);
      const setlist = store.saveSetlist(patch);
      const res = { setlist };
      await notify(res);
      return res;
    }
    if (action === "add_songs") {
      const idsToAdd = Array.isArray(input.songIds) ? input.songIds.map((x) => str(x).trim()).filter(Boolean) : [];
      const seen = new Set(existing.items.map((i) => i.songId));
      /** @type {{ songId: string }[]} */
      const added = [];
      for (const sid of idsToAdd) {
        if (seen.has(sid) || !store.song(sid)) continue;
        seen.add(sid);
        added.push({ songId: sid });
      }
      const setlist = store.saveSetlist({ id: existing.id, items: [...existing.items, ...added] });
      const res = { addedCount: added.length, setlist };
      await notify(res);
      return res;
    }
    if (action === "trash") {
      if (typeof store.trashSetlist !== "function") throw new Error("Trash API is unavailable on this store.");
      const trashed = store.trashSetlist(id);
      if (!trashed) throw new Error(`Setlist not found: "${id}".`);
      const res = {
        trashed: true,
        id: trashed.id,
        title: str(trashed.item?.title || existing.title),
        retentionDays: TRASH_RETENTION_DAYS
      };
      await notify(res);
      return res;
    }
    throw new Error(`Unsupported manage_setlists action: "${action}".`);
  }

  throw new Error(`Unknown tool: "${name}".`);
}
