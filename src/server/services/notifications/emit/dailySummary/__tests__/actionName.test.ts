import { describe, expect, it } from "vitest";
import { actionNameMarkdown } from "../actionName";

describe("actionNameMarkdown", () => {
  it("turns a stored editor link into a Markdown link", () => {
    const stored =
      'Read <a target="blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD-Situation-analysis">Situation Analysis doc</a>';
    expect(actionNameMarkdown(stored)).toBe(
      "Read [Situation Analysis doc](https://app.notion.com/p/PRD-Situation-analysis)",
    );
  });

  it("drops other editor tags and decodes entities", () => {
    expect(actionNameMarkdown("<p>Pay <strong>Malte</strong> &amp; Ira</p>")).toBe(
      "Pay Malte & Ira",
    );
  });

  it("leaves plain names untouched, including Markdown-significant characters", () => {
    expect(actionNameMarkdown("Go over Malte's email_response * 2 < 3")).toBe(
      "Go over Malte's email_response * 2 < 3",
    );
  });

  it("does not treat non-editor angle brackets as HTML", () => {
    expect(actionNameMarkdown("Email <alice@example.com> re contract")).toBe(
      "Email <alice@example.com> re contract",
    );
    expect(actionNameMarkdown("a<b and c>d")).toBe("a<b and c>d");
  });

  it("decodes entities once, so escaped markup stays text", () => {
    expect(actionNameMarkdown("<p>Fix &amp;lt;img src=x onerror=alert(1)&amp;gt;</p>")).toBe(
      "Fix &lt;img src=x onerror=alert(1)&gt;",
    );
    expect(
      actionNameMarkdown('<a href="https://x.test">the &amp;lt;div&amp;gt; wrapper</a>'),
    ).toBe("[the &lt;div&gt; wrapper](https://x.test)");
  });

  it("keeps apostrophes in a double-quoted href and makes the link pattern-safe", () => {
    expect(
      actionNameMarkdown(`<a href="https://x.test/?q=it's (draft)">Foo [draft]</a>`),
    ).toBe("[Foo (draft)](https://x.test/?q=it's%20%28draft%29)");
  });

  it("keeps only the label for non-http links", () => {
    expect(actionNameMarkdown('<a href="javascript:alert(1)">Click</a> me')).toBe("Click me");
  });

  it("skips normalisation for very long names", () => {
    const long = "<a " + "x".repeat(3000);
    expect(actionNameMarkdown(long)).toBe(long);
  });
});
