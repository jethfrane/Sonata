// Regenerates the README and install-prompt screenshots in public/screenshots/.
// Run against the built app: npm run build && npm run serve:dist, then
//   BASE=http://127.0.0.1:5391 node tests/screenshots.mjs
import { fileURLToPath } from "node:url";
const { chromium } = await import("playwright");
const BASE = (process.env.BASE || "http://127.0.0.1:5391").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("../public/screenshots/", import.meta.url));

const SONGS = [
  { id: "song-demo-amazing", title: "Amazing Grace (My Chains Are Gone)", artist: "John Newton, Chris Tomlin", manualKey: "G:major", bpm: 72, isFavorite: true,
    links: [{ name: "Reference", url: "https://www.youtube.com/results?search_query=amazing+grace+my+chains+are+gone" }],
    body: "## Verse 1\nG           G/B       C        G\nAmazing grace, how sweet the sound\nG                   Em      D\nThat saved a wretch like me\nG            G/B        C          G\nI once was lost, but now am found\nG         Em      D         G\nWas blind but now I see\n\n## Chorus\n> All in, full band\n[C]My chains are [G]gone, I've been set [D]free\nMy [Em]God, my [C]Savior has [G]ransomed [D]me\nAnd [C]like a flood His [G]mercy [Em]reigns\nUn[C]ending [G]love, a[D]mazing [G]grace\n\n## Bridge\nC///  G/B///  Am7///  G///\n// Drums build here\nC  D  Em  G/D  C  D  G\n" },
  { id: "song-demo-howgreat", title: "How Great Is Our God", artist: "Chris Tomlin", manualKey: "C:major", bpm: 78, body: "## Verse\nC                 Am\nThe splendor of a King\n       F               C\nClothed in majesty\n" },
  { id: "song-demo-goodness", title: "Goodness of God", artist: "Bethel Music", manualKey: "A:major", bpm: 63, isFavorite: true, body: "## Verse\nA            D        A\nI love You, Lord\n" },
  { id: "song-demo-waymaker", title: "Way Maker", artist: "Sinach", manualKey: "E:major", bpm: 68, body: "## Chorus\nE           B\nWay maker, miracle worker\n" },
  { id: "song-demo-cornerstone", title: "Cornerstone", artist: "Hillsong Worship", manualKey: "C:major", bpm: 72, body: "## Chorus\nC        F        C\nChrist alone, cornerstone\n" }
];

const b = await chromium.launch();

/** @param {{ width: number, height: number }} viewport @param {"light"|"dark"} theme */
async function open(viewport, theme, path) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, hasTouch: viewport.width < 800 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/songs");
  await page.evaluate(({ songs, theme }) => {
    localStorage.clear();
    const now = Date.now();
    localStorage.setItem("sonata:v12:songs", JSON.stringify(songs.map((s, i) => ({ manualKey: "auto", transpose: 0, capo: 0, creator: "", description: "", links: [], isFavorite: false, ...s,
      createdAt: new Date(now - i * 864e5).toISOString(), updatedAt: new Date(now - i * 36e5).toISOString(), lastOpenedAt: new Date(now - i * 36e5).toISOString() }))));
    localStorage.setItem("sonata:v12:setlists", JSON.stringify([{ id: "set-demo-sunday", title: "Sunday, Nov 9", description: "", items: [{ songId: "song-demo-amazing" }, { songId: "song-demo-goodness" }, { songId: "song-demo-waymaker" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
    localStorage.setItem("sonata:v12:active", "song-demo-amazing");
    localStorage.setItem("sonata:v12:settings", JSON.stringify({ theme, buddy: false }));
  }, { songs: SONGS, theme });
  await page.goto(BASE + path);
  await page.waitForTimeout(700);
  return { ctx, page };
}

/** @param {any} page @param {string} name */
const shot = (page, name) => page.screenshot({ path: OUT + name, animations: "disabled" });

const desk = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

let { ctx, page } = await open(desk, "light", "/editor");
await shot(page, "desktop-chart.png"); await ctx.close();

({ ctx, page } = await open(desk, "dark", "/songs"));
await shot(page, "desktop-songs-dark.png"); await ctx.close();

({ ctx, page } = await open(desk, "light", "/theory"));
await page.click('#keyPicker [data-tonic="7"]'); await page.waitForTimeout(300);
await shot(page, "desktop-theory.png"); await ctx.close();

({ ctx, page } = await open(desk, "light", "/play/piano"));
await page.locator("#pianoPlayer [data-chord]").first().click().catch(() => {}); await page.waitForTimeout(300);
await shot(page, "desktop-play.png"); await ctx.close();

({ ctx, page } = await open(desk, "dark", "/stage"));
await page.waitForTimeout(400);
await shot(page, "desktop-stage.png"); await ctx.close();

({ ctx, page } = await open(desk, "light", "/editor"));
await page.click("#shareSongBtn"); await page.waitForTimeout(600);
await shot(page, "desktop-share.png"); await ctx.close();

({ ctx, page } = await open(phone, "light", "/editor"));
await page.click('[data-pane="preview"]'); await page.waitForTimeout(300);
await shot(page, "phone-chart.png"); await ctx.close();

({ ctx, page } = await open(phone, "dark", "/songs"));
await shot(page, "phone-songs-dark.png"); await ctx.close();

({ ctx, page } = await open(phone, "light", "/play/piano"));
await shot(page, "phone-play.png"); await ctx.close();

({ ctx, page } = await open(phone, "light", "/play/metronome"));
await shot(page, "phone-metronome.png"); await ctx.close();

// v4: Chords, Songs side by side, and a public Song Bank (served from a sample file, no Drive needed).
({ ctx, page } = await open(desk, "light", "/chords/D-over-F%23"));
await shot(page, "desktop-chords.png"); await ctx.close();

({ ctx, page } = await open(desk, "light", "/songs"));
await page.click('#libraryList [data-id="song-demo-amazing"] [data-act="open"]'); await page.waitForTimeout(300);
await shot(page, "desktop-songs.png"); await ctx.close();

({ ctx, page } = await open(phone, "light", "/chords/Am7"));
await shot(page, "phone-chords.png"); await ctx.close();

const SAMPLE_BANK = { type: "sonata-bank", v: 2, title: "Songs I can play", name: "Jethro Frane", bio: "OPM, pop and worship. Catch me live every Friday!",
  socials: { instagram: "jethrofrane", tiktok: "jethrofrane", facebook: "jethrofrane", youtube: "@jethrofrane" }, links: [], payments: [],
  updatedAt: new Date().toISOString(), songs: SONGS.map((x, i) => ({ id: "b" + i, t: x.title, a: x.artist, g: i % 2 ? "Worship" : "Hymn", k: x.manualKey.split(":")[0], bpm: x.bpm })) };
for (const [vp, name] of [[phone, "phone-bank.png"], [desk, "desktop-bank.png"]]) {
  ({ ctx, page } = await open(vp, "light", "/songs"));
  await page.route("**/api/bank?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE_BANK) }));
  await page.goto(BASE + "/bank/1SampleSongBankSampleSongBank00/jethro-frane"); await page.waitForTimeout(900);
  await shot(page, name); await ctx.close();
}

await b.close();
console.log("Screenshots saved to public/screenshots/");
