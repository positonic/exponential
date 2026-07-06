import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";

/**
 * Block atom that links to another Knowledge Page from inside a document — the
 * `/page` slash command inserts one after creating the target page (Notion-style
 * sub-pages, minus real nesting: the target is an ordinary workspace Page).
 *
 * The node carries the target `pageId` plus a **cached** `title`/`href`
 * snapshot. The interactive editor swaps in a React node view
 * (`PageLinkWithView`) that resolves the live title, so renames show up
 * immediately; this base definition is what the headless codec and the public
 * static render use. `renderHTML` deliberately emits a non-navigable `<div>`
 * (no `href`) so a published page never links into the authenticated app.
 *
 * Markdown projection: a plain link `[title](href)`. There is no parse rule —
 * a Markdown-source rewrite (e.g. the Zoe agent) degrades the node to a
 * regular link mark, which still navigates to the page in-app.
 */
export const PageLink = Node.create({
  name: "pageLink",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-id"),
        renderHTML: (attributes) => {
          const pageId = attributes.pageId as string | null;
          return pageId ? { "data-page-id": pageId } : {};
        },
      },
      title: {
        default: "Untitled",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => {
          const title = attributes.title as string | null;
          return title ? { "data-title": title } : {};
        },
      },
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-href"),
        renderHTML: (attributes) => {
          const href = attributes.href as string | null;
          return href ? { "data-href": href } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-link",
        class: "page-link-block",
      }),
      String((node.attrs.title as string | null) ?? "Untitled"),
    ];
  },

  /** tiptap-markdown spec: project the node as a plain Markdown link. */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const title =
            ((node.attrs.title as string | null) ?? "Untitled") || "Untitled";
          const href = (node.attrs.href as string | null) ?? "";
          const safeTitle = title.replace(/([[\]])/g, "\\$1");
          state.write(`[${safeTitle}](${href})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
