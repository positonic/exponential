import { describe, it, expect } from "vitest";
import { activeRunInclude, withActiveRun } from "../include";

describe("activeRunInclude / withActiveRun", () => {
  it("selects only the live set, newest first, one row", () => {
    expect(activeRunInclude.agentRuns.where.status.in).toEqual(["QUEUED", "RUNNING"]);
    expect(activeRunInclude.agentRuns.take).toBe(1);
    expect(activeRunInclude.agentRuns.orderBy).toEqual({ createdAt: "desc" });
  });

  it("maps the included rows to activeRun (or null)", () => {
    const run = { id: "r", status: "RUNNING", startedAt: null, toolCallCount: 0, agentId: "a", agent: { name: "Aria" } };
    expect(withActiveRun({ id: "x", agentRuns: [run] }).activeRun).toEqual(run);
    expect(withActiveRun({ id: "x", agentRuns: [] }).activeRun).toBeNull();
    expect(withActiveRun({ id: "x" }).activeRun).toBeNull();
  });
});
