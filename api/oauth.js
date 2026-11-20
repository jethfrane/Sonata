// OAuth 2.1 + RFC 9728/8414/7591 handler for Sonata's Remote MCP server.
// Dispatches ?action=protected-resource|auth-server|register|authorize|callback|token
// and supports path fallback (/.well-known/*, /api/oauth/*). Zero database.
import {
  SITE,
  GOOGLE_SCOPES,
  authorizationServerMetadata,
  clientSecretFor,
  clientSecretMatches,
  getGoogleClientId,
  getGoogleClientSecret,
  isAllowedRedirectUri,
  isOAuthConfigured,
  open,
  pkceMatches,
  protectedResourceMetadata,
  refreshGoogleToken,
  seal,
  signClientId,
  verifyClientId
} from "./_lib/oauth.js";

const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_AUTH_METHODS = new Set(["none", "client_secret_post", "client_secret_basic"]);

/** @param {any} res @param {number} status @param {any} data @param {string} [cache] */
function sendJson(res, status, data, cache = "no-store") {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(status).send(JSON.stringify(data));
}

/** @param {any} res */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** @param {any} req */
async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buf.byteLength;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { status: 413 });
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

/** @param {any} req */
async function parsePostBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) && !Array.isArray(req.body)) {
    return req.body;
  }
  const raw = (await readRawBody(req)).trim();
  if (!raw) return {};
  const ct = String(req.headers?.["content-type"] || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw Object.assign(new Error("Body must be a JSON object"), { status: 400 });
    }
    return parsed;
  } catch (e) {
    if (/** @type {any} */ (e)?.status === 400) throw e;
    if (!ct && raw.includes("=") && !raw.startsWith("{")) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
    throw Object.assign(new Error("Malformed request body"), { status: 400 });
  }
}

/** Extract HTTP Basic client_id / client_secret if present (RFC 6749 §2.3.1). @param {any} req */
function parseBasicAuth(req) {
  const auth = String(req.headers?.authorization || "");
  if (!/^Basic\s+/i.test(auth)) return null;
  const decoded = Buffer.from(auth.replace(/^Basic\s+/i, "").trim(), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  return { client_id: dec(decoded.slice(0, idx)), client_secret: dec(decoded.slice(idx + 1)) };
}

/** @param {URL} url */
function resolveAction(url) {
  const explicit = url.searchParams.get("action");
  if (explicit) return explicit;
  const p = url.pathname.replace(/\/+$/, "");
  if (p === "/.well-known/oauth-protected-resource" || p.startsWith("/.well-known/oauth-protected-resource/")) {
    return "protected-resource";
  }
  if (p === "/.well-known/oauth-authorization-server" || p.startsWith("/.well-known/oauth-authorization-server/")) {
    return "auth-server";
  }
  const m = p.match(/^\/api\/oauth\/([a-z-]+)$/);
  return m ? m[1] : "";
}

/** @param {any} res @param {string} target */
function redirect(res, target) {
  res.setHeader("Location", target);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(302).send("");
}

/**
 * Create a testable Vercel OAuth handler with optional dependency injection.
 * @param {{ fetch?: typeof fetch, secret?: string, googleClientId?: string, googleClientSecret?: string, site?: string, now?: () => number }} [io]
 */
export function createOAuthHandler(io = {}) {
  return async function oauthHandler(req, res) {
    setCors(res);
    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(204).send("");
    }

    const origin = (io.site || SITE).replace(/\/+$/, "");
    const url = new URL(req.url || "/api/oauth", origin);
    const action = resolveAction(url);
    const nowMs = io.now ? io.now() : Date.now();
    const fetchImpl = io.fetch || fetch;
    const secret = io.secret ?? process.env.SONATA_MCP_SECRET;
    const googleClientSecret = io.googleClientSecret ?? process.env.SONATA_GOOGLE_CLIENT_SECRET;
    const tokenOpts = { secret, now: nowMs };
    const googleOpts = { googleClientId: io.googleClientId, googleClientSecret };
    const configured = io.secret && io.googleClientSecret
      ? Boolean(String(io.secret).trim() && String(io.googleClientSecret).trim())
      : isOAuthConfigured({
          SONATA_MCP_SECRET: secret,
          SONATA_GOOGLE_CLIENT_SECRET: googleClientSecret
        });

    if (action === "protected-resource") {
      if (method !== "GET") return sendJson(res, 405, { error: "invalid_request", error_description: "Method not allowed" });
      return sendJson(res, 200, protectedResourceMetadata(origin), "public, max-age=300");
    }

    if (action === "auth-server") {
      if (method !== "GET") return sendJson(res, 405, { error: "invalid_request", error_description: "Method not allowed" });
      return sendJson(res, 200, authorizationServerMetadata(origin), "public, max-age=300");
    }

    if (action === "register") {
      if (method !== "POST") return sendJson(res, 405, { error: "invalid_request", error_description: "POST required" });
      if (!secret || !String(secret).trim()) {
        return sendJson(res, 503, { error: "temporarily_unavailable", error_description: "Sonata MCP OAuth is not configured." });
      }
      let body;
      try {
        body = await parsePostBody(req);
      } catch (e) {
        return sendJson(res, /** @type {any} */ (e)?.status || 400, { error: "invalid_client_metadata", error_description: /** @type {Error} */ (e).message });
      }

      const redirectUris = body.redirect_uris;
      if (redirectUris !== undefined) {
        if (!Array.isArray(redirectUris) || !redirectUris.length || redirectUris.some((u) => !isAllowedRedirectUri(u))) {
          return sendJson(res, 400, { error: "invalid_redirect_uri", error_description: "All redirect_uris must be valid https, localhost, or safe native URIs." });
        }
      }
      const authMethod = body.token_endpoint_auth_method ? String(body.token_endpoint_auth_method) : "none";
      if (!ALLOWED_AUTH_METHODS.has(authMethod)) {
        return sendJson(res, 400, { error: "invalid_client_metadata", error_description: "Unsupported token_endpoint_auth_method" });
      }
      const clientId = signClientId(
        {
          redirect_uris: redirectUris,
          client_name: typeof body.client_name === "string" ? body.client_name : "",
          token_endpoint_auth_method: authMethod
        },
        tokenOpts
      );
      /** @type {Record<string, any>} */
      const out = {
        client_id: clientId,
        client_id_issued_at: Math.floor(nowMs / 1000),
        client_name: typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "MCP Client",
        redirect_uris: Array.isArray(redirectUris) ? redirectUris : [],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: authMethod
      };
      if (authMethod !== "none") {
        out.client_secret = clientSecretFor(clientId, tokenOpts);
        out.client_secret_expires_at = 0;
      }
      return sendJson(res, 201, out);
    }

    if (action === "authorize") {
      if (method !== "GET") return sendJson(res, 405, { error: "invalid_request", error_description: "GET required" });
      if (!configured) {
        return sendJson(res, 503, { error: "temporarily_unavailable", error_description: "Google OAuth server credentials are not configured." });
      }
      const q = url.searchParams;
      const clientId = q.get("client_id") || "";
      const redirectUri = q.get("redirect_uri") || "";
      const responseType = q.get("response_type") || "";
      const codeChallenge = q.get("code_challenge") || "";
      const codeChallengeMethod = q.get("code_challenge_method") || "";
      const clientState = q.get("state") || "";
      const scope = q.get("scope") || "sonata:library";
      const resource = q.get("resource") || "";

      const client = verifyClientId(clientId, tokenOpts);
      if (!client) {
        return sendJson(res, 400, { error: "invalid_client", error_description: "Invalid or unrecognized client_id." });
      }
      if (!isAllowedRedirectUri(redirectUri) || (Array.isArray(client.r) && client.r.length > 0 && !client.r.includes(redirectUri))) {
        return sendJson(res, 400, { error: "invalid_request", error_description: "Invalid or unregistered redirect_uri." });
      }
      if (responseType !== "code") {
        return sendJson(res, 400, { error: "unsupported_response_type", error_description: "Only response_type=code is supported." });
      }
      if (!codeChallenge || codeChallengeMethod !== "S256") {
        return sendJson(res, 400, { error: "invalid_request", error_description: "PKCE with code_challenge_method=S256 is required." });
      }

      const sealedState = seal(
        "state",
        {
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          client_state: clientState,
          scope,
          resource
        },
        600,
        tokenOpts
      );
      const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      googleAuthUrl.searchParams.set("client_id", getGoogleClientId(googleOpts));
      googleAuthUrl.searchParams.set("redirect_uri", `${origin}/api/oauth/callback`);
      googleAuthUrl.searchParams.set("response_type", "code");
      googleAuthUrl.searchParams.set("scope", GOOGLE_SCOPES);
      googleAuthUrl.searchParams.set("access_type", "offline");
      googleAuthUrl.searchParams.set("prompt", "consent");
      googleAuthUrl.searchParams.set("include_granted_scopes", "true");
      googleAuthUrl.searchParams.set("state", sealedState);
      return redirect(res, googleAuthUrl.href);
    }

    if (action === "callback") {
      if (method !== "GET") return sendJson(res, 405, { error: "invalid_request", error_description: "GET required" });
      if (!configured) {
        return sendJson(res, 503, { error: "temporarily_unavailable", error_description: "Google OAuth server credentials are not configured." });
      }
      const q = url.searchParams;
      const stateToken = q.get("state") || "";
      const st = open("state", stateToken, tokenOpts);
      if (!st || !isAllowedRedirectUri(st.redirect_uri)) {
        return sendJson(res, 400, { error: "invalid_request", error_description: "Invalid or expired OAuth state." });
      }

      const clientRedirect = new URL(st.redirect_uri);
      const errParam = q.get("error");
      if (errParam) {
        clientRedirect.searchParams.set("error", errParam);
        if (st.client_state) clientRedirect.searchParams.set("state", st.client_state);
        return redirect(res, clientRedirect.href);
      }
      const googleCode = q.get("code") || "";
      if (!googleCode) {
        clientRedirect.searchParams.set("error", "invalid_request");
        if (st.client_state) clientRedirect.searchParams.set("state", st.client_state);
        return redirect(res, clientRedirect.href);
      }

      const form = new URLSearchParams({
        code: googleCode,
        client_id: getGoogleClientId(googleOpts),
        client_secret: getGoogleClientSecret(googleOpts),
        redirect_uri: `${origin}/api/oauth/callback`,
        grant_type: "authorization_code"
      });
      const tokenResp = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString()
      });
      const googleTokens = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !googleTokens?.access_token) {
        clientRedirect.searchParams.set("error", "server_error");
        if (st.client_state) clientRedirect.searchParams.set("state", st.client_state);
        return redirect(res, clientRedirect.href);
      }

      let email = "";
      try {
        const ui = await fetchImpl("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${googleTokens.access_token}` }
        });
        if (ui.ok) {
          const info = await ui.json().catch(() => ({}));
          if (typeof info?.email === "string") email = info.email;
        }
      } catch { /* email is optional */ }

      const mcpCode = seal(
        "code",
        {
          client_id: st.client_id,
          redirect_uri: st.redirect_uri,
          code_challenge: st.code_challenge,
          scope: st.scope || "sonata:library",
          resource: st.resource || "",
          ga: googleTokens.access_token,
          gr: googleTokens.refresh_token || "",
          gexp: nowMs + (Number(googleTokens.expires_in) || 3599) * 1000,
          email
        },
        300,
        tokenOpts
      );
      clientRedirect.searchParams.set("code", mcpCode);
      if (st.client_state) clientRedirect.searchParams.set("state", st.client_state);
      return redirect(res, clientRedirect.href);
    }

    if (action === "token") {
      if (method !== "POST") return sendJson(res, 405, { error: "invalid_request", error_description: "POST required" });
      if (!configured) {
        return sendJson(res, 503, { error: "temporarily_unavailable", error_description: "Google OAuth server credentials are not configured." });
      }
      let body;
      try {
        body = await parsePostBody(req);
      } catch (e) {
        return sendJson(res, /** @type {any} */ (e)?.status || 400, { error: "invalid_request", error_description: /** @type {Error} */ (e).message });
      }
      const basic = parseBasicAuth(req);
      if (basic?.client_id && body.client_id && basic.client_id !== String(body.client_id)) {
        return sendJson(res, 401, { error: "invalid_client", error_description: "Mismatched client_id." });
      }
      const clientId = String(basic?.client_id || body.client_id || "");
      const clientSecret = String(basic?.client_secret || body.client_secret || "");
      const grantType = String(body.grant_type || "");

      const client = verifyClientId(clientId, tokenOpts);
      if (!client) {
        return sendJson(res, 401, { error: "invalid_client", error_description: "Invalid client_id." });
      }
      if (client.am !== "none" || clientSecret) {
        if (!clientSecretMatches(clientId, clientSecret, tokenOpts)) {
          return sendJson(res, 401, { error: "invalid_client", error_description: "Invalid client credentials." });
        }
      }

      const accessTtl = 3600;
      const refreshTtl = 90 * 24 * 3600;

      if (grantType === "authorization_code") {
        const code = String(body.code || "");
        const verifier = String(body.code_verifier || "");
        const redirectUri = String(body.redirect_uri || "");
        const grant = open("code", code, tokenOpts);
        if (!grant || grant.client_id !== clientId || grant.redirect_uri !== redirectUri) {
          return sendJson(res, 400, { error: "invalid_grant", error_description: "Invalid or expired authorization code." });
        }
        if (!pkceMatches(verifier, grant.code_challenge)) {
          return sendJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed." });
        }
        const accessToken = seal(
          "access",
          {
            client_id: clientId,
            scope: grant.scope || "sonata:library",
            email: grant.email || "",
            ga: grant.ga,
            gr: grant.gr || "",
            gexp: grant.gexp
          },
          accessTtl,
          tokenOpts
        );
        /** @type {Record<string, any>} */
        const out = {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: accessTtl,
          scope: grant.scope || "sonata:library"
        };
        if (grant.gr) {
          out.refresh_token = seal(
            "refresh",
            {
              client_id: clientId,
              scope: grant.scope || "sonata:library",
              email: grant.email || "",
              gr: grant.gr
            },
            refreshTtl,
            tokenOpts
          );
        }
        return sendJson(res, 200, out);
      }

      if (grantType === "refresh_token") {
        const refreshToken = String(body.refresh_token || "");
        const grant = open("refresh", refreshToken, tokenOpts);
        if (!grant || grant.client_id !== clientId || !grant.gr) {
          return sendJson(res, 400, { error: "invalid_grant", error_description: "Invalid or expired refresh token." });
        }
        let refreshed;
        try {
          refreshed = await refreshGoogleToken(grant.gr, fetchImpl, googleOpts);
        } catch (e) {
          const status = /** @type {any} */ (e)?.status === 401 ? 400 : 502;
          return sendJson(res, status, { error: status === 400 ? "invalid_grant" : "temporarily_unavailable", error_description: /** @type {Error} */ (e).message });
        }
        const nextRefresh = refreshed.refresh_token || grant.gr;
        const accessToken = seal(
          "access",
          {
            client_id: clientId,
            scope: grant.scope || "sonata:library",
            email: grant.email || "",
            ga: refreshed.access_token,
            gr: nextRefresh,
            gexp: nowMs + (Number(refreshed.expires_in) || 3599) * 1000
          },
          accessTtl,
          tokenOpts
        );
        const nextMcpRefresh = seal(
          "refresh",
          {
            client_id: clientId,
            scope: grant.scope || "sonata:library",
            email: grant.email || "",
            gr: nextRefresh
          },
          refreshTtl,
          tokenOpts
        );
        return sendJson(res, 200, {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: accessTtl,
          refresh_token: nextMcpRefresh,
          scope: grant.scope || "sonata:library"
        });
      }

      return sendJson(res, 400, { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." });
    }

    return sendJson(res, 404, { error: "invalid_request", error_description: "Unknown OAuth endpoint." });
  };
}

export default createOAuthHandler();
