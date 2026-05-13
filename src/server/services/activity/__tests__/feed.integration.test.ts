/**
 * Integration test for getActivityFeed. Real DB (testcontainer) because the
 * cursor-based pagination relies on a compound ORDER BY + WHERE that we
 * want to verify against actual Prisma query behavior, not a mock.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace } from "~/test/factories";
import { getActivityFeed } from "../feed";

async function seedEvent(
  db: ReturnType<typeof getTestDb>,
  args: {
    workspaceId: string;
    userId: string;
    createdAt: Date;
    entityType?: string;
    action?: string;
    metadata?: Record<string, unknown>;
    entityId?: string;
  },
) {
  return db.workspaceActivityEvent.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      entityType: args.entityType ?? "action",
      entityId: args.entityId ?? `e-${Math.random().toString(36).slice(2, 10)}`,
      action: args.action ?? "created",
      metadata: args.metadata,
      createdAt: args.createdAt,
    },
  });
}

describe("getActivityFeed (integration)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("orders events descending by createdAt and joins the actor user", async () => {
    const user = await createUser(db, { name: "Alice" });
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "feed-order" });

    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: new Date("2026-05-10T10:00:00Z"),
      metadata: { name: "First" },
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: new Date("2026-05-12T10:00:00Z"),
      metadata: { name: "Third" },
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: new Date("2026-05-11T10:00:00Z"),
      metadata: { name: "Second" },
    });

    const { events } = await getActivityFeed(db, { workspaceId: ws.id });

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.entityRef)).toEqual(["Third", "Second", "First"]);
    // Actor join populates name + id
    expect(events[0]!.actor?.name).toBe("Alice");
  });

  it("scopes events to the right workspace (no leakage)", async () => {
    const user = await createUser(db);
    const wsA = await createWorkspace(db, { ownerId: user.id, slug: "feed-a" });
    const wsB = await createWorkspace(db, { ownerId: user.id, slug: "feed-b" });

    await seedEvent(db, {
      workspaceId: wsA.id,
      userId: user.id,
      createdAt: new Date("2026-05-10T10:00:00Z"),
      metadata: { name: "A1" },
    });
    await seedEvent(db, {
      workspaceId: wsB.id,
      userId: user.id,
      createdAt: new Date("2026-05-11T10:00:00Z"),
      metadata: { name: "B1" },
    });
    await seedEvent(db, {
      workspaceId: wsB.id,
      userId: user.id,
      createdAt: new Date("2026-05-12T10:00:00Z"),
      metadata: { name: "B2" },
    });

    const a = await getActivityFeed(db, { workspaceId: wsA.id });
    const b = await getActivityFeed(db, { workspaceId: wsB.id });

    expect(a.events.map((e) => e.entityRef)).toEqual(["A1"]);
    expect(b.events.map((e) => e.entityRef)).toEqual(["B2", "B1"]);
  });

  it("paginates with stable cursors covering same-second events", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "feed-paginate" });

    // Seed 7 events. Two at the same exact createdAt to exercise the
    // id-tiebreaker branch of the cursor.
    const sameSec = new Date("2026-05-10T10:00:00.000Z");
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: sameSec,
      metadata: { name: "tie-a" },
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: sameSec,
      metadata: { name: "tie-b" },
    });
    for (let i = 0; i < 5; i++) {
      await seedEvent(db, {
        workspaceId: ws.id,
        userId: user.id,
        createdAt: new Date(`2026-05-${(11 + i).toString().padStart(2, "0")}T10:00:00Z`),
        metadata: { name: `day-${i}` },
      });
    }

    const first = await getActivityFeed(db, { workspaceId: ws.id, limit: 3 });
    expect(first.events).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();

    const second = await getActivityFeed(db, {
      workspaceId: ws.id,
      cursor: first.nextCursor!,
      limit: 3,
    });
    expect(second.events).toHaveLength(3);
    // No overlap between page 1 and page 2.
    const ids1 = first.events.map((e) => e.id);
    const ids2 = second.events.map((e) => e.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);

    const third = await getActivityFeed(db, {
      workspaceId: ws.id,
      cursor: second.nextCursor!,
      limit: 3,
    });
    // 7 total / 3 per page = pages of 3, 3, 1
    expect(third.events).toHaveLength(1);
    expect(third.nextCursor).toBeNull();

    // All 7 events accounted for exactly once
    const allIds = new Set([
      ...ids1,
      ...ids2,
      ...third.events.map((e) => e.id),
    ]);
    expect(allIds.size).toBe(7);
  });

  it("respects the limit param and applies a hard ceiling", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "feed-limit" });
    for (let i = 0; i < 12; i++) {
      await seedEvent(db, {
        workspaceId: ws.id,
        userId: user.id,
        createdAt: new Date(`2026-05-${(i + 1).toString().padStart(2, "0")}T10:00:00Z`),
      });
    }

    const small = await getActivityFeed(db, { workspaceId: ws.id, limit: 5 });
    expect(small.events).toHaveLength(5);
    expect(small.nextCursor).toBeTruthy();

    // Limit larger than 12 still works
    const big = await getActivityFeed(db, { workspaceId: ws.id, limit: 100 });
    expect(big.events).toHaveLength(12);
    expect(big.nextCursor).toBeNull();
  });

  it("resolves render hints + entity refs for known events", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "feed-hints" });

    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: new Date("2026-05-10T10:00:00Z"),
      entityType: "action",
      action: "completed",
      metadata: { name: "Ship it" },
    });
    await seedEvent(db, {
      workspaceId: ws.id,
      userId: user.id,
      createdAt: new Date("2026-05-09T10:00:00Z"),
      entityType: "ticket_comment",
      action: "created",
      metadata: { snippet: "looks good to me" },
    });

    const { events } = await getActivityFeed(db, { workspaceId: ws.id });

    expect(events[0]!.hint.iconKind).toBe("completed");
    expect(events[0]!.hint.template).toContain("completed");
    expect(events[0]!.entityRef).toBe("Ship it");

    expect(events[1]!.hint.iconKind).toBe("commented");
    expect(events[1]!.entityRef).toBe("looks good to me");
  });
});
