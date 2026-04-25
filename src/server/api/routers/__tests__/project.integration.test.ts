import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProject,
  addWorkspaceMember,
  createTeam,
  addTeamMember,
} from "~/test/factories";

describe("project router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getAll", () => {
    it("returns projects user created", async () => {
      const user = await createUser(db);
      await createProject(db, { createdById: user.id, name: "My Project" });

      const caller = createTestCaller(user.id);
      const projects = await caller.project.getAll();

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe("My Project");
    });

    it("returns projects from workspace user belongs to", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "proj-ws" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      await createProject(db, { createdById: owner.id, workspaceId: ws.id, name: "WS Project" });

      const memberCaller = createTestCaller(member.id);
      const projects = await memberCaller.project.getAll({ workspaceId: ws.id });

      expect(projects.some((p) => p.name === "WS Project")).toBe(true);
    });

    it("does NOT return projects from other workspaces", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);
      const ws1 = await createWorkspace(db, { ownerId: user1.id, slug: "ws-a" });
      const ws2 = await createWorkspace(db, { ownerId: user2.id, slug: "ws-b" });
      await createProject(db, { createdById: user1.id, workspaceId: ws1.id, name: "WS1 Proj" });
      await createProject(db, { createdById: user2.id, workspaceId: ws2.id, name: "WS2 Proj" });

      const caller1 = createTestCaller(user1.id);
      const projects = await caller1.project.getAll({ workspaceId: ws1.id });

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe("WS1 Proj");
    });

    it("returns projects from team user belongs to", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "team-proj-ws" });
      const team = await createTeam(db, { workspaceId: ws.id });
      await addTeamMember(db, team.id, member.id, "member");
      await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        teamId: team.id,
        name: "Team Project",
      });

      const memberCaller = createTestCaller(member.id);
      const projects = await memberCaller.project.getAll();

      expect(projects.some((p) => p.name === "Team Project")).toBe(true);
    });

    it("response has expected shape (contract test)", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "contract-proj-ws" });
      await createProject(db, { createdById: user.id, workspaceId: ws.id });

      const caller = createTestCaller(user.id);
      const projects = await caller.project.getAll();

      expect(projects[0]).toHaveProperty("id");
      expect(projects[0]).toHaveProperty("name");
      expect(projects[0]).toHaveProperty("status");
      expect(projects[0]).toHaveProperty("slug");
      expect(projects[0]).toHaveProperty("createdById");
    });
  });

  describe("create", () => {
    it("creates project in workspace", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "create-proj-ws" });

      const caller = createTestCaller(user.id);
      const project = await caller.project.create({
        name: "New Project",
        status: "ACTIVE",
        priority: "NONE",
        workspaceId: ws.id,
      });

      expect(project.name).toBe("New Project");
      expect(project.workspaceId).toBe(ws.id);
      expect(project.slug).toBeTruthy();
    });
  });

  describe("update", () => {
    it("creator can update", async () => {
      const user = await createUser(db);
      const project = await createProject(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      const updated = await caller.project.update({
        id: project.id,
        name: "Updated Project",
        status: "ACTIVE",
        priority: "NONE",
      });

      expect(updated.name).toBe("Updated Project");
    });

    it("unauthorized user cannot update", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.project.update({
          id: project.id,
          name: "Should Fail",
          status: "ACTIVE",
          priority: "NONE",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
