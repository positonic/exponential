/**
 * The method capability: the Exponential Method as agents receive it.
 *
 * Reads `content/docs/method/**` through the same docs loader `/docs/method`
 * renders from (`listDocPages`), so the Markdown an agent gets is byte for
 * byte the `DocPage.content` the docs page passes to `MarkdownRenderer`. No
 * other loader is allowed: two loaders could drift apart under one version
 * (D-0014, D-0015).
 *
 * Who may read a draft is the router's decision; this module only knows
 * whether it was asked to include one.
 */
import { DOCS_DIR, listDocPages } from "~/lib/docs/content";
import {
  computeMethodHash,
  METHOD_DOCUMENTS,
  readMethodRelease,
  type MethodDocumentId,
} from "~/lib/docs/method";

export const METHOD_CANONICAL_REPO = "positonic/exponential";
export const METHOD_CANONICAL_PATH = "content/docs/method";

export interface MethodDocument {
  id: MethodDocumentId;
  title: string;
  href: string;
  markdown: string;
}

export interface MethodPayload {
  version: string;
  status: "draft" | "published";
  /** `sha256:<hex>`, computed at request time from the documents returned. */
  contentHash: string;
  publishedAt: string | null;
  canonicalSource: {
    repo: typeof METHOD_CANONICAL_REPO;
    path: typeof METHOD_CANONICAL_PATH;
    /** `/docs/method` once published; null while the method is dark. */
    url: string | null;
  };
  documents: MethodDocument[];
}

export interface GetMethodOptions {
  /** Return the method even while its manifest says `draft`. */
  includeDraft: boolean;
  /** Docs root; defaults to `content/docs`. Tests pass a temp dir. */
  docsDir?: string;
}

/**
 * The current method version, or null when there is none to serve: no
 * manifest, no pages, or a draft that the caller may not see.
 */
export function getMethod({ includeDraft, docsDir = DOCS_DIR }: GetMethodOptions): MethodPayload | null {
  const release = readMethodRelease(docsDir);
  if (!release) return null;
  const isPublished = release.status === "published";
  if (!isPublished && !includeDraft) return null;

  const pages = listDocPages(docsDir, { includeUnpublishedMethod: true });
  const bySlug = new Map(pages.map((p) => [p.slug.join("/"), p]));

  const documents: MethodDocument[] = [];
  for (const doc of METHOD_DOCUMENTS) {
    const page = bySlug.get(doc.slug.join("/"));
    if (!page) continue;
    documents.push({ id: doc.id, title: page.meta.title, href: page.href, markdown: page.content });
  }
  if (documents.length === 0) return null;

  return {
    version: release.version,
    status: isPublished ? "published" : "draft",
    contentHash: computeMethodHash(documents),
    publishedAt: isPublished ? release.publishedAt : null,
    canonicalSource: {
      repo: METHOD_CANONICAL_REPO,
      path: METHOD_CANONICAL_PATH,
      url: isPublished ? documents[0]!.href : null,
    },
    documents,
  };
}
