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

async function createTranscription(
  db: ReturnType<typeof getTestDb>,
  args: {
    userId: string;
    projectId?: string | null;
    workspaceId?: string | null;
    title?: string;
  },
) {
  const id = `s-${Math.random().toString(36).slice(2, 10)}`;
  return db.transcriptionSession.create({
    data: {
      sessionId: id,
      title: args.title ?? `Title ${id}`,
      transcription: "hello world",
      userId: args.userId,
      projectId: args.projectId ?? null,
      workspaceId: args.workspaceId ?? null,
    },
  });
}

describe("transcription router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getById", () => {
    it("workspace member can view a transcription on an unrestricted project", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-getbyid-open" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      const trx = await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const memberCaller = createTestCaller(member.id);
      const result = await memberCaller.transcription.getById({ id: trx.id });
      expect(result.id).toBe(trx.id);
    });

    it("denies a workspace member when the project is restricted", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-getbyid-restricted" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const trx = await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const memberCaller = createTestCaller(member.id);
      await expect(
        memberCaller.transcription.getById({ id: trx.id }),
      ).rejects.toThrow(TRPCError);
    });

    it("allows a ProjectMember on a restricted project", async () => {
      const owner = await createUser(db);
      const projectMember = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-getbyid-pm" });
      await addWorkspaceMember(db, ws.id, projectMember.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, projectMember.id, "viewer");
      const trx = await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const caller = createTestCaller(projectMember.id);
      const result = await caller.transcription.getById({ id: trx.id });
      expect(result.id).toBe(trx.id);
    });

    it("workspace owner is the escape hatch for a restricted project", async () => {
      const owner = await createUser(db);
      const projectCreator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-getbyid-escape" });
      await addWorkspaceMember(db, ws.id, projectCreator.id, "member");
      const project = await createProject(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const trx = await createTranscription(db, {
        userId: projectCreator.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const ownerCaller = createTestCaller(owner.id);
      const result = await ownerCaller.transcription.getById({ id: trx.id });
      expect(result.id).toBe(trx.id);
    });
  });

  describe("getProjectTranscriptions", () => {
    it("returns transcriptions uploaded by other users on the same project", async () => {
      const owner = await createUser(db);
      const collaborator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-list-shared" });
      await addWorkspaceMember(db, ws.id, collaborator.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      // Owner uploaded this one — collaborator should still see it.
      await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
        title: "Owner's recording",
      });

      const caller = createTestCaller(collaborator.id);
      const list = await caller.transcription.getProjectTranscriptions({
        projectId: project.id,
      });
      expect(list).toHaveLength(1);
      expect(list[0]!.title).toBe("Owner's recording");
    });

    it("denies access when the user has no project access", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-list-deny" });
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.transcription.getProjectTranscriptions({ projectId: project.id }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("getAllTranscriptions", () => {
    it("hides restricted-project transcriptions from a non-member workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-all-hide" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const restricted = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
        name: "Restricted",
      });
      await createTranscription(db, {
        userId: owner.id,
        projectId: restricted.id,
        workspaceId: ws.id,
        title: "Hidden recording",
      });

      const memberCaller = createTestCaller(member.id);
      const all = await memberCaller.transcription.getAllTranscriptions();
      expect(all.find((t) => t.title === "Hidden recording")).toBeUndefined();
    });

    it("includes another user's transcription on an open project the caller can access", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-all-show" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
        title: "Shared recording",
      });

      const memberCaller = createTestCaller(member.id);
      const all = await memberCaller.transcription.getAllTranscriptions();
      expect(all.find((t) => t.title === "Shared recording")).toBeDefined();
    });

    it("workspace owner sees a restricted project's transcriptions via escape hatch", async () => {
      const owner = await createUser(db);
      const projectCreator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-all-escape" });
      await addWorkspaceMember(db, ws.id, projectCreator.id, "member");
      const project = await createProject(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await createTranscription(db, {
        userId: projectCreator.id,
        projectId: project.id,
        workspaceId: ws.id,
        title: "Locked but visible to owner",
      });

      const ownerCaller = createTestCaller(owner.id);
      const all = await ownerCaller.transcription.getAllTranscriptions();
      expect(all.find((t) => t.title === "Locked but visible to owner")).toBeDefined();
    });
  });

  describe("assignProject", () => {
    it("denies moving a transcription into a project the user can't edit", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-assign-deny" });
      const targetProject = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      // Stranger is not a workspace member, owns their own transcription.
      const trx = await createTranscription(db, { userId: stranger.id });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.transcription.assignProject({
          transcriptionId: trx.id,
          projectId: targetProject.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("allows assigning when the user can edit the target project", async () => {
      const owner = await createUser(db);
      const trx = await createTranscription(db, { userId: owner.id });
      const project = await createProject(db, { createdById: owner.id });

      const caller = createTestCaller(owner.id);
      const result = await caller.transcription.assignProject({
        transcriptionId: trx.id,
        projectId: project.id,
      });
      expect(result.projectId).toBe(project.id);
    });

    it("a project editor on a restricted project can assign their own transcription", async () => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-assign-editor" });
      await addWorkspaceMember(db, ws.id, editor.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, editor.id, "editor");
      const trx = await createTranscription(db, { userId: editor.id });

      const editorCaller = createTestCaller(editor.id);
      const result = await editorCaller.transcription.assignProject({
        transcriptionId: trx.id,
        projectId: project.id,
      });
      expect(result.projectId).toBe(project.id);
    });

    it("a project viewer on a restricted project cannot assign", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-assign-viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, viewer.id, "viewer");
      const trx = await createTranscription(db, { userId: viewer.id });

      const viewerCaller = createTestCaller(viewer.id);
      await expect(
        viewerCaller.transcription.assignProject({
          transcriptionId: trx.id,
          projectId: project.id,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("updateTitle", () => {
    it("blocks workspace members on a restricted project unless they're members", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "trx-update-restricted" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const trx = await createTranscription(db, {
        userId: owner.id,
        projectId: project.id,
        workspaceId: ws.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.transcription.updateTitle({ id: trx.id, title: "nope" }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
