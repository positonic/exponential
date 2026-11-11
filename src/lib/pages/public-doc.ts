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
 *  - `database` nodes (ADR-0078) become static `table` nodes from the
 *    caller-supplied projection; a database not in the map is dropped
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

/** One row of a database as the public render shows it: one text per visible column. */
export interface PublicDatabaseRow {
  cells: string[];
  /** The row page's public path when it is published; the title cell links there. */
  href?: string;
}

/** A database projected for the public render (ADR-0078): visible columns in view order. */
export interface PublicDatabaseTable {
  name: string;
  columns: string[];
  rows: PublicDatabaseRow[];
  /** Which column is the title — the one that links to the row page. Defaults to 0. */
  titleIndex?: number;
}

export type PublicDatabaseMap = ReadonlyMap<string, PublicDatabaseTable>;

function textNode(text: string, href?: string): JSONContent[] {
  if (!text) return [];
  return [
    href && href.startsWith("/")
      ? { type: "text", text, marks: [{ type: "link", attrs: { href } }] }
      : { type: "text", text },
  ];
}

/**
 * A database block as a static Tiptap `table` (the editor's own table node),
 * so the public page needs no renderer of its own: a header row of the
 * visible properties, one row per Row, the title cell linking to the row's
 * public URL when that row is published.
 */
export function publicDatabaseTableNode(table: PublicDatabaseTable): JSONContent {
  const header = {
    type: "tableRow",
    content: table.columns.map((name) => ({
      type: "tableHeader",
      content: [{ type: "paragraph", content: textNode(name) }],
    })),
  };
  const titleIndex = table.titleIndex ?? 0;
  const rows = table.rows.map((row) => ({
    type: "tableRow",
    content: row.cells.map((cell, index) => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: textNode(cell, index === titleIndex ? row.href : undefined) }],
    })),
  }));
  return { type: "table", content: [header, ...rows] };
}

function isSafeLinkMark(mark: { attrs?: Record<string, unknown> }): boolean {
  const href = mark.attrs?.href;
  return typeof href === "string" && SAFE_LINK_HREF.test(href.trim());
}

function sanitizeNode(
  node: JSONContent,
  pageLinks: PublicPageLinkMap,
  databases: PublicDatabaseMap,
): JSONContent | null {
  if (node.type === "database") {
    // A database the caller projected becomes a static table; one it did not
    // (deleted, or the caller chose not to publish it) is left out entirely,
    // so neither its id nor its name reaches the public HTML.
    const databaseId = node.attrs?.databaseId;
    const table = typeof databaseId === "string" ? databases.get(databaseId) : undefined;
    return table ? publicDatabaseTableNode(table) : null;
  }

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
    ?.map((child) => sanitizeNode(child, pageLinks, databases))
    .filter((child): child is JSONContent => child !== null);

  return {
    ...node,
    ...(marks !== undefined ? { marks } : {}),
    ...(content !== undefined ? { content } : {}),
  };
}

const NO_LINKS: PublicPageLinkMap = new Map();
const NO_DATABASES: PublicDatabaseMap = new Map();

export function sanitizeDocForPublic(
  doc: JSONContent,
  pageLinks: PublicPageLinkMap = NO_LINKS,
  databases: PublicDatabaseMap = NO_DATABASES,
): JSONContent {
  return sanitizeNode(doc, pageLinks, databases) ?? { type: "doc", content: [] };
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

/** A `pageLink` node's rewritten target: the new page id and its in-app href. */
export interface PageLinkRewrite {
  pageId: string;
  href: string;
}

/**
 * Rewrite `pageLink` node targets through a remap (old page id → new
 * {pageId, href}). Used by duplicate-with-sub-pages (ADR-0039) so a copied tree
 * links to the copies, not the originals. Links whose target isn't in the remap
 * (un-copyable / out-of-scope pages) are left untouched. Pure; returns a new doc
 * and never mutates the input.
 */
export function remapPageLinkIds(
  doc: JSONContent,
  remap: ReadonlyMap<string, PageLinkRewrite>,
): JSONContent {
  const rewrite = (node: JSONContent): JSONContent => {
    let next = node;
    if (node.type === "pageLink") {
      const pageId = node.attrs?.pageId;
      const target = typeof pageId === "string" ? remap.get(pageId) : undefined;
      if (target) {
        next = {
          ...node,
          attrs: { ...node.attrs, pageId: target.pageId, href: target.href },
        };
      }
    }
    if (next.content) {
      return { ...next, content: next.content.map(rewrite) };
    }
    return next;
  };
  return rewrite(doc);
}
