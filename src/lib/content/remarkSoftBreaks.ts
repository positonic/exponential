/**
 * remark plugin that turns single ("soft") line breaks into hard breaks, so
 * content typed into a textarea keeps its line breaks when rendered as Markdown
 * (ADR-0016). This matches the GitHub-comment convention and preserves the
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
    for (const child of children) {
      if (
        child.type === "text" &&
        typeof child.value === "string" &&
        child.value.includes("\n")
      ) {
        const segments = child.value.split("\n");
        segments.forEach((segment, index) => {
          if (segment) out.push({ type: "text", value: segment });
          if (index < segments.length - 1) out.push({ type: "break" });
        });
      } else {
        walk(child);
        out.push(child);
      }
    }
    node.children = out;
  }

  walk(tree);
}

export const remarkSoftBreaks: Plugin<[], Root> = () => (tree) =>
  applySoftBreaks(tree as unknown as MdNode);
