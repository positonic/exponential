import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace } from "~/test/factories";

describe("timeEntry router (E2E baseline)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("start → stop creates an Action and accumulates timeSpentMins", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "te-ws" });
    const caller = createTestCaller(user.id);

    const started = await caller.timeEntry.start({
      typedTitle: "Plan the week",
      workspaceId: ws.id,
    });
    expect(started.endedAt).toBeNull();
    expect(started.action.name).toBe("Plan the week");
    expect(started.action.workspaceId).toBe(ws.id);

    // Backdate startedAt by 10 minutes so stop() sees a non-trivial duration.
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    await db.timeEntry.update({
      where: { id: started.id },
      data: { startedAt: tenMinAgo },
    });

    const stopped = await caller.timeEntry.stop({ entryId: started.id });
    expect(stopped.endedAt).not.toBeNull();

    const action = await db.action.findUnique({
      where: { id: started.action.id },
    });
    expect(action?.timeSpentMins).toBeGreaterThanOrEqual(9);
    expect(action?.timeSpentMins).toBeLessThanOrEqual(11);
  });

  it("a second start silently auto-stops the first (single global timer)", async () => {
    const user = await createUser(db);
    const caller = createTestCaller(user.id);

    const first = await caller.timeEntry.start({ typedTitle: "first" });
    // Backdate so the auto-stop produces a measurable duration on the old action.
    const fourMinAgo = new Date(Date.now() - 4 * 60_000);
    await db.timeEntry.update({
      where: { id: first.id },
      data: { startedAt: fourMinAgo },
    });

    const second = await caller.timeEntry.start({ typedTitle: "second" });
    expect(second.id).not.toBe(first.id);

    // Exactly one entry should be running for this user
    const running = await db.timeEntry.findMany({
      where: { userId: user.id, endedAt: null },
    });
    expect(running).toHaveLength(1);
    expect(running[0]!.id).toBe(second.id);

    // The first action's timeSpentMins got bumped by the auto-stop
    const firstAction = await db.action.findUnique({
      where: { id: first.action.id },
    });
    expect(firstAction?.timeSpentMins).toBeGreaterThanOrEqual(3);
  });

  it("getActive returns the running entry, then null after stop", async () => {
    const user = await createUser(db);
    const caller = createTestCaller(user.id);

    expect(await caller.timeEntry.getActive()).toBeNull();

    const entry = await caller.timeEntry.start({ typedTitle: "track me" });
    const active = await caller.timeEntry.getActive();
    expect(active?.id).toBe(entry.id);

    await caller.timeEntry.stop();
    expect(await caller.timeEntry.getActive()).toBeNull();
  });

  it("listByDateRange returns overlapping entries (including running) and excludes out-of-range", async () => {
    const user = await createUser(db);
    const caller = createTestCaller(user.id);

    const e1 = await caller.timeEntry.start({ typedTitle: "today" });
    // Backdate to ensure stop produces a real range; stop now.
    await db.timeEntry.update({
      where: { id: e1.id },
      data: {
        startedAt: new Date(Date.now() - 60 * 60_000), // 1h ago
      },
    });
    await caller.timeEntry.stop({ entryId: e1.id });

    // Old completed entry (outside range)
    const old = await caller.timeEntry.start({ typedTitle: "old" });
    await caller.timeEntry.stop({ entryId: old.id });
    await db.timeEntry.update({
      where: { id: old.id },
      data: {
        startedAt: new Date("2025-01-01T10:00:00Z"),
        endedAt: new Date("2025-01-01T11:00:00Z"),
      },
    });

    // Running entry inside range
    const running = await caller.timeEntry.start({ typedTitle: "running" });

    const startDate = new Date(Date.now() - 2 * 60 * 60_000);
    const endDate = new Date(Date.now() + 60 * 60_000);
    const inRange = await caller.timeEntry.listByDateRange({ startDate, endDate });

    const ids = inRange.map((r) => r.id);
    expect(ids).toContain(e1.id);
    expect(ids).toContain(running.id);
    expect(ids).not.toContain(old.id);
  });

  it("listRecent returns only COMPLETED entries newest-first; resume creates a fresh entry on the same action", async () => {
    const user = await createUser(db);
    const caller = createTestCaller(user.id);

    // Three Play → Stop cycles
    const e1 = await caller.timeEntry.start({ typedTitle: "first" });
    await caller.timeEntry.stop();
    const e2 = await caller.timeEntry.start({ typedTitle: "second" });
    await caller.timeEntry.stop();
    const e3 = await caller.timeEntry.start({ typedTitle: "third" });
    await caller.timeEntry.stop();

    const recent = await caller.timeEntry.listRecent({ limit: 10 });
    expect(recent.map((r) => r.id)).toEqual([e3.id, e2.id, e1.id]);
    expect(recent.every((r) => r.endedAt !== null)).toBe(true);

    // Resume on first action: should create a NEW entry, not mutate e1.
    const resumed = await caller.timeEntry.start({ actionId: e1.action.id });
    expect(resumed.id).not.toBe(e1.id);
    expect(resumed.action.id).toBe(e1.action.id);

    const e1Refreshed = await db.timeEntry.findUnique({ where: { id: e1.id } });
    expect(e1Refreshed?.endedAt).not.toBeNull();

    // Now only the resumed one is running.
    const running = await db.timeEntry.findMany({ where: { userId: user.id, endedAt: null } });
    expect(running).toHaveLength(1);
    expect(running[0]!.id).toBe(resumed.id);
  });
});
