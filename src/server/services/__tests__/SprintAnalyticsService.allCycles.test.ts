/**
 * Tests for the all-cycles roll-up behind the Metrics page headline.
 *
 * These pin the parts that are easy to get subtly wrong: summing across cycles
 * without double-counting a PR that lands in two overlapping cycle windows,
 * dropping empty cycles from the trend series, and never emitting NaN.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

import type { PrismaClient } from "@prisma/client";
import { SprintAnalyticsService } from "../SprintAnalyticsService";

interface CycleRow {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface TicketRow {
  cycleId: string;
  status: string;
  points: number | null;
}

interface PrRow {
  prNumber: number;
  repoFullName: string;
  /** When set, the PR is a merge event; otherwise it's an `opened` event. */
  prMergedAt?: Date;
  eventTimestamp?: Date;
}

/**
 * Minimal Prisma stub for `getAllCyclesMetrics`: canned cycles, tickets and
 * GitHubActivity rows. `gitHubActivity.findMany` branches on the query the
 * service issues (merged rows vs `opened` rows).
 */
function makeService(opts: {
  cycles: CycleRow[];
  tickets: TicketRow[];
  merged?: PrRow[];
  opened?: PrRow[];
}) {
  const prisma = {
    list: {
      findMany: vi.fn().mockResolvedValue(opts.cycles),
    },
    ticket: {
      findMany: vi.fn().mockResolvedValue(opts.tickets),
    },
    gitHubActivity: {
      findMany: vi
        .fn()
        .mockImplementation(
          (args: {
            where: {
              eventAction?: string;
              prMergedAt?: { gte?: Date; lte?: Date };
            };
          }) => {
            if (args.where.eventAction === "opened") {
              return Promise.resolve(opts.opened ?? []);
            }
            // Honour the merge-time window the caller asked for, so tests
            // actually exercise the bounded query rather than silently
            // relying on the in-memory filter downstream.
            const { gte, lte } = args.where.prMergedAt ?? {};
            const rows = (opts.merged ?? []).filter((row) => {
              if (!row.prMergedAt) return false;
              if (gte && row.prMergedAt < gte) return false;
              if (lte && row.prMergedAt > lte) return false;
              return true;
            });
            return Promise.resolve(rows);
          },
        ),
    },
  } as unknown as PrismaClient;

  return new SprintAnalyticsService(prisma);
}

const HOUR = 60 * 60 * 1000;

describe("SprintAnalyticsService.getAllCyclesMetrics", () => {
  it("sums ticket metrics across cycles and returns them oldest → newest", async () => {
    const service = makeService({
      cycles: [
        {
          id: "c1",
          name: "Cycle 1",
          status: "COMPLETED",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-14"),
        },
        {
          id: "c2",
          name: "Cycle 2",
          status: "ACTIVE",
          startDate: new Date("2026-01-15"),
          endDate: new Date("2026-01-28"),
        },
      ],
      tickets: [
        { cycleId: "c1", status: "DONE", points: 3 },
        { cycleId: "c1", status: "DEPLOYED", points: 2 },
        { cycleId: "c1", status: "IN_PROGRESS", points: 5 },
        { cycleId: "c2", status: "DONE", points: null },
        { cycleId: "c2", status: "BACKLOG", points: 1 },
      ],
    });

    const result = await service.getAllCyclesMetrics("ws-1");

    expect(result.cycleCount).toBe(2);
    expect(result.totalTickets).toBe(5);
    expect(result.completedTickets).toBe(3); // 2 in c1 + 1 in c2
    expect(result.completedPoints).toBe(5); // 3 + 2 + 0
    expect(result.totalPoints).toBe(11);
    expect(result.completionRate).toBeCloseTo(60); // 3/5

    expect(result.cycles.map((c) => c.cycleName)).toEqual([
      "Cycle 1",
      "Cycle 2",
    ]);
    expect(result.cycles[0]).toMatchObject({
      completedTickets: 2,
      completedPoints: 5,
      totalTickets: 3,
    });
    expect(result.cycles[0]?.completionRate).toBeCloseTo(66.67, 1);
    expect(result.cycles[1]).toMatchObject({
      completedTickets: 1,
      completedPoints: 0,
      totalTickets: 2,
      completionRate: 50,
    });
  });

  it("drops cycles with no tickets from the series", async () => {
    const service = makeService({
      cycles: [
        {
          id: "c1",
          name: "Cycle 1",
          status: "COMPLETED",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-14"),
        },
        {
          id: "c2",
          name: "Empty future cycle",
          status: "PLANNED",
          startDate: new Date("2026-02-01"),
          endDate: new Date("2026-02-14"),
        },
      ],
      tickets: [{ cycleId: "c1", status: "DONE", points: 1 }],
    });

    const result = await service.getAllCyclesMetrics("ws-1");

    expect(result.cycleCount).toBe(1);
    expect(result.cycles.map((c) => c.cycleName)).toEqual(["Cycle 1"]);
  });

  it("counts a PR merged inside two overlapping cycle windows only once overall", async () => {
    const mergedAt = new Date("2026-01-14T12:00:00Z");
    const service = makeService({
      cycles: [
        {
          id: "c1",
          name: "Cycle 1",
          status: "COMPLETED",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-20"),
        },
        {
          id: "c2",
          name: "Cycle 2",
          status: "COMPLETED",
          // Overlaps c1's window — the PR falls in both.
          startDate: new Date("2026-01-10"),
          endDate: new Date("2026-01-31"),
        },
      ],
      tickets: [
        { cycleId: "c1", status: "DONE", points: 1 },
        { cycleId: "c2", status: "DONE", points: 1 },
      ],
      merged: [{ prNumber: 7, repoFullName: "acme/app", prMergedAt: mergedAt }],
      opened: [
        {
          prNumber: 7,
          repoFullName: "acme/app",
          eventTimestamp: new Date(mergedAt.getTime() - 4 * HOUR),
        },
      ],
    });

    const result = await service.getAllCyclesMetrics("ws-1");

    // Both cycle windows contain it…
    expect(result.cycles[0]?.mergedPrCount).toBe(1);
    expect(result.cycles[1]?.mergedPrCount).toBe(1);
    // …but the roll-up counts the PR once.
    expect(result.mergedPrCount).toBe(1);
    expect(result.avgPrHours).toBeCloseTo(4);
    expect(result.medianPrHours).toBeCloseTo(4);
  });

  it("counts an unmeasurable PR (no opened event) without producing NaN", async () => {
    const service = makeService({
      cycles: [
        {
          id: "c1",
          name: "Cycle 1",
          status: "COMPLETED",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-14"),
        },
      ],
      tickets: [{ cycleId: "c1", status: "DONE", points: 1 }],
      merged: [
        {
          prNumber: 9,
          repoFullName: "acme/app",
          prMergedAt: new Date("2026-01-05"),
        },
      ],
      opened: [], // never captured
    });

    const result = await service.getAllCyclesMetrics("ws-1");

    expect(result.mergedPrCount).toBe(1);
    expect(result.avgPrHours).toBeNull();
    expect(result.medianPrHours).toBeNull();
    expect(result.cycles[0]?.avgPrHours).toBeNull();
  });

  it("ignores PRs merged outside every cycle window", async () => {
    const service = makeService({
      cycles: [
        {
          id: "c1",
          name: "Cycle 1",
          status: "COMPLETED",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-14"),
        },
      ],
      tickets: [{ cycleId: "c1", status: "DONE", points: 1 }],
      merged: [
        {
          prNumber: 11,
          repoFullName: "acme/app",
          prMergedAt: new Date("2026-03-01"), // long after the cycle
        },
      ],
      opened: [
        {
          prNumber: 11,
          repoFullName: "acme/app",
          eventTimestamp: new Date("2026-02-28"),
        },
      ],
    });

    const result = await service.getAllCyclesMetrics("ws-1");

    expect(result.mergedPrCount).toBe(0);
    expect(result.cycles[0]?.mergedPrCount).toBe(0);
  });

  /**
   * The Metrics page reads the same cycle through two independent code paths:
   * the batched roll-up below the chart, and `getCycleTicketMetrics` in the
   * per-cycle breakdown. They sum tickets with separate loops, so a change to
   * one could silently disagree with the other — exactly the drift ADR-0047
   * set out to prevent. This pins them together.
   */
  it("agrees with getCycleTicketMetrics for the same cycle", async () => {
    const tickets = [
      { cycleId: "c1", status: "DONE", points: 3 },
      { cycleId: "c1", status: "DEPLOYED", points: null },
      { cycleId: "c1", status: "IN_PROGRESS", points: 5 },
      { cycleId: "c1", status: "QA", points: 2 },
    ];
    const cycle = {
      id: "c1",
      name: "Cycle 1",
      status: "COMPLETED",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-14"),
    };

    const prisma = {
      list: {
        findMany: vi.fn().mockResolvedValue([cycle]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(cycle),
      },
      ticket: {
        findMany: vi.fn().mockResolvedValue(tickets),
      },
      gitHubActivity: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const service = new SprintAnalyticsService(prisma);

    const rollUp = await service.getAllCyclesMetrics("ws-1");
    const single = await service.getCycleTicketMetrics("c1");

    const row = rollUp.cycles[0]!;
    expect(row.totalTickets).toBe(single.totalTickets);
    expect(row.completedTickets).toBe(single.completedTickets);
    expect(row.completedPoints).toBe(single.completedPoints);
    expect(row.totalPoints).toBe(single.totalPoints);
    expect(row.completionRate).toBeCloseTo(single.completionRate);
    // …and the roll-up totals equal the single cycle, there being only one.
    expect(rollUp.completedTickets).toBe(single.completedTickets);
    expect(rollUp.totalPoints).toBe(single.totalPoints);
  });

  it("returns a zeroed result (no NaN) for a workspace with no cycles", async () => {
    const service = makeService({ cycles: [], tickets: [] });

    const result = await service.getAllCyclesMetrics("ws-1");

    expect(result).toMatchObject({
      cycleCount: 0,
      totalTickets: 0,
      completedTickets: 0,
      completionRate: 0,
      mergedPrCount: 0,
      avgPrHours: null,
      cycles: [],
    });
    expect(Number.isNaN(result.completionRate)).toBe(false);
  });
});
