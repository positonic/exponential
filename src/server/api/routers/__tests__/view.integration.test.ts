import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProject,
  createAction,
  addWorkspaceMember,
  addProjectMember,
} from "~/test/factories";

describe("view router — access gating", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getViewActions", () => {
    it("intersects saved-view projectIds with accessible projects (restricted project filtered out)", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "view-intersect" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");

      const openProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      const restrictedProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      await createAction(db, {
        createdById: owner.id,
        projectId: openProject.id,
        workspaceId: ws.id,
        name: "Open Action",
      });
      await createAction(db, {
        createdById: owner.id,
        projectId: restrictedProject.id,
        workspaceId: ws.id,
        name: "Restricted Action",
      });

      const actions = await createTestCaller(stranger.id).view.getViewActions({
        workspaceId: ws.id,
        filters: { projectIds: [openProject.id, restrictedProject.id] },
      });

      const names = actions.map((a) => a.name);
      expect(names).toContain("Open Action");
      expect(names).not.toContain("Restricted Action");
    });

    it("returns empty when caller can access NONE of the requested projects", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "view-empty" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");

      const restrictedProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await createAction(db, {
        createdById: owner.id,
        projectId: restrictedProject.id,
        workspaceId: ws.id,
        name: "Hidden",
      });

      const actions = await createTestCaller(stranger.id).view.getViewActions({
        workspaceId: ws.id,
        filters: { projectIds: [restrictedProject.id] },
      });

      expect(actions).toEqual([]);
    });

    it("with no projectIds filter, hides actions of restricted projects from non-members", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "view-no-filter" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");

      const restrictedProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await createAction(db, {
        createdById: owner.id,
        projectId: restrictedProject.id,
        workspaceId: ws.id,
        name: "Restricted Hidden",
      });

      const actions = await createTestCaller(stranger.id).view.getViewActions({
        workspaceId: ws.id,
      });

      expect(actions.find((a) => a.name === "Restricted Hidden")).toBeUndefined();
    });

    it("ProjectMember on restricted project sees their actions through saved-view filter", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "view-pm" });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const restrictedProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, restrictedProject.id, member.id, "viewer");
      await createAction(db, {
        createdById: owner.id,
        projectId: restrictedProject.id,
        workspaceId: ws.id,
        name: "Visible to PM",
      });

      const actions = await createTestCaller(member.id).view.getViewActions({
        workspaceId: ws.id,
        filters: { projectIds: [restrictedProject.id] },
      });
      expect(actions.some((a) => a.name === "Visible to PM")).toBe(true);
    });
  });
});
