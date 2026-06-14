/**
 * remark plugin that turns the app's `@[Name](id)` mention syntax into mention
 * spans, so the canonical Markdown renderer can show mentions as badges
 * (ADR-0017).
 *
 * The stored mention syntax (`@[Name](userId)`, written by
 * `useMentionAutocomplete`) collides with Markdown link syntax: Markdown parses
 * `[Name](userId)` as a link sitting right after a literal `@`. This plugin
 * detects that exact shape — a `link` node immediately preceded by text ending
 * in `@` — and rewrites it into a span the renderer styles as a badge. Known
 * names (passed in) become a styled mention; unknown names degrade to plain
 * `@Name` text rather than a broken link to a user id.
 *
 * The transform core (`applyMentions`) is a pure tree walk — no DOM, no React —
 * exported directly so it is trivially unit-testable. `remarkMentions` is the
 * thin unified attacher used by the renderer.
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

export const MENTION_CLASS = "cc-mention";
export const MENTION_UNKNOWN_CLASS = "cc-mention-unknown";

/** Pure core: rewrite `@[Name](id)` link shapes into mention spans, in place. */
export function applyMentions(tree: MdNode, mentionNames: string[]): void {
  const known = new Set(mentionNames.map((n) => n.toLowerCase()));

  function walk(node: MdNode): void {
    const children = node.children;
    if (!children) return;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child && child.type === "link") {
        const prev = i > 0 ? children[i - 1] : undefined;
        const first = child.children?.[0];
        const name =
          first && first.type === "text" && typeof first.value === "string"
            ? first.value
            : undefined;

        if (
          name &&
          prev &&
          prev.type === "text" &&
          typeof prev.value === "string" &&
          prev.value.endsWith("@")
        ) {
          // Strip the trailing "@" that introduced the mention.
          prev.value = prev.value.slice(0, -1);

          const isKnown = known.has(name.toLowerCase());
          // Re-render the link node as a span. mdast-util-to-hast's applyData
          // honours data.hName/hProperties even on built-in node types, so the
          // <a> the link handler would emit becomes our span instead.
          child.data = {
            hName: "span",
            hProperties: {
              className: [isKnown ? MENTION_CLASS : MENTION_UNKNOWN_CLASS],
            },
          };
          child.children = [{ type: "text", value: `@${name}` }];
        }
      }

      if (child) walk(child);
    }
  }

  walk(tree);
}

export const remarkMentions: Plugin<[string[]?], Root> =
  (mentionNames = []) =>
  (tree) =>
    applyMentions(tree as unknown as MdNode, mentionNames);
