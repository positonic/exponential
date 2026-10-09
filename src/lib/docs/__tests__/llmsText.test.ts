import { describe, it, expect } from "vitest";
import { buildDocsNavigation, listDocPages } from "../content";
import { buildLlmsFull, buildLlmsIndex } from "../llmsText";

const pages = listDocPages();
const nav = buildDocsNavigation(pages);
const opts = { productName: "Exponential", baseUrl: "https://example.test", pages, nav };

describe("buildLlmsIndex", () => {
  it("lists every visible page once, with an absolute URL, under its sidebar section", () => {
    const text = buildLlmsIndex(opts);
    const visible = pages.filter((p) => !p.meta.hidden);
    for (const p of visible) {
      expect(text).toContain(`](https://example.test${p.href})`);
    }
    expect(text).toContain("## Get started");
    expect(text).toContain("https://example.test/llms-full.txt");
  });

  it("appends extra sections verbatim", () => {
    expect(buildLlmsIndex({ ...opts, appendix: "## Bounty API\n\nGET /api/bounties" })).toContain("## Bounty API");
  });
});

describe("buildLlmsFull", () => {
  it("contains every page's body with relative links made absolute", () => {
    const text = buildLlmsFull(opts);
    expect(text).toContain("# Quickstart");
    expect(text).not.toMatch(/\]\(\/docs\//);
    expect(text).toContain("](https://example.test/docs/");
  });

  it("strips frontmatter", () => {
    expect(buildLlmsFull(opts)).not.toMatch(/^updated: \d{4}-\d{2}-\d{2}$/m);
  });
});
