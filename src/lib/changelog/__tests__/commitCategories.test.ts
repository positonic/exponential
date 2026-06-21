import { describe, it, expect } from "vitest";

import {
  parseCommitMessage,
  isMergeCommit,
  summarizeByCategory,
  groupUserFacingForDigest,
} from "../commitCategories";

describe("parseCommitMessage", () => {
  it("extracts category + text from a conventional commit", () => {
    expect(parseCommitMessage("feat: add broadcasts")).toEqual({
      category: "feat",
      text: "add broadcasts",
    });
  });

  it("strips a scope and lowercases the category", () => {
    expect(parseCommitMessage("Fix(crm): honor workspace")).toEqual({
      category: "fix",
      text: "honor workspace",
    });
  });

  it("falls through to 'update' for a non-conventional message", () => {
    expect(parseCommitMessage("tidy things up")).toEqual({
      category: "update",
      text: "tidy things up",
    });
  });
});

describe("isMergeCommit", () => {
  it("detects merge commits", () => {
    expect(isMergeCommit("Merge pull request #1 from x")).toBe(true);
    expect(isMergeCommit("Merge branch 'main'")).toBe(true);
  });
  it("does not flag normal commits", () => {
    expect(isMergeCommit("feat: merge two lists")).toBe(false);
  });
});

describe("summarizeByCategory (timeline behaviour — counts everything)", () => {
  it("counts by category, descending, merges as 'update'", () => {
    const summary = summarizeByCategory([
      { message: "feat: a" },
      { message: "feat: b" },
      { message: "fix: c" },
      { message: "Merge branch 'x'" },
    ]);
    expect(summary).toEqual([
      { category: "feat", count: 2 },
      { category: "fix", count: 1 },
      { category: "update", count: 1 },
    ]);
  });
});

describe("groupUserFacingForDigest (digest behaviour — filters noise)", () => {
  it("keeps only user-facing categories, drops merges/chore/ci, ordered", () => {
    const sections = groupUserFacingForDigest([
      { message: "fix: b" },
      { message: "feat: a" },
      { message: "chore: deps" },
      { message: "ci: tweak" },
      { message: "Merge pull request #2" },
      { message: "perf: faster" },
    ]);
    expect(sections.map((s) => s.category)).toEqual(["feat", "fix", "perf"]);
    expect(sections[0]!.items).toEqual([{ commit: { message: "feat: a" }, text: "a" }]);
    expect(sections[0]!.meta.label).toBe("Feature");
  });

  it("returns an empty array when nothing user-facing shipped (→ skip the send)", () => {
    expect(
      groupUserFacingForDigest([
        { message: "chore: deps" },
        { message: "ci: cache" },
        { message: "Merge branch 'main'" },
      ]),
    ).toEqual([]);
  });
});
