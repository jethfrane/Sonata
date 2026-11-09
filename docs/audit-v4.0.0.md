# Sonata v4.0.0 (2026-11-09): features, fixes and re-audit

Builds on v3.2.0 (`docs/audit-v3.2.0.md`). Goal from Jethro: smaller QR codes and links, link previews for every page, many more chord types (slash chords included), a chord dictionary with diagrams for guitar, ukulele, bass and piano, better PNG/PDF export, a way to share long setlists, a YouTube player, and a Song Bank for requests. All of it storage-free: no Sonata database.

## Architecture decisions

| Need | Decision | Why |
|---|---|---|
| Short links / small QR | Song stays inside the link. QR codes carry an upper-case form (`/Q/<base32>`) that uses the QR *alphanumeric* mode; error correction L on screens. | A server-stored short link would break the no-storage rule. Measured: a full song's QR goes from 101×101 to 81×81 modules (−36 % area). Packing the data differently saved only 3–8 % (deflate already does that work), so the text link is about the same length. Link previews make the link length matter much less in chat apps. |
| Long setlists | "Song links": one link per song in a message with a `Setlist:` title line. "Add from links" (Songs) reads any pasted text, rebuilds songs and the setlist, and skips songs already saved. | Each link stays small; works in any chat app; no storage. |
| Song Bank | One JSON file (`sonata_songbank.json`) in the owner's own Drive, shared "anyone with the link can view". `/api/bank` reads it per request (60 s CDN cache) and only passes files whose `type` is `sonata-bank`. Requests open the owner's WhatsApp / Messenger / SMS / Telegram / email with the text filled in. | Fits "powered by Google Drive only". The library file is never shared (tested). |
| New fields | `genre` and `inBank` live on each song (synced by the existing merge, untouched). The bank profile lives in its own storage key and in the bank file (restored on a new device). | No change to the Drive merge/tombstone logic. Fingerprint treats empty new fields as unchanged, so existing users don't re-upload (bug caught by the regression suite). |
| Chord shapes | `js/core/chords.js`: 33 chord types, a search over fret positions (≤ 4 fingers, barre = 1, 4-fret stretch, bass note lowest, chord tones present), scored for playability, with the chord-book shape for ~70 common chords first. | Unit-tested: every shape plays only chord tones with the right bass. |
| Size | Chords and Song Bank screens load on first use (7.5 KB and 6.7 KB gzipped). Main bundle 47 → 54 KB gzipped (shared helpers). Preview images are not in the offline cache. | |

## Bugs found and fixed in this round

| # | Sev | Bug | Fix | Test |
|---|---|---|---|---|
| 1 | **High** | **QR codes made by Sonata couldn't be read.** The encoder looked up its error-correction table with the format bits (M=0, L=1…) instead of the table order (L, M, Q, H), so the code said "M" but was built as "L". An independent decoder (jsQR) failed on every code from the v3.1.2 encoder. | Correct index. | unit: all 4 levels × byte and alphanumeric decode; browser: on-screen QR decodes and opens the song |
| 2 | Medium | Existing Drive users would upload their whole library once after updating (new empty fields changed the fingerprint). | Fingerprint ignores default-valued new fields. | regression "identical library is not uploaded again" + unit |
| 3 | Medium | Song Bank dialog didn't show the link after publishing (stale profile copy). | Redraw reads the current profile. | features |
| 4 | Medium | "Request in this key" opened the request dialog and closed it at once. | Action keeps the new sheet. | features |
| 5 | Medium | PNG export used a font Sonata doesn't ship (fell back to system fonts) and multi-column PNGs could split a chord line from its lyric. | Inter / JetBrains Mono (loaded first); column breaks respect chord+lyric pairs. | features (PNG download) |
| 6 | Low | PDFs uncompressed. | Flate-compressed streams: 46 % (1 song) and 38 % (5 songs) of the old size. | unit: valid xref offsets, streams inflate back |
| 7 | Low | Play listed at most 18 song chords. | Up to 80. | features (25 chords) |
| 8 | Low | Phone Songs toolbar overflowed at 320 px with the new filter. | Search + sort on one row, filters full width. | routes 320 px |
| 9 | Low | Bass-note badge contrast; small "make your own list" link. | Darker text; 44 px link. | audit |

## Verification

- Unit + API: **30/30** (`npm test`: core + `tests/api.test.mjs` for both Vercel functions with a fake Drive, incl. refusing non-bank files, sign-in pages and oversized files, and escaping crafted titles).
- Browser: browser **31**, routes **53**, a11y **22**, regression **41**, features **38** (new: Chords, chord pop-ups, Theory families, every song chord, QR decode → open, YouTube, setlist links round trip, PDF/PNG, bank publish with fake Drive, listener search/filter/transpose/request to WhatsApp).
- Layout audit: **210 states** (35 screens × 360, 390, phone landscape, 768, 1024, 1440): 0 sideways scroll, 0 off-screen controls, 0 touch targets < 44 px, 0 axe violations, 0 page errors.

## Needs Jethro (can't be verified here)

1. Publish a Song Bank with your Google account on the live site, open the link on another phone, send a request. (The public-file download path from Google is tested only with a fake Drive; if Google ever blocks it, adding a `GOOGLE_API_KEY` env var in Vercel makes `/api/bank` use the Drive API instead.)
2. Scan a QR from the Share sheet and from a printed PNG with an iPhone and an Android camera.
3. YouTube playback inside Sonata on iPhone/Android.
4. Paste a shared link into Messenger/WhatsApp/Viber and check the preview card and image.

## Production re-audit (after release, https://sonata.jethrofrane.xyz)

- Released: `main` fast-forwarded to `aa07467`; `version.json` = 4.0.0.
- `npm run test:live` against production: **16/16** (version, per-page previews and images, shared-song and QR previews, both functions incl. id validation, QR link opens the song, Chords and Theory render, CSP, no sideways scroll).
- Layout audit against production: **180 states** (30 screens × 6 sizes): 0 sideways scroll, 0 off-screen controls, 0 targets < 44 px, 0 axe violations, 0 page errors. (States that need the localhost-only test hook ran against the same build locally.)
- Naming: the feature is called **Song Bank** everywhere (general use: singers, bands, worship teams, teachers), with no busking-specific wording.
