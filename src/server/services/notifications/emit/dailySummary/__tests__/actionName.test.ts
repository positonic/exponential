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

  it("drops other tags and decodes entities", () => {
    expect(actionNameMarkdown("<p>Pay <strong>Malte</strong> &amp; Ira</p>")).toBe(
      "Pay Malte & Ira",
    );
  });

  it("leaves plain names untouched, including Markdown-significant characters", () => {
    expect(actionNameMarkdown("Go over Malte's email_response * 2 < 3")).toBe(
      "Go over Malte's email_response * 2 < 3",
    );
  });
});
