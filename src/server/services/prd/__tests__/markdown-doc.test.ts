/**
 * Unit tests for the server-side Markdown → ProseMirror codec wrapper.
 *
 * The wrapper's whole contract is (1) byte-identical output to the client
 * codec (it runs the same code) and (2) leaving the process globals exactly
 * as it found them — the swap must be invisible to everything else on the
 * server.
 */

import { describe, it, expect } from "vitest";

import { markdownToDocServer } from "../markdown-doc";
import { markdownToDoc, EMPTY_DOC } from "~/lib/prd/codec";

// Exercises every node type the PRD schema supports: headings, marks, links,
// task lists (nested + checked state), tables, block images, code blocks,
// blockquotes and ordered lists.
const SAMPLE_MD = `# Heading one

Some **bold** and *italic* and \`code\` and a [link](https://example.com).

- [ ] unchecked task
- [x] checked task
  - [ ] nested task

| Col A | Col B |
| --- | --- |
| a1 | b1 |

![alt text](https://example.com/img.png)

\`\`\`ts
const x = 1;
\`\`\`

> a blockquote

1. ordered one
2. ordered two
`;

describe("markdownToDocServer", () => {
  it("produces exactly what the client codec produces", () => {
    expect(markdownToDocServer(SAMPLE_MD)).toEqual(markdownToDoc(SAMPLE_MD));
  });

  it("parses every PRD node type", () => {
    const doc = markdownToDocServer(SAMPLE_MD);
    const types = (doc.content ?? []).map((n) => n.type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "taskList",
      "table",
      "image",
      "codeBlock",
      "blockquote",
      "orderedList",
    ]);
  });

  it("returns the canonical empty doc for empty input", () => {
    expect(markdownToDocServer("")).toEqual(EMPTY_DOC);
    expect(markdownToDocServer("   ")).toEqual(EMPTY_DOC);
    expect(markdownToDocServer(null)).toEqual(EMPTY_DOC);
    expect(markdownToDocServer(undefined)).toEqual(EMPTY_DOC);
  });

  it("restores pre-existing globals untouched", () => {
    // The unit-test environment registers happy-dom globals; the swap must
    // put back the very same object references.
    const before = { window: globalThis.window, document: globalThis.document };
    markdownToDocServer("# Hi");
    expect(globalThis.window).toBe(before.window);
    expect(globalThis.document).toBe(before.document);
  });

  it("works with no ambient DOM globals (server conditions)", () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { window: g.window, document: g.document };
    delete g.window;
    delete g.document;
    try {
      const doc = markdownToDocServer("# Hi");
      expect(doc.content?.[0]?.type).toBe("heading");
      // ...and it must not have re-introduced them.
      expect(g.window).toBeUndefined();
      expect(g.document).toBeUndefined();
    } finally {
      g.window = saved.window;
      g.document = saved.document;
    }
  });
});
