import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";

import { databaseMarker, MORE_ROWS_LINE_RE } from "~/lib/databases/marker";

/**
 * Block atom that stands for a Database inside a page body (ADR-0078 §2).
 * The node carries the `databaseId` and a **cached** `name`; the schema, view
 * and rows live in `PageDatabase` and its row pages, never in the doc. The
 * interactive editor swaps in a React node view (V2) that renders the table;
 * this base definition is what the headless codec and the public render use,
 * so with no node view the atom shows its cached name.
 *
 * Markdown projection: the stored `body` holds a **marker only**,
 * `<!-- database:<id> -->` on its own line. Readers expand it into a table at
 * read time (`expandDatabaseMarkers`). The parse rule below turns the marker
 * back into the node **and swallows the table that follows it**, so a body
 * that was read expanded and written back (a CLI `pages update --body`)
 * keeps the block and writes nothing to any row — the requirement that
 * nothing round-trips the projected table.
 */

const MARKER_RE = /^<!--\s*database:([A-Za-z0-9_-]+)\s*-->$/;

/** The slice of markdown-it this plugin touches, typed locally so the lib stays an implicit dependency. */
interface MarkdownItToken {
  type: string;
  content: string;
}
interface MarkdownItCoreState {
  tokens: MarkdownItToken[];
}
export interface MarkdownItLike {
  core: { ruler: { push(name: string, rule: (state: MarkdownItCoreState) => void): void } };
}

/**
 * markdown-it plugin: a marker `html_block` becomes the node's HTML, and the
 * pipe table (plus any "more rows" trailer) right after it is dropped.
 * Registered through tiptap-markdown's `parse.setup`.
 */
export function databaseMarkdownPlugin(md: MarkdownItLike): void {
  md.core.ruler.push("exponential_database_block", (state) => {
    const tokens = state.tokens;
    const kept: MarkdownItToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const match =
        token.type === "html_block" ? MARKER_RE.exec(token.content.trim()) : null;
      if (!match) {
        kept.push(token);
        continue;
      }
      token.content = `<div data-type="database" data-database-id="${match[1]}"></div>\n`;
      kept.push(token);
      // Swallow the projected table that follows the marker, if any.
      let next = i + 1;
      if (tokens[next]?.type === "table_open") {
        while (next < tokens.length && tokens[next]!.type !== "table_close") next++;
        next++;
        const [open, inline, close] = [tokens[next], tokens[next + 1], tokens[next + 2]];
        if (
          open?.type === "paragraph_open" &&
          inline?.type === "inline" &&
          MORE_ROWS_LINE_RE.test(inline.content.trim()) &&
          close?.type === "paragraph_close"
        ) {
          next += 3;
        }
        i = next - 1;
      }
    }
    state.tokens = kept;
  });
}

export const DatabaseNode = Node.create({
  name: "database",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-database-id"),
        renderHTML: (attributes) => {
          const databaseId = attributes.databaseId as string | null;
          return databaseId ? { "data-database-id": databaseId } : {};
        },
      },
      /** Cached for the atom's fallback rendering; the node view shows the live name. */
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) => {
          const name = attributes.name as string | null;
          return name ? { "data-name": name } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "database",
        class: "database-block",
      }),
      String((node.attrs.name as string | null) ?? "Database"),
    ];
  },

  /** tiptap-markdown spec: a marker line out, the marker (minus its table) back in. */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const databaseId = node.attrs.databaseId as string | null;
          if (!databaseId) return;
          state.write(databaseMarker(databaseId));
          state.closeBlock(node);
        },
        parse: {
          setup(md: MarkdownItLike) {
            databaseMarkdownPlugin(md);
          },
        },
      },
    };
  },
});
