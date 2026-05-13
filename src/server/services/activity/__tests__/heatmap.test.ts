/**
 * Unit tests for the heatmap level calculator. Pure function — no DB,
 * no mocked Prisma. Verifies the level-bucketing rules in isolation
 * before the reader service composes them with real counts.
 */

import { describe, it, expect } from "vitest";
import { calculateLevels } from "../heatmap";

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("calculateLevels", () => {
  it("returns all level 0 when every cell has count 0", () => {
    const cells = [
      { date: day("2026-01-01"), count: 0 },
      { date: day("2026-01-02"), count: 0 },
      { date: day("2026-01-03"), count: 0 },
    ];
    const result = calculateLevels(cells, { now: day("2026-01-03") });
    expect(result.map((c) => c.level)).toEqual([0, 0, 0]);
  });

  it("buckets uniform non-zero counts into L4 (saturated)", () => {
    const cells = [
      { date: day("2026-01-01"), count: 5 },
      { date: day("2026-01-02"), count: 5 },
      { date: day("2026-01-03"), count: 5 },
    ];
    const result = calculateLevels(cells, { now: day("2026-01-03") });
    expect(result.map((c) => c.level)).toEqual([4, 4, 4]);
  });

  it("never buckets a zero-count day into a non-zero level", () => {
    const cells = [
      { date: day("2026-01-01"), count: 0 },
      { date: day("2026-01-02"), count: 100 },
      { date: day("2026-01-03"), count: 0 },
    ];
    const result = calculateLevels(cells, { now: day("2026-01-03") });
    expect(result[0]!.level).toBe(0);
    expect(result[2]!.level).toBe(0);
    // Only one non-zero day → uniform → L4
    expect(result[1]!.level).toBe(4);
  });

  it("distributes a 1-to-4 spread across L1–L4", () => {
    const cells = [
      { date: day("2026-01-01"), count: 1 }, // min → L1
      { date: day("2026-01-02"), count: 2 },
      { date: day("2026-01-03"), count: 3 },
      { date: day("2026-01-04"), count: 4 }, // max → L4
    ];
    const result = calculateLevels(cells, { now: day("2026-01-04") });
    const levels = result.map((c) => c.level);
    expect(levels[0]).toBe(1);
    expect(levels[3]).toBe(4);
    // L1 ≤ rest ≤ L4 monotonically
    expect(levels[1]).toBeGreaterThanOrEqual(levels[0]!);
    expect(levels[2]).toBeGreaterThanOrEqual(levels[1]!);
    expect(levels[3]).toBeGreaterThanOrEqual(levels[2]!);
  });

  it("buckets the top of the range into L4 even with outliers", () => {
    const cells = [
      { date: day("2026-01-01"), count: 1 },
      { date: day("2026-01-02"), count: 1 },
      { date: day("2026-01-03"), count: 100 }, // outlier → still L4
    ];
    const result = calculateLevels(cells, { now: day("2026-01-03") });
    expect(result[2]!.level).toBe(4);
  });

  it("flags today's cell with isToday=true and only that cell", () => {
    const today = day("2026-05-13");
    const cells = [
      { date: day("2026-05-12"), count: 2 },
      { date: day("2026-05-13"), count: 3 },
      { date: day("2026-05-14"), count: 1 },
    ];
    const result = calculateLevels(cells, { now: today });
    const flags = result.map((c) => c.isToday);
    expect(flags).toEqual([false, true, false]);
  });

  it("preserves input ordering and count values", () => {
    const cells = [
      { date: day("2026-01-01"), count: 7 },
      { date: day("2026-01-02"), count: 0 },
      { date: day("2026-01-03"), count: 3 },
    ];
    const result = calculateLevels(cells, { now: day("2026-01-03") });
    expect(result.map((c) => c.count)).toEqual([7, 0, 3]);
    expect(result.map((c) => c.date.toISOString())).toEqual([
      cells[0]!.date.toISOString(),
      cells[1]!.date.toISOString(),
      cells[2]!.date.toISOString(),
    ]);
  });
});
