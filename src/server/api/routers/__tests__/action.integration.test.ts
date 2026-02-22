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
});
