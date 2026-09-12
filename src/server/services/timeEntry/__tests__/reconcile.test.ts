/**
 * Table-driven tests for the manual-wins rules (pure, no mocks).
 * Times are minutes after an arbitrary origin; `t(14, 50)` is 14:50.
 */

import { describe, it, expect } from "vitest";
import { reconcileProposed, appendReference, type ManualInterval } from "../reconcile";

const t = (h: number, m: number) => (h * 60 + m) * 60_000;

const manualA: ManualInterval = { id: "m1", actionId: "A", startMs: t(14, 50), endMs: t(15, 30) };

describe("reconcileProposed — same Action", () => {
  it("drops the proposal and names the manual entry to annotate", () => {
    const result = reconcileProposed([manualA], {
      actionId: "A",
      startMs: t(14, 57),
      endMs: t(15, 22),
      sourceRef: "claude-session:s1#0",
    });
    expect(result).toEqual({ kind: "merge", mergeInto: ["m1"], pieces: [] });
  });

  it("merges on any overlap, however small, and into every overlapping manual entry", () => {
    const manualA2: ManualInterval = { id: "m2", actionId: "A", startMs: t(16, 0), endMs: t(16, 30) };
    const result = reconcileProposed([manualA, manualA2], {
      actionId: "A",
      startMs: t(15, 29),
      endMs: t(16, 1),
      sourceRef: "r",
    });
    expect(result.kind).toBe("merge");
    expect(result.mergeInto).toEqual(["m1", "m2"]);
  });

  it("touching at the boundary is not an overlap", () => {
    const result = reconcileProposed([manualA], {
      actionId: "A",
      startMs: t(15, 30),
      endMs: t(16, 0),
      sourceRef: "r",
    });
    expect(result.kind).toBe("write");
    expect(result.pieces).toHaveLength(1);
  });
});

describe("reconcileProposed — no manual overlap", () => {
  it("writes the proposal untouched with its own ref", () => {
    const result = reconcileProposed([manualA], {
      actionId: "B",
      startMs: t(9, 22),
      endMs: t(10, 30),
      sourceRef: "claude-session:s1#0",
    });
    expect(result).toEqual({
      kind: "write",
      mergeInto: [],
      pieces: [{ actionId: "B", startMs: t(9, 22), endMs: t(10, 30), sourceRef: "claude-session:s1#0" }],
    });
  });

  it("with no manual entries at all", () => {
    const result = reconcileProposed([], { actionId: "B", startMs: t(9, 0), endMs: t(9, 30), sourceRef: "r" });
    expect(result.kind).toBe("write");
    expect(result.pieces).toHaveLength(1);
  });
});

describe("appendReference", () => {
  it("starts a note, appends once, never duplicates", () => {
    expect(appendReference(null, "r1")).toBe("r1");
    expect(appendReference("PR 642", "r1")).toBe("PR 642 · r1");
    expect(appendReference("PR 642 · r1", "r1")).toBe("PR 642 · r1");
  });
});
