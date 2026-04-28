import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProject,
  createAction,
  assignAction,
  addWorkspaceMember,
} from "~/test/factories";

describe("action router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("create", () => {
    it("creates action for authenticated user", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      const action = await caller.action.create({
        name: "Test Action",
      });

      expect(action.name).toBe("Test Action");
    });

    it("creates action with projectId when user has project access", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "action-ws" });
      const project = await createProject(db, {
        createdById: user.id,
        workspaceId: ws.id,
      });

      const caller = createTestCaller(user.id);
      const action = await caller.action.create({
        name: "Project Action",
        projectId: project.id,
      });

      expect(action.project?.id).toBe(project.id);
    });

    it("throws FORBIDDEN when creating action on inaccessible project", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.action.create({
          name: "Should Fail",
          projectId: project.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe("getAll", () => {
    it("returns actions created by user (unassigned)", async () => {
      const user = await createUser(db);
      await createAction(db, { createdById: user.id, name: "My Action" });

      const caller = createTestCaller(user.id);
      const actions = await caller.action.getAll();

      expect(actions).toHaveLength(1);
      expect(actions[0]!.name).toBe("My Action");
    });

    it("returns actions assigned to user", async () => {
      const creator = await createUser(db);
      const assignee = await createUser(db);

      const action = await createAction(db, { createdById: creator.id, name: "Assigned Action" });
      await assignAction(db, action.id, assignee.id);

      const assigneeCaller = createTestCaller(assignee.id);
      const actions = await assigneeCaller.action.getAll();

      expect(actions.some((a) => a.name === "Assigned Action")).toBe(true);
    });

    it("does NOT return other users' unassigned actions", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      await createAction(db, { createdById: user1.id, name: "User1 Action" });
      await createAction(db, { createdById: user2.id, name: "User2 Action" });

      const caller1 = createTestCaller(user1.id);
      const actions = await caller1.action.getAll();

      expect(actions).toHaveLength(1);
      expect(actions[0]!.name).toBe("User1 Action");
    });

    it("excludes DELETED actions", async () => {
      const user = await createUser(db);
      await createAction(db, { createdById: user.id, name: "Active", status: "ACTIVE" });
      await createAction(db, { createdById: user.id, name: "Deleted", status: "DELETED" });

      const caller = createTestCaller(user.id);
      const actions = await caller.action.getAll();

      expect(actions).toHaveLength(1);
      expect(actions[0]!.name).toBe("Active");
    });

    it("filters by workspaceId via project", async () => {
      const user = await createUser(db);
      const ws1 = await createWorkspace(db, { ownerId: user.id, slug: "ws1" });
      const ws2 = await createWorkspace(db, { ownerId: user.id, slug: "ws2" });
      const proj1 = await createProject(db, { createdById: user.id, workspaceId: ws1.id });
      const proj2 = await createProject(db, { createdById: user.id, workspaceId: ws2.id });

      await createAction(db, { createdById: user.id, name: "WS1 Action", projectId: proj1.id });
      await createAction(db, { createdById: user.id, name: "WS2 Action", projectId: proj2.id });

      const caller = createTestCaller(user.id);
      const actions = await caller.action.getAll({ workspaceId: ws1.id });

      expect(actions).toHaveLength(1);
      expect(actions[0]!.name).toBe("WS1 Action");
    });

    it("response has expected shape (contract test)", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "contract-ws" });
      const proj = await createProject(db, { createdById: user.id, workspaceId: ws.id });
      await createAction(db, { createdById: user.id, projectId: proj.id });

      const caller = createTestCaller(user.id);
      const actions = await caller.action.getAll();

      expect(actions[0]).toHaveProperty("id");
      expect(actions[0]).toHaveProperty("name");
      expect(actions[0]).toHaveProperty("status");
      expect(actions[0]).toHaveProperty("project");
      expect(actions[0]).toHaveProperty("assignees");
      expect(actions[0]).toHaveProperty("createdBy");
      expect(actions[0]).toHaveProperty("tags");
    });
  });

  describe("update", () => {
    it("creator can update", async () => {
      const user = await createUser(db);
      const action = await createAction(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      const updated = await caller.action.update({
        id: action.id,
        name: "Updated Name",
      });

      expect(updated.name).toBe("Updated Name");
    });

    it("assignee can update", async () => {
      const creator = await createUser(db);
      const assignee = await createUser(db);
      const action = await createAction(db, { createdById: creator.id });
      await assignAction(db, action.id, assignee.id);

      const assigneeCaller = createTestCaller(assignee.id);
      const updated = await assigneeCaller.action.update({
        id: action.id,
        name: "Assignee Updated",
      });

      expect(updated.name).toBe("Assignee Updated");
    });

    it("unauthorized user cannot update", async () => {
      const creator = await createUser(db);
      const stranger = await createUser(db);
      const action = await createAction(db, { createdById: creator.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.action.update({
          id: action.id,
          name: "Should Fail",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("sets completedAt when status changes to COMPLETED", async () => {
      const user = await createUser(db);
      const action = await createAction(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      const updated = await caller.action.update({
        id: action.id,
        status: "COMPLETED",
      });

      expect(updated.completedAt).not.toBeNull();
    });
  });

  describe("getProjectActions", () => {
    it("returns project actions for authorized user", async () => {
      const user = await createUser(db);
      const project = await createProject(db, { createdById: user.id });
      await createAction(db, { createdById: user.id, projectId: project.id, name: "Proj Action" });

      const caller = createTestCaller(user.id);
      const actions = await caller.action.getProjectActions({ projectId: project.id });

      expect(actions).toHaveLength(1);
      expect(actions[0]!.name).toBe("Proj Action");
    });

    it("throws FORBIDDEN for unauthorized user", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.action.getProjectActions({ projectId: project.id }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("getById", () => {
    it("returns action with rich relations for authorized user", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const project = await createProject(db, {
        createdById: user.id,
        workspaceId: ws.id,
      });
      const action = await createAction(db, {
        createdById: user.id,
        projectId: project.id,
        name: "Detailed Action",
      });

      const caller = createTestCaller(user.id);
      const result = await caller.action.getById({ id: action.id });

      expect(result.id).toBe(action.id);
      expect(result).toHaveProperty("project");
      expect(result).toHaveProperty("syncs");
      expect(result).toHaveProperty("assignees");
      expect(result).toHaveProperty("createdBy");
      expect(result).toHaveProperty("tags");
      expect(result).toHaveProperty("lists");
    });

    it("throws NOT_FOUND for stranger's action (access-scoped)", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const action = await createAction(db, { createdById: owner.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.action.getById({ id: action.id }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws NOT_FOUND for invalid id", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);
      await expect(
        caller.action.getById({ id: "nonexistent-id" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("getToday", () => {
    it("includes actions due today, excludes tomorrow and yesterday", async () => {
      const user = await createUser(db);
      const today = new Date();
      today.setHours(9, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await db.action.create({
        data: {
          name: "Today action",
          createdById: user.id,
          status: "ACTIVE",
          dueDate: today,
        },
      });
      await db.action.create({
        data: {
          name: "Tomorrow action",
          createdById: user.id,
          status: "ACTIVE",
          dueDate: tomorrow,
        },
      });
      await db.action.create({
        data: {
          name: "Yesterday action",
          createdById: user.id,
          status: "ACTIVE",
          dueDate: yesterday,
        },
      });

      const caller = createTestCaller(user.id);
      const result = await caller.action.getToday();
      expect(result.map((a) => a.name)).toEqual(["Today action"]);
    });

    it("excludes DELETED status actions", async () => {
      const user = await createUser(db);
      const today = new Date();
      today.setHours(9, 0, 0, 0);

      await db.action.create({
        data: {
          name: "Deleted today",
          createdById: user.id,
          status: "DELETED",
          dueDate: today,
        },
      });

      const caller = createTestCaller(user.id);
      const result = await caller.action.getToday();
      expect(result).toHaveLength(0);
    });

    it("includes actions assigned to user even when created by stranger", async () => {
      const stranger = await createUser(db);
      const me = await createUser(db);
      const today = new Date();
      today.setHours(9, 0, 0, 0);

      const action = await db.action.create({
        data: {
          name: "Assigned to me",
          createdById: stranger.id,
          status: "ACTIVE",
          dueDate: today,
        },
      });
      await assignAction(db, action.id, me.id);

      const myCaller = createTestCaller(me.id);
      const result = await myCaller.action.getToday();
      expect(result.map((a) => a.name)).toContain("Assigned to me");
    });

    it("returns response shape with expected nested relations", async () => {
      const user = await createUser(db);
      const today = new Date();
      today.setHours(9, 0, 0, 0);
      await db.action.create({
        data: {
          name: "Shape check",
          createdById: user.id,
          status: "ACTIVE",
          dueDate: today,
        },
      });

      const caller = createTestCaller(user.id);
      const [first] = await caller.action.getToday();
      expect(first).toBeDefined();
      expect(first).toHaveProperty("project");
      expect(first).toHaveProperty("syncs");
      expect(first).toHaveProperty("assignees");
      expect(first).toHaveProperty("createdBy");
      expect(first).toHaveProperty("tags");
    });
  });

  describe("bulkReschedule", () => {
    it("reschedules all actions belonging to user", async () => {
      const user = await createUser(db);
      const a1 = await createAction(db, { createdById: user.id });
      const a2 = await createAction(db, { createdById: user.id });
      const a3 = await createAction(db, { createdById: user.id });
      const target = new Date("2030-06-15T09:00:00Z");

      const caller = createTestCaller(user.id);
      const result = await caller.action.bulkReschedule({
        actionIds: [a1.id, a2.id, a3.id],
        dueDate: target,
      });

      expect(result.count).toBe(3);
      const fresh = await db.action.findMany({
        where: { id: { in: [a1.id, a2.id, a3.id] } },
      });
      for (const a of fresh) {
        expect(a.scheduledStart).toEqual(target);
      }
    });

    it("clears scheduledStart and dueDate when dueDate is null", async () => {
      const user = await createUser(db);
      const action = await db.action.create({
        data: {
          name: "Has dates",
          createdById: user.id,
          status: "ACTIVE",
          scheduledStart: new Date("2030-01-01"),
          dueDate: new Date("2030-01-01"),
        },
      });

      const caller = createTestCaller(user.id);
      await caller.action.bulkReschedule({
        actionIds: [action.id],
        dueDate: null,
      });

      const fresh = await db.action.findUnique({ where: { id: action.id } });
      expect(fresh?.scheduledStart).toBeNull();
      expect(fresh?.dueDate).toBeNull();
    });

    it("does not update stranger's actions (permission scoping)", async () => {
      const user = await createUser(db);
      const stranger = await createUser(db);
      const mine = await createAction(db, { createdById: user.id });
      const theirs = await createAction(db, { createdById: stranger.id });
      const target = new Date("2030-06-15T09:00:00Z");

      const caller = createTestCaller(user.id);
      await caller.action.bulkReschedule({
        actionIds: [mine.id, theirs.id],
        dueDate: target,
      });

      const freshMine = await db.action.findUnique({ where: { id: mine.id } });
      const freshTheirs = await db.action.findUnique({
        where: { id: theirs.id },
      });
      expect(freshMine?.scheduledStart).toEqual(target);
      expect(freshTheirs?.scheduledStart).toBeNull();
    });
  });

  describe("bulkDelete", () => {
    it("deletes all actions belonging to user", async () => {
      const user = await createUser(db);
      const a1 = await createAction(db, { createdById: user.id });
      const a2 = await createAction(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      const result = await caller.action.bulkDelete({
        actionIds: [a1.id, a2.id],
      });

      expect(result.count).toBe(2);
      const remaining = await db.action.findMany({
        where: { id: { in: [a1.id, a2.id] } },
      });
      expect(remaining).toHaveLength(0);
    });

    it("does not delete stranger's actions (permission scoping)", async () => {
      const user = await createUser(db);
      const stranger = await createUser(db);
      const mine = await createAction(db, { createdById: user.id });
      const theirs = await createAction(db, { createdById: stranger.id });

      const caller = createTestCaller(user.id);
      const result = await caller.action.bulkDelete({
        actionIds: [mine.id, theirs.id],
      });

      expect(result.count).toBe(1);
      const freshTheirs = await db.action.findUnique({
        where: { id: theirs.id },
      });
      expect(freshTheirs).not.toBeNull();
    });
  });

  describe("bulkAssignProject", () => {
    it("reassigns actions and resets kanbanStatus to TODO", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const project = await createProject(db, {
        createdById: user.id,
        workspaceId: ws.id,
      });
      const a1 = await createAction(db, {
        createdById: user.id,
        kanbanStatus: "DONE",
      });
      const a2 = await createAction(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      const result = await caller.action.bulkAssignProject({
        actionIds: [a1.id, a2.id],
        projectId: project.id,
      });

      expect(result.count).toBe(2);
      const fresh = await db.action.findMany({
        where: { id: { in: [a1.id, a2.id] } },
      });
      for (const a of fresh) {
        expect(a.projectId).toBe(project.id);
        expect(a.kanbanStatus).toBe("TODO");
      }
    });

    it("clears projectId and kanbanStatus when projectId is null", async () => {
      const user = await createUser(db);
      const project = await createProject(db, { createdById: user.id });
      const action = await createAction(db, {
        createdById: user.id,
        projectId: project.id,
        kanbanStatus: "TODO",
      });

      const caller = createTestCaller(user.id);
      await caller.action.bulkAssignProject({
        actionIds: [action.id],
        projectId: null,
      });

      const fresh = await db.action.findUnique({ where: { id: action.id } });
      expect(fresh?.projectId).toBeNull();
      expect(fresh?.kanbanStatus).toBeNull();
    });
  });
});
