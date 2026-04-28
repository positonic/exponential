import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProject,
  addWorkspaceMember,
  addProjectMember,
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

  describe("restricted projects", () => {
    it("getAll hides a restricted project from a plain workspace member", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "restrict-hide-ws" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        name: "Restricted",
        isRestricted: true,
      });

      const strangerCaller = createTestCaller(stranger.id);
      const projects = await strangerCaller.project.getAll({ workspaceId: ws.id });

      expect(projects.some((p) => p.name === "Restricted")).toBe(false);
    });

    it("getAll shows a restricted project to a workspace owner (escape hatch)", async () => {
      const creator = await createUser(db);
      const wsOwner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: wsOwner.id, slug: "restrict-owner-ws" });
      await addWorkspaceMember(db, ws.id, creator.id, "member");
      await createProject(db, {
        createdById: creator.id,
        workspaceId: ws.id,
        name: "Owner Restricted",
        isRestricted: true,
      });

      const ownerCaller = createTestCaller(wsOwner.id);
      const projects = await ownerCaller.project.getAll({ workspaceId: ws.id });

      expect(projects.some((p) => p.name === "Owner Restricted")).toBe(true);
    });

    it("getAll shows a restricted project to a ProjectMember", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "restrict-member-ws" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        name: "Member Project",
        isRestricted: true,
      });
      await addProjectMember(db, project.id, member.id, "editor");

      const memberCaller = createTestCaller(member.id);
      const projects = await memberCaller.project.getAll({ workspaceId: ws.id });

      expect(projects.some((p) => p.name === "Member Project")).toBe(true);
    });

    it("flipping isRestricted hides a previously-visible workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "restrict-flip-ws" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        name: "Will Restrict",
      });

      const memberCaller = createTestCaller(member.id);
      const ownerCaller = createTestCaller(owner.id);

      // Initially visible
      const before = await memberCaller.project.getAll({ workspaceId: ws.id });
      expect(before.some((p) => p.id === project.id)).toBe(true);

      // Owner restricts
      await ownerCaller.project.setRestricted({
        projectId: project.id,
        isRestricted: true,
      });

      // Now hidden
      const after = await memberCaller.project.getAll({ workspaceId: ws.id });
      expect(after.some((p) => p.id === project.id)).toBe(false);
    });
  });

  describe("setRestricted", () => {
    it("creator can flip the restriction", async () => {
      const owner = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const caller = createTestCaller(owner.id);
      const result = await caller.project.setRestricted({
        projectId: project.id,
        isRestricted: true,
      });

      expect(result.isRestricted).toBe(true);
    });

    it("a plain workspace member cannot flip the restriction", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "set-restrict-ws" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.project.setRestricted({
          projectId: project.id,
          isRestricted: true,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("a project editor cannot flip the restriction", async () => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const project = await createProject(db, {
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, editor.id, "editor");

      const editorCaller = createTestCaller(editor.id);
      await expect(
        editorCaller.project.setRestricted({
          projectId: project.id,
          isRestricted: false,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("a project admin can flip the restriction", async () => {
      const owner = await createUser(db);
      const admin = await createUser(db);
      const project = await createProject(db, {
        createdById: owner.id,
        isRestricted: false,
      });
      await addProjectMember(db, project.id, admin.id, "admin");

      const adminCaller = createTestCaller(admin.id);
      const result = await adminCaller.project.setRestricted({
        projectId: project.id,
        isRestricted: true,
      });

      expect(result.isRestricted).toBe(true);
    });
  });

  describe("member management", () => {
    it("addMember + listMembers happy path", async () => {
      const owner = await createUser(db);
      const newMember = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const caller = createTestCaller(owner.id);
      await caller.project.addMember({
        projectId: project.id,
        userId: newMember.id,
        role: "editor",
      });

      const members = await caller.project.listMembers({ projectId: project.id });
      expect(members).toHaveLength(1);
      expect(members[0]!.user.id).toBe(newMember.id);
      expect(members[0]!.role).toBe("editor");
    });

    it("addMember is idempotent and updates the role on repeat calls", async () => {
      const owner = await createUser(db);
      const target = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });

      const caller = createTestCaller(owner.id);
      await caller.project.addMember({
        projectId: project.id,
        userId: target.id,
        role: "viewer",
      });
      await caller.project.addMember({
        projectId: project.id,
        userId: target.id,
        role: "admin",
      });

      const members = await caller.project.listMembers({ projectId: project.id });
      expect(members).toHaveLength(1);
      expect(members[0]!.role).toBe("admin");
    });

    it("addMember requires manage_members permission", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const target = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "addmember-auth-ws" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.project.addMember({
          projectId: project.id,
          userId: target.id,
          role: "editor",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("removeMember removes a non-creator member", async () => {
      const owner = await createUser(db);
      const target = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });
      await addProjectMember(db, project.id, target.id, "editor");

      const caller = createTestCaller(owner.id);
      await caller.project.removeMember({
        projectId: project.id,
        userId: target.id,
      });

      const members = await caller.project.listMembers({ projectId: project.id });
      expect(members).toHaveLength(0);
    });

    it("removeMember refuses to remove the project creator", async () => {
      const owner = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });
      // Even if a creator row exists in ProjectMember, the rule fires on createdById.
      await addProjectMember(db, project.id, owner.id, "admin");

      const caller = createTestCaller(owner.id);
      await expect(
        caller.project.removeMember({
          projectId: project.id,
          userId: owner.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("removeMember requires manage_members permission", async () => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const target = await createUser(db);
      const project = await createProject(db, {
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, editor.id, "editor");
      await addProjectMember(db, project.id, target.id, "editor");

      const editorCaller = createTestCaller(editor.id);
      await expect(
        editorCaller.project.removeMember({
          projectId: project.id,
          userId: target.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("updateMemberRole changes the role", async () => {
      const owner = await createUser(db);
      const target = await createUser(db);
      const project = await createProject(db, { createdById: owner.id });
      await addProjectMember(db, project.id, target.id, "viewer");

      const caller = createTestCaller(owner.id);
      const updated = await caller.project.updateMemberRole({
        projectId: project.id,
        userId: target.id,
        role: "admin",
      });

      expect(updated.role).toBe("admin");
    });

    it("updateMemberRole requires manage_members permission", async () => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const target = await createUser(db);
      const project = await createProject(db, {
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, editor.id, "editor");
      await addProjectMember(db, project.id, target.id, "viewer");

      const editorCaller = createTestCaller(editor.id);
      await expect(
        editorCaller.project.updateMemberRole({
          projectId: project.id,
          userId: target.id,
          role: "admin",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
