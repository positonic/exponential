import { describe, expect, it } from "vitest";
import {
  myActionsDueTodayWhere,
  myActionsOwnershipWhere,
  myInboxActionsWhere,
} from "../myActionsWhere";

describe("myActionsWhere", () => {
  it("owns actions I created with no assignees, or ones assigned to me", () => {
    expect(myActionsOwnershipWhere("u1")).toEqual({
      OR: [
        { createdById: "u1", assignees: { none: {} } },
        { assignees: { some: { userId: "u1" } } },
      ],
    });
  });

  it("inbox is my active actions with no project", () => {
    expect(myInboxActionsWhere("u1")).toEqual({
      AND: [myActionsOwnershipWhere("u1")],
      projectId: null,
      status: "ACTIVE",
    });
  });

  it("due today spans the server's local day from midnight to the next midnight", () => {
    const now = new Date(2026, 8, 16, 15, 42, 7);
    const where = myActionsDueTodayWhere("u1", now);

    expect(where).toEqual({
      ...myActionsOwnershipWhere("u1"),
      dueDate: { gte: new Date(2026, 8, 16), lt: new Date(2026, 8, 17) },
      status: "ACTIVE",
    });
    // The caller's clock is not mutated.
    expect(now.getHours()).toBe(15);
  });

  it("due today scopes by the project's workspace only when one is given", () => {
    const now = new Date(2026, 8, 16, 9);
    expect(myActionsDueTodayWhere("u1", now, "w1")).toMatchObject({ project: { workspaceId: "w1" } });
    expect(myActionsDueTodayWhere("u1", now)).not.toHaveProperty("project");
  });
});
