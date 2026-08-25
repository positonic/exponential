/**
 * The local wiki's `[[wikilink]]` syntax, and the mapping between a page's path
 * on disk and its URL in the app.
 *
 * Wikilinks are how the wiki is navigated — by the librarian and, once there is
 * a viewer, by a person. `src-tauri/seeds/schema.md` defines them: the link text
 * is the page's path without the `.md`, so `[[people/ada]]` points at
 * `people/ada.md`. A link to a page that does **not** exist yet is not a broken
 * link; it marks something worth writing. So unresolved links render distinctly
 * rather than being hidden or dropped, and clicking one offers to create it.
 *
 * The transform core (`applyWikiLinks`) is a pure mdast walk — no DOM, no React,
 * no Tauri — so it is trivially unit-testable. `remarkWikiLinks` is the thin
 * unified attacher the renderer uses. Doing this on the AST rather than by
 * string replacement matters: `schema.md` documents the syntax *inside code
 * spans*, and a naive replace would rewrite the documentation of the feature.
 */
import type { Plugin } from "unified";
import type { Root } from "mdast";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/** Every wiki URL lives under this prefix; it is not workspace-scoped. */
export const WIKI_ROUTE = "/wiki";

export const WIKI_LINK_CLASS = "wiki-link";
/** Marks a link whose page does not exist yet — the wiki's "red link". */
export const WIKI_LINK_MISSING_CLASS = "wiki-link--missing";

/** `[[people/ada]]`, but never across a line break. */
const WIKI_LINK_RE = /\[\[([^[\]\n]+)]]/g;

/** `people/ada` → `people/ada.md`. Idempotent. */
export function targetToPath(target: string): string {
  const clean = normalizeTarget(target);
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

/** `people/ada.md` → `people/ada`. Idempotent. */
export function pathToTarget(path: string): string {
  const clean = normalizeTarget(path);
  return clean.endsWith(".md") ? clean.slice(0, -".md".length) : clean;
}

/** The app URL for a page, from either a target or a path. */
export function wikiHref(targetOrPath: string): string {
  const segments = pathToTarget(targetOrPath).split("/").filter(Boolean);
  if (segments.length === 0) return WIKI_ROUTE;
  return `${WIKI_ROUTE}/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * The wiki path for a catch-all route's segments. Next has already decoded
 * them, so this only re-joins and re-attaches the extension.
 */
export function segmentsToPath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null;
  const joined = segments.filter(Boolean).join("/");
  return joined ? targetToPath(joined) : null;
}

/**
 * What to call a page in a list: its first heading if it has one, else its
 * filename. The heading is what the librarian actually writes (`schema.md` asks
 * for one), and it reads better than a slug.
 */
export function pageTitle(path: string, content?: string): string {
  // Fenced blocks first: a page that opens with a shell snippet would otherwise
  // be titled by its first comment line.
  const prose = content?.replace(/^```[\s\S]*?^```/gm, "");
  const heading = prose ? /^#\s+(.+)$/m.exec(prose)?.[1]?.trim() : undefined;
  if (heading) return heading;
  const base = pathToTarget(path).split("/").pop() ?? path;
  return base.replace(/[-_]/g, " ");
}

/** The folder a page sits in, or null for a page at the wiki root. */
export function pageFolder(path: string): string | null {
  const segments = path.split("/");
  return segments.length > 1 ? segments.slice(0, -1).join("/") : null;
}

function normalizeTarget(raw: string): string {
  return raw
    .trim()
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/**
 * Split one text value on its wikilinks, or null when it has none (so the
 * caller can leave the node untouched rather than rebuild an identical one).
 */
function splitWikiLinks(value: string, known: ReadonlySet<string>): MdNode[] | null {
  WIKI_LINK_RE.lastIndex = 0;
  let match = WIKI_LINK_RE.exec(value);
  if (!match) return null;

  const out: MdNode[] = [];
  let cursor = 0;

  while (match) {
    const [full, rawTarget] = match;
    const target = normalizeTarget(rawTarget ?? "");

    if (!target) {
      // `[[]]` is not a link. Leave it as the literal text it is.
      match = WIKI_LINK_RE.exec(value);
      continue;
    }

    if (match.index > cursor) {
      out.push({ type: "text", value: value.slice(cursor, match.index) });
    }

    const exists = known.has(targetToPath(target));
    out.push({
      type: "link",
      url: wikiHref(target),
      children: [{ type: "text", value: pathToTarget(target) }],
      data: {
        hProperties: {
          className: exists
            ? [WIKI_LINK_CLASS]
            : [WIKI_LINK_CLASS, WIKI_LINK_MISSING_CLASS],
        },
      },
    });

    cursor = match.index + full.length;
    match = WIKI_LINK_RE.exec(value);
  }

  if (out.length === 0) return null;
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
}

/**
 * Rewrite `[[wikilinks]]` into mdast link nodes, in place.
 *
 * `known` holds the page paths that exist (`people/ada.md`), so an unresolved
 * link can be marked rather than silently rendered as if it led somewhere.
 */
export function applyWikiLinks(tree: MdNode, known: ReadonlySet<string>): void {
  function walk(node: MdNode): void {
    const children = node.children;
    if (!children) return;

    const out: MdNode[] = [];
    let rewrote = false;

    for (const child of children) {
      if (child.type === "text" && typeof child.value === "string") {
        const pieces = splitWikiLinks(child.value, known);
        if (pieces) {
          out.push(...pieces);
          rewrote = true;
          continue;
        }
      }
      out.push(child);
      // Never descend into a link: markdown has no nested links, and a
      // wikilink inside one is text the author meant literally.
      if (child.type !== "link") walk(child);
    }

    if (rewrote) node.children = out;
  }

  walk(tree);
}

/** All wikilink targets in a document, deduped, in first-seen order. */
export function collectWikiLinks(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  WIKI_LINK_RE.lastIndex = 0;
  let match = WIKI_LINK_RE.exec(markdown);
  while (match) {
    const target = normalizeTarget(match[1] ?? "");
    if (target && !seen.has(target)) {
      seen.add(target);
      found.push(target);
    }
    match = WIKI_LINK_RE.exec(markdown);
  }
  return found;
}

export const remarkWikiLinks: Plugin<[ReadonlySet<string>?], Root> =
  (known = new Set<string>()) =>
  (tree) =>
    applyWikiLinks(tree as unknown as MdNode, known);
