import { describe, it, expect } from "vitest";
import { separateFenceFromHtmlBlock } from "../fenceAfterHtml";

describe("separateFenceFromHtmlBlock", () => {
  it("puts a blank line between an HTML tag line and a fence that follows it", () => {
    const md = '<img src="x.png" width="600" />\n```mermaid\nA --> B\n```';
    expect(separateFenceFromHtmlBlock(md)).toBe(
      '<img src="x.png" width="600" />\n\n```mermaid\nA --> B\n```',
    );
  });

  it("covers a fence further down a multi-line HTML block", () => {
    const md = "<figure>\n  <img src=\"x.png\">\n</figure>\n```js\nx\n```";
    expect(separateFenceFromHtmlBlock(md)).toBe(
      "<figure>\n  <img src=\"x.png\">\n</figure>\n\n```js\nx\n```",
    );
  });

  it("handles tilde fences and closing tags", () => {
    const md = "</div>\n~~~\nx\n~~~";
    expect(separateFenceFromHtmlBlock(md)).toBe("</div>\n\n~~~\nx\n~~~");
  });

  it("leaves a fence already separated by a blank line alone", () => {
    const md = '<img src="x.png">\n\n```mermaid\nA --> B\n```';
    expect(separateFenceFromHtmlBlock(md)).toBe(md);
  });

  it("leaves a fence after ordinary Markdown alone", () => {
    const md = "Intro\n```js\nx\n```\n- item\n  ```sh\n  cmd\n  ```\n![](x.png)\n```\ny\n```";
    expect(separateFenceFromHtmlBlock(md)).toBe(md);
  });

  it("never touches lines inside an open fence", () => {
    const md = "```html\n<div>\n```js\n</div>\n```\n<img src=x>\n```\nafter\n```";
    expect(separateFenceFromHtmlBlock(md)).toBe(
      "```html\n<div>\n```js\n</div>\n```\n<img src=x>\n\n```\nafter\n```",
    );
  });

  it("ignores backtick fences whose info string has a backtick, and autolinks", () => {
    const md = "<b>x</b>\n```foo`bar\n<https://example.com>\n```\nx\n```";
    // The first ``` line is not an opener (backtick in the info string), so
    // it stays in the HTML block as plain text; the next one is a real opener.
    expect(separateFenceFromHtmlBlock(md)).toBe(
      "<b>x</b>\n```foo`bar\n<https://example.com>\n\n```\nx\n```",
    );
  });

  it("leaves verbatim HTML blocks alone", () => {
    const md = "<pre>\n```\nliteral\n```\n</pre>";
    expect(separateFenceFromHtmlBlock(md)).toBe(md);
  });

  it("is a no-op on text without HTML", () => {
    const md = "# Title\n\nSome prose.\n\n```mermaid\nA --> B\n```\n";
    expect(separateFenceFromHtmlBlock(md)).toBe(md);
  });
});
