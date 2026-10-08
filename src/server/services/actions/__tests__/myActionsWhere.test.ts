import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  myActionsDueTodayWhere,
  myActionsOwnershipWhere,
  myActionsTodayWhere,
  serverLocalDay,
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

  it("the server's local day spans midnight to the next midnight", () => {
    const now = new Date(2026, 8, 16, 15, 42, 7);
    expect(serverLocalDay(now)).toEqual({ start: new Date(2026, 8, 16), end: new Date(2026, 8, 17) });
    // The caller's clock is not mutated.
    expect(now.getHours()).toBe(15);
  });

  it("due today is my active actions with a deadline in the day, scoped by project workspace", () => {
    const day = serverLocalDay(new Date(2026, 8, 16, 9));
    expect(myActionsDueTodayWhere("u1", day)).toEqual({
      ...myActionsOwnershipWhere("u1"),
      dueDate: { gte: day.start, lt: day.end },
      status: "ACTIVE",
    });
    expect(myActionsDueTodayWhere("u1", day, "w1")).toMatchObject({ project: { workspaceId: "w1" } });
  });

  it("today is scheduled in the day, or unscheduled and due in it", () => {
    const day = serverLocalDay(new Date(2026, 8, 16));
    const inDay = { gte: day.start, lt: day.end };

    expect(myActionsTodayWhere("u1", day)).toEqual({
      AND: [
        myActionsOwnershipWhere("u1"),
        {
          OR: [
            { scheduledStart: inDay },
            { scheduledStart: null, dueDate: inDay },
          ],
        },
      ],
      status: "ACTIVE",
    });
  });

  it("today scopes by the action's own workspace or its project's, only when one is given", () => {
    const day = serverLocalDay(new Date(2026, 8, 16));
    expect(myActionsTodayWhere("u1", day, "w1").AND).toContainEqual({
      OR: [{ workspaceId: "w1" }, { project: { workspaceId: "w1" } }],
    });
    expect(myActionsTodayWhere("u1", day).AND).toHaveLength(2);
  });

  type Row = {
    id: string;
    status: string;
    projectId: string | null;
    dueDate: Date | null;
    scheduledStart: Date | null;
  };
  type Range = { gte: Date; lt: Date };

  /** Evaluates the date clause of `myActionsTodayWhere` against a row. */
  function matchesToday(where: Prisma.ActionWhereInput, a: Row): boolean {
    const inRange = (v: Date | null, r: Range) => v !== null && v >= r.gte && v < r.lt;
    const branches = (where.AND as Prisma.ActionWhereInput[])[1]!.OR as Array<{
      scheduledStart: Range | null;
      dueDate?: Range;
    }>;
    return branches.some((branch) =>
      branch.scheduledStart === null
        ? a.scheduledStart === null && inRange(a.dueDate, branch.dueDate!)
        : inRange(a.scheduledStart, branch.scheduledStart),
    );
  }

  function expectParity(rows: Row[], dayOf: Date) {
    const day = serverLocalDay(dayOf);
    const bucket = partitionActions(rows, { today: day.start }).todays.map((a) => a.id).sort();
    const where = myActionsTodayWhere("u1", day);
    expect(rows.filter((a) => matchesToday(where, a)).map((a) => a.id).sort()).toEqual(bucket);
    return bucket;
  }

  it("today selects exactly the /today partition's todays bucket", () => {
    const at = (day: number, hour = 9) => new Date(2026, 8, day, hour);
    const base = { status: "ACTIVE", projectId: "p1", dueDate: null, scheduledStart: null };
    const rows: Row[] = [
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

    expect(expectParity(rows, at(16))).toEqual([
      "due-today",
      "past-due-scheduled-today",
      "scheduled-late-tonight",
      "scheduled-today",
    ]);
  });

  it("today agrees with the partition across a DST change", () => {
    // A zone with DST, so the change days are really 25 and 23 hours long
    // (CI runs in UTC, where they aren't). Node re-reads TZ on change.
    const previousTz = process.env.TZ;
    process.env.TZ = "Europe/Berlin";
    try {
      // Clocks go back on 2026-10-25 and forward on 2026-03-29. A flat 24h
      // window would drop the late action on the first and take in the
      // next day's early one on the second.
      const base = { status: "ACTIVE", projectId: "p1", dueDate: null };
      for (const [y, m, d] of [[2026, 9, 25], [2026, 2, 29]] as const) {
        const rows: Row[] = [
          { ...base, id: "late", scheduledStart: new Date(y, m, d, 23, 30) },
          { ...base, id: "next-day-early", scheduledStart: new Date(y, m, d + 1, 0, 30) },
        ];
        expect(serverLocalDay(new Date(y, m, d, 12)).end.getTime()
          - serverLocalDay(new Date(y, m, d, 12)).start.getTime()).not.toBe(24 * 60 * 60 * 1000);
        expect(expectParity(rows, new Date(y, m, d, 12))).toEqual(["late"]);
      }
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
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
