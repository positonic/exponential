import { describe, expect, it } from "vitest";
import { partitionActions } from "../partition";
import { isInPausedProject, withoutPausedProjects } from "../pausedProjects";

describe("pausedProjects", () => {
  it("an action in an On hold, Completed or Cancelled project is paused", () => {
    expect(isInPausedProject({ project: { status: "ON_HOLD" } })).toBe(true);
    expect(isInPausedProject({ project: { status: "COMPLETED" } })).toBe(true);
    expect(isInPausedProject({ project: { status: "CANCELLED" } })).toBe(true);
  });

  it("an action in an Active project, or in none, is not", () => {
    expect(isInPausedProject({ project: { status: "ACTIVE" } })).toBe(false);
    expect(isInPausedProject({ project: null })).toBe(false);
    expect(isInPausedProject({})).toBe(false);
  });

  it("a status the list doesn't name keeps the action visible", () => {
    expect(isInPausedProject({ project: { status: "PLANNING" } })).toBe(false);
    expect(isInPausedProject({ project: { status: null } })).toBe(false);
  });

  it("filtering before the partition takes an On hold project's overdue pile off /today", () => {
    const today = new Date(2026, 10, 16, 9);
    const yesterday = new Date(2026, 10, 15, 9);
    const base = { status: "ACTIVE", scheduledStart: yesterday, dueDate: null };
    const actions = [
      { ...base, id: "loose", projectId: null, project: null },
      { ...base, id: "active", projectId: "p1", project: { status: "ACTIVE" } },
      { ...base, id: "german-1", projectId: "p2", project: { status: "ON_HOLD" } },
      { ...base, id: "german-2", projectId: "p2", project: { status: "ON_HOLD" } },
    ];

    // The partition itself is project-blind (the project page uses it too)...
    expect(partitionActions(actions, { today }).overdue.map((a) => a.id)).toHaveLength(4);
    // ...so Today's surfaces filter first.
    const overdue = partitionActions(withoutPausedProjects(actions), { today }).overdue;
    expect(overdue.map((a) => a.id).sort()).toEqual(["active", "loose"]);
  });
});
