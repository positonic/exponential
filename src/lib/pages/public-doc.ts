import type { JSONContent } from "@tiptap/core";

/**
 * Sanitize a canonical ProseMirror `bodyDoc` for the unauthenticated public
 * render (ADR-0038). The schema already constrains what `generateHTML` can
 * emit; this pass closes the attribute-level gaps:
 *
 *  - `link` marks keep only http(s)/mailto hrefs (drops `javascript:` etc.)
 *  - `image` nodes keep only http(s) srcs (drops `data:`/`javascript:`)
 *  - `comment` marks are internal collaboration artifacts and are stripped,
 *    matching the Markdown projection, which also drops them (ADR-0024)
 *  - `pageLink` nodes resolve through the caller-supplied map of **published**
 *    targets: a published target becomes a plain paragraph linking to its
 *    public URL (live title); an unpublished/unknown target keeps only the
 *    cached title — the page id and internal workspace path are private and
 *    must not leak into public HTML
 *
 * Pure and isomorphic — unit-testable without a DOM.
 */

const SAFE_LINK_HREF = /^(?:https?:|mailto:)/i;
const SAFE_IMAGE_SRC = /^https?:/i;

/** A published pageLink target: its live title and public path (`/p/…`). */
export interface PublicPageLinkTarget {
  title: string;
  href: string;
}

export type PublicPageLinkMap = ReadonlyMap<string, PublicPageLinkTarget>;

function isSafeLinkMark(mark: { attrs?: Record<string, unknown> }): boolean {
  const href = mark.attrs?.href;
  return typeof href === "string" && SAFE_LINK_HREF.test(href.trim());
}

function sanitizeNode(
  node: JSONContent,
  pageLinks: PublicPageLinkMap,
): JSONContent | null {
  if (node.type === "pageLink") {
    const pageId = node.attrs?.pageId;
    const target =
      typeof pageId === "string" ? pageLinks.get(pageId) : undefined;
    // A published target with a safe app-relative href becomes a real link to
    // its public URL with its live title. The href is built from trusted
    // values (buildPublicPagePath always emits `/p/…`), but this is a public
    // HTML render, so we still refuse anything that isn't an app-relative path
    // — defense-in-depth against a `javascript:`/`data:` href slipping in.
    if (target && target.href.startsWith("/")) {
      return {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: target.title || "Untitled",
            marks: [{ type: "link", attrs: { href: target.href } }],
          },
        ],
      };
    }
    // Otherwise (unpublished / unknown / unsafe href): title-only text, with no
    // page id or internal workspace path leaked.
    const title = node.attrs?.title;
    return {
      type: "pageLink",
      attrs: { title: typeof title === "string" && title ? title : "Untitled" },
    };
  }

  if (node.type === "image") {
    const src = node.attrs?.src as unknown;
    if (typeof src !== "string" || !SAFE_IMAGE_SRC.test(src.trim())) {
      return null;
    }
  }

  const marks = node.marks?.filter((mark) => {
    if (mark.type === "comment") return false;
    if (mark.type === "link") return isSafeLinkMark(mark);
    return true;
  });

  const content = node.content
    ?.map((child) => sanitizeNode(child, pageLinks))
    .filter((child): child is JSONContent => child !== null);

  return {
    ...node,
    ...(marks !== undefined ? { marks } : {}),
    ...(content !== undefined ? { content } : {}),
  };
}

const NO_LINKS: PublicPageLinkMap = new Map();

export function sanitizeDocForPublic(
  doc: JSONContent,
  pageLinks: PublicPageLinkMap = NO_LINKS,
): JSONContent {
  return sanitizeNode(doc, pageLinks) ?? { type: "doc", content: [] };
}

/**
 * Collect the distinct page ids referenced by `pageLink` nodes in a document,
 * in document order. Pure; used by the public render (to resolve published
 * targets) and by the publish flow (to walk the linked-page graph).
 */
export function collectPageLinkIds(
  doc: JSONContent | null | undefined,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "pageLink") {
      const pageId = node.attrs?.pageId;
      if (typeof pageId === "string" && pageId && !seen.has(pageId)) {
        seen.add(pageId);
        ids.push(pageId);
      }
    }
    node.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}
