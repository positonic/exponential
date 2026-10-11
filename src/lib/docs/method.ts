/**
 * The Exponential Method's publication gate and content hash.
 *
 * The method lives in `content/docs/method/` as versioned Markdown (the
 * canonical source, D-0014) next to a release manifest, `_release.json`. While
 * the manifest says `draft`, the method is dark: the docs loader leaves
 * `method/**` out of the page list (and so out of the sidebar, search,
 * `/llms*.txt`, the sitemap and static params) and `getDocContent` refuses to
 * render it. Agents still reach the draft through `agentGuidance.method`, but
 * only from a preview workspace. The gate opens by editing the manifest.
 *
 * Like `content.ts`, this module is pure and not `server-only`, so
 * `scripts/check-docs.ts` can import it.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

/** The folder under `content/docs` that holds the method. */
export const METHOD_DIR = "method";

/** The release manifest's file name; `_`-prefixed, so it is never a page. */
export const METHOD_RELEASE_FILE = "_release.json";

export interface MethodReleaseHistoryEntry {
  version: string;
  contentHash: string;
  publishedAt: string;
}

/** Shape of `content/docs/method/_release.json`. */
export interface MethodRelease {
  /** Semver of the files as they stand. */
  version: string;
  status: "draft" | "published";
  /** ISO timestamp, set when `status` becomes `published`. */
  publishedAt: string | null;
  /** `sha256:<hex>`, recorded at publication; null while draft. */
  contentHash: string | null;
  /** Earlier published versions, append-only. */
  history: MethodReleaseHistoryEntry[];
}

export type MethodDocumentId = "method" | "glossary" | "agent-principles";

/** The method's documents, in their fixed order (the order the hash covers). */
export const METHOD_DOCUMENTS: readonly { id: MethodDocumentId; slug: string[] }[] = [
  { id: "method", slug: [METHOD_DIR] },
  { id: "glossary", slug: [METHOD_DIR, "glossary"] },
  { id: "agent-principles", slug: [METHOD_DIR, "agent-principles"] },
];

/** Reads the release manifest, or null when there is none (or it does not parse). */
export function readMethodRelease(docsDir: string): MethodRelease | null {
  try {
    const raw = fs.readFileSync(path.join(docsDir, METHOD_DIR, METHOD_RELEASE_FILE), "utf-8");
    return JSON.parse(raw) as MethodRelease;
  } catch {
    return null;
  }
}

/** True only when the manifest exists and says `published`. */
export function isMethodPublished(docsDir: string): boolean {
  return readMethodRelease(docsDir)?.status === "published";
}

/**
 * True when a docs path (a slug joined with `/`, or a file path relative to
 * `content/docs`, either separator) falls under the method folder.
 */
export function isMethodPath(relPath: string): boolean {
  const first = relPath.replace(/\\/g, "/").replace(/^\/+/, "").split("/")[0] ?? "";
  return first === METHOD_DIR || first === `${METHOD_DIR}.md`;
}

/**
 * SHA-256 over each page's title and Markdown body, in the given (fixed)
 * order. Frontmatter is excluded by construction: callers pass the body
 * without it, because the pre-commit hook re-stamps `updated:` on every staged
 * docs page and that must not change the hash. Line endings are normalised.
 */
export function computeMethodHash(pages: { title: string; markdown: string }[]): string {
  const hash = crypto.createHash("sha256");
  for (const page of pages) {
    const title = page.title.replace(/\r\n?/g, "\n");
    const body = page.markdown.replace(/\r\n?/g, "\n");
    hash.update(`${title.length}:${title}\n${body.length}:${body}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}
