/**
 * Integration tests for the T6 extensions to getWorkspaceHomeStats:
 * weeklySparkline, lastWeekTotal, fourWeekAvg, bestWeekTotal — all driven
 * by `WorkspaceActivityEvent` daily counts.
 *
 * Real DB via testcontainer Postgres because the multi-week aggregation
 * runs `date_trunc('day', ...) GROUP BY day` and we want to verify the
 * bucketing against actual rows, not a mock.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { addWeeks, startOfISOWeek } from "date-fns";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace } from "~/test/factories";
import { getWorkspaceHomeStats } from "../workspaceHomeStats";

async function seedEvent(
  db: ReturnType<typeof getTestDb>,
  args: {
    workspaceId: string;
    userId: string;
    createdAt: Date;
  },
) {
  return db.workspaceActivityEvent.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      entityType: "action",
      entityId: `e-${Math.random().toString(36).slice(2, 10)}`,
      action: "created",
      createdAt: args.createdAt,
    },
  });
}

describe("getWorkspaceHomeStats — T6 weekly fields (integration)", () => {
  let db: ReturnType<typeof getTestDb>;
  // Anchor "now" to a fixed Wednesday so ISO weeks are deterministic.
  const now = new Date("2026-05-13T12:00:00Z"); // Wed
  const thisMon = startOfISOWeek(now);

  beforeEach(() => {
    db = getTestDb();
  });

  it("populates the 7-day sparkline with correct day counts + today flag", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "homestats-spark",
    });

    // Seed: 2 events Monday, 1 event Wednesday (today), 3 events Friday.
    const mon = new Date(thisMon);
    const wed = new Date(thisMon);
    wed.setDate(thisMon.getDate() + 2);
    const fri = new Date(thisMon);
    fri.setDate(thisMon.getDate() + 4);

    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: mon });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: mon });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: wed });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: fri });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: fri });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: fri });

    const stats = await getWorkspaceHomeStats(db, {
      workspaceId: ws.id,
      userId: user.id,
      now,
    });

    expect(stats.weeklySparkline).toHaveLength(7);
    expect(stats.weeklySparkline.map((b) => b.day)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(stats.weeklySparkline[0]!.count).toBe(2); // Mon
    expect(stats.weeklySparkline[2]!.count).toBe(1); // Wed (today)
    expect(stats.weeklySparkline[4]!.count).toBe(3); // Fri
    // Only Wed is today
    expect(stats.weeklySparkline.map((b) => b.isToday)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("computes lastWeekTotal from events in the previous ISO week", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "homestats-lastweek",
    });

    const lastWeekStart = startOfISOWeek(addWeeks(now, -1));
    // 4 events last week, spread across days
    for (let i = 0; i < 4; i++) {
      const d = new Date(lastWeekStart);
      d.setDate(lastWeekStart.getDate() + i);
      await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: d });
    }
    // 1 event this week (should not pollute lastWeekTotal)
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: thisMon,
    });

    const stats = await getWorkspaceHomeStats(db, {
      workspaceId: ws.id,
      userId: user.id,
      now,
    });

    expect(stats.lastWeekTotal).toBe(4);
  });

  it("computes fourWeekAvg as the mean of the last 4 completed weeks (excludes current)", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "homestats-4wkavg",
    });

    // weeks 1..4 ago: 2, 4, 6, 8 events respectively  → avg = 5
    for (let w = 1; w <= 4; w++) {
      const wkStart = startOfISOWeek(addWeeks(now, -w));
      const count = w * 2; // 2, 4, 6, 8
      for (let i = 0; i < count; i++) {
        const d = new Date(wkStart);
        d.setDate(wkStart.getDate() + (i % 7));
        await seedEvent(db, {
          workspaceId: ws.id,
          userId: user.id,
          createdAt: d,
        });
      }
    }
    // Current week — should NOT factor in
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: thisMon,
    });

    const stats = await getWorkspaceHomeStats(db, {
      workspaceId: ws.id,
      userId: user.id,
      now,
    });

    expect(stats.fourWeekAvg).toBe(5); // (2 + 4 + 6 + 8) / 4
  });

  it("computes bestWeekTotal as the max across the 12-week window", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "homestats-best",
    });

    // Week -6 has 9 events (the best). Other weeks have fewer.
    const sixWeeksAgo = startOfISOWeek(addWeeks(now, -6));
    for (let i = 0; i < 9; i++) {
      const d = new Date(sixWeeksAgo);
      d.setDate(sixWeeksAgo.getDate() + (i % 7));
      await seedEvent(db, {
        workspaceId: ws.id,
        userId: user.id,
        createdAt: d,
      });
    }
    // A weaker week 2 weeks ago
    const twoWeeksAgo = startOfISOWeek(addWeeks(now, -2));
    for (let i = 0; i < 3; i++) {
      const d = new Date(twoWeeksAgo);
      d.setDate(twoWeeksAgo.getDate() + i);
      await seedEvent(db, {
        workspaceId: ws.id,
        userId: user.id,
        createdAt: d,
      });
    }

    const stats = await getWorkspaceHomeStats(db, {
      workspaceId: ws.id,
      userId: user.id,
      now,
    });

    expect(stats.bestWeekTotal).toBe(9);
  });

  it("returns zeroed weekly fields for a workspace with no activity events", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "homestats-empty",
    });

    const stats = await getWorkspaceHomeStats(db, {
      workspaceId: ws.id,
      userId: user.id,
      now,
    });

    expect(stats.weeklySparkline).toHaveLength(7);
    expect(stats.weeklySparkline.every((b) => b.count === 0)).toBe(true);
    expect(stats.lastWeekTotal).toBe(0);
    expect(stats.fourWeekAvg).toBe(0);
    expect(stats.bestWeekTotal).toBe(0);
  });
});
