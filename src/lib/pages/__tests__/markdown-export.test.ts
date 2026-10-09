import { describe, expect, it } from "vitest";
import { buildMarkdownExport, markdownFilename } from "../markdown-export";

describe("buildMarkdownExport", () => {
  it("puts the title above the body as an H1", () => {
    expect(buildMarkdownExport("Runbook", "Step one.\n\nStep two.")).toBe(
      "# Runbook\n\nStep one.\n\nStep two.\n",
    );
  });

  it("does not repeat a title the body already opens with", () => {
    expect(buildMarkdownExport("Runbook", "# Runbook\n\nStep one.")).toBe(
      "# Runbook\n\nStep one.\n",
    );
  });

  it("keeps a same-text heading at a different level", () => {
    expect(buildMarkdownExport("Runbook", "## Runbook\n\nStep one.")).toBe(
      "# Runbook\n\n## Runbook\n\nStep one.\n",
    );
  });

  it("emits just the heading for an empty body", () => {
    expect(buildMarkdownExport("Runbook", "   \n\n ")).toBe("# Runbook\n");
    expect(buildMarkdownExport("Runbook", null)).toBe("# Runbook\n");
  });

  it("falls back to Untitled for a blank title", () => {
    expect(buildMarkdownExport("  ", "Body.")).toBe("# Untitled\n\nBody.\n");
    expect(buildMarkdownExport(null, "Body.")).toBe("# Untitled\n\nBody.\n");
  });
});

describe("markdownFilename", () => {
  it("keeps readable titles, spaces included", () => {
    expect(markdownFilename("Q3 Launch Plan")).toBe("Q3 Launch Plan.md");
  });

  it("replaces characters a filesystem would reject", () => {
    expect(markdownFilename("Infra/Secrets: a *draft*?")).toBe(
      "Infra Secrets a draft.md",
    );
  });

  it("strips leading dots and trailing padding", () => {
    expect(markdownFilename("  ..hidden.  ")).toBe("hidden.md");
  });

  it("falls back to Untitled when nothing survives", () => {
    expect(markdownFilename("///")).toBe("Untitled.md");
    expect(markdownFilename("")).toBe("Untitled.md");
    expect(markdownFilename(null)).toBe("Untitled.md");
  });

  it("caps the stem length", () => {
    const name = markdownFilename("x".repeat(400));
    expect(name).toBe(`${"x".repeat(100)}.md`);
  });
});
