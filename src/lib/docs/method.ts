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
import type { DocPage } from "./types";

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

export interface MethodDocumentContent {
  id: MethodDocumentId;
  title: string;
  href: string;
  /** The page's Markdown body, frontmatter excluded: exactly what /docs renders. */
  markdown: string;
}

/**
 * The method's documents from a docs page list, in the fixed order. Missing
 * documents are skipped. Shared by the agent-guidance service and docs:check
 * so both hash exactly the same text.
 */
export function collectMethodDocuments(pages: DocPage[]): MethodDocumentContent[] {
  const bySlug = new Map(pages.map((p) => [p.slug.join("/"), p]));
  const documents: MethodDocumentContent[] = [];
  for (const doc of METHOD_DOCUMENTS) {
    const page = bySlug.get(doc.slug.join("/"));
    if (!page) continue;
    documents.push({ id: doc.id, title: page.meta.title, href: page.href, markdown: page.content });
  }
  return documents;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compares two `MAJOR.MINOR.PATCH` versions; null when either is not one. */
export function compareSemver(a: string, b: string): number | null {
  const ma = SEMVER_RE.exec(a);
  const mb = SEMVER_RE.exec(b);
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The release manifest's immutability rules (D-0015), checked by
 * `npm run docs:check`. Returns one message per broken rule; empty is OK.
 *
 * - A published version's text never changes: the hash computed from the
 *   files must equal the recorded `contentHash`.
 * - `history` versions are unique and strictly increasing, and the current
 *   version is newer than all of them, so one version never names two texts.
 */
export function checkMethodRelease(release: MethodRelease, computedHash: string): string[] {
  const problems: string[] = [];

  if (!SEMVER_RE.test(release.version)) {
    problems.push(`version "${release.version}" is not MAJOR.MINOR.PATCH`);
  }
  if (release.status !== "draft" && release.status !== "published") {
    problems.push(`status must be "draft" or "published", not "${String(release.status)}"`);
  }

  if (release.status === "published") {
    if (!release.publishedAt) problems.push("a published release needs publishedAt");
    if (!release.contentHash) {
      problems.push(`a published release needs contentHash (the files hash to ${computedHash})`);
    } else if (release.contentHash !== computedHash) {
      problems.push(
        `published version ${release.version} changed: contentHash is ${release.contentHash} but the files hash to ${computedHash}. ` +
          "A published version is immutable; bump the version and append the old release to history.",
      );
    }
  }

  const history = Array.isArray(release.history) ? release.history : [];
  if (!Array.isArray(release.history)) problems.push("history must be an array");

  const seen = new Map<string, string>();
  history.forEach((entry, i) => {
    const previous = seen.get(entry.version);
    if (previous !== undefined) {
      problems.push(
        previous === entry.contentHash
          ? `history lists version ${entry.version} twice`
          : `history version ${entry.version} reappears with a different hash`,
      );
    }
    seen.set(entry.version, entry.contentHash);
    if (i > 0) {
      const order = compareSemver(history[i - 1]!.version, entry.version);
      if (order === null) problems.push(`history version "${entry.version}" is not MAJOR.MINOR.PATCH`);
      else if (order >= 0) {
        problems.push(`history versions must strictly increase: ${history[i - 1]!.version} then ${entry.version}`);
      }
    }
  });

  const latest = history[history.length - 1];
  if (latest) {
    const reused = seen.get(release.version);
    if (reused !== undefined) {
      problems.push(
        reused === computedHash && release.status === "published"
          ? `version ${release.version} is both current and in history`
          : `version ${release.version} was already published with hash ${reused}; bump the version`,
      );
    } else {
      const order = compareSemver(latest.version, release.version);
      if (order !== null && order >= 0) {
        problems.push(`version ${release.version} must be newer than the last published version ${latest.version}`);
      }
    }
  }

  return problems;
}

/**
 * The rules that need the previous release, which a single commit can't
 * check on its own: comparing against the manifest on the base branch stops
 * someone editing published text and pasting the new hash into `contentHash`,
 * or rewriting `history`. Returns one message per broken rule; empty is OK.
 *
 * - `history` only grows: the base's entries are a prefix of the new ones.
 * - Once published, the method stays published. A new version is released in
 *   one PR (text, version bump, hash, `publishedAt`, old release appended to
 *   history); a draft would take the published version offline.
 * - Under the same version, `contentHash` and `publishedAt` never change.
 * - A bumped version appends the base release to `history`.
 */
export function checkMethodReleaseAgainstBase(base: MethodRelease, next: MethodRelease): string[] {
  const problems: string[] = [];
  const baseHistory = Array.isArray(base.history) ? base.history : [];
  const nextHistory = Array.isArray(next.history) ? next.history : [];
  const sameEntry = (a: MethodReleaseHistoryEntry | undefined, b: MethodReleaseHistoryEntry | undefined) =>
    !!a && !!b && a.version === b.version && a.contentHash === b.contentHash && a.publishedAt === b.publishedAt;

  if (!baseHistory.every((entry, i) => sameEntry(entry, nextHistory[i]))) {
    problems.push("history is append-only: the base branch's entries must stay, unchanged and in order");
  }

  if (base.status !== "published") return problems;

  if (next.status !== "published") {
    problems.push(
      `version ${base.version} is published; the method can't go back to draft. ` +
        "Release a new version in one PR: change the text, bump the version, set contentHash and publishedAt, " +
        "and append the old release to history.",
    );
  }

  if (next.version === base.version) {
    if (next.contentHash !== base.contentHash) {
      problems.push(
        `published version ${base.version} was released with ${base.contentHash}; ` +
          "its text and contentHash can't change. Bump the version instead.",
      );
    }
    if (next.publishedAt !== base.publishedAt) {
      problems.push(`published version ${base.version} keeps its publishedAt (${base.publishedAt})`);
    }
  } else if (
    base.contentHash &&
    base.publishedAt &&
    !nextHistory.some((e) => sameEntry(e, { version: base.version, contentHash: base.contentHash!, publishedAt: base.publishedAt! }))
  ) {
    problems.push(`the previous release ${base.version} must be appended to history`);
  }

  return problems;
}
