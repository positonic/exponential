import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, createAction, addWorkspaceMember } from "~/test/factories";

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

  // Real SQL for the nested relation filters behind the agent-owner path
  // (creator → agent → owner, and the owner's standing in the action's
  // workspace): an agent writes as its shadow user (ADR-0049), so this row
  // has no project, no assignee and a creator that is nobody's own account.
  it("lets an agent's owner find, open and complete a project-less action the agent created", async () => {
    const owner = await createUser(db);
    const teammate = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: teammate.id, slug: "sbt-agent" });
    await addWorkspaceMember(db, ws.id, owner.id);

    const shadow = await db.user.create({ data: { name: "Desk agent", isAgent: true } });
    await db.externalAgent.create({
      data: { name: "Desk agent", ownerId: owner.id, shadowUserId: shadow.id },
    });
    await addWorkspaceMember(db, ws.id, shadow.id);
    const action = await createAction(db, {
      createdById: shadow.id,
      workspaceId: ws.id,
      name: "Open a payments account",
    });

    const asOwner = createTestCaller(owner.id);
    const hits = await asOwner.action.searchByTitle({ workspaceId: ws.id, query: "payments" });
    expect(hits.map((r) => r.id)).toEqual([action.id]);
    const palette = await asOwner.search.global({ query: "payments", workspaceId: ws.id });
    expect(palette.results.filter((r) => r.type === "action").map((r) => r.id)).toEqual([action.id]);
    expect((await asOwner.action.getById({ id: action.id })).id).toBe(action.id);

    await asOwner.action.update({ id: action.id, status: "COMPLETED" });
    const completed = await db.action.findUniqueOrThrow({ where: { id: action.id } });
    expect(completed.status).toBe("COMPLETED");

    // A project-less action stays personal: owning the workspace is not a way in.
    const asTeammate = createTestCaller(teammate.id);
    expect(await asTeammate.action.searchByTitle({ workspaceId: ws.id, query: "payments" })).toEqual([]);
    const theirs = await asTeammate.search.global({ query: "payments", workspaceId: ws.id });
    expect(theirs.results.filter((r) => r.type === "action")).toEqual([]);
    await expect(asTeammate.action.getById({ id: action.id })).rejects.toThrow(/not found/i);

    // The path ends with the workspace: once the owner is removed, neither
    // the workspace search nor the all-workspaces one reaches the row.
    await db.workspaceUser.delete({
      where: { userId_workspaceId: { userId: owner.id, workspaceId: ws.id } },
    });
    const afterRemoval = await asOwner.search.global({ query: "payments" });
    expect(afterRemoval.results.filter((r) => r.type === "action")).toEqual([]);
    await expect(asOwner.action.getById({ id: action.id })).rejects.toThrow(/not found/i);
    await expect(asOwner.action.update({ id: action.id, name: "Renamed" })).rejects.toThrow();
  });

  // The whole chain against real tables: the create's owner default, the
  // owner's own list ("created by me, or assigned to me"), and what the
  // workspace's own member procedures leave the owner with afterwards. An
  // assignee keeps an action whatever their workspace standing, so the
  // default assignment has to be withdrawn when the owner loses the
  // workspace or drops to viewer.
  describe("a project-less action an agent creates", () => {
    async function agentFilesAnAction(slug: string) {
      const admin = await createUser(db);
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: admin.id, slug });
      await addWorkspaceMember(db, ws.id, owner.id);
      const shadow = await db.user.create({ data: { name: "Desk agent", isAgent: true } });
      await db.externalAgent.create({
        data: { name: "Desk agent", ownerId: owner.id, shadowUserId: shadow.id },
      });
      await addWorkspaceMember(db, ws.id, shadow.id);

      const created = await createTestCaller(shadow.id).action.create({
        name: "Ask the accountant about payouts",
        workspaceId: ws.id,
      });
      return {
        ws,
        shadow,
        created,
        asAdmin: createTestCaller(admin.id),
        asOwner: createTestCaller(owner.id),
        ownerId: owner.id,
      };
    }

    it("lands on its owner's list, assigned to them", async () => {
      const { ws, shadow, created, asOwner, ownerId } = await agentFilesAnAction("sbt-agent-plate");

      expect(created.createdById).toBe(shadow.id);
      expect(created.source).toBe("agent");
      expect(created.assignees.map((a) => a.userId)).toEqual([ownerId]);

      const mine = await asOwner.action.getAll({ workspaceId: ws.id });
      expect(mine.map((a) => a.id)).toEqual([created.id]);
    });

    it("leaves the owner when they are removed from the workspace", async () => {
      const { ws, created, asAdmin, asOwner, ownerId } = await agentFilesAnAction("sbt-agent-removed");

      await asAdmin.workspace.removeMember({ workspaceId: ws.id, userId: ownerId });

      expect(await db.actionAssignee.count({ where: { actionId: created.id } })).toBe(0);
      expect(await asOwner.action.getAll()).toEqual([]);
      await expect(asOwner.action.getById({ id: created.id })).rejects.toThrow(/not found/i);
      await expect(asOwner.action.update({ id: created.id, name: "Renamed" })).rejects.toThrow();
    });

    it("becomes read-only for an owner demoted to viewer", async () => {
      const { ws, created, asAdmin, asOwner, ownerId } = await agentFilesAnAction("sbt-agent-viewer");

      await asAdmin.workspace.updateMemberRole({ workspaceId: ws.id, userId: ownerId, role: "viewer" });

      expect(await db.actionAssignee.count({ where: { actionId: created.id } })).toBe(0);
      // Still theirs to read, through the agent-owner path…
      expect((await asOwner.action.getById({ id: created.id })).id).toBe(created.id);
      // …but no longer to change.
      await expect(asOwner.action.update({ id: created.id, name: "Renamed" })).rejects.toThrow();
      const unchanged = await db.action.findUniqueOrThrow({ where: { id: created.id } });
      expect(unchanged.name).toBe("Ask the accountant about payouts");
    });
  });
});
