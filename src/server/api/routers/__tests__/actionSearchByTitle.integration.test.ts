import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, createAction } from "~/test/factories";

describe("action.searchByTitle", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("returns case-insensitive prefix matches, scoped to workspace", async () => {
    const user = await createUser(db);
    const ws1 = await createWorkspace(db, { ownerId: user.id, slug: "sbt-ws1" });
    const ws2 = await createWorkspace(db, { ownerId: user.id, slug: "sbt-ws2" });

    await createAction(db, { createdById: user.id, workspaceId: ws1.id, name: "Review PR" });
    await createAction(db, { createdById: user.id, workspaceId: ws1.id, name: "review notes" });
    await createAction(db, { createdById: user.id, workspaceId: ws2.id, name: "Review other ws" });

    const caller = createTestCaller(user.id);
    const results = await caller.action.searchByTitle({
      workspaceId: ws1.id,
      query: "review",
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.workspaceId)).toEqual([ws1.id, ws1.id]);
    expect(results.every((r) => r.name.toLowerCase().startsWith("review"))).toBe(true);
  });

  it("falls back to contains when prefix yields fewer than `limit`", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "sbt-fb" });

    await createAction(db, { createdById: user.id, workspaceId: ws.id, name: "alpha task" });
    await createAction(db, { createdById: user.id, workspaceId: ws.id, name: "see beta and gamma" });
    await createAction(db, { createdById: user.id, workspaceId: ws.id, name: "epsilon" });

    const caller = createTestCaller(user.id);
    const results = await caller.action.searchByTitle({
      workspaceId: ws.id,
      query: "alpha",
      limit: 5,
    });

    // 'alpha task' (prefix) plus 'see beta and gamma' is unrelated; only one hit.
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("alpha task");

    const containsResults = await caller.action.searchByTitle({
      workspaceId: ws.id,
      query: "beta",
      limit: 5,
    });
    expect(containsResults.some((r) => r.name === "see beta and gamma")).toBe(true);
  });

  it("excludes CANCELLED and old DONE actions; includes recent DONE", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "sbt-status" });

    const open = await createAction(db, {
      createdById: user.id,
      workspaceId: ws.id,
      name: "draft proposal",
      kanbanStatus: "TODO",
    });
    const cancelled = await createAction(db, {
      createdById: user.id,
      workspaceId: ws.id,
      name: "draft cancelled",
      kanbanStatus: "CANCELLED",
    });
    const oldDone = await createAction(db, {
      createdById: user.id,
      workspaceId: ws.id,
      name: "draft old",
      kanbanStatus: "DONE",
    });
    await db.action.update({
      where: { id: oldDone.id },
      data: { completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    });
    const recentDone = await createAction(db, {
      createdById: user.id,
      workspaceId: ws.id,
      name: "draft recent",
      kanbanStatus: "DONE",
    });
    await db.action.update({
      where: { id: recentDone.id },
      data: { completedAt: new Date() },
    });

    const caller = createTestCaller(user.id);
    const results = await caller.action.searchByTitle({
      workspaceId: ws.id,
      query: "draft",
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(recentDone.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(oldDone.id);
  });
});
