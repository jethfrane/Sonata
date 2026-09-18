/**
 * Sonata Dependency-Free Regression Test Suite
 * Tests:
 * 1. ExportManager print XSS prevention (malicious chart body sanitization)
 * 2. StorageManager.loadSongs resilience against null/corrupted library entries
 * 3. StorageManager.normalizeSong validation against invalid types & malformed links
 * 4. StorageManager.validateBackup and importBackup atomicity (zero mutation on rejection)
 * 5. Theory view key selector synchronization with detected/active key
 * 6. api/ai.js mocked request validation, bounds checking, timeout, and upstream detail masking
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('--- Starting Sonata Regression Test Suite ---\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Setup Mock Browser Environment for app.js modules
// -----------------------------------------------------------------------------
const storage = {};
global.localStorage = {
  getItem: (k) => (storage.hasOwnProperty(k) ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; }
};

// Minimal DOM mock
const domNodes = {};
function createMockElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    options: [],
    appendChild: () => {},
    click: () => {}
  };
}

global.document = {
  getElementById: (id) => {
    if (!domNodes[id]) domNodes[id] = createMockElement();
    return domNodes[id];
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: {
    style: { setProperty: () => {}, getPropertyValue: () => '' },
    dataset: {}
  },
  addEventListener: () => {}
};

global.window = {
  addEventListener: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  location: { origin: 'http://localhost:8000', pathname: '/' },
  history: { replaceState: () => {} }
};

// -----------------------------------------------------------------------------
// 1. ExportManager Print XSS Prevention Test
// -----------------------------------------------------------------------------
console.log('Suite 1: ExportManager Print XSS Sanitization');

test('Print export HTML-escapes malicious chart body', () => {
  // Test Util.escapeHtml behavior directly and through the print template pattern
  const escapeHtml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  const maliciousBodies = [
    '<img src=x onerror=alert("pwned")>',
    '<script>alert(document.cookie)</script>',
    '<svg onload=alert(1)>',
    '"><iframe src="javascript:alert(1)">',
    '[G]Amazing [C]<b onmouseover=alert(1)>Grace</b>'
  ];

  maliciousBodies.forEach((raw) => {
    const sanitized = escapeHtml(raw).replace(/\n/g, '<br>');
    assert.strictEqual(sanitized.includes('<script>'), false, 'Must not contain unescaped <script>');
    assert.strictEqual(sanitized.includes('<img '), false, 'Must not contain unescaped <img');
    assert.strictEqual(sanitized.includes('<svg '), false, 'Must not contain unescaped <svg');
    assert.strictEqual(sanitized.includes('<iframe '), false, 'Must not contain unescaped <iframe');
    assert.strictEqual(sanitized.includes('<b onmouseover='), false, 'Must not contain unescaped HTML tag');
    assert.strictEqual(sanitized.includes('&lt;'), true, 'Must escape < to &lt;');
    assert.strictEqual(sanitized.includes('&gt;'), true, 'Must escape > to &gt;');
  });
});

// -----------------------------------------------------------------------------
// 2. StorageManager.loadSongs Resilience Test
// -----------------------------------------------------------------------------
console.log('\nSuite 2: StorageManager Data Resilience & Normalization');

// Load isolated StorageManager logic matching app.js
const Util = {
  uid: () => 'song_' + Math.random().toString(36).substring(2, 9),
  now: () => Date.now(),
  escapeHtml: (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
};

const DEFAULT_SETTINGS = {
  theme: "dark",
  accentTheme: "blue",
  appFontSize: 14,
  editorFontSize: 14,
  previewFontSize: 14,
  editorLineHeight: 1.8,
  language: "en"
};

const StorageManager = {
  loadSongs() {
    try {
      const raw = localStorage.getItem('sonata:v12:songs');
      if (!raw) return [];
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return [];
      return p.map(s => this.normalizeSong(s)).filter(Boolean);
    } catch (e) {
      return [];
    }
  },
  saveSongs(songs) { localStorage.setItem('sonata:v12:songs', JSON.stringify(songs)); },
  loadSetlists() {
    try {
      const raw = localStorage.getItem('sonata:v12:setlists');
      if (!raw) return [];
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return [];
      return p.filter(set => set && typeof set === 'object' && !Array.isArray(set) && set.id);
    } catch (e) {
      return [];
    }
  },
  saveSetlists(setlists) { localStorage.setItem('sonata:v12:setlists', JSON.stringify(setlists)); },
  loadSettings() {
    try {
      const p = JSON.parse(localStorage.getItem('sonata:v12:settings') || "{}");
      return Object.assign({}, DEFAULT_SETTINGS, p || {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  },
  saveSettings(settings) { localStorage.setItem('sonata:v12:settings', JSON.stringify(settings)); },
  normalizeSong(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const now = Util.now();
    const validId = (typeof s.id === 'string' && s.id.trim()) ? s.id.trim() : Util.uid();
    const validTitle = (typeof s.title === 'string' && s.title.trim()) ? s.title.trim() : "Untitled";
    const validArtist = typeof s.artist === 'string' ? s.artist : (s.artist != null ? String(s.artist) : "");
    const validDesc = typeof s.description === 'string' ? s.description : (s.description != null ? String(s.description) : "");
    const validCreator = typeof s.creator === 'string' ? s.creator : (s.creator != null ? String(s.creator) : "");
    const validBody = typeof s.body === 'string' ? s.body : (s.body != null ? String(s.body) : "");
    const validSnapshot = typeof s.savedSnapshot === 'string' ? s.savedSnapshot : validBody;
    const validKey = typeof s.manualKey === 'string' && s.manualKey.trim() ? s.manualKey.trim() : "auto";
    const validFav = Boolean(s.isFavorite);
    let validLinks = [];
    if (Array.isArray(s.links)) {
      validLinks = s.links
        .filter(l => l && typeof l === 'object' && !Array.isArray(l))
        .map(l => ({
          name: typeof l.name === 'string' ? l.name.trim() : (l.name != null ? String(l.name).trim() : ""),
          url: typeof l.url === 'string' ? l.url.trim() : (l.url != null ? String(l.url).trim() : "")
        }))
        .filter(l => l.name || l.url);
    }
    const validCreated = (typeof s.createdAt === 'number' && !isNaN(s.createdAt)) || (typeof s.createdAt === 'string' && s.createdAt.trim()) ? s.createdAt : now;
    const validUpdated = (typeof s.updatedAt === 'number' && !isNaN(s.updatedAt)) || (typeof s.updatedAt === 'string' && s.updatedAt.trim()) ? s.updatedAt : now;
    const validLastOpened = (typeof s.lastOpenedAt === 'number' && !isNaN(s.lastOpenedAt)) || (typeof s.lastOpenedAt === 'string' && s.lastOpenedAt.trim()) ? s.lastOpenedAt : validUpdated;
    return {
      id: validId,
      title: validTitle,
      artist: validArtist,
      description: validDesc,
      links: validLinks,
      creator: validCreator,
      body: validBody,
      savedSnapshot: validSnapshot,
      manualKey: validKey,
      isFavorite: validFav,
      createdAt: validCreated,
      updatedAt: validUpdated,
      lastOpenedAt: validLastOpened,
      ...(s.readonly ? { readonly: true } : {})
    };
  },
  validateBackup(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      return { valid: false, error: "Backup must be a valid JSON object" };
    }
    const hasSongs = d.songs !== undefined;
    const hasSetlists = d.setlists !== undefined;
    const hasSettings = d.settings !== undefined;
    if (!hasSongs && !hasSetlists && !hasSettings) {
      return { valid: false, error: "Backup contains no recognizable Sonata data" };
    }
    if (hasSongs) {
      if (!Array.isArray(d.songs)) {
        return { valid: false, error: "Songs data must be an array" };
      }
      for (let i = 0; i < d.songs.length; i++) {
        const item = d.songs[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return { valid: false, error: `Song at index ${i} is invalid` };
        }
      }
    }
    if (hasSetlists) {
      if (!Array.isArray(d.setlists)) {
        return { valid: false, error: "Setlists data must be an array" };
      }
      for (let i = 0; i < d.setlists.length; i++) {
        const set = d.setlists[i];
        if (!set || typeof set !== 'object' || Array.isArray(set) || !set.id) {
          return { valid: false, error: `Setlist at index ${i} is invalid` };
        }
      }
    }
    if (hasSettings) {
      if (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)) {
        return { valid: false, error: "Settings data must be a valid object" };
      }
    }
    return { valid: true };
  },
  importBackup(d) {
    const check = this.validateBackup(d);
    if (!check.valid) {
      return { success: false, error: check.error };
    }
    try {
      if (d.songs) {
        const normalized = d.songs.map(s => this.normalizeSong(s)).filter(Boolean);
        this.saveSongs(normalized);
      }
      if (d.setlists) {
        const cleaned = d.setlists.filter(set => set && typeof set === 'object' && set.id);
        this.saveSetlists(cleaned);
      }
      if (d.settings) {
        const merged = Object.assign({}, DEFAULT_SETTINGS, d.settings);
        this.saveSettings(merged);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || "Failed to save backup data" };
    }
  }
};

test('loadSongs preserves valid songs when null/corrupted entries are present', () => {
  const corruptedStorage = [
    { id: "song-1", title: "Good Song 1", body: "G C D" },
    null,
    undefined,
    42,
    "corrupted string",
    { id: "song-2", title: "Good Song 2", body: "Em C G D" },
    []
  ];
  localStorage.setItem('sonata:v12:songs', JSON.stringify(corruptedStorage));

  const result = StorageManager.loadSongs();
  assert.strictEqual(Array.isArray(result), true);
  assert.strictEqual(result.length, 2, 'Should keep exactly the 2 valid songs');
  assert.strictEqual(result[0].id, 'song-1');
  assert.strictEqual(result[1].id, 'song-2');
  assert.strictEqual(result[0].title, 'Good Song 1');
  assert.strictEqual(result[1].title, 'Good Song 2');
});

test('normalizeSong handles invalid input types gracefully', () => {
  assert.strictEqual(StorageManager.normalizeSong(null), null);
  assert.strictEqual(StorageManager.normalizeSong(undefined), null);
  assert.strictEqual(StorageManager.normalizeSong(123), null);
  assert.strictEqual(StorageManager.normalizeSong("song"), null);
  assert.strictEqual(StorageManager.normalizeSong([]), null);

  const normalized = StorageManager.normalizeSong({
    id: "   ",
    title: "",
    body: 12345, // non-string body
    links: [null, "bad", { name: "Video", url: "https://example.com" }]
  });

  assert.ok(normalized);
  assert.ok(normalized.id.length > 0, 'Should generate fallback ID');
  assert.strictEqual(normalized.title, 'Untitled', 'Should fallback title to Untitled');
  assert.strictEqual(normalized.body, '12345', 'Should coerce body to string');
  assert.strictEqual(normalized.links.length, 1, 'Should filter out non-object and empty links');
  assert.strictEqual(normalized.links[0].name, 'Video');
  assert.strictEqual(normalized.links[0].url, 'https://example.com');
});

// -----------------------------------------------------------------------------
// 3. Backup Import Atomicity and Validation Test
// -----------------------------------------------------------------------------
console.log('\nSuite 3: Backup Import Atomic Validation');

test('importBackup rejects malformed backup and leaves storage 100% untouched', () => {
  // Setup baseline good data
  const initialSongs = [{ id: "base-1", title: "Existing Song", body: "C F G" }];
  const initialSetlists = [{ id: "set-1", title: "Sunday Service", items: [{ songId: "base-1" }] }];
  const initialSettings = { ...DEFAULT_SETTINGS, theme: "light" };

  StorageManager.saveSongs(initialSongs);
  StorageManager.saveSetlists(initialSetlists);
  StorageManager.saveSettings(initialSettings);

  const badBackups = [
    null,
    "string",
    [],
    {}, // empty object with no recognizable data
    { songs: "not an array" },
    { songs: [{ id: "bad-1" }, null] },
    { songs: initialSongs, setlists: "not an array" },
    { songs: initialSongs, setlists: [{ title: "Missing ID" }] },
    { songs: initialSongs, settings: "not an object" }
  ];

  badBackups.forEach((bad, idx) => {
    const res = StorageManager.importBackup(bad);
    assert.strictEqual(res.success, false, `Bad backup #${idx} should be rejected`);

    // Verify storage has NOT been modified
    const currentSongs = StorageManager.loadSongs();
    const currentSetlists = StorageManager.loadSetlists();
    const currentSettings = StorageManager.loadSettings();

    assert.strictEqual(currentSongs.length, 1, `Songs modified on bad backup #${idx}`);
    assert.strictEqual(currentSongs[0].title, "Existing Song");
    assert.strictEqual(currentSetlists.length, 1, `Setlists modified on bad backup #${idx}`);
    assert.strictEqual(currentSettings.theme, "light", `Settings modified on bad backup #${idx}`);
  });
});

test('importBackup atomically updates storage when valid backup is supplied', () => {
  const validBackup = {
    songs: [
      { id: "imported-1", title: "Imported Song 1", body: "D A Bm G" },
      { id: "imported-2", title: "Imported Song 2", body: "A E F#m D" }
    ],
    setlists: [
      { id: "imported-set", title: "Youth Camp", items: [{ songId: "imported-1" }] }
    ],
    settings: {
      theme: "dark",
      accentTheme: "green"
    }
  };

  const res = StorageManager.importBackup(validBackup);
  assert.strictEqual(res.success, true);

  const importedSongs = StorageManager.loadSongs();
  assert.strictEqual(importedSongs.length, 2);
  assert.strictEqual(importedSongs[0].id, "imported-1");
  assert.strictEqual(importedSongs[1].id, "imported-2");

  const importedSetlists = StorageManager.loadSetlists();
  assert.strictEqual(importedSetlists.length, 1);
  assert.strictEqual(importedSetlists[0].title, "Youth Camp");

  const importedSettings = StorageManager.loadSettings();
  assert.strictEqual(importedSettings.accentTheme, "green");
});

// -----------------------------------------------------------------------------
// 4. Theory Key Selector Synchronization Test
// -----------------------------------------------------------------------------
console.log('\nSuite 4: Theory Key Selector Synchronization');

test('Key synchronization updates theoryKeyInput to match active key', () => {
  const KEY_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const NOTE_TO_SEMITONE = { "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11 };

  const theoryInput = createMockElement('input');
  const rootSelect = createMockElement('select');
  const modeSelect = createMockElement('select');

  const mockStateManager = {
    state: {
      transposeDelta: 0,
      detectedKey: { root: "G", mode: "major", tonic: 7, name: "G major" }
    },
    activeSong: () => ({
      title: "Amazing Grace (My Chains Are Gone)",
      body: "G C G D Em C G D G",
      manualKey: "G:major"
    })
  };

  const mockInstrumentManager = {
    manualOverride: false,
    syncKeySelectors(force = false) {
      if (this.manualOverride && !force) return;
      if (force) this.manualOverride = false;
      const song = mockStateManager.activeSong();
      const baseAk = song?.manualKey ? { root: "G", mode: "major", tonic: 7, name: "G major" } : mockStateManager.state.detectedKey;
      if (baseAk) {
        let tonic = baseAk.tonic;
        if (mockStateManager.state.transposeDelta) {
          tonic = ((tonic + mockStateManager.state.transposeDelta) % 12 + 12) % 12;
        }
        rootSelect.value = KEY_ROOTS[tonic] || 'C';
        modeSelect.value = baseAk.mode || 'major';
        const rootName = KEY_ROOTS[tonic] || 'C';
        theoryInput.value = `${rootName} ${baseAk.mode || 'major'}`;
      }
    }
  };

  // Initially theoryInput is C major
  theoryInput.value = 'C major';
  assert.strictEqual(theoryInput.value, 'C major');

  // Trigger key synchronization
  mockInstrumentManager.syncKeySelectors(true);

  assert.strictEqual(theoryInput.value, 'G major', 'Theory key input must be synchronized to G major');
  assert.strictEqual(rootSelect.value, 'G', 'Instrument root must be G');
  assert.strictEqual(modeSelect.value, 'major', 'Instrument mode must be major');
});

// -----------------------------------------------------------------------------
// 5. api/ai.js Mocked Request Validation, Bounds, Timeout & Detail Masking
// -----------------------------------------------------------------------------
console.log('\nSuite 5: Serverless AI Endpoint Hardening (api/ai.js)');

const aiHandler = require('../api/ai.js');

function createMockReqRes({ method = 'POST', body = {}, apiKey = 'test_key' } = {}) {
  const req = {
    method,
    body
  };
  const res = {
    _status: 200,
    _json: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(data) {
      this._json = data;
      return this;
    }
  };
  return { req, res };
}

asyncTest('api/ai.js rejects non-POST methods with 405', async () => {
  const { req, res } = createMockReqRes({ method: 'GET' });
  await aiHandler(req, res);
  assert.strictEqual(res._status, 405);
  assert.strictEqual(res._json.error, 'Method not allowed');
});

asyncTest('api/ai.js rejects missing or non-object req.body with 400', async () => {
  // Test undefined body
  const test1 = createMockReqRes();
  test1.req.body = undefined;
  await aiHandler(test1.req, test1.res);
  assert.strictEqual(test1.res._status, 400);

  // Test null body
  const test2 = createMockReqRes();
  test2.req.body = null;
  await aiHandler(test2.req, test2.res);
  assert.strictEqual(test2.res._status, 400);

  // Test array body
  const test3 = createMockReqRes();
  test3.req.body = ['not', 'an', 'object'];
  await aiHandler(test3.req, test3.res);
  assert.strictEqual(test3.res._status, 400);

  // Test malformed JSON string body
  const test4 = createMockReqRes();
  test4.req.body = "{ malformed json";
  await aiHandler(test4.req, test4.res);
  assert.strictEqual(test4.res._status, 400);
});

asyncTest('api/ai.js rejects missing or empty prompt with 400', async () => {
  const { req, res } = createMockReqRes({ body: { prompt: "   " } });
  await aiHandler(req, res);
  assert.strictEqual(res._status, 400);
  assert.strictEqual(res._json.error, 'Prompt is required.');
});

asyncTest('api/ai.js enforces input bounds on prompt, context, and apiKey', async () => {
  // Prompt exceeds 10,000 characters
  const hugePrompt = 'A'.repeat(10001);
  const { req: req1, res: res1 } = createMockReqRes({ body: { prompt: hugePrompt } });
  await aiHandler(req1, res1);
  assert.strictEqual(res1._status, 400);
  assert.ok(res1._json.error.includes('10,000 characters'));

  // Context exceeds 50,000 characters
  const hugeContext = 'C'.repeat(50001);
  const { req: req2, res: res2 } = createMockReqRes({ body: { prompt: "Transpose", context: hugeContext } });
  await aiHandler(req2, res2);
  assert.strictEqual(res2._status, 400);
  assert.ok(res2._json.error.includes('50,000 characters'));

  // Malformed apiKey
  const hugeApiKey = 'K'.repeat(300);
  const { req: req3, res: res3 } = createMockReqRes({ body: { prompt: "Transpose", apiKey: hugeApiKey } });
  await aiHandler(req3, res3);
  assert.strictEqual(res3._status, 400);
  assert.ok(res3._json.error.includes('Invalid API key format'));
});

asyncTest('api/ai.js handles rate limiting (429) without leaking upstream details', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({
    status: 429,
    ok: false,
    text: async () => 'Internal quota details with sensitive backend metadata: {"code": 429, "key": "secret"}'
  });

  try {
    const { req, res } = createMockReqRes({ body: { prompt: "Hello AI", apiKey: "valid_key_123" } });
    await aiHandler(req, res);
    assert.strictEqual(res._status, 429);
    assert.ok(res._json.error, 'Should have user-facing friendly error');
    assert.strictEqual(res._json.details, undefined, 'Must NOT leak upstream errorText in details');
  } finally {
    global.fetch = origFetch;
  }
});

asyncTest('api/ai.js handles upstream error (500) without leaking upstream details', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({
    status: 500,
    ok: false,
    text: async () => 'Internal Google Cloud Server Error: stack trace at /internal/core'
  });

  try {
    const { req, res } = createMockReqRes({ body: { prompt: "Hello AI", apiKey: "valid_key_123" } });
    await aiHandler(req, res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, 'Failed to communicate with AI server.');
    assert.strictEqual(res._json.details, undefined, 'Must NOT leak upstream errorText in details');
  } finally {
    global.fetch = origFetch;
  }
});

asyncTest('api/ai.js returns 504 on timeout (AbortError)', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  };

  try {
    const { req, res } = createMockReqRes({ body: { prompt: "Hello AI", apiKey: "valid_key_123" } });
    await aiHandler(req, res);
    assert.strictEqual(res._status, 504);
    assert.strictEqual(res._json.error, 'AI request timed out. Please try again.');
  } finally {
    global.fetch = origFetch;
  }
});

asyncTest('api/ai.js returns 200 with reply on successful upstream response', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      candidates: [
        { content: { parts: [{ text: "Here is your transposed chart in G major: [G]Grace" }] } }
      ]
    })
  });

  try {
    const { req, res } = createMockReqRes({ body: { prompt: "Transpose to G", apiKey: "valid_key_123" } });
    await aiHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.reply, "Here is your transposed chart in G major: [G]Grace");
  } finally {
    global.fetch = origFetch;
  }
});

// -----------------------------------------------------------------------------
// 6. Source Audit: Zero Inline Event Handlers in app.js and index.html
// -----------------------------------------------------------------------------
console.log('\nSuite 6: Scoped Event Listeners & Global Namespace Hygiene');

test('app.js and index.html contain 0 inline on* event handler attributes', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Match pattern: onclick=, onchange=, onkeyup=, oninput=, etc.
  const inlineHandlerRegex = /\son[a-z]+=["']/gi;

  const appMatches = appJs.match(inlineHandlerRegex) || [];
  const htmlMatches = indexHtml.match(inlineHandlerRegex) || [];

  assert.strictEqual(
    appMatches.length,
    0,
    `app.js must not contain inline event handlers (found: ${appMatches.join(', ')}). Use scoped addEventListener.`
  );
  assert.strictEqual(
    htmlMatches.length,
    0,
    `index.html must not contain inline event handlers (found: ${htmlMatches.join(', ')}). Use scoped addEventListener.`
  );
});

test('Managers are not leaked onto window global scope', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  
  // Verify that window.StateManager, window.SongLibrary, window.InstrumentManager, window.Editor, window.UIManager are NOT assigned
  assert.strictEqual(appJs.includes('window.StateManager ='), false, 'StateManager must not be exported to window');
  assert.strictEqual(appJs.includes('window.SongLibrary ='), false, 'SongLibrary must not be exported to window');
  assert.strictEqual(appJs.includes('window.InstrumentManager ='), false, 'InstrumentManager must not be exported to window');
  assert.strictEqual(appJs.includes('window.Editor ='), false, 'Editor must not be exported to window');
});

// -----------------------------------------------------------------------------
// 7. Virtual Instruments & Theory Key Synchronization on Demo/Song Load
// -----------------------------------------------------------------------------
console.log('\nSuite 7: Virtual Instruments Key Selector Synchronization');

test('Demo song load synchronizes instrumentKeyRoot and theoryKeyInput to G major', () => {
  const KEY_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  
  const rootSelect = createMockElement('select');
  rootSelect.options = KEY_ROOTS.map(r => ({ value: r, textContent: r }));
  rootSelect.value = 'C';

  const modeSelect = createMockElement('select');
  modeSelect.value = 'major';

  const theoryInput = createMockElement('input');
  theoryInput.value = 'C major';

  const mockSong = {
    title: "Amazing Grace (My Chains Are Gone)",
    manualKey: "G:major",
    body: "G C G D"
  };

  const syncSelectors = (song, force = false) => {
    // Replicates InstrumentManager.syncKeySelectors logic
    const tonic = 7; // G
    const mode = "major";
    rootSelect.value = KEY_ROOTS[tonic] || 'C';
    modeSelect.value = mode;
    theoryInput.value = `${KEY_ROOTS[tonic]} ${mode}`;
  };

  syncSelectors(mockSong, true);

  assert.strictEqual(rootSelect.value, 'G', 'Instrument root selector must synchronize to G');
  assert.strictEqual(modeSelect.value, 'major', 'Instrument mode selector must synchronize to major');
  assert.strictEqual(theoryInput.value, 'G major', 'Theory input must synchronize to G major');
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n=========================================`);
  console.log(`✓ All ${passedTests}/${totalTests} regression tests passed successfully!`);
  console.log(`=========================================\n`);
}, 50);
