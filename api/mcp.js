// Streamable HTTP JSON-RPC 2.0 MCP server for Sonata.
// Anonymous requests expose 7 public chord/music/import/format/link tools.
// Authenticated requests (Bearer snt_a.* from /api/oauth or Bearer ya29.* Google token)
// unlock all 18 tools backed by the user's Google Drive sonata_library.json.
import {
  ALL_TOOL_DEFS,
  LIBRARY_TOOL_DEFS,
  PUBLIC_TOOL_DEFS,
  PUBLIC_TOOL_NAMES,
  SONATA_FORMAT_GUIDE,
  executeLibraryTool,
  executePublicTool
} from "../js/core/mcp-tools.js";
import { runWithDriveLibrary } from "./_lib/drive-server.js";
import { SITE, open, refreshGoogleToken } from "./_lib/oauth.js";
import { importPage, tooMany } from "./import.js";

const PROTOCOL_VERSION = "2025-03-26";
const MAX_BODY_BYTES = 512 * 1024;
const LIBRARY_TOOL_NAMES = new Set(LIBRARY_TOOL_DEFS.map((t) => t.name));
const READ_ONLY_LIBRARY_TOOLS = new Set(["get_library_summary", "list_songs", "get_song", "list_trash"]);
const URL_FETCH_TOOLS = new Set(["extract_chords_from_url", "import_song_from_url"]);

/** @param {any} res */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
}

/** @param {any} res @param {number} status @param {any} data */
function sendJson(res, status, data) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(status).send(JSON.stringify(data));
}

/** @param {any} res @param {string} origin @param {string} [errCode] @param {string} [desc] */
function sendUnauthorized(res, origin, errCode = "", desc = "Authentication required to access your Sonata library.") {
  const metaUrl = `${origin}/.well-known/oauth-protected-resource`;
  const challenge = errCode
    ? `Bearer error="${errCode}", resource_metadata="${metaUrl}"`
    : `Bearer resource_metadata="${metaUrl}"`;
  res.setHeader("WWW-Authenticate", challenge);
  return sendJson(res, 401, {
    error: errCode || "unauthorized",
    error_description: desc
  });
}

/** @param {any} err */
function safeErrorText(err) {
  const raw = String(err?.message || err || "Tool execution failed");
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(snt_[a-z]+|ya29)\.[A-Za-z0-9._-]+/g, "[redacted]")
    .slice(0, 500);
}

/** @param {any} req */
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    const str = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    return JSON.parse(str);
  }
  if (typeof req[Symbol.asyncIterator] !== "function") return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.byteLength;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

/** @param {any} req */
function clientIp(req) {
  const raw = String(req.headers?.["x-real-ip"] || String(req.headers?.["x-forwarded-for"] || "").split(",")[0] || "unknown").trim();
  return raw || "unknown";
}

/**
 * Create a testable Streamable HTTP MCP handler with optional dependency injection.
 * @param {{
 *   fetch?: typeof fetch,
 *   resolve?: (host: string) => Promise<string[]>,
 *   importIo?: { fetch?: typeof fetch, resolve?: (host: string) => Promise<string[]> },
 *   tooMany?: (who: string) => boolean,
 *   secret?: string,
 *   googleClientId?: string,
 *   googleClientSecret?: string,
 *   site?: string,
 *   now?: () => number
 * }} [io]
 */
export function createMcpHandler(io = {}) {
  return async function mcpHandler(req, res) {
    setCors(res);
    const method = String(req.method || "GET").toUpperCase();
    const origin = (io.site || SITE).replace(/\/+$/, "");

    if (method === "OPTIONS") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(204).send("");
    }

    if (method === "GET") {
      const accept = String(req.headers?.accept || "");
      if (/text\/event-stream/i.test(accept)) {
        res.setHeader("Allow", "POST, GET, OPTIONS");
        return sendJson(res, 405, {
          error: "method_not_allowed",
          message: "Server-sent event streams are not offered on GET; send JSON-RPC 2.0 via POST."
        });
      }
      return sendJson(res, 200, {
        name: "sonata-mcp",
        version: "7.4.0",
        protocolVersion: PROTOCOL_VERSION,
        transport: "streamable-http",
        status: "ok",
        tools: ALL_TOOL_DEFS.length,
        publicTools: PUBLIC_TOOL_DEFS.length,
        oauth: {
          protectedResource: `${origin}/.well-known/oauth-protected-resource`,
          authorizationServer: `${origin}/.well-known/oauth-authorization-server`
        }
      });
    }

    if (method !== "POST") {
      res.setHeader("Allow", "POST, GET, OPTIONS");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    const nowMs = io.now ? io.now() : Date.now();
    const fetchImpl = io.fetch || fetch;
    const secret = io.secret ?? process.env.SONATA_MCP_SECRET;
    const googleClientSecret = io.googleClientSecret ?? process.env.SONATA_GOOGLE_CLIENT_SECRET;
    const tokenOpts = { secret, now: nowMs };
    const googleOpts = { googleClientId: io.googleClientId, googleClientSecret };
    const importIo = {
      ...(io.importIo || {}),
      ...(io.importIo?.fetch || io.fetch ? { fetch: io.importIo?.fetch || io.fetch } : {}),
      ...(io.importIo?.resolve || io.resolve ? { resolve: io.importIo?.resolve || io.resolve } : {})
    };
    const rateCheck = io.tooMany || tooMany;
    const who = clientIp(req);

    // Resolve authentication before dispatching JSON-RPC requests.
    const authHeader = String(req.headers?.authorization || "").trim();
    /** @type {{ mode: "anonymous"|"oauth"|"google", googleToken: string|null, refreshToken: string, email: string, refreshed: boolean }} */
    const auth = { mode: "anonymous", googleToken: null, refreshToken: "", email: "", refreshed: false };

    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(\S+)$/i);
      if (!m) {
        return sendUnauthorized(res, origin, "invalid_token", "Invalid Authorization header format.");
      }
      const token = m[1];
      if (token.startsWith("snt_a.")) {
        const payload = open("access", token, tokenOpts);
        if (!payload || (!payload.ga && !payload.gr)) {
          return sendUnauthorized(res, origin, "invalid_token", "Access token is invalid or expired.");
        }
        auth.mode = "oauth";
        auth.refreshToken = typeof payload.gr === "string" ? payload.gr : "";
        auth.email = typeof payload.email === "string" ? payload.email : "";
        const nearExpiry = !payload.ga || nowMs >= Number(payload.gexp || 0) - 30_000;
        if (nearExpiry) {
          if (!auth.refreshToken) {
            return sendUnauthorized(res, origin, "invalid_token", "Google token expired and no refresh token is available.");
          }
          try {
            const refreshed = await refreshGoogleToken(auth.refreshToken, fetchImpl, googleOpts);
            auth.googleToken = refreshed.access_token;
            auth.refreshed = true;
            if (refreshed.refresh_token) auth.refreshToken = refreshed.refresh_token;
          } catch (e) {
            if (/** @type {any} */ (e)?.status === 503) {
              return sendJson(res, 503, { error: "temporarily_unavailable", error_description: "OAuth refresh is not configured." });
            }
            return sendUnauthorized(res, origin, "invalid_token", "Google authorization expired or was revoked.");
          }
        } else {
          auth.googleToken = payload.ga;
        }
      } else if (token.startsWith("ya29.") && token.length >= 12) {
        auth.mode = "google";
        auth.googleToken = token;
      } else {
        return sendUnauthorized(res, origin, "invalid_token", "Unrecognized or invalid bearer token.");
      }
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (e) {
      const status = /** @type {any} */ (e)?.status || 400;
      return sendJson(res, status, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: status === 413 ? "Request payload too large" : "Parse error" }
      });
    }

    if (!payload || typeof payload !== "object" || (Array.isArray(payload) && !payload.length)) {
      return sendJson(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" }
      });
    }

    const isBatch = Array.isArray(payload);
    const messages = isBatch ? payload : [payload];
    const fetchUrl = (/** @type {string} */ rawUrl) => importPage(rawUrl, importIo);

    /** @param {any} msg */
    async function dispatchOne(msg) {
      if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
      }
      const isNotification = !Object.prototype.hasOwnProperty.call(msg, "id") || msg.id === undefined;
      const id = msg.id ?? null;
      const rpcMethod = msg.method;
      const params = msg.params && typeof msg.params === "object" ? msg.params : {};

      if (rpcMethod === "notifications/initialized" || rpcMethod.startsWith("notifications/")) {
        return null;
      }

      const reply = (/** @type {any} */ result) => (isNotification ? null : { jsonrpc: "2.0", id, result });
      const fail = (/** @type {number} */ code, /** @type {string} */ message) =>
        isNotification ? null : { jsonrpc: "2.0", id, error: { code, message } };

      if (rpcMethod === "initialize") {
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: { name: "sonata", version: "7.4.0" },
          instructions: SONATA_FORMAT_GUIDE
        });
      }

      if (rpcMethod === "ping") {
        return reply({});
      }

      if (rpcMethod === "tools/list") {
        return reply({ tools: auth.googleToken ? ALL_TOOL_DEFS : PUBLIC_TOOL_DEFS });
      }

      if (rpcMethod === "tools/call") {
        const name = typeof params.name === "string" ? params.name : "";
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
        if (!name) return fail(-32602, "Tool name is required.");

        const isPublic = PUBLIC_TOOL_NAMES.has(name);
        const isLibrary = LIBRARY_TOOL_NAMES.has(name);

        if (isLibrary && !auth.googleToken) {
          throw Object.assign(new Error("Authentication required for library tools."), { httpStatus: 401 });
        }

        // Per-IP rate limit for outbound webpage fetches.
        if (URL_FETCH_TOOLS.has(name) && !(name === "import_song_from_url" && args.rawChart && String(args.rawChart).trim())) {
          if (rateCheck(who)) {
            return reply({
              isError: true,
              content: [{ type: "text", text: "Rate limit exceeded for URL import (20 requests/min). Please wait a moment or pass rawChart directly." }]
            });
          }
        }

        try {
          let result;
          if (isPublic) {
            result = await executePublicTool(name, args, { origin, fetchUrl });
          } else if (isLibrary) {
            const readOnly = READ_ONLY_LIBRARY_TOOLS.has(name) || (name === "empty_trash" && args.confirm !== true);
            const run = async (/** @type {string} */ googleToken) =>
              await runWithDriveLibrary(
                googleToken,
                (store) => executeLibraryTool(name, args, { store, origin, arranger: auth.email, fetchUrl }),
                { fetch: fetchImpl, readOnly }
              );

            let out;
            try {
              out = await run(/** @type {string} */ (auth.googleToken));
            } catch (e) {
              if (/** @type {any} */ (e)?.expired && auth.mode === "oauth" && auth.refreshToken && !auth.refreshed) {
                const refreshed = await refreshGoogleToken(auth.refreshToken, fetchImpl, googleOpts).catch(() => null);
                if (!refreshed?.access_token) {
                  throw Object.assign(new Error("Google authorization expired."), { httpStatus: 401, errCode: "invalid_token" });
                }
                auth.googleToken = refreshed.access_token;
                auth.refreshed = true;
                out = await run(auth.googleToken);
              } else if (/** @type {any} */ (e)?.expired || /** @type {any} */ (e)?.status === 401) {
                throw Object.assign(new Error("Google Drive token expired or invalid."), { httpStatus: 401, errCode: "invalid_token" });
              } else {
                throw e;
              }
            }
            result = out.result;
          } else {
            return reply({
              isError: true,
              content: [{ type: "text", text: `Unknown tool: "${name}".` }]
            });
          }

          return reply({
            content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }]
          });
        } catch (e) {
          if (/** @type {any} */ (e)?.httpStatus === 401) throw e;
          return reply({
            isError: true,
            content: [{ type: "text", text: safeErrorText(e) }]
          });
        }
      }

      if (rpcMethod === "resources/list") {
        return reply({
          resources: [
            {
              uri: "sonata://format-guide",
              name: "Sonata Chord Chart Format Guide",
              description: "Syntax guide for Sonata chord charts, sections, inline/above-lyric chords, rhythm slashes, keys, and notes.",
              mimeType: "text/markdown"
            }
          ]
        });
      }

      if (rpcMethod === "resources/read") {
        const uri = typeof params.uri === "string" ? params.uri : "";
        if (uri !== "sonata://format-guide") return fail(-32602, `Unknown resource URI: "${uri}".`);
        return reply({
          contents: [
            {
              uri: "sonata://format-guide",
              mimeType: "text/markdown",
              text: SONATA_FORMAT_GUIDE
            }
          ]
        });
      }

      if (rpcMethod === "prompts/list") {
        return reply({
          prompts: [
            {
              name: "import_chords_from_link",
              description: "Fetch a public chord chart URL, clean it into Sonata format, detect key/capo/BPM, and save to the library or generate a share link.",
              arguments: [
                { name: "url", description: "Public HTTPS URL of the chord chart page", required: true }
              ]
            }
          ]
        });
      }

      if (rpcMethod === "prompts/get") {
        const pName = typeof params.name === "string" ? params.name : "";
        if (pName !== "import_chords_from_link") return fail(-32602, `Unknown prompt: "${pName}".`);
        const targetUrl = typeof params.arguments?.url === "string" ? params.arguments.url.trim() : "<url>";
        return reply({
          description: "Import and format a chord chart from a link for Sonata.",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Extract the chord chart from ${targetUrl}. Try extract_chords_from_url (or import_song_from_url if saving to my library). Clean up the sections (## Verse 1, ## Chorus, ## Bridge), align chords cleanly above lyrics or use [G] inline chords, verify the detected key, capo, and BPM, and keep the source URL in links.`
              }
            }
          ]
        });
      }

      return fail(-32601, `Method not found: ${rpcMethod}`);
    }

    try {
      const results = [];
      for (const msg of messages) {
        const out = await dispatchOne(msg);
        if (out) results.push(out);
      }
      if (!results.length) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(202).send("");
      }
      return sendJson(res, 200, isBatch ? results : results[0]);
    } catch (e) {
      if (/** @type {any} */ (e)?.httpStatus === 401) {
        return sendUnauthorized(
          res,
          origin,
          /** @type {any} */ (e).errCode || "",
          /** @type {Error} */ (e).message
        );
      }
      return sendJson(res, 500, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" }
      });
    }
  };
}

export default createMcpHandler();
