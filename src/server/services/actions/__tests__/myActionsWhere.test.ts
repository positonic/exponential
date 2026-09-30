import { describe, expect, it } from "vitest";
import {
  myActionsDueTodayWhere,
  myActionsOwnershipWhere,
  myInboxActionsWhere,
  myOverdueActionsWhere,
  isInboxAction,
} from "../myActionsWhere";
import { partitionActions } from "~/lib/actions/partition";

describe("myActionsWhere", () => {
  it("owns actions I created with no assignees, or ones assigned to me", () => {
    expect(myActionsOwnershipWhere("u1")).toEqual({
      OR: [
        { createdById: "u1", assignees: { none: {} } },
        { assignees: { some: { userId: "u1" } } },
      ],
    });
  });

  it("inbox is my active actions with no project, due date or schedule", () => {
    expect(myInboxActionsWhere("u1")).toEqual({
      AND: [myActionsOwnershipWhere("u1")],
      projectId: null,
      dueDate: null,
      scheduledStart: null,
      status: "ACTIVE",
    });
  });

  it("isInboxAction matches the where clause and the /today inbox bucket", () => {
    const base = { status: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null };
    const actions = [
      { ...base, id: "unsorted" },
      { ...base, id: "due", dueDate: new Date(2026, 8, 1) },
      { ...base, id: "scheduled", scheduledStart: new Date(2026, 8, 1) },
      { ...base, id: "project", projectId: "p1" },
      { ...base, id: "done", status: "COMPLETED" },
    ];
    const bucket = partitionActions(actions, { today: new Date(2026, 8, 16) }).inbox;
    expect(actions.filter(isInboxAction).map((a) => a.id)).toEqual(["unsorted"]);
    expect(bucket.map((a) => a.id)).toEqual(["unsorted"]);
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

  it("overdue mirrors the /today partition: schedule before today, else due before today", () => {
    const startOfToday = new Date(2026, 8, 16);
    expect(myOverdueActionsWhere("u1", startOfToday)).toEqual({
      AND: [
        myActionsOwnershipWhere("u1"),
        {
          OR: [
            { scheduledStart: { lt: startOfToday } },
            { scheduledStart: null, dueDate: { lt: startOfToday } },
          ],
        },
      ],
      status: "ACTIVE",
    });
  });
});
