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
} from "~/test/factories";

async function createPage(
  db: ReturnType<typeof getTestDb>,
  args: {
    createdById: string;
    workspaceId: string;
    projectId?: string | null;
    title?: string;
    includeInSearch?: boolean;
  },
) {
  return db.knowledgePage.create({
    data: {
      createdById: args.createdById,
      workspaceId: args.workspaceId,
      projectId: args.projectId ?? null,
      title: args.title ?? "A page",
      body: "hello world",
      includeInSearch: args.includeInSearch ?? true,
    },
  });
}

describe("page router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("get — visibility mirrors Meetings", () => {
    it("workspace member can view a page on an unrestricted project", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-open" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(member.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("denies a workspace member when the project is restricted", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-restricted" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(member.id);
      await expect(caller.page.get({ id: page.id })).rejects.toThrow(TRPCError);
    });

    it("allows a ProjectMember on a restricted project", async () => {
      const owner = await createUser(db);
      const projectMember = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-pm" });
      await addWorkspaceMember(db, ws.id, projectMember.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, projectMember.id, "viewer");
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(projectMember.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("workspace owner is the escape hatch for a restricted project", async () => {
      const owner = await createUser(db);
      const projectCreator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-escape" });
      await addWorkspaceMember(db, ws.id, projectCreator.id, "member");
      const project = await createProject(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const page = await createPage(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(owner.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("project-less page is visible to any workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-projless" });
      await addWorkspaceMember(db, ws.id, member.id, "viewer");
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
      });

      const caller = createTestCaller(member.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("denies a non-member of the workspace on a project-less page", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-stranger" });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
      });

      const caller = createTestCaller(stranger.id);
      await expect(caller.page.get({ id: page.id })).rejects.toThrow(TRPCError);
    });
  });

  describe("list — scoped to visible pages", () => {
    it("hides a restricted-project page from a non-member workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-list-hide" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const restricted = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
        name: "Restricted",
      });
      await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: restricted.id,
        title: "Hidden page",
      });
      await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
        title: "Open page",
      });

      const caller = createTestCaller(member.id);
      const list = await caller.page.list({ workspaceId: ws.id });
      const titles = list.map((p) => p.title);
      expect(titles).toContain("Open page");
      expect(titles).not.toContain("Hidden page");
    });

    it("filters by title search", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-list-search" });
      await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Roadmap" });
      await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Onboarding" });

      const caller = createTestCaller(owner.id);
      const list = await caller.page.list({ workspaceId: ws.id, search: "road" });
      expect(list.map((p) => p.title)).toEqual(["Roadmap"]);
    });
  });

  describe("create — placement gating", () => {
    it("a non-viewer workspace member can create a project-less page", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-ok" });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const caller = createTestCaller(member.id);
      const page = await caller.page.create({ workspaceId: ws.id, title: "Notes" });
      expect(page.title).toBe("Notes");
      expect(page.createdById).toBe(member.id);
    });

    it("a viewer cannot create a page", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");

      const caller = createTestCaller(viewer.id);
      await expect(
        caller.page.create({ workspaceId: ws.id, title: "Nope" }),
      ).rejects.toThrow(TRPCError);
    });

    it("cannot create a page on a restricted project without edit access", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-restricted" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      const caller = createTestCaller(member.id);
      await expect(
        caller.page.create({ workspaceId: ws.id, projectId: project.id, title: "X" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update — optimistic concurrency", () => {
    it("rejects a stale body save (docVersion conflict)", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-update-stale" });
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });

      const caller = createTestCaller(owner.id);
      // First save from base 0 succeeds and bumps to 1.
      const first = await caller.page.update({
        id: page.id,
        baseVersion: 0,
        bodyDoc: { type: "doc", content: [] },
        body: "v1",
      });
      expect(first).toMatchObject({ docVersion: 1 });

      // A second save still claiming base 0 is stale.
      await expect(
        caller.page.update({
          id: page.id,
          baseVersion: 0,
          bodyDoc: { type: "doc", content: [] },
          body: "v2",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("a viewer cannot edit a project-less page", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-update-viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });

      const caller = createTestCaller(viewer.id);
      await expect(
        caller.page.update({ id: page.id, title: "hijack" }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
