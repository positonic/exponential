import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import matter from "gray-matter";
import { parseUpdatedField, setUpdatedFrontmatter } from "../lastUpdated";
import { listDocPages } from "../content";

describe("parseUpdatedField", () => {
  it("accepts the Date YAML produces for an unquoted date", () => {
    expect(parseUpdatedField(matter("---\nupdated: 2026-09-28\n---\n").data.updated)).toBe("2026-09-28");
  });

  it("accepts a quoted date string", () => {
    expect(parseUpdatedField(matter('---\nupdated: "2026-09-28"\n---\n').data.updated)).toBe("2026-09-28");
  });

  it("rejects missing and malformed values", () => {
    expect(parseUpdatedField(undefined)).toBeNull();
    expect(parseUpdatedField("yesterday")).toBeNull();
    expect(parseUpdatedField("2026-9-28")).toBeNull();
    expect(parseUpdatedField(new Date("not a date"))).toBeNull();
  });
});

describe("setUpdatedFrontmatter", () => {
  it("appends the field and leaves every other line untouched", () => {
    const raw = "---\ntitle: Concepts\norder: 2   # keep this comment\n---\n\nBody with --- inside.\n";
    expect(setUpdatedFrontmatter(raw, "2026-09-28")).toBe(
      "---\ntitle: Concepts\norder: 2   # keep this comment\nupdated: 2026-09-28\n---\n\nBody with --- inside.\n",
    );
  });

  it("replaces an existing date in place", () => {
    const raw = "---\ntitle: A\nupdated: 2026-01-01\nicon: IconBook\n---\n\nBody\n";
    expect(setUpdatedFrontmatter(raw, "2026-09-28")).toBe("---\ntitle: A\nupdated: 2026-09-28\nicon: IconBook\n---\n\nBody\n");
  });

  it("is a no-op when the date is already current", () => {
    const raw = "---\ntitle: A\nupdated: 2026-09-28\n---\n\nBody\n";
    expect(setUpdatedFrontmatter(raw, "2026-09-28")).toBe(raw);
  });

  it("does not mistake a value ending in --- for the closing fence", () => {
    const raw = "---\ntitle: Before---\ndescription: x\n---\n\nBody\n";
    const out = setUpdatedFrontmatter(raw, "2026-09-28");
    expect(matter(out).data).toMatchObject({ title: "Before---", description: "x" });
    expect(parseUpdatedField(matter(out).data.updated)).toBe("2026-09-28");
  });

  it("adds a frontmatter block to a page without one", () => {
    const out = setUpdatedFrontmatter("# Heading\n", "2026-09-28");
    expect(parseUpdatedField(matter(out).data.updated)).toBe("2026-09-28");
    expect(matter(out).content.trim()).toBe("# Heading");
  });

  it("keeps a byte-order mark and trailing spaces on the opening fence", () => {
    for (const raw of ["\uFEFF---\ntitle: A\n---\n\nBody\n", "---  \ntitle: A\n---\n\nBody\n"]) {
      const out = setUpdatedFrontmatter(raw, "2026-09-28");
      expect(out.startsWith(raw.slice(0, raw.indexOf("\n") + 1))).toBe(true);
      expect(matter(out).data).toMatchObject({ title: "A" });
      expect(parseUpdatedField(matter(out).data.updated)).toBe("2026-09-28");
      expect(matter(out).content.trim()).toBe("Body");
    }
  });

  it("refuses rather than prepend a second block when it cannot find the frontmatter", () => {
    // gray-matter reads `---yaml` as a fence with a language hint; this function does not.
    const raw = "---yaml\ntitle: A\n---\n\nBody\n";
    expect(matter(raw).data).toMatchObject({ title: "A" });
    expect(() => setUpdatedFrontmatter(raw, "2026-09-28")).toThrow(/unrecognised frontmatter fence/);
  });

  it("handles CRLF line endings", () => {
    const out = setUpdatedFrontmatter("---\r\ntitle: A\r\n---\r\n\r\nBody\r\n", "2026-09-28");
    expect(out).toBe("---\r\ntitle: A\r\nupdated: 2026-09-28\r\n---\r\n\r\nBody\r\n");
    expect(matter(out).data).toMatchObject({ title: "A" });
    expect(parseUpdatedField(matter(out).data.updated)).toBe("2026-09-28");
  });
});

describe("page meta", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-updated-"));
    fs.writeFileSync(path.join(dir, "dated.md"), "---\ntitle: Dated\nupdated: 2026-09-28\n---\n\nBody\n");
    fs.writeFileSync(path.join(dir, "undated.md"), "---\ntitle: Undated\n---\n\nBody\n");
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exposes the updated date as YYYY-MM-DD, or undefined when absent", () => {
    const byTitle = new Map(listDocPages(dir).map((p) => [p.meta.title, p.meta.updated]));
    expect(byTitle.get("Dated")).toBe("2026-09-28");
    expect(byTitle.get("Undated")).toBeUndefined();
  });
});
