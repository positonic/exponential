/**
 * remark plugin that turns single ("soft") line breaks into hard breaks, so
 * content typed into a textarea keeps its line breaks when rendered as Markdown
 * (ADR-0017). This matches the GitHub-comment convention and preserves the
 * behaviour of the legacy whitespace-pre-wrap renderers on compact surfaces
 * (activity feed, comments).
 *
 * Equivalent to the core of `remark-breaks`, hand-rolled to avoid a new
 * dependency. The transform core (`applySoftBreaks`) is pure — a plain tree
 * walk — so it is easy to test. Only splits `text` nodes, so it never touches
 * code blocks or inline code (those carry `value`, not children).
 */
import type { Plugin } from "unified";
import type { Root } from "mdast";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** Pure core: split `text` nodes on "\n" into hard `break` nodes, in place. */
export function applySoftBreaks(tree: MdNode): void {
  function walk(node: MdNode): void {
    const children = node.children;
    if (!children) return;

    const out: MdNode[] = [];
    // Emit a break only after real content and never twice in a row, so a run
    // of blank/whitespace-only lines can't stack into a wall of <br>. (Such a
    // run reaches us because CommonMark keeps whitespace-only lines — a single
    // space, an nbsp — inside one paragraph rather than splitting it, unlike a
    // truly empty line.)
    const pushBreak = () => {
      if (out.length > 0 && out[out.length - 1]?.type !== "break") {
        out.push({ type: "break" });
      }
    };
    for (const child of children) {
      if (
        child.type === "text" &&
        typeof child.value === "string" &&
        child.value.includes("\n")
      ) {
        const segments = child.value.split("\n");
        segments.forEach((segment, index) => {
          // Whitespace-only lines carry no content — skip the text node and let
          // their surrounding breaks collapse away.
          if (segment.trim()) out.push({ type: "text", value: segment });
          if (index < segments.length - 1) pushBreak();
        });
      } else {
        walk(child);
        out.push(child);
      }
    }
    // Drop trailing breaks: blank lines at the end of a block add only a gap.
    while (out.length > 0 && out[out.length - 1]?.type === "break") out.pop();
    node.children = out;
  }

  walk(tree);
}

export const remarkSoftBreaks: Plugin<[], Root> = () => (tree) =>
  applySoftBreaks(tree as unknown as MdNode);
