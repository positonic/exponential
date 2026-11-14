import { describe, it, expect } from "vitest";
import { threeWayMerge } from "../three-way-merge";

const BASE = ["# Plan", "", "## Goals", "", "Grow revenue.", "", "## Risks", "", "Churn.", ""].join("\n");

describe("threeWayMerge", () => {
  it("lands edits to different sections from both sides", () => {
    const ours = BASE.replace("Grow revenue.", "Grow revenue 20%.");
    const theirs = BASE.replace("Churn.", "Churn and hiring.");
    const r = threeWayMerge(BASE, ours, theirs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.merged).toContain("Grow revenue 20%.");
    expect(r.merged).toContain("Churn and hiring.");
    expect(r.changed).toBe(true);
  });

  it("is a no-op when theirs equals base", () => {
    const ours = BASE.replace("Churn.", "Churn!");
    const r = threeWayMerge(BASE, ours, BASE);
    expect(r).toEqual({ ok: true, merged: ours, changed: false });
  });

  it("takes an incoming change when ours equals base", () => {
    const theirs = BASE.replace("Churn.", "Churn!");
    const r = threeWayMerge(BASE, BASE, theirs);
    expect(r).toEqual({ ok: true, merged: theirs, changed: true });
  });

  it("merges an insertion at the end with an edit at the top", () => {
    const ours = BASE.replace("# Plan", "# Plan 2027");
    const theirs = BASE + "\n## Budget\n\nTBD.\n";
    const r = threeWayMerge(BASE, ours, theirs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.merged.startsWith("# Plan 2027")).toBe(true);
    expect(r.merged.endsWith("## Budget\n\nTBD.\n")).toBe(true);
  });

  it("conflicts when both sides rewrite the same line differently", () => {
    const ours = BASE.replace("Churn.", "Churn is the risk.");
    const theirs = BASE.replace("Churn.", "Hiring is the risk.");
    const r = threeWayMerge(BASE, ours, theirs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toEqual({
      base: ["Churn."],
      ours: ["Churn is the risk."],
      theirs: ["Hiring is the risk."],
    });
  });

  it("conflicts on adjacent changes, as git does", () => {
    // Ours rewrites "Churn."; theirs inserts a line right before it.
    const ours = BASE.replace("Churn.", "Churn is the risk.");
    const theirs = BASE.replace("\nChurn.", "\nNote:\nChurn.");
    expect(threeWayMerge(BASE, ours, theirs).ok).toBe(false);
  });

  it("accepts the identical change from both sides", () => {
    const same = BASE.replace("Churn.", "Churn!");
    const r = threeWayMerge(BASE, same, same);
    expect(r).toEqual({ ok: true, merged: same, changed: false });
  });

  it("merges a deletion on one side with an edit elsewhere", () => {
    const ours = BASE.replace("## Risks\n\nChurn.\n", "");
    const theirs = BASE.replace("Grow revenue.", "Grow revenue fast.");
    const r = threeWayMerge(BASE, ours, theirs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.merged).not.toContain("Risks");
    expect(r.merged).toContain("Grow revenue fast.");
  });

  it("handles an empty base: both sides adding text is a conflict, one side is not", () => {
    expect(threeWayMerge("", "A", "B").ok).toBe(false);
    expect(threeWayMerge("", "", "B")).toEqual({ ok: true, merged: "B", changed: true });
  });
});
