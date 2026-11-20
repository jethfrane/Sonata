#!/usr/bin/env node
import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname, resolve, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import {
  ALL_TOOL_DEFS,
  PUBLIC_TOOL_DEFS,
  PUBLIC_TOOL_NAMES,
  SONATA_FORMAT_GUIDE,
  executePublicTool,
  executeLibraryTool
} from "../js/core/mcp-tools.js";
import { Store, memoryStorage, mergeLibraries, libraryFingerprint } from "../js/core/store.js";
import { importPage } from "../api/import.js";

const ORIGIN = "https://sonata.jethrofrane.xyz";
const SERVER_INFO = { name: "sonata-cli", version: "6.3.0" };
const MCP_PROTOCOL_VERSION = "2025-03-26";
const ALL_TOOL_MAP = new Map(ALL_TOOL_DEFS.map((t) => [t.name, t]));

/** @param {unknown} v */
function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Redact any accidental credential/token substrings from error messages. @param {unknown} err */
function safeError(err) {
  const raw = err instanceof Error ? err.message : String(err || "Unknown error");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:ya29|snt_[acrst]|snt_cl)\.[A-Za-z0-9._~+/=-]+/g, "[REDACTED]");
}

/** @param {string} raw @param {string} label */
function parseJsonObject(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

/** @param {string} msg */
function failCli(msg) {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  process.exitCode = 1;
}

/** @param {string[]} argv */
function parseCallArgs(argv) {
  let toolName = "";
  let argsRaw;
  let argsFile;
  let localPath;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--args" || a.startsWith("--args=")) {
      const v = a === "--args" ? argv[++i] : a.slice(7);
      if (v === undefined) throw new Error("Missing value for --args.");
      argsRaw = v;
    } else if (a === "--args-file" || a.startsWith("--args-file=")) {
      const v = a === "--args-file" ? argv[++i] : a.slice(12);
      if (v === undefined) throw new Error("Missing value for --args-file.");
      argsFile = v;
    } else if (a === "--local" || a.startsWith("--local=")) {
      const v = a === "--local" ? argv[++i] : a.slice(8);
      if (v === undefined) throw new Error("Missing value for --local.");
      localPath = v;
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (!toolName) {
      toolName = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  return { help: false, toolName, argsRaw, argsFile, localPath };
}

/** @param {string[]} argv */
function parseMcpArgs(argv) {
  let localPath;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--local" || a.startsWith("--local=")) {
      const v = a === "--local" ? argv[++i] : a.slice(8);
      if (v === undefined) throw new Error("Missing value for --local.");
      localPath = v;
    } else {
      throw new Error(`Unknown option for mcp: ${a}`);
    }
  }
  return { help: false, localPath };
}

/** @param {string} localPath */
async function loadLocalStore(localPath) {
  const resolved = resolve(localPath);
  let localData = null;
  try {
    const raw = await readFile(resolved, "utf8");
    localData = parseJsonObject(raw, `Library file (${basename(resolved)})`);
    if (localData.app !== undefined && localData.app !== "sonata") {
      throw new Error("Local file is not a Sonata library.");
    }
    for (const k of ["songs", "setlists", "trash", "deletedIds"]) {
      if (localData[k] !== undefined && !Array.isArray(localData[k])) {
        throw new Error(`Invalid "${k}" array in local library file.`);
      }
    }
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err)?.code !== "ENOENT") throw err;
  }
  const store = new Store(memoryStorage()).load();
  if (localData) {
    const merged = mergeLibraries(store.snapshot(), localData);
    store.applyMerged(merged);
    store.persist();
    store.dirty = false;
  }
  return store;
}

/** @param {string} localPath @param {unknown} snapshot */
async function writeAtomicJson(localPath, snapshot) {
  const resolved = resolve(localPath);
  const dir = dirname(resolved);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
  const payload = JSON.stringify(snapshot, null, 2) + "\n";
  try {
    await writeFile(tmp, payload, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, resolved);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

/**
 * Execute one Sonata MCP tool (public or local-library).
 * @param {string} name
 * @param {Record<string, any>} args
 * @param {string|undefined} localPath
 */
async function executeTool(name, args, localPath) {
  if (!ALL_TOOL_MAP.has(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!isPlainObject(args)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  const baseCtx = {
    origin: ORIGIN,
    fetchUrl: (/** @type {string} */ url) => importPage(String(url || ""))
  };

  if (PUBLIC_TOOL_NAMES.has(name)) {
    const result = await executePublicTool(name, args, baseCtx);
    return { mutated: false, result };
  }

  if (!localPath) {
    throw new Error(`Library tool "${name}" requires --local <sonata_library.json>.`);
  }

  const store = await loadLocalStore(localPath);
  const beforeFp = libraryFingerprint(store.snapshot());
  let result;
  try {
    result = await executeLibraryTool(name, args, {
      ...baseCtx,
      store
    });
  } finally {
    clearTimeout(store.saveTimer);
  }
  store.flush();
  const snap = store.snapshot();
  const afterFp = libraryFingerprint(snap);
  const mutated = afterFp !== beforeFp;
  if (mutated) {
    await writeAtomicJson(localPath, snap);
  }
  return { mutated, result };
}

function printUsage() {
  process.stdout.write([
    "Sonata CLI & stdio MCP server",
    "",
    "Usage:",
    "  sonata-cli.mjs tools",
    "  sonata-cli.mjs guide",
    "  sonata-cli.mjs call <toolName> [--args '<json>' | --args-file <path>] [--local <sonata_library.json>]",
    "  sonata-cli.mjs mcp [--local <sonata_library.json>]",
    ""
  ].join("\n"));
}

/** @param {string} name @param {Record<string, any>|undefined} args */
function buildImportPrompt(name, args = {}) {
  if (name !== "import_chords_from_link") return null;
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const raw = typeof args.rawChart === "string" ? args.rawChart.trim() : "";
  const lines = [
    "Import a chord chart into Sonata cleanly following sonata://format-guide:",
    url ? `- Source URL: ${url}` : "- Check if the user provided a chord site URL or pasted chart text.",
    raw ? "- Raw chart text is already supplied; pass it as rawChart to import_song_from_url or analyze_chord_chart." : "- Call import_song_from_url (or extract_chords_from_url in public mode) first. If the website blocks automated fetch (403/Cloudflare), read the page via web search or browser and pass the cleaned Sonata-formatted chart as rawChart.",
    "- Check for duplicates before saving, keep source links, and use soft-delete Trash (never empty_trash with confirm: true without explicit confirmation)."
  ];
  return {
    description: "Import a song chart from a link or pasted text into Sonata format.",
    messages: [{ role: "user", content: { type: "text", text: lines.join("\n") } }]
  };
}

/**
 * Handle one parsed JSON-RPC 2.0 request or notification.
 * @param {any} msg
 * @param {string|undefined} localPath
 */
async function handleRpc(msg, localPath) {
  if (!isPlainObject(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  const hasId = Object.prototype.hasOwnProperty.call(msg, "id") && msg.id !== undefined;
  const { id, method, params } = msg;

  // Notifications must not emit a response.
  if (!hasId) return null;

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: SERVER_INFO,
          instructions: "Sonata chord chart, transposition, setlist, and Trash management MCP server."
        }
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: localPath ? ALL_TOOL_DEFS : PUBLIC_TOOL_DEFS }
      };
    }

    if (method === "tools/call") {
      if (!isPlainObject(params) || typeof params.name !== "string" || !params.name) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: missing tool name." } };
      }
      if (!ALL_TOOL_MAP.has(params.name)) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params.name}` } };
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isPlainObject(args)) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: arguments must be an object." } };
      }
      try {
        const { result } = await executeTool(params.name, args, localPath);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false
          }
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: safeError(err) }],
            isError: true
          }
        };
      }
    }

    if (method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            {
              uri: "sonata://format-guide",
              name: "Sonata Chord Chart Format Guide",
              description: "Reference guide for Sonata chart syntax, sections, inline chords, notes, dividers, rhythm slashes, and keys.",
              mimeType: "text/markdown"
            }
          ]
        }
      };
    }

    if (method === "resources/read") {
      const uri = isPlainObject(params) ? params.uri : "";
      if (uri !== "sonata://format-guide") {
        return { jsonrpc: "2.0", id, error: { code: -32002, message: "Resource not found." } };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [{ uri, mimeType: "text/markdown", text: SONATA_FORMAT_GUIDE }]
        }
      };
    }

    if (method === "prompts/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          prompts: [
            {
              name: "import_chords_from_link",
              description: "Import a song chart from a chord website or pasted text into Sonata format cleanly without duplicates.",
              arguments: [
                { name: "url", description: "Public chord page URL to fetch and analyze", required: false },
                { name: "rawChart", description: "Pasted chord chart text if already copied or if site blocked fetch", required: false }
              ]
            }
          ]
        }
      };
    }

    if (method === "prompts/get") {
      const name = isPlainObject(params) && typeof params.name === "string" ? params.name : "";
      const prompt = buildImportPrompt(name, isPlainObject(params?.arguments) ? params.arguments : {});
      if (!prompt) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown prompt." } };
      }
      return { jsonrpc: "2.0", id, result: prompt };
    }

    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (err) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: safeError(err) } };
  }
}

/** @param {string|undefined} localPath */
async function runMcpStdio(localPath) {
  if (localPath) {
    // Validate existing --local file upfront if present without failing on ENOENT.
    await loadLocalStore(localPath);
  }
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();

  const processLine = async (/** @type {string} */ line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }

    if (Array.isArray(payload)) {
      if (!payload.length) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }) + "\n");
        return;
      }
      const replies = [];
      for (const item of payload) {
        const res = await handleRpc(item, localPath);
        if (res) replies.push(res);
      }
      if (replies.length) process.stdout.write(JSON.stringify(replies) + "\n");
      return;
    }

    const res = await handleRpc(payload, localPath);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  };

  rl.on("line", (line) => {
    queue = queue.then(() => processLine(line)).catch((err) => {
      process.stderr.write(JSON.stringify({ ok: false, error: safeError(err) }) + "\n");
    });
  });

  await new Promise((res) => rl.once("close", res));
  await queue;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    return;
  }

  if (cmd === "tools") {
    if (rest.length) throw new Error(`Unexpected arguments for tools: ${rest.join(" ")}`);
    process.stdout.write(JSON.stringify(ALL_TOOL_DEFS, null, 2) + "\n");
    return;
  }

  if (cmd === "guide") {
    if (rest.length) throw new Error(`Unexpected arguments for guide: ${rest.join(" ")}`);
    process.stdout.write(String(SONATA_FORMAT_GUIDE).replace(/\n?$/, "\n"));
    return;
  }

  if (cmd === "call") {
    const parsed = parseCallArgs(rest);
    if (parsed.help) {
      printUsage();
      return;
    }
    if (!parsed.toolName) throw new Error("Missing <toolName>. Usage: sonata-cli.mjs call <toolName> [options]");
    if (parsed.argsRaw !== undefined && parsed.argsFile !== undefined) {
      throw new Error("Specify either --args or --args-file, not both.");
    }
    let toolArgs = {};
    if (parsed.argsRaw !== undefined) {
      toolArgs = parseJsonObject(parsed.argsRaw, "--args");
    } else if (parsed.argsFile !== undefined) {
      const rawFile = await readFile(resolve(parsed.argsFile), "utf8");
      toolArgs = parseJsonObject(rawFile, "--args-file");
    }
    const { mutated, result } = await executeTool(parsed.toolName, toolArgs, parsed.localPath);
    process.stdout.write(JSON.stringify({ ok: true, mutated, result }, null, 2) + "\n");
    return;
  }

  if (cmd === "mcp") {
    const parsed = parseMcpArgs(rest);
    if (parsed.help) {
      printUsage();
      return;
    }
    await runMcpStdio(parsed.localPath);
    return;
  }

  throw new Error(`Unknown subcommand: ${cmd}`);
}

main().catch((err) => {
  failCli(safeError(err));
});
