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

async function createPipelineProject(
  db: ReturnType<typeof getTestDb>,
  args: {
    workspaceId: string;
    createdById: string;
    isRestricted?: boolean;
  },
) {
  const project = await createProject(db, {
    createdById: args.createdById,
    workspaceId: args.workspaceId,
    isRestricted: args.isRestricted ?? false,
  });
  // Convert to a pipeline-typed project so the router considers it a pipeline.
  await db.project.update({
    where: { id: project.id },
    data: { type: "pipeline" },
  });
  const stage = await db.pipelineStage.create({
    data: {
      projectId: project.id,
      name: "Lead",
      color: "gray",
      order: 0,
      type: "active",
    },
  });
  return { project, stage };
}

describe("pipeline router — access gating", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getDeals", () => {
    it("allows a workspace member on an unrestricted pipeline", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-deals-open" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const { project } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: false,
      });

      const deals = await createTestCaller(member.id).pipeline.getDeals({
        projectId: project.id,
      });
      expect(deals).toEqual([]);
    });

    it("denies a non-member workspace user when pipeline is restricted", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-deals-deny" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const { project } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });

      await expect(
        createTestCaller(stranger.id).pipeline.getDeals({ projectId: project.id }),
      ).rejects.toThrow(TRPCError);
    });

    it("allows a ProjectMember on a restricted pipeline", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-deals-pm" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const { project } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, member.id, "viewer");

      const deals = await createTestCaller(member.id).pipeline.getDeals({
        projectId: project.id,
      });
      expect(deals).toEqual([]);
    });

    it("allows the workspace owner on a restricted pipeline (escape hatch)", async () => {
      const owner = await createUser(db);
      const projectCreator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-deals-escape" });
      await addWorkspaceMember(db, ws.id, projectCreator.id, "member");
      const { project } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: projectCreator.id,
        isRestricted: true,
      });

      const deals = await createTestCaller(owner.id).pipeline.getDeals({
        projectId: project.id,
      });
      expect(deals).toEqual([]);
    });
  });

  describe("createDeal", () => {
    it("denies a workspace viewer on a restricted pipeline", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-create-restricted" });
      await addWorkspaceMember(db, ws.id, viewer.id, "member");
      const { project, stage } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, viewer.id, "viewer");

      await expect(
        createTestCaller(viewer.id).pipeline.createDeal({
          projectId: project.id,
          stageId: stage.id,
          title: "Should fail",
          currency: "USD",
          workspaceId: ws.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("allows a ProjectMember editor on a restricted pipeline", async () => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-create-editor" });
      await addWorkspaceMember(db, ws.id, editor.id, "member");
      const { project, stage } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, editor.id, "editor");

      const deal = await createTestCaller(editor.id).pipeline.createDeal({
        projectId: project.id,
        stageId: stage.id,
        title: "Editor Deal",
        currency: "USD",
        workspaceId: ws.id,
      });
      expect(deal.title).toBe("Editor Deal");
    });
  });

  describe("getDeal / updateDeal", () => {
    it("denies non-member workspace user from reading a deal on a restricted pipeline", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-getdeal-deny" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const { project, stage } = await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });
      const deal = await db.deal.create({
        data: {
          projectId: project.id,
          stageId: stage.id,
          title: "Hidden Deal",
          currency: "USD",
          workspaceId: ws.id,
          createdById: owner.id,
          stageOrder: 0,
        },
      });

      await expect(
        createTestCaller(stranger.id).pipeline.getDeal({ id: deal.id }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("get (workspace-scoped)", () => {
    it("returns null when the workspace pipeline is restricted and caller is not a member", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pl-get-restricted" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      await createPipelineProject(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        isRestricted: true,
      });

      const result = await createTestCaller(stranger.id).pipeline.get({
        workspaceId: ws.id,
      });
      expect(result).toBeNull();
    });
  });
});
