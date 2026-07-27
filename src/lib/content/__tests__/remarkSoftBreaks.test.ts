import { describe, it, expect } from "vitest";

import { applySoftBreaks } from "../remarkSoftBreaks";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** A document root wrapping one paragraph whose single text node holds `value`. */
function doc(value: string): MdNode {
  return {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value }] }],
  };
}

/** Children of the paragraph inside the document root. */
function paragraphChildren(tree: MdNode): MdNode[] {
  return tree.children![0]!.children!;
}

/** Compact string form: text values verbatim, breaks as "<br>". */
function shape(children: MdNode[]): string {
  return children
    .map((c) => (c.type === "break" ? "<br>" : (c.value ?? `<${c.type}>`)))
    .join("|");
}

describe("applySoftBreaks", () => {
  it("turns a single newline into a hard break", () => {
    const tree = doc("line1\nline2");
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("line1|<br>|line2");
  });

  it("collapses a run of whitespace-only lines into a single break", () => {
    // CommonMark keeps whitespace-only lines (a lone space, an nbsp) inside one
    // paragraph — the exact shape that used to stack into a wall of <br>.
    const tree = doc("Hello\n \n \n \nWorld");
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("Hello|<br>|World");
  });

  it("drops trailing whitespace-only lines entirely (no dangling break)", () => {
    const tree = doc("Let me pull the key actions:\n \n \n \n ");
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("Let me pull the key actions:");
  });

  it("drops leading whitespace-only lines (no leading break)", () => {
    const tree = doc(" \n \nWorld");
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("World");
  });

  it("preserves a soft break next to a non-text sibling", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "emphasis", children: [{ type: "text", value: "lot" }] },
            { type: "text", value: "\nWorld" },
          ],
        },
      ],
    };
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("<emphasis>|<br>|World");
  });

  it("leaves text without newlines untouched", () => {
    const tree = doc("just one line");
    applySoftBreaks(tree);
    expect(shape(paragraphChildren(tree))).toBe("just one line");
  });
});
