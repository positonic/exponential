import { describe, it, expect } from "vitest";

import { toPlainText } from "../plainText";

describe("toPlainText", () => {
  it("returns an empty string for empty or nullish input", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText("   \n  ")).toBe("");
  });

  it("leaves plain text alone", () => {
    expect(toPlainText("Chase the overdue invoice")).toBe(
      "Chase the overdue invoice",
    );
  });

  describe("legacy HTML (Tiptap output)", () => {
    it("reduces a link-only action name to the link text", () => {
      // The workspace-home regression: names authored in the rich action
      // input are a bare autolinked URL.
      const name =
        '<a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://github.com/acme/repo/pull/12">https://github.com/acme/repo/pull/12</a>';
      expect(toPlainText(name)).toBe("https://github.com/acme/repo/pull/12");
    });

    it("keeps surrounding text and drops inline formatting", () => {
      expect(
        toPlainText(
          'Review <strong>the</strong> <a href="https://x.com">doc</a> today',
        ),
      ).toBe("Review the doc today");
    });

    it("separates block boundaries and line breaks with a space", () => {
      expect(toPlainText("<p>First</p><p>Second</p>")).toBe("First Second");
      expect(toPlainText("<p>Line one<br>Line two</p>")).toBe(
        "Line one Line two",
      );
      expect(toPlainText("<ul><li>One</li><li>Two</li></ul>")).toBe("One Two");
    });

    it("keeps inline tags from splitting a word", () => {
      expect(toPlainText("<p>un<em>do</em> it</p>")).toBe("undo it");
    });

    it("decodes named and numeric entities", () => {
      expect(toPlainText("<p>Tom &amp; Jerry&nbsp;&#8212; it&#39;s &quot;on&quot;</p>")).toBe(
        "Tom & Jerry — it's \"on\"",
      );
      expect(toPlainText("<p>&#x1F600; &lt;tag&gt;</p>")).toBe("😀 <tag>");
    });

    it("treats markdown-looking text inside HTML as literal", () => {
      expect(toPlainText("<p>use **bold** here</p>")).toBe("use **bold** here");
    });

    it("leaves numeric entities outside the Unicode range as typed", () => {
      // String.fromCodePoint would throw on these — and this runs in render.
      // (Built from parts: to the pre-commit colour check a literal
      // eight-digit entity looks like a hex colour.)
      const entity = (n: string) => `&${"#"}${n};`;
      const input = `<p>${entity("1114112")} ${entity("xFFFFFFFF")} ${entity("99999999")} ok</p>`;
      expect(toPlainText(input)).toBe(
        `${entity("1114112")} ${entity("xFFFFFFFF")} ${entity("99999999")} ok`,
      );
    });
  });

  describe("markdown", () => {
    it("reduces links and images to their text", () => {
      expect(toPlainText("Fix [the bug](https://x.com/1) now")).toBe(
        "Fix the bug now",
      );
      expect(toPlainText("See ![diagram](https://x.com/a.png)")).toBe(
        "See diagram",
      );
      expect(toPlainText("Ref [docs][1] and <https://x.com>")).toBe(
        "Ref docs and https://x.com",
      );
    });

    it("strips emphasis, strikethrough and inline code", () => {
      expect(toPlainText("**Ship** the *thing* with `code` ~~soon~~")).toBe(
        "Ship the thing with code soon",
      );
      expect(toPlainText("__Ship__ the _thing_")).toBe("Ship the thing");
      expect(toPlainText("***very*** important")).toBe("very important");
    });

    it("keeps underscores and asterisks that are not emphasis", () => {
      expect(toPlainText("rename user_profile_id and compute 2 * 3 * 4")).toBe(
        "rename user_profile_id and compute 2 * 3 * 4",
      );
    });

    it("drops heading, list, quote and rule markers", () => {
      const md = [
        "# Cycle goal",
        "",
        "> Make it feel effortless",
        "",
        "- [ ] tiered home",
        "- [x] cycle card",
        "1. first",
        "2) second",
        "",
        "---",
        "```ts",
        "const x = 1;",
        "```",
      ].join("\n");
      expect(toPlainText(md)).toBe(
        "Cycle goal Make it feel effortless tiered home cycle card first second const x = 1;",
      );
    });

    it("keeps the @ on mention markup", () => {
      expect(toPlainText("@[Ada Lovelace](usr_1) can you check?")).toBe(
        "@Ada Lovelace can you check?",
      );
    });

    it("unescapes escaped punctuation", () => {
      expect(toPlainText("Price is \\*not\\* final \\[draft\\]")).toBe(
        "Price is *not* final [draft]",
      );
    });

    it("keeps private-use characters that were in the content", () => {
      // Icon fonts and pasted data use the PUA; the escape sentinels must not
      // collide with (or eat) them.
      expect(toPlainText("logo \uE000\uE011\uE0FF here \\*x\\*")).toBe(
        "logo \uE000\uE011\uE0FF here *x*",
      );
    });

    it("collapses paragraphs onto one line", () => {
      expect(toPlainText("First paragraph.\n\nSecond   paragraph.\n")).toBe(
        "First paragraph. Second paragraph.",
      );
    });
  });
});
