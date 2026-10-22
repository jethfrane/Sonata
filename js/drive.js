// @ts-check
// Google Drive backup. One file (sonata_library.json) that only Sonata can
// see (drive.file scope). Every sync downloads, merges, then uploads, so two
// devices never overwrite each other's edits.

const CLIENT_ID = "158653989463-6dicjrekd70pp2mh39scp05skr6ilcl6.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
const FILE_NAME = "sonata_library.json";
const TOKEN_KEY = "sonata_google_token";
const EXPIRY_KEY = "sonata_google_token_expiry";
const PROFILE_KEY = "sonata_user_profile";
const FILE_KEY = "sonata_drive_file_id";

/**
 * @typedef {"signed-out"|"connecting"|"syncing"|"synced"|"expired"|"error"|"offline"} DriveStatus
 * @typedef {{ email?: string|null, name?: string|null, givenName?: string|null, picture?: string|null }} Profile
 */

/** @type {Promise<void>|null} */
let gisLoading = null;
function loadGis() {
  if (/** @type {any} */ (window).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error("Google sign-in could not load.")); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

export class Drive {
  /**
   * @param {import("./core/store.js").Store} store
   * @param {(status: DriveStatus) => void} onStatus
   */
  constructor(store, onStatus) {
    this.store = store;
    this.onStatus = onStatus;
    /** @type {DriveStatus} */ this.status = "signed-out";
    /** @type {string|null} */ this.token = null;
    /** @type {Profile} */ this.profile = {};
    /** @type {string|null} */ this.fileId = null;
    /** @type {string|null} */ this.error = null;
    this.busy = false;
    this.queued = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */ this.timer = undefined;
    this.lastSync = 0;
  }

  init() {
    try {
      this.profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") || {};
      this.fileId = localStorage.getItem(FILE_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      const exp = Number(localStorage.getItem(EXPIRY_KEY) || 0);
      if (token && exp > Date.now() + 30_000) {
        this.token = token;
        this.set("synced");
        this.sync();
      } else if (token || this.profile.email) {
        this.token = null;
        this.set("expired");
      }
    } catch { /* storage blocked */ }
    this.store.on("library-change", () => this.schedule());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.token && Date.now() - this.lastSync > 60_000) this.sync();
    });
    window.addEventListener("online", () => { if (this.token && this.status === "offline") this.sync(); });
  }

  get signedIn() { return Boolean(this.token || this.profile.email); }

  get lastSynced() { try { return localStorage.getItem("sonata:v12:last_synced"); } catch { return null; } }

  /** @param {DriveStatus} s @param {string|null} [error] */
  set(s, error = null) {
    this.status = s;
    this.error = error;
    this.onStatus(s);
  }

  /** Sign in with a Google popup (must be called from a tap/click). */
  async signIn() {
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      this.set("error", "Drive backup works on the published site (https://sonata.jethrofrane.xyz).");
      return false;
    }
    this.set("connecting");
    try { await loadGis(); } catch (e) { this.set("error", /** @type {Error} */ (e).message); return false; }
    const g = /** @type {any} */ (window).google;
    return new Promise((resolve) => {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: this.profile.email ? "" : "consent",
        hint: this.profile.email || undefined,
        callback: async (/** @type {any} */ resp) => {
          if (!resp || resp.error) {
            this.set(this.profile.email ? "expired" : "signed-out", resp?.error === "access_denied" ? null : "Google sign-in did not finish. Please try again.");
            resolve(false);
            return;
          }
          this.token = resp.access_token;
          try {
            localStorage.setItem(TOKEN_KEY, resp.access_token);
            localStorage.setItem(EXPIRY_KEY, String(Date.now() + (Number(resp.expires_in) || 3599) * 1000));
          } catch { /* storage blocked */ }
          await this.fetchProfile();
          resolve(await this.sync());
        },
        error_callback: (/** @type {any} */ err) => {
          // Popup closed or blocked.
          this.set(this.profile.email ? "expired" : "signed-out", err?.type === "popup_failed_to_open" ? "Your browser blocked the Google window. Allow pop-ups for this site and try again." : null);
          resolve(false);
        }
      });
      client.requestAccessToken();
    });
  }

  async fetchProfile() {
    if (!this.token) return;
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${this.token}` } });
      if (!r.ok) return;
      const d = await r.json();
      this.profile = { email: d.email || null, name: d.name || null, givenName: d.given_name || null, picture: d.picture || null };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
    } catch { /* profile is optional */ }
  }

  signOut() {
    const g = /** @type {any} */ (window).google;
    if (this.token && g?.accounts?.oauth2) { try { g.accounts.oauth2.revoke(this.token, () => {}); } catch { /* ignore */ } }
    this.token = null;
    this.profile = {};
    this.fileId = null;
    for (const k of [TOKEN_KEY, EXPIRY_KEY, PROFILE_KEY, FILE_KEY]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    this.set("signed-out");
  }

  /** Debounced sync after edits. */
  schedule() {
    if (!this.token) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 4000);
  }

  tokenValid() {
    try { return Boolean(this.token) && Number(localStorage.getItem(EXPIRY_KEY) || 0) > Date.now() + 15_000; } catch { return Boolean(this.token); }
  }

  /** @param {string} url @param {RequestInit} [init] */
  async api(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${this.token}` } });
    if (r.status === 401) {
      this.token = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      throw Object.assign(new Error("expired"), { expired: true });
    }
    if (!r.ok) throw new Error(`Drive ${r.status}`);
    return r;
  }

  async findFile() {
    if (this.fileId) {
      try {
        const r = await this.api(`https://www.googleapis.com/drive/v3/files/${this.fileId}?fields=id,trashed`);
        const d = await r.json();
        if (d.id && !d.trashed) return d.id;
      } catch (e) { if (/** @type {any} */ (e).expired) throw e; }
    }
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const r = await this.api(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&spaces=drive`);
    const d = await r.json();
    return d.files?.[0]?.id || null;
  }

  /** Download, merge, upload. Returns true on success. */
  async sync() {
    if (!this.token) return false;
    if (!this.tokenValid()) { this.token = null; this.set("expired"); return false; }
    if (!navigator.onLine) { this.set("offline"); return false; }
    if (this.busy) { this.queued = true; return false; }
    this.busy = true;
    this.set("syncing");
    try {
      const id = await this.findFile();
      if (id) {
        const r = await this.api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
        const remote = await r.json().catch(() => null);
        if (remote && typeof remote === "object") this.store.mergeIn(remote);
      }
      const body = JSON.stringify(this.store.snapshot());
      const boundary = "sonata" + Math.random().toString(36).slice(2);
      const meta = JSON.stringify(id ? {} : { name: FILE_NAME, mimeType: "application/json" });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const url = id
        ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&fields=id`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
      const up = await this.api(url, { method: id ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart });
      const saved = await up.json();
      this.fileId = saved.id || id;
      if (this.fileId) localStorage.setItem(FILE_KEY, this.fileId);
      localStorage.setItem("sonata:v12:last_synced", new Date().toISOString());
      this.lastSync = Date.now();
      this.set("synced");
      return true;
    } catch (e) {
      if (/** @type {any} */ (e).expired) this.set("expired");
      else if (!navigator.onLine) this.set("offline");
      else this.set("error", "Sync didn't finish. Your songs are safe on this device; Sonata will try again.");
      return false;
    } finally {
      this.busy = false;
      if (this.queued) { this.queued = false; this.schedule(); }
    }
  }
}
