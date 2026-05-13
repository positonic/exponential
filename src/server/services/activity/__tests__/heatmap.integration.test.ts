/**
 * Integration test for getActivityHeatmap. Uses the testcontainer Postgres
 * because the reader runs `SELECT date_trunc('day', ...) GROUP BY day` and
 * we want to assert the per-day bucketing against real DB rows.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace } from "~/test/factories";
import { getActivityHeatmap } from "../heatmap";

async function seedEvent(
  db: ReturnType<typeof getTestDb>,
  args: {
    workspaceId: string;
    userId: string;
    createdAt: Date;
    entityType?: string;
    action?: string;
  },
) {
  return db.workspaceActivityEvent.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      entityType: args.entityType ?? "action",
      entityId: `e-${Math.random().toString(36).slice(2, 10)}`,
      action: args.action ?? "created",
      createdAt: args.createdAt,
    },
  });
}

describe("getActivityHeatmap (integration)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("buckets events by day inside the 12-month window", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "hm-bucket" });
    // Fix "now" to anchor the window deterministically.
    const now = new Date("2026-05-13T12:00:00Z");

    // Three events on the same day, two on another day, one outside the window.
    const dayA = new Date("2026-05-10T10:00:00Z");
    const dayB = new Date("2026-04-01T09:00:00Z");
    const wayOld = new Date("2025-01-01T09:00:00Z"); // ~16 months ago, outside

    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: dayA });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: dayA });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: dayA });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: dayB });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: dayB });
    await seedEvent(db, { workspaceId: ws.id, userId: user.id, createdAt: wayOld });

    const { cells, total } = await getActivityHeatmap(db, {
      workspaceId: ws.id,
      now,
    });

    // The window holds exactly 371 days (53 weeks × 7).
    expect(cells).toHaveLength(371);
    // Total counts only events inside the window — the ~16-month-old event is excluded.
    expect(total).toBe(5);

    // Specific day buckets land on the right cells.
    const dayACell = cells.find(
      (c) => c.date.toISOString().slice(0, 10) === "2026-05-10",
    );
    const dayBCell = cells.find(
      (c) => c.date.toISOString().slice(0, 10) === "2026-04-01",
    );
    expect(dayACell?.count).toBe(3);
    expect(dayBCell?.count).toBe(2);
    expect(dayACell?.level).toBe(4); // bigger than dayB → top bucket
    expect(dayBCell?.level).toBeGreaterThan(0);
  });

  it("scopes counts to the right workspace (no leakage)", async () => {
    const user = await createUser(db);
    const wsA = await createWorkspace(db, { ownerId: user.id, slug: "hm-a" });
    const wsB = await createWorkspace(db, { ownerId: user.id, slug: "hm-b" });
    const now = new Date("2026-05-13T12:00:00Z");

    await seedEvent(db, {
      workspaceId: wsA.id,
      userId: user.id,
      createdAt: new Date("2026-05-10T10:00:00Z"),
    });
    await seedEvent(db, {
      workspaceId: wsB.id,
      userId: user.id,
      createdAt: new Date("2026-05-10T10:00:00Z"),
    });
    await seedEvent(db, {
      workspaceId: wsB.id,
      userId: user.id,
      createdAt: new Date("2026-05-11T10:00:00Z"),
    });

    const resultA = await getActivityHeatmap(db, {
      workspaceId: wsA.id,
      now,
    });
    expect(resultA.total).toBe(1);

    const resultB = await getActivityHeatmap(db, {
      workspaceId: wsB.id,
      now,
    });
    expect(resultB.total).toBe(2);
  });

  it("returns 371 empty cells for a workspace with no events", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "hm-empty" });

    const result = await getActivityHeatmap(db, {
      workspaceId: ws.id,
      now: new Date("2026-05-13T12:00:00Z"),
    });

    expect(result.cells).toHaveLength(371);
    expect(result.total).toBe(0);
    expect(result.cells.every((c) => c.level === 0)).toBe(true);
  });

  it("counts events from any entityType/action combination", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "hm-mixed" });
    const now = new Date("2026-05-13T12:00:00Z");
    const dayInWindow = new Date("2026-05-10T10:00:00Z");

    // One of each known entity/action pair, all on the same day.
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: dayInWindow,
      entityType: "action",
      action: "completed",
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: dayInWindow,
      entityType: "ticket",
      action: "status_changed",
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: dayInWindow,
      entityType: "action_comment",
      action: "created",
    });

    const { total } = await getActivityHeatmap(db, {
      workspaceId: ws.id,
      now,
    });
    expect(total).toBe(3);
  });
});
