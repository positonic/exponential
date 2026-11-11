import { describe, it, expect } from "vitest";
import { linkSelectionOnPaste } from "../pasteLink";

const URL_ = "https://example.com/spec";

describe("linkSelectionOnPaste", () => {
  it("wraps the selection in a Markdown link", () => {
    const value = "Read the spec first";
    expect(linkSelectionOnPaste(value, 5, 13, URL_)).toEqual({
      value: `Read [the spec](${URL_}) first`,
      snippet: `[the spec](${URL_})`,
      cursor: 5 + `[the spec](${URL_})`.length,
    });
  });

  it("accepts a backwards selection and trims the pasted URL", () => {
    expect(linkSelectionOnPaste("the spec", 8, 0, `  ${URL_}\n`)?.value).toBe(
      `[the spec](${URL_})`,
    );
  });

  it("escapes brackets in the link text", () => {
    expect(linkSelectionOnPaste("see [v2]", 0, 8, URL_)?.value).toBe(
      `[see \\[v2\\]](${URL_})`,
    );
  });

  it("escapes parentheses in the URL so an unbalanced one can't end the link", () => {
    expect(
      linkSelectionOnPaste("Foo", 0, 3, "https://en.wikipedia.org/wiki/Foo_(bar")?.value,
    ).toBe("[Foo](https://en.wikipedia.org/wiki/Foo_\\(bar)");
  });

  it.each([
    ["no selection", "the spec", 3, 3, URL_],
    ["plain-text paste", "the spec", 0, 8, "hello"],
    ["paste with spaces", "the spec", 0, 8, `${URL_} and more`],
    ["non-http URL", "the spec", 0, 8, "javascript:alert(1)"],
    ["URL over a URL", "https://old.example.com", 0, 23, URL_],
    ["whitespace-only selection", "a   b", 1, 4, URL_],
    ["selection across a blank line", "one\n\ntwo", 0, 8, URL_],
  ])("leaves the paste alone: %s", (_label, value, start, end, pasted) => {
    expect(linkSelectionOnPaste(value, start, end, pasted)).toBeNull();
  });
});
