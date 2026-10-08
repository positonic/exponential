import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  myActionsOwnershipWhere,
  myActionsTodayWhere,
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

  it("today is scheduled today, or unscheduled and due today, from the caller's midnight", () => {
    const startOfToday = new Date(2026, 8, 16);
    const today = { gte: startOfToday, lt: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) };

    expect(myActionsTodayWhere("u1", startOfToday)).toEqual({
      AND: [
        myActionsOwnershipWhere("u1"),
        {
          OR: [
            { scheduledStart: today },
            { scheduledStart: null, dueDate: today },
          ],
        },
      ],
      status: "ACTIVE",
    });
  });

  it("today scopes by the action's own workspace or its project's, only when one is given", () => {
    const startOfToday = new Date(2026, 8, 16);
    expect(myActionsTodayWhere("u1", startOfToday, "w1").AND).toContainEqual({
      OR: [{ workspaceId: "w1" }, { project: { workspaceId: "w1" } }],
    });
    expect(myActionsTodayWhere("u1", startOfToday).AND).toHaveLength(2);
  });

  it("today selects exactly the /today partition's todays bucket", () => {
    const startOfToday = new Date(2026, 8, 16);
    const at = (day: number, hour = 9) => new Date(2026, 8, day, hour);
    const base = { status: "ACTIVE", projectId: "p1", dueDate: null, scheduledStart: null };
    const actions = [
      // The #838 shape: rescheduled to today, no deadline.
      { ...base, id: "scheduled-today", scheduledStart: at(16) },
      { ...base, id: "scheduled-late-tonight", scheduledStart: at(16, 23) },
      { ...base, id: "due-today", dueDate: at(16) },
      // Past-due, rescheduled for today: schedule wins.
      { ...base, id: "past-due-scheduled-today", dueDate: at(10), scheduledStart: at(16) },
      // Due today but scheduled for tomorrow: schedule wins the other way.
      { ...base, id: "due-today-scheduled-tomorrow", dueDate: at(16), scheduledStart: at(17) },
      { ...base, id: "scheduled-yesterday", scheduledStart: at(15) },
      { ...base, id: "scheduled-tomorrow-midnight", scheduledStart: at(17, 0) },
      { ...base, id: "due-tomorrow", dueDate: at(17) },
      { ...base, id: "undated" },
    ];

    // The date clause of the WHERE, evaluated against each row.
    const dateClause = myActionsTodayWhere("u1", startOfToday).AND as Prisma.ActionWhereInput[];
    const inRange = (v: Date | null, r: { gte: Date; lt: Date }) =>
      v !== null && v >= r.gte && v < r.lt;
    const matches = (a: (typeof actions)[number]) =>
      (dateClause[1]!.OR as Array<{ scheduledStart: unknown; dueDate?: { gte: Date; lt: Date } }>).some((branch) =>
        branch.scheduledStart === null
          ? a.scheduledStart === null && inRange(a.dueDate, branch.dueDate!)
          : inRange(a.scheduledStart, branch.scheduledStart as { gte: Date; lt: Date }),
      );

    const bucket = partitionActions(actions, { today: startOfToday }).todays.map((a) => a.id).sort();
    expect(actions.filter(matches).map((a) => a.id).sort()).toEqual(bucket);
    expect(bucket).toEqual([
      "due-today",
      "past-due-scheduled-today",
      "scheduled-late-tonight",
      "scheduled-today",
    ]);
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
