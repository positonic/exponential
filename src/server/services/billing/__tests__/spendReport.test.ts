/**
 * The admin spend report: the numbers the assistant allowance is sized from.
 * The percentile has to read directly as "an allowance of X would have
 * covered N% of these workspaces", so it is checked on small hand-countable
 * lists. Mocked Prisma; no database.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { getSpendReport, nearestRankPercentile, SPEND_REPORT_ROW_LIMIT } from "../spendReport";

describe("nearestRankPercentile", () => {
  const TEN = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("is the smallest value that the given share of the list is at or under", () => {
    expect(nearestRankPercentile(TEN, 50)).toBe(50);
    expect(nearestRankPercentile(TEN, 80)).toBe(80);
    expect(nearestRankPercentile(TEN, 90)).toBe(90);
    expect(nearestRankPercentile(TEN, 100)).toBe(100);
  });

  it("rounds the rank up, so the share covered is never less than asked for", () => {
    // 80% of 4 workspaces is 3.2, so it takes the 4th to cover 80%.
    expect(nearestRankPercentile([1, 2, 3, 4], 80)).toBe(4);
    expect(nearestRankPercentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it("does not depend on the order the values arrive in", () => {
    expect(nearestRankPercentile([90, 10, 50, 30, 70], 80)).toBe(70);
  });

  it("is the only value for a list of one, and nothing for an empty list", () => {
    expect(nearestRankPercentile([42], 50)).toBe(42);
    expect(nearestRankPercentile([42], 90)).toBe(42);
    expect(nearestRankPercentile([], 80)).toBeNull();
  });
});

describe("getSpendReport", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
  const NOVEMBER = new Date("2026-11-15T10:00:00Z");

  /** The month's per-workspace counters, as the query returns them: highest first. */
  function monthHas(periods: Array<{ workspaceId: string; costMicros: number }>) {
    db.workspaceUsagePeriod.findMany.mockResolvedValue(
      [...periods].sort((a, b) => b.costMicros - a.costMicros) as never,
    );
  }

  beforeEach(() => {
    mockReset(db);
    monthHas([]);
    db.usageEvent.groupBy.mockResolvedValue([] as never);
    db.workspace.findMany.mockResolvedValue([] as never);
  });

  it("reports on the whole calendar month, in UTC", async () => {
    const report = await getSpendReport(db, NOVEMBER);

    expect(report.periodStart).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(report.periodEnd).toEqual(new Date("2026-12-01T00:00:00.000Z"));
    expect(db.workspaceUsagePeriod.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { periodStart: new Date("2026-11-01T00:00:00.000Z"), costMicros: { gt: 0 } },
    });
  });

  it("totals the month and places the allowance percentiles across workspaces", async () => {
    monthHas([
      { workspaceId: "a", costMicros: 100_000 },
      { workspaceId: "b", costMicros: 200_000 },
      { workspaceId: "c", costMicros: 300_000 },
      { workspaceId: "d", costMicros: 400_000 },
      { workspaceId: "e", costMicros: 9_000_000 },
    ]);

    const report = await getSpendReport(db, NOVEMBER);

    expect(report.totalMicros).toBe(10_000_000);
    expect(report.workspacesWithSpend).toBe(5);
    // One heavy workspace moves the total, not what most workspaces need.
    expect(report.percentiles).toEqual({ p50: 300_000, p80: 400_000, p90: 9_000_000 });
  });

  it("lists workspaces highest spend first, with their names and turn counts", async () => {
    monthHas([
      { workspaceId: "ws-small", costMicros: 50_000 },
      { workspaceId: "ws-big", costMicros: 2_500_000 },
    ]);
    db.workspace.findMany.mockResolvedValue([
      { id: "ws-small", name: "Small Co", slug: "small", type: "team" },
      { id: "ws-big", name: "Big Co", slug: "big", type: "team" },
    ] as never);
    db.usageEvent.groupBy.mockImplementation((async (args: { by: string[] }) =>
      args.by.includes("workspaceId")
        ? [
            { workspaceId: "ws-small", _count: { _all: 4 } },
            { workspaceId: "ws-big", _count: { _all: 310 } },
          ]
        : []) as never);

    const report = await getSpendReport(db, NOVEMBER);

    expect(report.workspaces).toEqual([
      { workspaceId: "ws-big", name: "Big Co", slug: "big", type: "team", costMicros: 2_500_000, events: 310 },
      { workspaceId: "ws-small", name: "Small Co", slug: "small", type: "team", costMicros: 50_000, events: 4 },
    ]);
  });

  it("keeps a deleted workspace's spend in the report", async () => {
    monthHas([{ workspaceId: "ws-gone", costMicros: 700_000 }]);

    const report = await getSpendReport(db, NOVEMBER);

    expect(report.totalMicros).toBe(700_000);
    expect(report.workspaces).toEqual([
      { workspaceId: "ws-gone", name: null, slug: null, type: null, costMicros: 700_000, events: 0 },
    ]);
  });

  it("splits hosted spend by source and keeps own-key turns apart", async () => {
    db.usageEvent.groupBy.mockImplementation((async (args: { by: string[] }) =>
      args.by.includes("source")
        ? [
            { source: "CHAT", onOwnKey: false, _sum: { costMicros: 800_000 }, _count: { _all: 120 } },
            { source: "AGENT_RUN", onOwnKey: false, _sum: { costMicros: 1_500_000 }, _count: { _all: 9 } },
            { source: "CHAT", onOwnKey: true, _sum: { costMicros: 4_000_000 }, _count: { _all: 600 } },
          ]
        : []) as never);

    const report = await getSpendReport(db, NOVEMBER);

    expect(report.bySource).toEqual([
      { source: "CHAT", costMicros: 800_000, events: 120 },
      { source: "AGENT_RUN", costMicros: 1_500_000, events: 9 },
      { source: "VOICE", costMicros: 0, events: 0 },
      { source: "DIRECT", costMicros: 0, events: 0 },
    ]);
    expect(report.ownKey).toEqual({ costMicros: 4_000_000, events: 600 });
  });

  it("summarises every workspace but lists only the highest spenders", async () => {
    const many = Array.from({ length: SPEND_REPORT_ROW_LIMIT + 25 }, (_, index) => ({
      workspaceId: `ws-${index}`,
      costMicros: 1_000 * (index + 1),
    }));
    monthHas(many);

    const report = await getSpendReport(db, NOVEMBER);

    expect(report.workspacesWithSpend).toBe(SPEND_REPORT_ROW_LIMIT + 25);
    expect(report.workspaces).toHaveLength(SPEND_REPORT_ROW_LIMIT);
    expect(report.workspaces[0]?.costMicros).toBe(1_000 * (SPEND_REPORT_ROW_LIMIT + 25));
    expect(report.totalMicros).toBe(many.reduce((sum, period) => sum + period.costMicros, 0));
  });

  it("is empty, not an error, for a month with no metered use", async () => {
    const report = await getSpendReport(db, NOVEMBER);

    expect(report).toMatchObject({
      totalMicros: 0,
      workspacesWithSpend: 0,
      percentiles: { p50: null, p80: null, p90: null },
      ownKey: { costMicros: 0, events: 0 },
      workspaces: [],
    });
  });
});
