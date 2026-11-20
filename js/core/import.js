// @ts-check
// Reading a chord chart out of a web page. Pure text work with no DOM, so the same code
// runs in the server function (api/import.js) and in tests.

/** Largest chart passed on, in characters. */
export const MAX_CHART = 20000;

const CHORD = /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:(?:sus|add|maj|min|dim|aug|[#b♯♭+-])\d*)*(?:\([^)\s]*\))?(?:\/[A-G][#b♯♭]?)?$/;
const MARK = /^(?:[|/\\\-–—.%:]+|\(?x\s?\d+\)?|N\.?C\.?)$/i;
const SECTION = /^\[?\s*(?:intro|introd(?:u[cç][aã]o|ucción)?|verse|verso|estrofe|estrofa|stanza|pre[- ]?chorus|pr[eé][- ]?(?:refr[aã]o|coro)|chorus|refr[aã]o|coro|koro|bridge|ponte|puente|tulalay|interlude|interl[uú]dio|instrumental|solo|outro|final|tag|ending|refrain|hook|vamp|coda)\b[^\]]{0,24}\]?\s*:?$/i;

/** Strip ASCII 6-string guitar/4-string uke tablature blocks (e|---3---|) and their single-chord header while keeping chords & lyrics intact. @param {string} text */
export function stripAsciiTabLines(text) {
  const isTab = (/** @type {string} */ l) => /^\s*[eBGDAEagACT]\d?\s*[|:][-0-9hpb/\\~xs^v()|]{4,}/i.test(l);
  const lines = String(text || "").split("\n");
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isTab(l)) continue;
    // Drop a lone chord name (like "G7" above a G7 tab box) when the very next line is an ASCII tab string
    if (isTab(lines[i + 1] || "") && chordsIn(l).count === 1 && l.trim().split(/\s+/).length === 1) continue;
    out.push(l);
  }
  return out.join("\n");
}

/** How many chords a line holds, and whether it is a chord line (mostly chords) or has inline [G] chords. @param {string} line */
export function chordsIn(line) {
  const inline = (line.match(/\[[A-G][^\]\s]{0,11}\]/g) || []).filter((x) => CHORD.test(x.slice(1, -1))).length;
  const words = line.trim().split(/\s+/).filter(Boolean);
  const real = words.filter((w) => !MARK.test(w));
  const chords = real.filter((w) => CHORD.test(w.replace(/^[(|]+|[)|]+$/g, ""))).length;
  const chordLine = chords > 0 && chords >= real.length * 0.6;
  return { count: chordLine ? chords : inline, chordLine, inline: inline > 0 };
}

const ENT = /** @type {Record<string, string>} */ ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", sharp: "♯", flat: "♭", copy: "©" });
/** @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** HTML to text. Spaces inside a line are kept: they are what lines a chord up over its word. @param {string} html */
export function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/span\s*>(?=\s*<span\b[^>]*?(?:\bjs-tab-row\b|display\s*:\s*block))/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|section|article|blockquote|td|th)\s*>/gi, "\n")
    // An opening block tag starts a new line only if one has not just been started (</div><div> is one break, not two).
    .replace(/<(p|div|li|tr|h[1-6]|pre|section|article|blockquote)\b[^>]*>/gi, "\u0001")
    .replace(/<[^>]*>/g, ""))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n").replace(/\n?[ \t]*\u0001/g, "\n").replace(/\t/g, "    ").replace(/[ ]+$/gm, "");
}

/** @param {string} html @param {string} name */
const metaContent = (html, name) => {
  const tag = (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i")) || [""])[0];
  return decodeEntities((tag.match(/content=["']([^"']*)["']/i) || ["", ""])[1]).trim();
};

/**
 * Title and artist from a page's title. "Song – Artist chords | Site" becomes { title: "Song", artist: "Artist" }.
 * @param {string} raw
 */
export function splitTitle(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  s = s.split(/\s+[|•·»]\s+|\s+@\s+/)[0];
  s = s.replace(/\s+[–—-]\s+(?:cifra\s+club|ultimate[- ]guitar(?:\.com)?|chordie|e-?chords|azchords|guitaretab|lacuerda|worshiptogether)\s*$/i, "");
  s = s.replace(/\s*:\s*(?:acordes|letras(?:\s+y\s+acordes)?|chords|tabs?)\s*$/i, "");
  s = s.replace(/\s*[([]?\b(?:ver(?:sion)?\.?\s*#?\d+)\b[)\]]?/gi, "");
  s = s.replace(/\s+(?:for\s+guitar(?:\s+and\s+ukulele)?|for\s+ukulele)\b/gi, "");
  s = s.replace(/\s*[([]?\b(?:guitar\s+)?(?:chords?(?:\s+(?:and|&|with)\s+lyrics)?|lyrics(?:\s+(?:and|&|with)\s+chords)?|tabs?|chord\s+chart|ukulele\s+chords)\b[)\]]?\s*(?:ver(?:sion)?\.?\s*#?\d+)?\s*$/i, "").replace(/[\s–—:-]+$/, "").trim();
  let title = s, artist = "";
  const by = s.match(/^(.+?)\s+by\s+(.+)$/i);
  const dash = s.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  const comma = !by && !dash ? s.match(/^([A-Z0-9\s'’"“”!?.-]{3,}),\s+([A-Z][A-Za-z0-9\s.'’-]+)$/) : null;
  if (by) { title = by[1]; artist = by[2]; } else if (dash) { title = dash[1]; artist = dash[2]; } else if (comma) { title = comma[1]; artist = comma[2]; }
  const clean = (/** @type {string} */ x) => x
    .replace(/\s*[([]?\b(?:ver(?:sion)?\.?\s*#?\d+)\b[)\]]?/gi, "")
    .replace(/\s+(?:guitar\s+|ukulele\s+)?(?:chords?|lyrics|tabs?)(?:\s+(?:and|&|with)\s+(?:chords?|lyrics))?\s*$/i, "")
    .replace(/^["“'‘]+|["”'’]+$/g, "").trim().slice(0, 120);
  title = clean(title);
  artist = clean(artist);
  if (/^[A-Z0-9\s'’-]{4,}$/.test(title) && /[A-Z]/.test(title)) {
    title = title.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return { title, artist };
}

/**
 * The part of some text that is the chart: from the first chord line or section name to the
 * last, dropping menus and footers around it. Null when there are too few chords to be a chart.
 * @param {string} text
 */
export function chartWindow(text) {
  text = stripAsciiTabLines(text);
  // A page that puts every line in its own paragraph comes out double-spaced; close it up so chords sit on their words.
  const filled = (text.match(/^.*\S.*$/gm) || []).length;
  const gaps = (text.match(/\S[^\n]*\n[ ]*\n(?=[ ]*\S)/g) || []).length;
  if (filled > 3 && gaps >= filled * 0.7) text = text.replace(/\n[ ]*\n/g, "\n");
  const lines = text.split("\n");
  const marks = lines.map((l) => { const c = chordsIn(l); return { chord: c.count > 0, n: c.count, section: SECTION.test(l.trim()) }; });
  // Find the densest stretch: lines far from any chord line (more than 12 lines away) end the chart.
  let best = { from: -1, to: -1, n: 0 };
  let cur = { from: -1, to: -1, n: 0 };
  for (let i = 0; i < lines.length; i++) {
    if (!marks[i].chord) continue;
    if (cur.from < 0 || i - cur.to > 12) { if (cur.n > best.n) best = cur; cur = { from: i, to: i, n: 0 }; }
    cur.to = i; cur.n += marks[i].n;
  }
  if (cur.n > best.n) best = cur;
  // A real chart has several chord lines; one stray "A" or a paid preview is not a chart.
  const chordLines = marks.slice(Math.max(0, best.from), best.to + 1).filter((m) => m.chord).length;
  if (best.n < 4 || chordLines < 2) return null;
  let from = best.from;
  // A section name or capo/key line just above the first chord line belongs to the chart.
  for (let i = best.from - 1; i >= Math.max(0, best.from - 4); i--) {
    const t = lines[i].trim();
    if (marks[i].section || /^(?:capo|capotraste|key|tom|tonalidad|tempo|bpm)\b/i.test(t)) from = i; else if (t) break;
  }
  let to = best.to;
  // The words under the last chord line.
  if (marks[best.to] && !/\[[A-G]/.test(lines[best.to]) && lines[best.to + 1]?.trim() && lines[best.to + 1].trim().length < 120) to = best.to + 1;
  // Collapse blank lines that separate a chord-only line from its lyric line immediately below.
  const sliced = lines.slice(from, to + 1);
  const joined = [];
  for (let i = 0; i < sliced.length; i++) {
    const curLine = sliced[i];
    if (!curLine.trim() && joined.length > 0 && i + 1 < sliced.length) {
      const prevC = chordsIn(joined[joined.length - 1]);
      const nextLine = sliced[i + 1];
      const nextC = chordsIn(nextLine);
      if (prevC.chordLine && !prevC.inline && nextLine.trim() && !nextC.chordLine && !SECTION.test(nextLine.trim())) {
        continue;
      }
    }
    joined.push(curLine);
  }
  const out = joined.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out.slice(0, MAX_CHART);
}

/**
 * Read a chart out of a fetched page.
 * @param {string} body the page (HTML or plain text)
 * @param {string} [type] its content type
 * @returns {{ title: string, artist: string, text: string }|null}
 */
export function extractChart(body, type = "text/html") {
  const src = String(body || "");
  if (!/html/i.test(type) && !/<(?:html|body|pre|div|p)\b/i.test(src)) {
    const text = chartWindow(src.replace(/\r\n?/g, "\n"));
    return text ? { title: "", artist: "", text } : null;
  }
  const h1Match = (src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || ["", ""])[1];
  const h1Text = decodeEntities(h1Match.replace(/<[^>]*>/g, " ")).replace(/\s{2,}/g, " – ").trim();
  let rawTitle = (metaContent(src, "og:title") || decodeEntities((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1]) || h1Text).trim();
  if (/^(?:tabs?\s+and\s+guitar\s+tablature|chordie\b|ultimate[- ]guitar\b)/i.test(rawTitle) && h1Text) rawTitle = h1Text;
  const head = splitTitle(rawTitle);
  if (!head.artist) {
    const metaArt = metaContent(src, "music:musician_description") || metaContent(src, "author") || decodeEntities((
      src.match(/["']artistName["']\s*:\s*["']([^"']+)["']/i)
      || src.match(/Writer\(s\)\s*:\s*<\/strong>\s*([\s\S]*?)<\/div>/i)
      || src.match(/<a[^>]+href=["'][^"']*\/(?:artist|band|songwriter|songartist|writer)s?\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
      || ["", ""]
    )[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    if (metaArt && metaArt.length < 80 && !/^(?:worshiptogether|ultimate|chordie|cifra)/i.test(metaArt)) head.artist = metaArt;
  }

  // 1. Ultimate-Guitar .js-store JSON payload ([tab] + [ch]Chord[/ch] markup)
  const ugMatch = src.match(/class=["']js-store["'][^>]+data-content=["']([^"']+)["']/i) || src.match(/data-content=["']([^"']+)["'][^>]+class=["']js-store["']/i);
  if (ugMatch) {
    try {
      const json = JSON.parse(decodeEntities(ugMatch[1]));
      const pageData = json?.store?.page?.data;
      const wikiContent = pageData?.tab_view?.wiki_tab?.content;
      if (typeof wikiContent === "string" && wikiContent.trim()) {
        const cleanedUg = wikiContent
          .replace(/\r\n?/g, "\n")
          .replace(/\[\/?tab\]/gi, "")
          .replace(/\[ch\]([\s\S]*?)\[\/ch\]/gi, "$1");
        const metaLines = [];
        if (pageData?.tab?.tonality_name) metaLines.push(`Key: ${pageData.tab.tonality_name}`);
        if (pageData?.tab_view?.meta?.capo) metaLines.push(`Capo ${pageData.tab_view.meta.capo}`);
        const text = chartWindow([...metaLines, cleanedUg].join("\n"));
        if (text) {
          return {
            title: String(pageData?.tab?.song_name || head.title || "").trim(),
            artist: String(pageData?.tab?.artist_name || head.artist || "").trim(),
            text
          };
        }
      }
    } catch { /* fall through to HTML extraction */ }
  }

  // 2. Segmented ChordPro HTML (WorshipTogether / SongSelect .chord-pro-line > .chord-pro-segment)
  if (/class=["'][^"']*chord-pro-line/i.test(src)) {
    const lineBlocks = src.split(/<div[^>]+class=["'][^"']*chord-pro-line[^"']*["'][^>]*>/i).slice(1);
    const wtLines = [];
    for (const rawBlock of lineBlocks) {
      const block = rawBlock.split(/<div[^>]+class=["'][^"']*(?:chord-pro-disp|song-taxonomy|ccm-custom)/i)[0];
      const segs = block.split(/<div[^>]+class=["'][^"']*chord-pro-segment[^"']*["'][^>]*>/i).slice(1);
      let chordRow = "";
      let lyricRow = "";
      for (const seg of segs) {
        const note = decodeEntities((seg.match(/class=["'][^"']*chord-pro-note[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || ["", ""])[1].replace(/<[^>]*>/g, "")).trim();
        const lyrRaw = decodeEntities((seg.match(/class=["'][^"']*chord-pro-lyric[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || ["", ""])[1].replace(/<[^>]*>/g, "")).replace(/[\r\n]+/g, "");
        const col = Math.max(chordRow.length + (chordRow && note ? 1 : 0), lyricRow.length);
        if (note) chordRow = chordRow.padEnd(col, " ") + note;
        if (lyrRaw) lyricRow = lyricRow.padEnd(col, " ") + lyrRaw;
      }
      if (chordRow.trim()) wtLines.push(chordRow.replace(/\s+$/, ""));
      if (lyricRow.trim()) wtLines.push(lyricRow.replace(/\s+$/, ""));
    }
    const wtText = chartWindow(wtLines.join("\n"));
    if (wtText) return { ...head, text: wtText };
  }

  // 3. A <pre> block is how most chord pages keep the spacing. Take the one with the most chords.
  /** @type {{ text: string, n: number }|null} */
  let best = null;
  for (const m of src.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi)) {
    const text = htmlToText(m[1].replace(/<br\s*\/?>/gi, "\n"));
    const n = text.split("\n").reduce((sum, l) => sum + chordsIn(l).count, 0);
    if (!best || n > best.n) best = { text, n };
  }
  const fromPre = best && best.n >= 3 ? chartWindow(best.text) : null;
  const text = fromPre || chartWindow(htmlToText((src.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i) || ["", src])[1]));
  return text ? { ...head, text } : null;
}

/**
 * A web address Sonata may fetch: https, a normal host name, no login, no odd port.
 * (The server function also checks the address the name resolves to.)
 * @param {string} raw @returns {URL|null}
 */
export function publicUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.length > 253 || /^[\d.]+$/.test(host) || host.startsWith("[") || /^0x/i.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|test|invalid|example|onion)$/.test(host)) return null;
  return u;
}

/** True for loopback, private, link-local and other addresses that are not the public internet. @param {string} ip */
export function privateAddress(ip) {
  const s = String(ip || "").toLowerCase();
  const v4 = s.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff") || s.startsWith("64:ff9b") || !s.includes(":");
}

/** One web link alone (not a Sonata share link): the case where Sonata reads the page. @param {string} text */
export function loneLink(text) {
  const t = String(text || "").trim();
  if (!/^https?:\/\/\S+$/i.test(t) || /(\?s=|\/q\/|\/share\/)/i.test(t)) return "";
  return publicUrl(t) ? t : "";
}
