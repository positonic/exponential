/**
 * A fenced code block written directly under a raw HTML line must still
 * render as code (or a diagram), not be swallowed into the HTML block.
 */

import { describe, expect, test, vi } from "vitest";
import { render } from "~/test/test-utils";

import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

vi.mock("~/app/_components/shared/MermaidDiagram", () => ({
  MermaidDiagram: ({ code }: { code: string }) => (
    <div data-testid="mermaid">{code}</div>
  ),
}));

describe("MarkdownRenderer: fence under a raw HTML line", () => {
  test("a mermaid fence directly under an <img> line still renders as a diagram", () => {
    const md =
      '<img src="https://blob.example/shot.png" width="600" />\n' +
      "```mermaid\nflowchart TB\n  R --> L\n```\n\nProse after.";
    const { container, getByTestId, getByText } = render(
      <MarkdownRenderer content={md} format="markdown" />,
    );
    expect(getByTestId("mermaid").textContent).toContain("R --> L");
    expect(getByText("Prose after.")).toBeTruthy();
    expect(container.textContent).not.toContain("```");
  });

  test("a plain fence directly under an <img> line still renders as code", () => {
    const md = '<img src="x.png">\n```js\nconst a = 1;\n```';
    const { container } = render(
      <MarkdownRenderer content={md} format="markdown" />,
    );
    expect(container.querySelector("code")?.textContent).toContain("const a = 1;");
    expect(container.textContent).not.toContain("```");
  });
});
