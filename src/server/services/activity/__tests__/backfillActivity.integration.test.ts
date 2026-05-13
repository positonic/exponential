/**
 * Integration tests for the WorkspaceActivityEvent backfill service.
 *
 * Uses the testcontainer Postgres set up by `~/test/test-db` — these tests
 * exercise the real DB because the backfill writes timestamped rows in
 * batches via Prisma's `createMany`, and we want to assert the persisted
 * rows actually carry the correct `createdAt` values (which a mocked
 * Prisma can't verify).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace } from "~/test/factories";
import { backfillWorkspaceActivity } from "../backfillActivity";

describe("backfillWorkspaceActivity (integration)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("emits a `completed` event for actions with completedAt", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "bf-ws-1" });

    const createdAt = new Date("2026-03-14T10:00:00Z");
    const completedAt = new Date("2026-03-15T10:00:00Z");
    await db.action.create({
      data: {
        name: "Old completed action",
        status: "COMPLETED",
        createdById: user.id,
        workspaceId: ws.id,
        createdAt,
        completedAt,
      },
    });

    const result = await backfillWorkspaceActivity(db, { workspaceId: ws.id });

    expect(result.skipped).toBe(false);
    expect(result.counts.action).toBe(1);
    // Every action also gets a `created` event at its createdAt.
    expect(result.counts.actionCreated).toBe(1);

    const completedRows = await db.workspaceActivityEvent.findMany({
      where: { workspaceId: ws.id, action: "completed" },
    });
    expect(completedRows).toHaveLength(1);
    expect(completedRows[0]!.createdAt.toISOString()).toBe(completedAt.toISOString());
    expect(completedRows[0]!.entityType).toBe("action");
    expect(completedRows[0]!.userId).toBe(user.id);
  });

  it("emits a `created` event for every action at its createdAt", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "bf-ws-2" });

    const createdAt = new Date("2026-03-10T10:00:00Z");
    // Open action — no completedAt
    await db.action.create({
      data: {
        name: "Still open",
        status: "ACTIVE",
        createdById: user.id,
        workspaceId: ws.id,
        createdAt,
      },
    });

    const result = await backfillWorkspaceActivity(db, { workspaceId: ws.id });

    expect(result.counts.actionCreated).toBe(1);
    expect(result.counts.action).toBe(0); // never completed

    const createdRow = await db.workspaceActivityEvent.findFirst({
      where: { workspaceId: ws.id, action: "created", entityType: "action" },
    });
    expect(createdRow?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("scopes events to the correct workspace and doesn't cross over", async () => {
    const userA = await createUser(db);
    const userB = await createUser(db);
    const wsA = await createWorkspace(db, { ownerId: userA.id, slug: "bf-ws-a" });
    const wsB = await createWorkspace(db, { ownerId: userB.id, slug: "bf-ws-b" });

    await db.action.create({
      data: {
        name: "A action",
        status: "COMPLETED",
        createdById: userA.id,
        workspaceId: wsA.id,
        createdAt: new Date("2026-03-31T10:00:00Z"),
        completedAt: new Date("2026-04-01T10:00:00Z"),
      },
    });
    await db.action.create({
      data: {
        name: "B action",
        status: "COMPLETED",
        createdById: userB.id,
        workspaceId: wsB.id,
        createdAt: new Date("2026-04-01T10:00:00Z"),
        completedAt: new Date("2026-04-02T10:00:00Z"),
      },
    });

    const resultA = await backfillWorkspaceActivity(db, { workspaceId: wsA.id });
    expect(resultA.counts.action).toBe(1);
    expect(resultA.counts.actionCreated).toBe(1);

    // wsA should only have its own action; nothing from wsB
    const wsARows = await db.workspaceActivityEvent.findMany({
      where: { workspaceId: wsA.id },
    });
    expect(wsARows).toHaveLength(2); // one `created` + one `completed`

    const wsBRows = await db.workspaceActivityEvent.findMany({
      where: { workspaceId: wsB.id },
    });
    expect(wsBRows).toHaveLength(0);
  });

  it("is idempotent — second run is a no-op without `force`", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "bf-ws-idem" });
    await db.action.create({
      data: {
        name: "Once",
        status: "COMPLETED",
        createdById: user.id,
        workspaceId: ws.id,
        createdAt: new Date("2026-01-30T10:00:00Z"),
        completedAt: new Date("2026-02-01T10:00:00Z"),
      },
    });

    const first = await backfillWorkspaceActivity(db, { workspaceId: ws.id });
    expect(first.skipped).toBe(false);
    expect(first.total).toBeGreaterThan(0);

    const second = await backfillWorkspaceActivity(db, { workspaceId: ws.id });
    expect(second.skipped).toBe(true);
    expect(second.total).toBe(0);

    const rows = await db.workspaceActivityEvent.findMany({
      where: { workspaceId: ws.id },
    });
    // No duplicates from the second run
    expect(rows).toHaveLength(first.total);
  });

  it("`force: true` re-emits events even when rows already exist", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "bf-ws-force" });
    await db.action.create({
      data: {
        name: "Replay me",
        status: "COMPLETED",
        createdById: user.id,
        workspaceId: ws.id,
        createdAt: new Date("2026-01-14T10:00:00Z"),
        completedAt: new Date("2026-01-15T10:00:00Z"),
      },
    });

    const first = await backfillWorkspaceActivity(db, { workspaceId: ws.id });
    expect(first.total).toBe(2); // one created + one completed

    const forced = await backfillWorkspaceActivity(db, {
      workspaceId: ws.id,
      force: true,
    });
    expect(forced.skipped).toBe(false);
    expect(forced.total).toBe(2);

    // Both runs inserted rows — 4 total (no dedup key)
    const rows = await db.workspaceActivityEvent.findMany({
      where: { workspaceId: ws.id },
    });
    expect(rows).toHaveLength(4);
  });

  it("returns zero counts for an empty workspace", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "bf-ws-empty" });

    const result = await backfillWorkspaceActivity(db, { workspaceId: ws.id });

    expect(result.skipped).toBe(false);
    expect(result.total).toBe(0);
    expect(result.counts).toEqual({
      action: 0,
      actionCreated: 0,
      ticket: 0,
      actionComment: 0,
      ticketComment: 0,
    });
  });
});
