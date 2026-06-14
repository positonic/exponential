import { describe, it, expect } from "vitest";

import {
  applyMentions,
  MENTION_CLASS,
  MENTION_UNKNOWN_CLASS,
} from "../remarkMentions";

// Minimal mdast shape matching how remark parses `@[Name](id)`:
// a text node ending in "@" immediately followed by a link node.
function mentionTree(precedingText: string, name: string, id: string) {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: precedingText },
          {
            type: "link",
            url: id,
            children: [{ type: "text", value: name }],
          },
        ],
      },
    ],
  };
}

function getParagraphChildren(tree: ReturnType<typeof mentionTree>) {
  return tree.children[0]!.children;
}

describe("applyMentions", () => {
  it("rewrites a known mention into a styled mention span", () => {
    const tree = mentionTree("hey @", "Jane Doe", "user_123");
    applyMentions(tree, ["Jane Doe"]);

    const [text, mention] = getParagraphChildren(tree);
    // trailing "@" stripped from preceding text
    expect(text).toMatchObject({ type: "text", value: "hey " });
    // link converted to a span carrying the known-mention class
    expect(mention?.data?.hName).toBe("span");
    expect(mention?.data?.hProperties?.className).toEqual([MENTION_CLASS]);
    expect(mention?.children?.[0]).toMatchObject({
      type: "text",
      value: "@Jane Doe",
    });
  });

  it("degrades an unknown mention to plain @name (no broken link)", () => {
    const tree = mentionTree("cc @", "Ghost", "user_404");
    applyMentions(tree, ["Jane Doe"]);

    const mention = getParagraphChildren(tree)[1];
    expect(mention?.data?.hProperties?.className).toEqual([
      MENTION_UNKNOWN_CLASS,
    ]);
    expect(mention?.children?.[0]).toMatchObject({ value: "@Ghost" });
  });

  it("is case-insensitive when matching known names", () => {
    const tree = mentionTree("@", "JANE DOE", "user_123");
    applyMentions(tree, ["jane doe"]);
    expect(getParagraphChildren(tree)[1]?.data?.hProperties?.className).toEqual([
      MENTION_CLASS,
    ]);
  });

  it("leaves a normal link untouched when not preceded by @", () => {
    const tree = mentionTree("see ", "docs", "https://x.com");
    applyMentions(tree, ["docs"]);

    const link = getParagraphChildren(tree)[1];
    expect(link?.type).toBe("link");
    expect(link?.data).toBeUndefined();
    expect(link?.url).toBe("https://x.com");
  });
});
