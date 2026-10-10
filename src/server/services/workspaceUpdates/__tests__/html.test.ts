import { describe, expect, it } from "vitest";

import { renderUpdateEmailHtml } from "../html";

describe("renderUpdateEmailHtml", () => {
  const md =
    "Intro.\n\n## Highlights\n\n### [Bulk edit](https://app/x)\n\nSome body.\n\n## Also shipped\n\n- **[Screen snapshots](https://app/c)**: see the slide\n- Docs\n";

  it("inlines styles and drops the app's class names", () => {
    const html = renderUpdateEmailHtml(md);
    expect(html).not.toContain("class=");
    expect(html).toMatch(/<h2 style="[^"]*text-transform: uppercase[^"]*">Highlights<\/h2>/);
    expect(html).toMatch(/<h3 style="[^"]*font-size: 17px[^"]*"><a style="[^"]*"[^>]*href="https:\/\/app\/x"/);
    expect(html).toMatch(/<p style="[^"]*">Some body\.<\/p>/);
  });

  it("keeps bullets tight: list items are not wrapped in paragraphs", () => {
    const html = renderUpdateEmailHtml(md);
    expect(html).toMatch(/<li style="[^"]*"><a style="[^"]*"[^>]*href="https:\/\/app\/c"><strong>Screen snapshots<\/strong><\/a>: see the slide<\/li>/);
    expect(html).toMatch(/<li style="[^"]*">Docs<\/li>/);
    expect(html).not.toContain("<li><p>");
  });

  it("still drops anything the public sanitizer drops", () => {
    const html = renderUpdateEmailHtml("[x](javascript:alert(1)) <script>bad()</script>");
    expect(html).not.toMatch(/href="javascript:|<script/);
  });
});
