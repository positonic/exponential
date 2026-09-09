import { describe, expect, it } from "vitest";
import {
  computeCyclePacing,
  computeCycleRollup,
  type RollupTicket,
} from "../cycleRollup";

const cycle = {
  id: "cy1",
  name: "Cycle 15",
  status: "ACTIVE",
  startDate: new Date("2026-09-03T00:00:00.000Z"),
  endDate: new Date("2026-09-17T00:00:00.000Z"),
};

let seq = 0;
function ticket(overrides: Partial<RollupTicket> = {}): RollupTicket {
  seq += 1;
  return {
    id: `t${seq}`,
    shortId: null,
    number: seq,
    title: `Ticket ${seq}`,
    status: "COMMITTED",
    points: null,
    assigneeId: null,
    ...overrides,
  };
}

describe("computeCycleRollup", () => {
  it("counts tickets when none carry points", () => {
    const r = computeCycleRollup(
      cycle,
      [ticket({ status: "DONE" }), ticket({ status: "IN_PROGRESS" }), ticket()],
      { userId: "u1" },
    );
    expect(r.usesPoints).toBe(false);
    expect([r.committed, r.completed, r.inProgress]).toEqual([3, 1, 1]);
  });

  it("weights by points as soon as any ticket has them (unpointed tickets weigh 0)", () => {
    const r = computeCycleRollup(
      cycle,
      [
        ticket({ status: "DEPLOYED", points: 3 }),
        ticket({ status: "IN_PROGRESS", points: 2 }),
        ticket({ status: "ARCHIVED", points: null }),
        ticket({ status: "COMMITTED", points: 5 }),
      ],
      { userId: "u1" },
    );
    expect(r.usesPoints).toBe(true);
    expect([r.committed, r.completed, r.inProgress]).toEqual([10, 3, 2]);
  });

  it("lists status counts in workflow order", () => {
    const r = computeCycleRollup(
      cycle,
      [ticket({ status: "QA" }), ticket({ status: "BACKLOG" }), ticket({ status: "QA" })],
      { userId: "u1" },
    );
    expect(r.statusCounts).toEqual([
      { status: "BACKLOG", count: 1 },
      { status: "QA", count: 2 },
    ]);
  });

  it("orders my tickets by workflow status and caps them (default four)", () => {
    const mine = [
      ticket({ status: "DONE", assigneeId: "u1" }),
      ticket({ status: "IN_PROGRESS", assigneeId: "u1" }),
      ticket({ status: "BLOCKED", assigneeId: "u2" }),
      ticket({ status: "COMMITTED", assigneeId: "u1" }),
      ticket({ status: "QA", assigneeId: "u1" }),
      ticket({ status: "BACKLOG", assigneeId: "u1" }),
    ];
    const r = computeCycleRollup(cycle, mine, { userId: "u1" });
    expect(r.myTickets.map((t) => t.status)).toEqual([
      "BACKLOG",
      "COMMITTED",
      "IN_PROGRESS",
      "QA",
    ]);
    expect(r.myTickets[0]).not.toHaveProperty("assigneeId");
    expect(
      computeCycleRollup(cycle, mine, { userId: "u1", myTicketsLimit: 10 }).myTickets,
    ).toHaveLength(5);
  });

  it("passes the cycle identity through unchanged", () => {
    const r = computeCycleRollup(cycle, [], { userId: "u1" });
    expect(r).toMatchObject(cycle);
    expect([r.committed, r.completed, r.inProgress]).toEqual([0, 0, 0]);
  });
});

describe("computeCyclePacing", () => {
  // Midpoint of the 14-day window → 50% elapsed.
  const mid = new Date("2026-09-10T00:00:00.000Z");
  const at = (completed: number, committed = 100) =>
    computeCyclePacing({ ...cycle, committed, completed, inProgress: 0 }, mid);

  it("is ahead exactly at done = elapsed + 15", () => {
    expect(at(65).pace).toBe("ahead");
    expect(at(64).pace).toBe("ontrack");
  });

  it("is on pace exactly at done + 1 = elapsed, behind just below", () => {
    expect(at(49).pace).toBe("ontrack");
    expect(at(48).pace).toBe("behind");
  });

  it("reports elapsed time, days left and done/progress percentages", () => {
    const p = computeCyclePacing(
      { ...cycle, committed: 10, completed: 2, inProgress: 3 },
      mid,
    );
    expect(p.timePct).toBe(50);
    expect(p.daysLeft).toBe(7);
    expect(p.over).toBe(false);
    expect(p.donePct).toBe(20);
    expect(p.progPct).toBe(50);
  });

  it("goes negative on daysLeft and clamps elapsed once the cycle is over", () => {
    const p = computeCyclePacing(
      { ...cycle, committed: 4, completed: 4, inProgress: 0 },
      new Date("2026-09-19T12:00:00.000Z"),
    );
    expect(p.daysLeft).toBe(-2);
    expect(p.over).toBe(true);
    expect(p.timePct).toBe(100);
    // 100% done at 100% elapsed is on pace (ahead needs done ≥ elapsed + 15).
    expect(p.pace).toBe("ontrack");
  });

  it("has no pacing without both dates and no division by zero without commitments", () => {
    const p = computeCyclePacing(
      { startDate: null, endDate: null, committed: 0, completed: 0, inProgress: 0 },
      mid,
    );
    expect(p).toEqual({
      daysLeft: null,
      over: false,
      donePct: 0,
      progPct: 0,
      timePct: null,
      pace: null,
    });
  });

  it("accepts ISO strings for the dates (serialised router output)", () => {
    const p = computeCyclePacing(
      {
        startDate: "2026-09-03T00:00:00.000Z",
        endDate: "2026-09-17T00:00:00.000Z",
        committed: 1,
        completed: 0,
        inProgress: 0,
      },
      mid.getTime(),
    );
    expect(p.timePct).toBe(50);
  });
});
