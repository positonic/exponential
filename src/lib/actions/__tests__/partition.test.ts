import { describe, expect, it } from "vitest";
import { partitionActions, type PartitionableAction } from "../partition";

// A fixed "today" so the suite is deterministic regardless of the wall clock.
const TODAY = new Date("2026-06-29T09:00:00.000Z");

function at(day: string, time = "12:00:00.000Z"): Date {
  return new Date(`${day}T${time}`);
}

function action(overrides: Partial<PartitionableAction> = {}): PartitionableAction {
  return {
    id: Math.random().toString(36).slice(2),
    status: "ACTIVE",
    priority: "Quick",
    scheduledStart: null,
    dueDate: null,
    projectId: null,
    completedAt: null,
    ...overrides,
  };
}

describe("partitionActions", () => {
  it("buckets a scheduled-today action with NO due date into `todays` (the Pay Malte shape)", () => {
    const malte = action({
      id: "malte",
      scheduledStart: at("2026-06-29", "14:24:00.000Z"), // 2:24 PM today, no dueDate
      dueDate: null,
    });

    const { todays, overdue, inbox, upcoming } = partitionActions([malte], {
      today: TODAY,
    });

    expect(todays.map((a) => a.id)).toEqual(["malte"]);
    expect(overdue).toHaveLength(0);
    expect(inbox).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it("buckets a due-today action with no schedule into `todays`", () => {
    const a = action({ id: "due-today", dueDate: at("2026-06-29") });
    const { todays } = partitionActions([a], { today: TODAY });
    expect(todays.map((x) => x.id)).toEqual(["due-today"]);
  });

  it("buckets a scheduled-before-today action into `overdue`", () => {
    const a = action({ id: "past", scheduledStart: at("2026-06-27") });
    const { overdue, todays } = partitionActions([a], { today: TODAY });
    expect(overdue.map((x) => x.id)).toEqual(["past"]);
    expect(todays).toHaveLength(0);
  });

  it("buckets a scheduled-after-tomorrow action into `upcoming`", () => {
    const a = action({ id: "future", scheduledStart: at("2026-07-05") });
    const { upcoming, todays } = partitionActions([a], { today: TODAY });
    expect(upcoming.map((x) => x.id)).toEqual(["future"]);
    expect(todays).toHaveLength(0);
  });

  it("buckets a no-schedule/no-due/no-project action into `inbox`", () => {
    const a = action({ id: "loose" });
    const { inbox } = partitionActions([a], { today: TODAY });
    expect(inbox.map((x) => x.id)).toEqual(["loose"]);
  });

  it("does NOT put a no-schedule/no-due action that has a project into inbox", () => {
    const a = action({ id: "projected", projectId: "proj-1" });
    const { inbox, todays, overdue, upcoming } = partitionActions([a], {
      today: TODAY,
    });
    expect(inbox).toHaveLength(0);
    expect(todays).toHaveLength(0);
    expect(overdue).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it("scheduled-today wins over a due date on another day (scheduled-or-due boundary)", () => {
    // Scheduled today but due far in the future: still `todays`, because
    // scheduled-today is evaluated before the due-date fallback.
    const a = action({
      id: "sched-wins",
      scheduledStart: at("2026-06-29", "08:00:00.000Z"),
      dueDate: at("2026-07-20"),
    });
    const { todays, upcoming } = partitionActions([a], { today: TODAY });
    expect(todays.map((x) => x.id)).toEqual(["sched-wins"]);
    expect(upcoming).toHaveLength(0);
  });

  it("keeps a due-today action that is also scheduled today in `todays` (no double-count)", () => {
    const a = action({
      id: "both",
      scheduledStart: at("2026-06-29", "10:00:00.000Z"),
      dueDate: at("2026-06-29"),
    });
    const { todays } = partitionActions([a], { today: TODAY });
    expect(todays.map((x) => x.id)).toEqual(["both"]);
  });

  it("routes COMPLETED to `completed` and drops non-ACTIVE statuses", () => {
    const done = action({
      id: "done",
      status: "COMPLETED",
      completedAt: at("2026-06-29", "08:00:00.000Z"),
    });
    const deleted = action({ id: "gone", status: "DELETED" });
    const draft = action({ id: "draft", status: "DRAFT" });

    const { completed, todays, overdue, inbox, upcoming } = partitionActions(
      [done, deleted, draft],
      { today: TODAY },
    );

    expect(completed.map((x) => x.id)).toEqual(["done"]);
    expect([...todays, ...overdue, ...inbox, ...upcoming]).toHaveLength(0);
  });

  it("sorts each active bucket by priority then id", () => {
    const a = action({ id: "b", priority: "Quick", scheduledStart: at("2026-06-29", "09:00:00.000Z") });
    const b = action({ id: "a", priority: "1st Priority", scheduledStart: at("2026-06-29", "10:00:00.000Z") });
    const c = action({ id: "c", priority: "Quick", scheduledStart: at("2026-06-29", "11:00:00.000Z") });

    const { todays } = partitionActions([a, b, c], { today: TODAY });
    // Highest priority ("1st Priority") first, then "Quick" ties broken by id.
    expect(todays.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("does not read the wall clock — same input + same `today` is stable", () => {
    const set = [
      action({ id: "x", scheduledStart: at("2026-06-29", "14:24:00.000Z") }),
      action({ id: "y", dueDate: at("2026-06-29") }),
      action({ id: "z" }),
    ];
    const first = partitionActions(set, { today: TODAY });
    const second = partitionActions(set, { today: TODAY });
    expect(first.todays.map((a) => a.id)).toEqual(second.todays.map((a) => a.id));
    expect(first.inbox.map((a) => a.id)).toEqual(second.inbox.map((a) => a.id));
  });
});
