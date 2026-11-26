// @ts-check
// Lazy-loaded browser AI agent bridge & WebMCP registration (18 tools).
import {
  ALL_TOOL_DEFS,
  PUBLIC_TOOL_NAMES,
  SONATA_FORMAT_GUIDE,
  executePublicTool,
  executeLibraryTool
} from "./core/mcp-tools.js";
import { store, app, profileName } from "./ui/ctx.js";
import { toast } from "./ui/dom.js";
import { t } from "./ui/i18n.js";

/** @type {any} */
let agentApi = null;

/** @param {string} url */
async function fetchUrl(url) {
  try {
    const r = await fetch(`/api/import?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const data = await r.json().catch(() => ({ error: "blocked" }));
    return { status: r.status, ...data };
  } catch {
    return { status: 502, error: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "blocked" };
  }
}

/** @param {{ tool: string, result?: any }} info */
function onMutate({ tool, result }) {
  try { app.refresh(); } catch { /* ignore */ }
  if (tool === "create_song" || tool === "import_song_from_url") {
    toast(t("agentAddedSong", "Added \"{title}\"", { title: result?.song?.title || "Song" }), "success");
  } else if (tool === "update_song") {
    toast(t("agentUpdatedSong", "Updated \"{title}\"", { title: result?.song?.title || "Song" }), "success");
  } else if (tool === "trash_song") {
    toast(t("movedToTrash", "Moved to Trash"), "info");
  } else if (tool === "restore_from_trash") {
    toast(t("restoredFromTrash", "Restored from Trash"), "success");
  } else if (tool === "empty_trash" && result?.confirmed) {
    toast(t("trashEmptied", "Trash emptied"), "info");
  } else if (tool === "manage_setlists") {
    toast(
      result?.trashed ? t("movedToTrash", "Moved to Trash") : t("agentUpdatedSetlist", "Setlist updated"),
      result?.trashed ? "info" : "success"
    );
  }
}

/** @param {string} name @param {any} [args] */
async function callTool(name, args = {}) {
  const ctx = {
    store,
    origin: typeof location !== "undefined" ? location.origin : "https://sonata.jethrofrane.xyz",
    arranger: profileName(),
    fetchUrl,
    onMutate
  };
  if (PUBLIC_TOOL_NAMES.has(name)) {
    return await executePublicTool(name, args, ctx);
  }
  return await executeLibraryTool(name, args, ctx);
}

/** Register all 18 Sonata tools with WebMCP and expose window.sonataAgent. */
export function initAgent() {
  if (agentApi) return agentApi;

  let webMcp = false;
  const mc = typeof navigator !== "undefined" ? /** @type {any} */ (navigator).modelContext : null;
  if (mc) {
    const webTools = ALL_TOOL_DEFS.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      execute: async (/** @type {any} */ args) => {
        const result = await callTool(def.name, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    }));
    try {
      if (typeof mc.registerTool === "function") {
        for (const tool of webTools) mc.registerTool(tool);
        webMcp = true;
      } else if (typeof mc.provideContext === "function") {
        mc.provideContext({ tools: webTools });
        webMcp = true;
      }
    } catch {
      webMcp = false;
    }
  }

  agentApi = {
    version: "7.7.0",
    webMcp,
    tools: () => ALL_TOOL_DEFS,
    call: callTool,
    guide: SONATA_FORMAT_GUIDE
  };
  if (typeof window !== "undefined") {
    /** @type {any} */ (window).sonataAgent = agentApi;
  }
  return agentApi;
}
