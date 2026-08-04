import { describe, expect, it } from "vitest";
import { partitionActions } from "../partition";
import {
  COHORT_MIN_SIZE,
  daysOverdue,
  groupOverdueCohorts,
  type TriageableAction,
} from "../triage";

// A fixed "today" so the suite is deterministic regardless of the wall clock.
const TODAY = new Date("2026-08-04T09:00:00.000Z");

function action(overrides: Partial<TriageableAction> = {}): TriageableAction {
  return {
    id: Math.random().toString(36).slice(2),
    name: "an action",
    status: "ACTIVE",
    priority: "Quick",
    scheduledStart: null,
    dueDate: null,
    projectId: null,
    completedAt: null,
    project: null,
    ...overrides,
  };
}

/** N actions sharing one exact instant — the signature of a bulk write. */
function bulk(
  n: number,
  stamp: string,
  overrides: Partial<TriageableAction> = {},
): TriageableAction[] {
  return Array.from({ length: n }, (_, i) =>
    action({ id: `bulk-${stamp}-${i}`, dueDate: new Date(stamp), ...overrides }),
  );
}

describe("groupOverdueCohorts", () => {
  it("groups actions sharing an exact instant into one cohort", () => {
    const stamp = "2026-07-25T08:29:55.483Z";
    const { cohorts, loose } = groupOverdueCohorts(bulk(17, stamp), {
      today: TODAY,
    });

    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]!.count).toBe(17);
    expect(cohorts[0]!.stampedAt.toISOString()).toBe(stamp);
    expect(cohorts[0]!.daysOverdue).toBe(10);
    expect(loose).toHaveLength(0);
  });

  it("leaves individually-dated actions loose even when they share a calendar day", () => {
    // Same day, different instants — a human dating things one at a time.
    const sameDay = [
      action({ id: "a", dueDate: new Date("2026-07-25T08:29:55.483Z") }),
      action({ id: "b", dueDate: new Date("2026-07-25T11:02:13.001Z") }),
      action({ id: "c", dueDate: new Date("2026-07-25T16:44:09.777Z") }),
    ];

    const { cohorts, loose } = groupOverdueCohorts(sameDay, { today: TODAY });

    expect(cohorts).toHaveLength(0);
    expect(loose.map((a) => a.id).sort()).toEqual(["a", "b", "c"]);
  });

  it(`needs ${COHORT_MIN_SIZE} members before a shared instant counts as a cohort`, () => {
    const pair = bulk(COHORT_MIN_SIZE - 1, "2026-07-25T08:29:55.483Z");
    expect(groupOverdueCohorts(pair, { today: TODAY }).cohorts).toHaveLength(0);

    const trio = bulk(COHORT_MIN_SIZE, "2026-07-25T08:29:55.483Z");
    expect(groupOverdueCohorts(trio, { today: TODAY }).cohorts).toHaveLength(1);
  });

  it("separates multiple bulk writes and orders them biggest first", () => {
    const overdue = [
      ...bulk(4, "2026-07-23T07:00:00.000Z"),
      ...bulk(17, "2026-07-25T08:29:55.483Z"),
      action({ id: "solo", dueDate: new Date("2026-07-30T22:00:00.000Z") }),
    ];

    const triage = groupOverdueCohorts(overdue, { today: TODAY });

    expect(triage.totalOverdue).toBe(22);
    expect(triage.cohorts.map((c) => c.count)).toEqual([17, 4]);
    expect(triage.cohortCount).toBe(21);
    expect(triage.loose.map((a) => a.id)).toEqual(["solo"]);
  });

  it("reports the distinct projects a cohort spans, so it can be explained", () => {
    const overdue = [
      ...bulk(2, "2026-07-25T08:29:55.483Z", {
        project: { name: "Net Worth Baseline" },
      }),
      ...bulk(2, "2026-07-25T08:29:55.483Z", {
        project: { name: "Tax Reserve System" },
      }),
    ];
    // Both helpers stamp ids by index, so de-dupe ids before grouping.
    const unique = overdue.map((a, i) => ({ ...a, id: `a${i}` }));

    const { cohorts } = groupOverdueCohorts(unique, { today: TODAY });

    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]!.projectNames.sort()).toEqual([
      "Net Worth Baseline",
      "Tax Reserve System",
    ]);
  });

  it("keys the cohort on scheduledStart when present (schedule wins, as in partitionActions)", () => {
    // Identical scheduledStart, differing dueDates: still one bulk write.
    const overdue = Array.from({ length: 3 }, (_, i) =>
      action({
        id: `s${i}`,
        scheduledStart: new Date("2026-07-25T08:29:55.483Z"),
        dueDate: new Date(`2026-07-2${i + 1}T12:00:00.000Z`),
      }),
    );

    const { cohorts } = groupOverdueCohorts(overdue, { today: TODAY });

    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]!.count).toBe(3);
  });

  it("orders loose debt oldest first", () => {
    const overdue = [
      action({ id: "recent", dueDate: new Date("2026-08-02T12:00:00.000Z") }),
      action({ id: "ancient", dueDate: new Date("2026-06-01T12:00:00.000Z") }),
      action({ id: "middling", dueDate: new Date("2026-07-15T12:00:00.000Z") }),
    ];

    const { loose } = groupOverdueCohorts(overdue, { today: TODAY });

    expect(loose.map((a) => a.id)).toEqual(["ancient", "middling", "recent"]);
  });

  it("consumes partitionActions output directly (the real call path)", () => {
    // A mixed pile: a bulk-dated plan, one real overdue item, one due today,
    // one completed. Only the overdue ones should reach triage.
    const all = [
      ...bulk(3, "2026-07-25T08:29:55.483Z"),
      action({ id: "real", dueDate: new Date("2026-07-30T09:00:00.000Z") }),
      action({ id: "today", dueDate: new Date("2026-08-04T09:00:00.000Z") }),
      action({
        id: "done",
        status: "COMPLETED",
        dueDate: new Date("2026-07-01T09:00:00.000Z"),
      }),
    ];

    const { overdue } = partitionActions(all, { today: TODAY });
    const triage = groupOverdueCohorts(overdue, { today: TODAY });

    expect(triage.totalOverdue).toBe(4);
    expect(triage.cohorts).toHaveLength(1);
    expect(triage.cohorts[0]!.count).toBe(3);
    expect(triage.loose.map((a) => a.id)).toEqual(["real"]);
  });
});

describe("daysOverdue", () => {
  it("counts whole days from the anchor to today", () => {
    expect(
      daysOverdue({ scheduledStart: null, dueDate: new Date("2026-07-25T08:29:55.483Z") }, TODAY),
    ).toBe(10);
  });

  it("prefers scheduledStart over dueDate, matching overdueAnchor", () => {
    expect(
      daysOverdue(
        {
          scheduledStart: new Date("2026-08-01T08:00:00.000Z"),
          dueDate: new Date("2026-06-01T08:00:00.000Z"),
        },
        TODAY,
      ),
    ).toBe(3);
  });

  it("returns 0 when there is no anchor at all", () => {
    expect(daysOverdue({ scheduledStart: null, dueDate: null }, TODAY)).toBe(0);
  });
});
