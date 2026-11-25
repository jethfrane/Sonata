# Connecting AI Agents & MCP to Sonata

Sonata (`v7.6.0`) exposes **18 MCP tools** (tagged with MCP 2025-03-26 `annotations`, plus the `sonata://format-guide` resource and `import_chords_from_link` prompt) across three transports so AI assistants can format, analyze, extract, transpose, link, and manage your library & Trash safely. Machine-readable discovery lives at `/llms.txt` and `/llms-full.txt`.

---

## 1. Available Tools (18 Total)

### Public Tools (7 — No Sign-In Required)
Available anonymously on the Remote MCP endpoint, inside WebMCP, and via the local CLI:

| Tool | Purpose |
|---|---|
| `extract_chords_from_url` | Fetch a public HTTPS chord webpage and analyze key, capo, BPM, chords, and progression. |
| `analyze_chord_chart` | Parse pasted/raw chord text (ChordPro, Ultimate Guitar, `[G]` inline, chord-over-lyric). |
| `format_chord_chart` | Auto-format raw pasted chord charts into canonical `## Section` Sonata markdown, repair chords (`D/F#m` -> `D/F#`), strip voicing legends, collapse stray blank gaps, and wrap long lines cleanly. |
| `build_sonata_link` | Build a compressed `https://sonata.jethrofrane.xyz/?s=...` import/share link for a song or setlist (including optional `genre` and `mood`). |
| `lookup_chord` | Get chord tones, interval formula, and guitar, ukulele, bass, and piano voicings. |
| `transpose_chart` | Transpose a chart by semitones or between keys, or render in `chords-only`, `nashville`, `roman`, or `lyrics` mode. |
| `get_key_info` | Inspect scale notes, key signature, relative key, diatonic chords, and chord families. |

### Library & Trash Tools (11 — OAuth / Local Library Required)
Require Google Drive OAuth on the Remote MCP endpoint (or `--local <path>` in CLI/stdio mode, or open Sonata tab in WebMCP):

| Tool | Purpose |
|---|---|
| `get_library_summary` | Return song, setlist, favorite, Song Bank, and Trash counts plus recent songs. |
| `list_songs` | Search and filter songs with pagination (`query`, `genre`, `mood`, `favoritesOnly`, `inBankOnly`, `limit`, `offset`). |
| `get_song` | Fetch the full song chart, links, mood, and sounding key by `id` or `query`. |
| `create_song` | Create and save a new song (optionally parsing `rawChart` and setting `genre` / `mood`). |
| `import_song_from_url` | Import from a URL or cleaned `rawChart`, checking for duplicates before saving. |
| `update_song` | Update metadata (`key`, `capo`, `genre`, `mood`, ...) or chart body, including permanent transposition via `transposeBy`. |
| `trash_song` | Move songs to Trash (30-day soft delete; preserves setlist references). |
| `list_trash` | List trashed songs and setlists with `trashedAt` and `expiresAt`. |
| `restore_from_trash` | Restore trashed songs or setlists with original IDs and setlist placements intact. |
| `empty_trash` | Permanently purge Trash items (`destructiveHint: true`). Returns a safe preview unless `confirm: true` is explicitly passed. |
| `manage_setlists` | `list`, `create`, `update`, `add_songs` (deduped), or `trash` setlists. |

---

## 2. Browser WebMCP (`navigator.modelContext` + `window.sonataAgent`)

When Sonata is open in a browser:
- If the browser supports WebMCP (`navigator.modelContext.registerTool` or `provideContext`), Sonata registers all **18 tools** (with MCP `annotations`) directly against your live in-memory library (`Store`) and refreshes the UI + toast notifications automatically on every mutation.
- Regardless of browser WebMCP support, Sonata exposes `window.sonataAgent`:
  - `window.sonataAgent.tools()` — lists all 18 tool schemas
  - `window.sonataAgent.call(name, args)` — executes any public or library tool directly
  - `window.sonataAgent.guide` — Sonata chart formatting guide

---

## 3. Remote MCP Server Setup

- **MCP Endpoint:** `https://sonata.jethrofrane.xyz/api/mcp`
- **Transport:** Streamable HTTP (JSON-RPC 2.0 `POST`)
- **OAuth 2.1 Discovery (Zero-DB, Stateless AES-256-GCM + PKCE S256):**
  - Protected Resource Metadata (RFC 9728): `https://sonata.jethrofrane.xyz/.well-known/oauth-protected-resource`
  - Authorization Server Metadata (RFC 8414): `https://sonata.jethrofrane.xyz/.well-known/oauth-authorization-server`
  - Dynamic Client Registration (RFC 7591): `https://sonata.jethrofrane.xyz/api/oauth/register`

Calling any of the 7 public tools works immediately without auth. Calling a library tool without a Bearer token returns HTTP `401` with `WWW-Authenticate: Bearer resource_metadata="https://sonata.jethrofrane.xyz/.well-known/oauth-protected-resource"`, triggering standard OAuth 2.1 + Google sign-in (`drive.file` scope — Sonata can only access its own `sonata_library.json` file).

### Client Setup Examples

- **Claude Connectors / Claude Desktop / Claude Code:**
  1. Open **Settings → Connectors → Add custom connector** (or in Claude Code run `claude mcp add --transport http sonata https://sonata.jethrofrane.xyz/api/mcp`).
  2. Enter `https://sonata.jethrofrane.xyz/api/mcp` and approve Google Drive sign-in when prompted.

- **Gemini / Gemini Tasks / Gemini CLI:**
  Add `https://sonata.jethrofrane.xyz/api/mcp` as an HTTP MCP server (`settings.json` or Gemini Connected Apps / Tasks HTTP connector; public tools also work unauthenticated, or pass `/llms-full.txt` context):
  ```json
  {
    "mcpServers": {
      "sonata": {
        "httpUrl": "https://sonata.jethrofrane.xyz/api/mcp"
      }
    }
  }
  ```

- **OpenAI / ChatGPT Connectors & Codex CLI (`~/.codex/config.toml`):**
  In ChatGPT **Settings → Connectors** add `https://sonata.jethrofrane.xyz/api/mcp`, or in Codex CLI add:
  ```toml
  [mcp_servers.sonata]
  url = "https://sonata.jethrofrane.xyz/api/mcp"
  ```

- **Antigravity:**
  Add `https://sonata.jethrofrane.xyz/api/mcp` as a remote HTTP MCP server, or use the local `sonata-controller` skill / stdio MCP server (`node scripts/sonata-cli.mjs mcp --local <path>`).

- **Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`):**
  ```json
  {
    "mcpServers": {
      "sonata": {
        "url": "https://sonata.jethrofrane.xyz/api/mcp"
      }
    }
  }
  ```

---

## 4. Local CLI, Stdio MCP & `sonata-controller` Skill

For local workflows or agents working with `sonata_library.json` via Google Drive CLI (`gdrive`):

- **CLI executable:** `scripts/sonata-cli.mjs`
  - `node scripts/sonata-cli.mjs tools` — dump all 18 tool schemas
  - `node scripts/sonata-cli.mjs guide` — print `SONATA_FORMAT_GUIDE`
  - `node scripts/sonata-cli.mjs call lookup_chord --args '{"chord":"D/F#"}'`
  - `node scripts/sonata-cli.mjs call list_songs --local /path/to/sonata_library.json`
  - `node scripts/sonata-cli.mjs mcp --local /path/to/sonata_library.json` — run as a standard stdio JSON-RPC 2.0 MCP server
- **Agent Skill:** `.agents/skills/sonata-controller/SKILL.md`
  Guides Antigravity/Codex/Claude through finding `sonata_library.json` via `gdrive readonly search`, downloading to a temp file, extracting/cleaning chord charts with `scripts/sonata-cli.mjs`, and updating Drive **in-place** (`gdrive mutate update <FILE_ID> ...` — never delete & recreate so `drive.file` access stays intact).

---

## 5. Deployment Configuration (Vercel & Google Cloud Console)

### Vercel Environment Variables
Set these in your Vercel project settings (**Settings → Environment Variables**) for Production & Preview:

| Variable | Purpose |
|---|---|
| `SONATA_GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Web Client Secret matching `158653989463-6dicjrekd70pp2mh39scp05skr6ilcl6.apps.googleusercontent.com`. |
| `SONATA_MCP_SECRET` | High-entropy secret (e.g. `openssl rand -base64 48`) used to encrypt sealed `snt_*` tokens (AES-256-GCM) and sign DCR `snt_cl.*` IDs (HMAC-SHA256). |
| `SONATA_GOOGLE_CLIENT_ID` *(optional)* | Overrides the default Google OAuth Client ID if rotated. |

### Google Cloud Console
Under **APIs & Services → Credentials → OAuth 2.0 Client IDs**:
- Add Authorized redirect URI:
  `https://sonata.jethrofrane.xyz/api/oauth/callback`
- Ensure `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/userinfo.email` are enabled on the OAuth consent screen.

### Vercel Serverless Function Budget
Sonata stays well within Vercel Hobby's 12-function limit (**6 total functions**):
- `api/page.js`
- `api/bank.js`
- `api/import.js`
- `api/set.js`
- `api/mcp.js`
- `api/oauth.js`

Shared server helpers live in `api/_lib/` (`api/_lib/oauth.js`, `api/_lib/drive-server.js`) so Vercel does not count them as standalone functions.
