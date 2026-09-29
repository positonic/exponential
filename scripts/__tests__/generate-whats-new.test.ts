import { describe, it, expect } from "vitest";
import { formatTitle, renderWhatsNew } from "../generate-whats-new";

describe("formatTitle", () => {
  it("keeps feat and fix, with their area", () => {
    expect(formatTitle("feat(crm): merge selected contacts")).toEqual({ kind: "New", area: "crm", text: "Merge selected contacts" });
    expect(formatTitle("fix: time segment no longer stretches (#27)")).toEqual({ kind: "Fixed", area: null, text: "Time segment no longer stretches" });
  });

  it("escapes angle brackets so placeholders stay literal", () => {
    expect(formatTitle("feat(docs): /go/<route> resolver")?.text).toBe("/go/&lt;route&gt; resolver");
    expect(formatTitle("fix(content): a single <br>")?.text).toBe("A single &lt;br&gt;");
  });

  it("drops everything else", () => {
    for (const t of ["chore: bump deps", "docs: add a page", "refactor(x): y", "perf: faster", "Merge branch main"]) {
      expect(formatTitle(t)).toBeNull();
    }
  });
});

describe("renderWhatsNew", () => {
  const prs = [
    { number: 3, title: "fix(today): light palette", mergedAt: "2026-09-28T10:00:00Z", url: "https://x/3" },
    { number: 2, title: "feat(crm): smart merge", mergedAt: "2026-09-29T10:00:00Z", url: "https://x/2" },
    { number: 1, title: "feat: old thing", mergedAt: "2026-08-15T10:00:00Z", url: "https://x/1" },
    { number: 4, title: "chore: tidy", mergedAt: "2026-09-29T11:00:00Z", url: "https://x/4" },
  ];
  const md = renderWhatsNew(prs, "2026-09-29");

  it("groups by month, newest first, New before Fixed", () => {
    expect(md.indexOf("## September 2026")).toBeLessThan(md.indexOf("## August 2026"));
    const sep = md.slice(md.indexOf("## September 2026"), md.indexOf("## August 2026"));
    expect(sep.indexOf("### New")).toBeLessThan(sep.indexOf("### Fixed"));
    expect(sep).toContain("- **crm** — Smart merge ([#2](https://x/2))");
  });

  it("leaves out non-user-facing PRs and writes valid frontmatter", () => {
    expect(md).not.toContain("tidy");
    expect(md.startsWith("---\ntitle: What's new\n")).toBe(true);
    expect(md).toContain("updated: 2026-09-29");
  });
});
