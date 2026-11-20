// Stateless OAuth 2.1 helpers for Sonata's Remote MCP server (node:crypto only, zero DB).
// Seals Google OAuth access+refresh tokens into AES-256-GCM bearer/code/refresh tokens
// and signs RFC 7591 Dynamic Client Registration IDs using SONATA_MCP_SECRET.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SITE = "https://sonata.jethrofrane.xyz";
export const GOOGLE_CLIENT_ID = process.env.SONATA_GOOGLE_CLIENT_ID || "158653989463-6dicjrekd70pp2mh39scp05skr6ilcl6.apps.googleusercontent.com";
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

const PREFIX = /** @type {const} */ ({
  code: "snt_c.",
  access: "snt_a.",
  refresh: "snt_r.",
  state: "snt_st."
});
const CLIENT_PREFIX = "snt_cl.";
const CLIENT_SECRET_PREFIX = "snt_cs.";
const B64U = /^[A-Za-z0-9_-]+$/;
const ALLOWED_AUTH_METHODS = new Set(["none", "client_secret_post", "client_secret_basic"]);
const BLOCKED_SCHEMES = new Set([
  "http:", "https:", "javascript:", "data:", "file:", "vbscript:", "about:",
  "blob:", "filesystem:", "mailto:", "tel:", "sms:", "ftp:", "ftps:", "ws:", "wss:",
  "chrome:", "edge:", "moz-extension:", "chrome-extension:", "jar:", "view-source:"
]);

/** @param {{ secret?: string, env?: Record<string, string|undefined> }} [opts] @param {boolean} [required] */
function getMcpSecret(opts = {}, required = true) {
  const raw = opts.secret ?? (opts.env || process.env).SONATA_MCP_SECRET;
  const secret = typeof raw === "string" ? raw.trim() : "";
  if (!secret && required) throw new Error("SONATA_MCP_SECRET is not configured");
  return secret;
}

/** @param {{ googleClientSecret?: string, env?: Record<string, string|undefined> }} [opts] */
export function getGoogleClientSecret(opts = {}) {
  const raw = opts.googleClientSecret ?? (opts.env || process.env).SONATA_GOOGLE_CLIENT_SECRET;
  return typeof raw === "string" ? raw.trim() : "";
}

/** @param {{ googleClientId?: string, env?: Record<string, string|undefined> }} [opts] */
export function getGoogleClientId(opts = {}) {
  const raw = opts.googleClientId ?? (opts.env || process.env).SONATA_GOOGLE_CLIENT_ID;
  return (typeof raw === "string" && raw.trim()) || GOOGLE_CLIENT_ID;
}

/** @param {Record<string, string|undefined>} [env] */
export function isOAuthConfigured(env = process.env) {
  return Boolean(env?.SONATA_MCP_SECRET?.trim() && env?.SONATA_GOOGLE_CLIENT_SECRET?.trim());
}

/** @param {string} secret @param {string} kind */
function deriveKey(secret, kind) {
  return createHmac("sha256", secret).update(`sonata:mcp:${kind}:v1`).digest();
}

/** @param {string} a @param {string} b */
function safeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Encrypt and authenticate a short- or long-lived OAuth artifact with AES-256-GCM.
 * @param {"code"|"access"|"refresh"|"state"} kind
 * @param {any} payload
 * @param {number} ttlSec
 * @param {{ secret?: string, now?: number, env?: Record<string, string|undefined> }} [opts]
 */
export function seal(kind, payload, ttlSec, opts = {}) {
  const prefix = PREFIX[kind];
  if (!prefix) throw new Error(`Unsupported token kind: ${kind}`);
  const secret = getMcpSecret(opts, true);
  const key = deriveKey(secret, kind);
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = Math.max(1, Math.floor(Number(ttlSec) || 0));
  const plaintext = JSON.stringify({ k: kind, iat: nowSec, exp: nowSec + ttl, p: payload });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(prefix, "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return prefix + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/**
 * Decrypt and verify an AES-256-GCM sealed OAuth artifact. Returns null on tampering, mismatch, or expiry.
 * @param {"code"|"access"|"refresh"|"state"} kind
 * @param {string} token
 * @param {{ secret?: string, now?: number, env?: Record<string, string|undefined> }} [opts]
 */
export function open(kind, token, opts = {}) {
  const prefix = PREFIX[kind];
  if (!prefix || typeof token !== "string" || !token.startsWith(prefix)) return null;
  const secret = getMcpSecret(opts, false);
  if (!secret) return null;
  const body = token.slice(prefix.length);
  if (!body || !B64U.test(body)) return null;
  const raw = Buffer.from(body, "base64url");
  if (raw.length <= 28) return null;
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  try {
    const key = deriveKey(secret, kind);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(prefix, "utf8"));
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const data = JSON.parse(json);
    const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
    if (!data || data.k !== kind || typeof data.exp !== "number" || data.exp <= nowSec) return null;
    return data.p;
  } catch {
    return null;
  }
}

/**
 * Issue an HMAC-signed Dynamic Client Registration client_id (`snt_cl.*`).
 * @param {{ redirect_uris?: string[], client_name?: string, token_endpoint_auth_method?: string }} [meta]
 * @param {{ secret?: string, now?: number, env?: Record<string, string|undefined> }} [opts]
 */
export function signClientId(meta = {}, opts = {}) {
  const secret = getMcpSecret(opts, true);
  const authMethod = ALLOWED_AUTH_METHODS.has(String(meta.token_endpoint_auth_method || "none"))
    ? String(meta.token_endpoint_auth_method || "none")
    : "none";
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.slice(0, 10) : [];
  const payload = {
    v: 1,
    r: redirectUris,
    n: typeof meta.client_name === "string" ? meta.client_name.slice(0, 80) : "",
    am: authMethod,
    iat: Math.floor((opts.now ?? Date.now()) / 1000),
    jti: randomBytes(6).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(`sonata:dcr:${body}`).digest("base64url");
  return `${CLIENT_PREFIX}${body}.${sig}`;
}

/**
 * Verify an HMAC-signed DCR client_id (`snt_cl.*`) and return its metadata, or null if invalid.
 * @param {string} clientId
 * @param {{ secret?: string, env?: Record<string, string|undefined> }} [opts]
 */
export function verifyClientId(clientId, opts = {}) {
  if (typeof clientId !== "string" || !clientId.startsWith(CLIENT_PREFIX)) return null;
  const secret = getMcpSecret(opts, false);
  if (!secret) return null;
  const parts = clientId.slice(CLIENT_PREFIX.length).split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!B64U.test(body) || !B64U.test(sig)) return null;
  const expected = createHmac("sha256", secret).update(`sonata:dcr:${body}`).digest("base64url");
  if (!safeEqualStr(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Derive a deterministic client_secret for a signed DCR client_id (`snt_cl.*`).
 * @param {string} clientId
 * @param {{ secret?: string, env?: Record<string, string|undefined> }} [opts]
 */
export function clientSecretFor(clientId, opts = {}) {
  const secret = getMcpSecret(opts, true);
  if (typeof clientId !== "string" || !clientId.startsWith(CLIENT_PREFIX)) {
    throw new Error("Invalid client_id");
  }
  return CLIENT_SECRET_PREFIX + createHmac("sha256", secret).update(`sonata:client-secret:${clientId}`).digest("base64url");
}

/**
 * Constant-time check for a DCR client's secret.
 * @param {string} clientId
 * @param {string} secret
 * @param {{ secret?: string, env?: Record<string, string|undefined> }} [opts]
 */
export function clientSecretMatches(clientId, secret, opts = {}) {
  if (typeof secret !== "string" || !secret || !verifyClientId(clientId, opts)) return false;
  try {
    return safeEqualStr(secret, clientSecretFor(clientId, opts));
  } catch {
    return false;
  }
}

/**
 * Verify a PKCE S256 code_verifier against the stored code_challenge using timingSafeEqual.
 * @param {string} verifier
 * @param {string} challenge
 */
export function pkceMatches(verifier, challenge) {
  if (typeof verifier !== "string" || typeof challenge !== "string") return false;
  if (verifier.length < 1 || verifier.length > 256 || !/^[A-Za-z0-9._~-]+$/.test(verifier)) return false;
  if (!challenge || !B64U.test(challenge)) return false;
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return safeEqualStr(computed, challenge);
}

/**
 * Validate OAuth redirect URIs: allows https, http://localhost|127.0.0.1|[::1], and safe native app schemes.
 * Blocks javascript:, data:, file:, vbscript:, remote http://, fragments, and malformed URIs.
 * @param {string} uri
 */
export function isAllowedRedirectUri(uri) {
  if (typeof uri !== "string" || !uri || uri.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(uri)) return false;
  let u;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  const proto = u.protocol.toLowerCase();
  if (proto === "https:") return Boolean(u.hostname);
  if (proto === "http:") {
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  }
  if (BLOCKED_SCHEMES.has(proto)) return false;
  // Require at least a 2-char custom scheme (RFC 8252 private-use / app scheme) with authority or path.
  return /^[a-z][a-z0-9+.-]{1,63}:$/.test(proto) && Boolean(u.host || u.pathname.startsWith("/"));
}

/**
 * RFC 9728 OAuth Protected Resource Metadata.
 * @param {string} [origin]
 */
export function protectedResourceMetadata(origin = SITE) {
  const base = origin.replace(/\/+$/, "");
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: ["sonata:library"],
    bearer_methods_supported: ["header"],
    resource_name: "Sonata MCP",
    resource_documentation: `${base}/llms.txt`
  };
}

/**
 * RFC 8414 OAuth Authorization Server Metadata.
 * @param {string} [origin]
 */
export function authorizationServerMetadata(origin = SITE) {
  const base = origin.replace(/\/+$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["sonata:library"],
    service_documentation: `${base}/llms.txt`
  };
}

/**
 * Refresh a Google OAuth access token using a Google refresh_token.
 * @param {string} refreshToken
 * @param {typeof fetch} [fetchImpl]
 * @param {{ googleClientId?: string, googleClientSecret?: string, env?: Record<string, string|undefined> }} [opts]
 */
export async function refreshGoogleToken(refreshToken, fetchImpl = fetch, opts = {}) {
  if (!refreshToken || typeof refreshToken !== "string") {
    throw Object.assign(new Error("Missing Google refresh token"), { status: 401 });
  }
  const clientSecret = getGoogleClientSecret(opts);
  if (!clientSecret) {
    throw Object.assign(new Error("Google OAuth client secret is not configured"), { status: 503 });
  }
  const clientId = getGoogleClientId(opts);
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const r = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString()
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.access_token) {
    const err = data?.error_description || data?.error || `Google token refresh failed (${r.status})`;
    throw Object.assign(new Error(String(err)), { status: r.status === 400 || r.status === 401 ? 401 : 502 });
  }
  return data;
}
