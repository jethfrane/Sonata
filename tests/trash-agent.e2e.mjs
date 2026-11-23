// Trash & AI Agents (WebMCP + window.sonataAgent) E2E tests.
// Run: BASE=http://127.0.0.1:5391/ node tests/trash-agent.e2e.mjs (serve dist with tests/serve.mjs)
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
const errs = [];

async function makePage(opts = {}) {
  const ctx = await b.newContext({
    viewport: opts.viewport || { width: 1280, height: 860 },
    permissions: ["clipboard-read", "clipboard-write"],
    hasTouch: Boolean(opts.touch),
    isMobile: Boolean(opts.touch)
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p };
}

async function seedLibrary(p, songs, setlists = [], trash = []) {
  await p.goto(BASE + "/songs");
  await p.evaluate(({ songs, setlists, trash }) => {
    localStorage.clear();
    localStorage.setItem("sonata:v12:songs", JSON.stringify(songs));
    localStorage.setItem("sonata:v12:setlists", JSON.stringify(setlists));
    localStorage.setItem("sonata:v12:trash", JSON.stringify(trash));
    localStorage.setItem("sonata:v12:settings", JSON.stringify({ buddy: false, language: "en" }));
    if (songs[0]) localStorage.setItem("sonata:v12:active", songs[0].id);
  }, { songs, setlists, trash });
  await p.reload();
  await p.waitForTimeout(500);
}

// 1. Song Trash -> Undo -> 0-active-songs visibility -> Restore (with setlist membership) -> Delete forever -> Empty trash
{
  const { ctx, p } = await makePage();
  const s1 = { id: "song-tr-111111", title: "Grace Alone", artist: "Dustin Kensrue", body: "G C D", updatedAt: "2026-10-01T00:00:00.000Z" };
  const s2 = { id: "song-tr-222222", title: "Anchor", artist: "Hillsong", body: "C F G", updatedAt: "2026-10-02T00:00:00.000Z" };
  const sl = { id: "set-tr-111111", title: "Sunday Worship", items: [{ songId: s1.id }, { songId: s2.id }], date: "2026-10-03", updatedAt: "2026-10-03T00:00:00.000Z" };
  await seedLibrary(p, [s1, s2], [sl]);

  // Delete s1 -> moves to Trash -> Undo toast restores it
  await p.click(`#libraryList [data-id="${s1.id}"] [data-act="more"]`);
  await p.click('[data-m="del"]');
  await p.waitForTimeout(300);
  ok(await p.locator("#libraryList .row[data-id]").count() === 1, "deleting song removes it from active list");
  ok((await p.textContent('[data-filter="trash"]')).includes("Trash") && (await p.textContent("#trashCount")).trim() === "1", "Trash tab displays count 1");
  await p.click(".toast-action");
  await p.waitForTimeout(300);
  ok(await p.locator("#libraryList .row[data-id]").count() === 2, "Undo toast restores song to active list");
  ok((await p.textContent('[data-filter="trash"]')).trim() === "Trash" && await p.isHidden("#trashCount"), "Trash count clears after Undo");

  // Delete both songs -> 0 active songs -> Trash tab remains reachable & shows items
  await p.click(`#libraryList [data-id="${s1.id}"] [data-act="more"]`);
  await p.click('[data-m="del"]');
  await p.waitForTimeout(200);
  await p.click(`#libraryList [data-id="${s2.id}"] [data-act="more"]`);
  await p.click('[data-m="del"]');
  await p.waitForTimeout(600);
  ok(await p.isVisible('[data-filter="trash"]'), "Trash tab remains visible even with 0 active songs");
  ok((await p.textContent('[data-filter="trash"]')).includes("Trash") && (await p.textContent("#trashCount")).trim() === "2", "Trash tab shows count 2");

  // Open Trash tab and restore s1 -> restores song & setlist membership
  await p.click('[data-filter="trash"]');
  await p.waitForTimeout(200);
  ok(await p.locator("#libraryList .trash-row").count() === 2, "Trash view lists both trashed songs");
  await p.click(`#libraryList [data-id="${s1.id}"] [data-act="trash-restore"]`);
  await p.waitForTimeout(600);
  ok(await p.locator("#libraryList .trash-row").count() === 1, "Restore removes item from Trash");
  const afterRestore = await p.evaluate(({ s1Id, slId }) => {
    const songs = JSON.parse(localStorage.getItem("sonata:v12:songs") || "[]");
    const sets = JSON.parse(localStorage.getItem("sonata:v12:setlists") || "[]");
    const set = sets.find((x) => x.id === slId);
    return { hasSong: songs.some((x) => x.id === s1Id), inSet: Boolean(set && set.items.some((i) => i.songId === s1Id)) };
  }, { s1Id: s1.id, slId: sl.id });
  ok(afterRestore.hasSong && afterRestore.inSet, "Restore brings back song and its setlist membership");

  // Delete forever permanently removes s2 and tombstones its id
  await p.click(`#libraryList [data-id="${s2.id}"] [data-act="trash-purge"]`);
  await p.waitForTimeout(300);
  await p.click("#sheetFoot .btn.danger");
  await p.waitForTimeout(600);
  const afterPurge = await p.evaluate((s2Id) => ({
    trashLen: JSON.parse(localStorage.getItem("sonata:v12:trash") || "[]").length,
    deleted: JSON.parse(localStorage.getItem("sonata:v12:deleted") || "[]").includes(s2Id)
  }), s2.id);
  ok(afterPurge.trashLen === 0 && afterPurge.deleted, "Delete forever permanently removes item and records deletedId");

  // Empty trash clears multiple items at once
  await p.evaluate(() => {
    const s = window.__sonata.store;
    const a = s.createSong({ title: "Bulk One", body: "G C" });
    const b = s.createSong({ title: "Bulk Two", body: "D A" });
    s.trashSongs([a.id, b.id]);
  });
  await p.click('[data-filter="trash"]');
  await p.waitForTimeout(200);
  ok(await p.locator("#libraryList .trash-row").count() === 2, "two items ready for Empty trash");
  await p.click('[data-act="trash-empty"]');
  await p.waitForTimeout(300);
  await p.click("#sheetFoot .btn.danger");
  await p.waitForTimeout(600);
  ok(await p.locator("#libraryList .trash-row").count() === 0 && (await p.textContent("#libraryList")).includes("Trash is empty"), "Empty trash clears all items and renders empty state");
  await ctx.close();
}

// 2. Setlist Trash -> Restore brings it back
{
  const { ctx, p } = await makePage();
  const s1 = { id: "song-sl-111111", title: "Alpha", body: "C F G", updatedAt: "2026-10-01T00:00:00.000Z" };
  const sl = { id: "set-sl-111111", title: "Evening Set", items: [{ songId: s1.id }], date: "2026-10-02", updatedAt: "2026-10-02T00:00:00.000Z" };
  await seedLibrary(p, [s1], [sl]);

  await p.click('[data-filter="setlists"]');
  await p.waitForTimeout(200);
  await p.click(`#libraryList [data-id="${sl.id}"] [data-act="set-more"]`);
  await p.click('[data-m="del"]');
  await p.waitForTimeout(300);
  ok((await p.textContent("#libraryList")).includes("No setlists yet"), "trashing setlist removes it from Setlists view");

  await p.click('[data-filter="trash"]');
  await p.waitForTimeout(200);
  ok((await p.textContent("#libraryList")).includes("Evening Set"), "trashed setlist appears in Trash tab");
  await p.click(`#libraryList [data-id="${sl.id}"] [data-act="trash-restore"]`);
  await p.waitForTimeout(300);

  await p.click('[data-filter="setlists"]');
  await p.waitForTimeout(200);
  ok((await p.textContent("#libraryList")).includes("Evening Set"), "Restore brings setlist back to Setlists view");
  await ctx.close();
}

// 3. window.sonataAgent + WebMCP navigator.modelContext.registerTool (all 18 tools) + live UI updates
{
  const { ctx, p } = await makePage({
    init: () => {
      window.__registeredTools = [];
      Object.defineProperty(navigator, "modelContext", {
        configurable: true,
        value: {
          registerTool(tool) {
            window.__registeredTools.push(tool);
          }
        }
      });
    }
  });
  await seedLibrary(p, [{ id: "song-ag-seed", title: "Seed Song", body: "G C D", updatedAt: "2026-10-01T00:00:00.000Z" }]);
  await p.waitForFunction(() => Boolean(window.sonataAgent));

  const initInfo = await p.evaluate(() => ({
    webMcp: window.sonataAgent.webMcp,
    toolCount: window.sonataAgent.tools().length,
    registeredNames: window.__registeredTools.map((t) => t.name),
    hasAnnotations: window.__registeredTools.every((t) => typeof t.annotations?.readOnlyHint === "boolean")
  }));
  ok(initInfo.webMcp === true && initInfo.toolCount === 18 && initInfo.registeredNames.length === 18 && initInfo.hasAnnotations, "navigator.modelContext.registerTool registers all 18 WebMCP tools with annotations");

  // Execute tools via window.sonataAgent and verify live UI updates
  const created = await p.evaluate(() => window.sonataAgent.call("create_song", {
    title: "Agent Anthem",
    artist: "AI Band",
    body: "G  C  D\nSing a new song",
    key: "G:major"
  }));
  await p.waitForTimeout(250);
  ok(created.song.title === "Agent Anthem" && (await p.textContent("#libraryList")).includes("Agent Anthem"), "sonataAgent.call('create_song') creates song and updates live UI");

  const updated = await p.evaluate((id) => window.sonataAgent.call("update_song", {
    id,
    title: "Agent Anthem Live",
    transposeBy: 2
  }), created.song.id);
  await p.waitForTimeout(250);
  ok(updated.song.manualKey === "A:major" && (await p.textContent("#libraryList")).includes("Agent Anthem Live"), "sonataAgent.call('update_song') updates title/chords in live UI");

  const chord = await p.evaluate(() => window.sonataAgent.call("lookup_chord", { chord: "Cmaj7", instrument: "guitar" }));
  ok(chord.name === "Cmaj7" && chord.notes.join(",") === "C,E,G,B" && chord.guitar.length > 0, "sonataAgent.call('lookup_chord') returns notes & guitar shapes");

  const listed = await p.evaluate(() => window.sonataAgent.call("list_songs", { query: "Anthem" }));
  ok(listed.total === 1 && listed.songs[0].id === created.song.id, "sonataAgent.call('list_songs') finds created song");

  const trashed = await p.evaluate((id) => window.sonataAgent.call("trash_song", { ids: [id] }), created.song.id);
  await p.waitForTimeout(250);
  ok(trashed.trashedCount === 1 && !(await p.textContent("#libraryList")).includes("Agent Anthem Live") && (await p.textContent("#trashCount")).trim() === "1", "sonataAgent.call('trash_song') updates live UI and Trash count");

  const restored = await p.evaluate((id) => window.sonataAgent.call("restore_from_trash", { ids: [id] }), created.song.id);
  await p.waitForTimeout(250);
  ok(restored.restoredSongs === 1 && (await p.textContent("#libraryList")).includes("Agent Anthem Live"), "sonataAgent.call('restore_from_trash') restores song in live UI");

  // 4. Backup & restore "AI Agents & MCP" card + Copy button + Settings button
  await p.click("#accountBtn");
  await p.waitForTimeout(500);
  ok(await p.isVisible("#aiMcpCard") && (await p.inputValue("#aiMcpUrl")) === "https://sonata.jethrofrane.xyz/api/mcp", "Backup & restore sheet displays AI Agents & MCP card with endpoint URL");
  await p.click("#copyMcpUrl");
  await p.waitForTimeout(250);
  ok((await p.evaluate(() => navigator.clipboard.readText())) === "https://sonata.jethrofrane.xyz/api/mcp", "Copy button copies MCP endpoint URL");

  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  await p.click("#settingsBtn");
  await p.waitForTimeout(400);
  ok(await p.isVisible("#openAiMcpBtn"), "Settings sheet shows AI Agents & MCP button");
  await p.click("#openAiMcpBtn");
  await p.waitForTimeout(500);
  ok((await p.textContent("#sheetTitle")) === "Backup & restore" && await p.isVisible("#aiMcpCard"), "Settings AI Agents & MCP button opens Backup & restore AI section");
  await ctx.close();
}

// 5. 375px mobile viewport zero horizontal overflow on Songs view with 5 filter tabs
{
  const { ctx, p } = await makePage({ viewport: { width: 375, height: 812 }, touch: true });
  const s1 = { id: "song-mob-1", title: "Mobile Song", artist: "Artist Name", body: "G C D", updatedAt: "2026-10-01T00:00:00.000Z" };
  const s2 = { id: "song-mob-2", title: "Trashed Mobile Song", artist: "Another", body: "Am F C G", updatedAt: "2026-10-01T00:00:00.000Z" };
  const trashEntry = { kind: "song", id: s2.id, trashedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), item: s2 };
  await seedLibrary(p, [s1], [], [trashEntry]);

  const tabCount = await p.locator(".library-toolbar [data-filter]").count();
  const songsOverflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(tabCount === 5 && songsOverflow <= 0, `375px Songs view with 5 filter tabs has zero horizontal overflow (${songsOverflow}px)`);

  await p.click('[data-filter="trash"]');
  await p.waitForTimeout(200);
  const trashOverflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(trashOverflow <= 0, `375px Trash tab has zero horizontal overflow (${trashOverflow}px)`);
  await ctx.close();
}

// 6. v7 Navigation (3-tab Songs · Chart · Tools), Tools Hub (/tools), Floating Popover Dropdowns, and Minor Circle of Fifths + Key Finder
{
  const { ctx, p } = await makePage({ viewport: { width: 1280, height: 860 } });
  const s1 = { id: "song-v7-1", title: "Alpha Worship", artist: "Artist A", body: "Am F C G\nChorus words", updatedAt: "2026-10-01T00:00:00.000Z" };
  const s2 = { id: "song-v7-2", title: "Zulu Hymn", artist: "Artist Z", body: "G D Em C", updatedAt: "2026-10-02T00:00:00.000Z" };
  await seedLibrary(p, [s1, s2]);

  // Clean 3-tab desktop & mobile nav
  const navCounts = await p.evaluate(() => ({
    desktopTabs: [...document.querySelectorAll(".tabs .tab")].map((b) => b.getAttribute("data-view")),
    mobileTabs: [...document.querySelectorAll(".bottom-nav .bn")].map((b) => b.getAttribute("data-view"))
  }));
  ok(navCounts.desktopTabs.join(",") === "songs,editor,tools" && navCounts.mobileTabs.join(",") === "songs,editor,tools", "desktop and mobile navigation have exactly 3 tabs: Songs, Chart, Tools");

  // Floating popover dropdown (.ui-select-menu) on #librarySort without layout shift, plus keyboard navigation
  const toolbarHeightBefore = await p.evaluate(() => document.querySelector(".library-toolbar").getBoundingClientRect().height);
  await p.dispatchEvent("#librarySort", "mousedown");
  await p.waitForTimeout(150);
  const menuInfo = await p.evaluate(() => {
    const m = document.querySelector(".ui-select-menu");
    const th = document.querySelector(".library-toolbar").getBoundingClientRect().height;
    return {
      open: Boolean(m),
      pos: m ? getComputedStyle(m).position : "",
      role: m ? m.getAttribute("role") : "",
      hasDrawer: Boolean(document.querySelector(".ui-select-drawer")),
      toolbarHeightAfter: th
    };
  });
  ok(menuInfo.open && menuInfo.pos === "fixed" && menuInfo.role === "listbox" && !menuInfo.hasDrawer && Math.abs(menuInfo.toolbarHeightAfter - toolbarHeightBefore) < 1, "clicking #librarySort opens fixed floating popover menu without shifting toolbar height");

  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(150);
  ok((await p.inputValue("#librarySort")) === "title" && await p.locator(".ui-select-menu").count() === 0, "keyboard ArrowDown + Enter selects option in floating menu and closes it");

  // Floating dropdown inside <dialog> top-layer modal (Settings)
  await p.click("#settingsBtn");
  await p.waitForTimeout(300);
  await p.dispatchEvent('#sheet select[data-set="language"]', "mousedown");
  await p.waitForTimeout(150);
  const dialogMenu = await p.evaluate(() => {
    const m = document.querySelector("#sheet .ui-select-menu");
    return { mountedInDialog: Boolean(m), optCount: m ? m.querySelectorAll(".ui-select-opt").length : 0 };
  });
  ok(dialogMenu.mountedInDialog && dialogMenu.optCount >= 2, "Settings dropdown mounts floating popover inside <dialog#sheet> above backdrop");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);

  // Tools Hub (/tools): open each tool and return with ← All tools
  await p.click('.tabs [data-view="tools"]');
  await p.waitForTimeout(200);
  ok(new URL(p.url()).pathname === "/tools" && await p.locator("#view-tools [data-open-tool]").count() === 8, "Tools tab opens /tools with 8 curated tool cards");

  for (const [card, expectedPath, backScope] of [
    ["chords", "/chords", "#view-chords"],
    ["theory", "/theory", "#view-theory"],
    ["key-finder", "/tools/key-finder", "#view-theory"],
    ["play:piano", "/play/piano", "#view-play"],
    ["play:guitar", "/play/guitar", "#view-play"],
    ["play:tuner", "/play/tuner", "#view-play"],
    ["play:metronome", "/play/metronome", "#view-play"],
    ["play:drums", "/play/drums", "#view-play"]
  ]) {
    await p.click(`#view-tools [data-open-tool="${card}"]`);
    await p.waitForTimeout(250);
    const activeToolsTab = await p.evaluate(() => document.querySelector('.tabs [data-view="tools"]').classList.contains("active"));
    ok(new URL(p.url()).pathname.startsWith(expectedPath) && activeToolsTab, `Tools Hub card '${card}' opens ${expectedPath} and keeps Tools nav active`);
    await p.click(`${backScope} [data-back-tools]`);
    await p.waitForTimeout(150);
    ok(new URL(p.url()).pathname === "/tools" && await p.isVisible("#view-tools"), `← All tools in ${backScope} returns to /tools`);
  }

  // Minor Circle of Fifths rearrangement + upgraded Key Finder
  await p.click('#view-tools [data-open-tool="key-finder"]');
  await p.waitForTimeout(300);
  await p.click('[data-key-mode="minor"]');
  await p.waitForTimeout(200);
  const minorCircle = await p.evaluate(() => {
    const circle = document.getElementById("circle");
    const outerWedges = [...circle.querySelectorAll('.wedge[data-pos="outer"]')];
    const middleWedges = [...circle.querySelectorAll('.wedge[data-pos="middle"]')];
    const pickerLabels = [...document.querySelectorAll("#keyPicker [data-tonic]")].map((b) => b.textContent.trim());
    return {
      mode: circle.dataset.mode,
      outerRings: new Set(outerWedges.map((w) => w.dataset.ring)).size === 1 ? outerWedges[0]?.dataset.ring : "mixed",
      outerFirstText: outerWedges[0]?.querySelector("text")?.textContent?.trim(),
      middleRings: new Set(middleWedges.map((w) => w.dataset.ring)).size === 1 ? middleWedges[0]?.dataset.ring : "mixed",
      middleFirstText: middleWedges[0]?.querySelector("text")?.textContent?.trim(),
      hubKey: circle.querySelector(".hub-key")?.textContent?.trim(),
      hubMode: circle.querySelector(".hub-mode")?.textContent?.trim(),
      allPickersMinor: pickerLabels.every((l) => l.endsWith("m"))
    };
  });
  ok(minorCircle.mode === "minor" && minorCircle.outerRings === "minor" && minorCircle.outerFirstText === "Am" && minorCircle.middleRings === "major" && minorCircle.middleFirstText === "C", "switching to Minor rearranges Circle of Fifths so Minor keys occupy outer ring (Am at top) and Relative Majors occupy middle ring");
  ok(minorCircle.allPickersMinor && minorCircle.hubKey.endsWith("m") && /minor/i.test(minorCircle.hubMode || ""), "Minor mode updates keyPicker buttons with 'm' and shows minor key + mode in center hub");

  // Upgraded Key Finder: Use song chords, candidate pills, wedge highlights
  await p.click("#kfUseSong");
  await p.waitForTimeout(200);
  const kfState = await p.evaluate(() => ({
    input: /** @type {HTMLInputElement} */ (document.getElementById("keyFinderInput")).value,
    candidates: [...document.querySelectorAll("#keyFinderResult .kf-cand[data-use-key]")].map((b) => b.textContent.trim()),
    foundWedges: document.querySelectorAll("#circle .wedge.found").length
  }));
  ok(kfState.input.includes("Am") && kfState.candidates.length >= 2 && kfState.foundWedges >= 4, "Key Finder 'Use song chords' populates active song chords, renders ranked Major/Minor candidates, and highlights matching wedges on the circle");

  await p.click('#keyFinderResult .kf-cand[data-use-key="9:minor"]');
  await p.waitForTimeout(200);
  ok((await p.textContent("#keyTitle")) === "A minor" && (await p.getAttribute("#circle", "data-mode")) === "minor", "clicking 'A minor' candidate pill switches Circle of Fifths to A minor");

  // Mobile 320px & 390px overflow check on /tools and /tools/key-finder
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const route of ["/tools", "/tools/key-finder"]) {
      await p.goto(BASE + route);
      await p.waitForTimeout(250);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, `no horizontal overflow at ${w}px on ${route} (${over}px)`);
    }
  }

  // Direct URL paste into empty editor #songBody & #quickImportBtn
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.route("**/api/import*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      title: "Way Maker",
      artist: "Sinach",
      source: "https://tabs.ultimate-guitar.com/tab/sinach/way-maker-chords",
      text: "Key: E\n[Chorus]\nA           E\nWay maker, miracle worker\nB                C#m\nPromise keeper, light in the darkness"
    })
  }));
  await p.goto(BASE + "/songs");
  await p.click("#newSongBtn");
  await p.waitForTimeout(250);
  ok(await p.isVisible("#quickImportBtn"), "empty Chart editor shows 'Import from link' quickstart chip");
  await p.evaluate(() => {
    const ta = document.getElementById("songBody");
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://tabs.ultimate-guitar.com/tab/sinach/way-maker-chords");
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.getElementById("sheet").open) && (await p.textContent("#lkFound")).includes("Way Maker"), "pasting a chord URL into empty #songBody automatically opens Import sheet and reads the chart");
  await p.click("#sheetFoot .btn.primary");
  await p.waitForTimeout(300);
  ok((await p.inputValue("#songTitle")) === "Way Maker" && (await p.inputValue("#songBody")).includes("## Chorus"), "confirming Add autofills the Sonata editor with title, artist, key, and formatted sections");
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.length ? errs.join(" | ") : "none"}`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
