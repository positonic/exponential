/**
 * The local wiki's tool contract, as the web app sees it.
 *
 * This module is the seam between "a wiki operation" and "however this device
 * happens to perform it". Today the only implementation is the Tauri shell's
 * IPC; the point of naming the operations here, in plain data, is that the next
 * one — a local inference loop, an MCP server, a different shell — implements
 * the same five calls without anything upstream noticing.
 *
 * The schemas are hand-written JSON Schema rather than zod, and that is not a
 * style choice. `@mastra/client-js` runs anything zod-shaped through a converter
 * that mangles this app's zod build into `{"anyOf":[{},{"type":"null"}]}`, which
 * the model provider rejects outright — the turn dies before the model sees
 * anything. Non-zod objects are forwarded untouched. (Found by the V2 spike; see
 * `/dev/mastra-client-tools`.) Plain JSON Schema also happens to be what a
 * brain-agnostic contract wants.
 */

import { getDesktopBridge } from "./platform";

/** Where the wiki lives and whether it has history. */
export interface WikiInfo {
  root: string;
  /** True when this call created the folder — the UI can mention it once. */
  created: boolean;
  /** False when git was unavailable; the wiki still works, without history. */
  git: boolean;
}

export interface WikiPage {
  /** Path relative to the wiki root — the handle every other call takes. */
  path: string;
  bytes: number;
}

/**
 * Wiki operations available on this device, or null when there is no device to
 * ask (a browser, or the Electron shell).
 */
export interface WikiBridge {
  /** Create the wiki if absent. Idempotent; safe to call every turn. */
  init: () => Promise<WikiInfo>;
  listPages: () => Promise<WikiPage[]>;
  readPage: (path: string) => Promise<string>;
  writePage: (path: string, content: string) => Promise<void>;
  search: (query: string) => Promise<SearchHit[]>;
  /**
   * Where the wiki lives, so the app can say so instead of making the user
   * guess. Read-only: there is deliberately no setter reachable from the page,
   * because a jail whose walls the caller can move is not a jail.
   */
  getRoot: () => Promise<string>;
  /**
   * Fetch a public web page for ingestion.
   *
   * Deliberately not a wiki path operation: ingest brings outside material *in*,
   * so it reads somewhere the jail knows nothing about. The Rust side carries
   * its own guard (public addresses only) rather than widening the wiki jail.
   */
  fetchUrl: (url: string) => Promise<FetchedSource>;
  /** Read a file from the user's machine for ingestion. Guarded separately too. */
  readExternal: (path: string) => Promise<FetchedSource>;
  /**
   * Record everything this turn changed as one commit. Called once, at turn end.
   * Committing nothing is a success — a turn that only answered questions has
   * nothing to record.
   */
  commitTurn: (message: string) => Promise<CommitResult>;
}

export interface CommitResult {
  committed: boolean;
  sha: string | null;
}

/** Outside material handed to the librarian to fold into the wiki. */
export interface FetchedSource {
  /** Echoed back so the librarian can cite where a page came from. */
  source: string;
  title: string | null;
  text: string;
  /** True when the source was longer than we carry into a prompt. */
  truncated: boolean;
}

export interface SearchHit {
  path: string;
  /** The filename matched, so a page named for its subject surfaces regardless. */
  pathMatched: boolean;
  lines: string[];
}

/** Tauri's IPC primitive, as narrowly as we need it. */
type TauriWindow = Window & {
  __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
};

function invoker(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  if (getDesktopBridge()?.shell !== "tauri") return null;
  const invoke = (window as TauriWindow).__TAURI_INTERNALS__?.invoke;
  return typeof invoke === "function" ? invoke : null;
}

/**
 * The wiki bridge for this device, or null if there isn't one.
 *
 * Null is the normal case: on the web and in the Electron shell there is no
 * jailed filesystem to talk to, which is exactly why the librarian is not
 * offered there.
 */
export function getWikiBridge(): WikiBridge | null {
  const invoke = invoker();
  if (!invoke) return null;

  return {
    init: async () => (await invoke("wiki_init")) as WikiInfo,
    listPages: async () => ((await invoke("wiki_list_pages")) ?? []) as WikiPage[],
    readPage: async (path: string) => {
      const content = await invoke("wiki_read_page", { path });
      return typeof content === "string" ? content : "";
    },
    writePage: async (path: string, content: string) => {
      await invoke("wiki_write_page", { path, content });
    },
    search: async (query: string) =>
      ((await invoke("wiki_search", { query })) ?? []) as SearchHit[],
    getRoot: async () => {
      const root = await invoke("wiki_get_root");
      return typeof root === "string" ? root : "";
    },
    fetchUrl: async (url: string) => (await invoke("wiki_fetch_url", { url })) as FetchedSource,
    readExternal: async (path: string) =>
      (await invoke("wiki_read_external", { path })) as FetchedSource,
    commitTurn: async (message: string) =>
      (await invoke("wiki_commit_turn", { message })) as CommitResult,
  };
}

/** Is this device able to host a local wiki at all? */
export function isLocalWikiAvailable(): boolean {
  return getWikiBridge() !== null;
}

/**
 * The librarian agent's id on the Mastra server.
 *
 * Deliberately absent from `getMastraAgents`' server-side allow-list: that list
 * feeds every chat surface, and an entry there would offer the librarian on the
 * web and in Electron, where its tools cannot run and every turn would fail.
 * The picker entry is injected client-side instead, only where the bridge exists.
 */
export const LOCAL_WIKI_AGENT_ID = "localWikiAgent";

/** Name shown in the picker and on the agent's chat bubbles. */
export const LOCAL_WIKI_AGENT_NAME = "Local wiki";

/** One tool as `@mastra/client-js` wants it: schema, plus a local `execute`. */
export interface WikiClientTool {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

/**
 * The tools handed to the librarian for one turn, each executing on this device.
 *
 * Descriptions are written for the model, not for us: they say what the tool is
 * for and when to reach for it, because that text is the only guidance the model
 * gets at the moment it decides.
 */
export function buildWikiClientTools(bridge: WikiBridge): Record<string, WikiClientTool> {
  return {
    wiki_list_pages: {
      id: "wiki_list_pages",
      description:
        "List every page in the wiki, by path. Use this to find out what exists before answering.",
      inputSchema: { ...NO_ARGS },
      execute: async () => ({ pages: await bridge.listPages() }),
    },
    wiki_read_page: {
      id: "wiki_read_page",
      description:
        "Read one page's markdown. Paths are relative to the wiki root, e.g. 'index.md' or " +
        "'people/ada.md'. Start with index.md and follow its [[wikilinks]].",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Page path relative to the wiki root, including the .md extension.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        // The model supplies this, so treat it as untrusted input rather than a
        // string. (The Rust side jails it regardless; this just keeps a
        // malformed call from becoming a confusing filesystem error.)
        const path = typeof args.path === "string" ? args.path : "";
        return { content: await bridge.readPage(path) };
      },
    },
    wiki_search: {
      id: "wiki_search",
      description:
        "Search page text and filenames for a phrase. Plain substring matching — no stemming or " +
        "synonyms — so try a distinctive word from the thing you're looking for. Use this when " +
        "index.md and its wikilinks don't lead you to the answer.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to look for in page contents and names." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const query = typeof args.query === "string" ? args.query : "";
        return { hits: await bridge.search(query) };
      },
    },
    wiki_fetch_url: {
      id: "wiki_fetch_url",
      description:
        "Fetch a public web page and return its text, for ingesting into the wiki. Only http(s) " +
        "URLs on the public internet. Long pages come back truncated — say so if that happens " +
        "rather than implying you read all of it.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The http(s) URL to fetch." },
        },
        required: ["url"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const url = typeof args.url === "string" ? args.url : "";
        return bridge.fetchUrl(url);
      },
    },
    wiki_read_external: {
      id: "wiki_read_external",
      description:
        "Read a text file from the user's machine for ingesting into the wiki — a path they gave " +
        "you, like '~/Downloads/notes.md'. This reads OUTSIDE the wiki, so only use it when the " +
        "user asked you to ingest that file. Files under home only, nothing hidden, text only.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file, absolute or starting with ~/.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const path = typeof args.path === "string" ? args.path : "";
        return bridge.readExternal(path);
      },
    },
    wiki_write_page: {
      id: "wiki_write_page",
      description:
        "Create or replace a page, writing its full markdown content. Use this to file durable " +
        "knowledge, and remember to update index.md and append to log.md in the same turn, per " +
        "schema.md. Prefer updating an existing page over creating a near-duplicate.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Page path relative to the wiki root, including the .md extension. Folders are created as needed.",
          },
          content: {
            type: "string",
            description: "The page's complete markdown. This replaces the file's current contents.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const path = typeof args.path === "string" ? args.path : "";
        const content = typeof args.content === "string" ? args.content : "";
        await bridge.writePage(path, content);
        return { written: path };
      },
    },
  };
}

/**
 * Tool names that change the wiki.
 *
 * The transport watches for these to decide whether a turn needs committing —
 * the alternative, an empty commit every turn, would bury the real ones.
 */
export const WIKI_WRITE_TOOLS: ReadonlySet<string> = new Set(["wiki_write_page"]);
