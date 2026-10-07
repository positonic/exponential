/**
 * The Meeting↔Workspace invariant end to end (CONTEXT.md, ADR-0014): a
 * project-linked Meeting's workspace is its Project's, on every create path
 * and when the Project itself moves. These are the cases that produced a
 * meeting listed under a workspace but "workspace-less" on its own page.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller, createApiKeyCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createApiKey,
  createWorkspace,
  createProject,
  createAction,
} from "~/test/factories";

describe("meeting placement invariant", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("startSession (device recorder)", () => {
    it("derives the workspace from the project when the device sends only a projectId", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: `place-start-${Date.now()}` });
      const project = await createProject(db, { createdById: user.id, workspaceId: ws.id });
      const { raw } = await createApiKey(db, user.id);

      const started = await createApiKeyCaller(raw).transcription.startSession({
        projectId: project.id,
        title: "Website feedback",
      });

      const row = await db.transcriptionSession.findUniqueOrThrow({ where: { id: started.id } });
      expect(row.projectId).toBe(project.id);
      expect(row.workspaceId).toBe(ws.id);
    });

    it("rejects a workspaceId that disagrees with the project's", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: `place-ws-a-${Date.now()}` });
      const other = await createWorkspace(db, { ownerId: user.id, slug: `place-ws-b-${Date.now()}` });
      const project = await createProject(db, { createdById: user.id, workspaceId: ws.id });
      const { raw } = await createApiKey(db, user.id);

      await expect(
        createApiKeyCaller(raw).transcription.startSession({
          projectId: project.id,
          workspaceId: other.id,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("keeps a caller-supplied workspace for a project-less meeting", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: `place-noproj-${Date.now()}` });
      const { raw } = await createApiKey(db, user.id);

      const started = await createApiKeyCaller(raw).transcription.startSession({
        projectId: null,
        workspaceId: ws.id,
      });

      const row = await db.transcriptionSession.findUniqueOrThrow({ where: { id: started.id } });
      expect(row.workspaceId).toBe(ws.id);
    });
  });

  describe("project.update moving a project between workspaces", () => {
    it("re-homes the project's meetings and their extracted actions", async () => {
      const user = await createUser(db);
      const from = await createWorkspace(db, { ownerId: user.id, slug: `place-from-${Date.now()}` });
      const to = await createWorkspace(db, { ownerId: user.id, slug: `place-to-${Date.now()}` });
      const project = await createProject(db, { createdById: user.id, workspaceId: from.id });
      const meeting = await db.transcriptionSession.create({
        data: {
          sessionId: `s-${Date.now()}`,
          transcription: "hello",
          userId: user.id,
          projectId: project.id,
          workspaceId: from.id,
        },
      });
      const extracted = await db.action.create({
        data: {
          name: "Extracted from the meeting",
          createdById: user.id,
          projectId: project.id,
          workspaceId: from.id,
          transcriptionSessionId: meeting.id,
        },
      });
      // An action on the project that did not come from a meeting is untouched
      // by this rule: only meeting-derived actions follow the meeting.
      const unrelated = await createAction(db, {
        createdById: user.id,
        projectId: project.id,
        workspaceId: from.id,
      });

      await createTestCaller(user.id).project.update({
        id: project.id,
        name: project.name,
        status: "ACTIVE",
        priority: "NONE",
        workspaceId: to.id,
      });

      const movedMeeting = await db.transcriptionSession.findUniqueOrThrow({ where: { id: meeting.id } });
      expect(movedMeeting.projectId).toBe(project.id);
      expect(movedMeeting.workspaceId).toBe(to.id);
      const movedAction = await db.action.findUniqueOrThrow({ where: { id: extracted.id } });
      expect(movedAction.workspaceId).toBe(to.id);
      const untouched = await db.action.findUniqueOrThrow({ where: { id: unrelated.id } });
      expect(untouched.workspaceId).toBe(from.id);
    });

    it("leaves meetings alone when the workspace does not change", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: `place-same-${Date.now()}` });
      const project = await createProject(db, { createdById: user.id, workspaceId: ws.id });
      const meeting = await db.transcriptionSession.create({
        data: {
          sessionId: `s-${Date.now()}`,
          transcription: "hello",
          userId: user.id,
          projectId: project.id,
          workspaceId: ws.id,
        },
      });
      const before = await db.transcriptionSession.findUniqueOrThrow({ where: { id: meeting.id } });

      await createTestCaller(user.id).project.update({
        id: project.id,
        name: "Renamed",
        status: "ACTIVE",
        priority: "NONE",
      });

      const after = await db.transcriptionSession.findUniqueOrThrow({ where: { id: meeting.id } });
      expect(after.workspaceId).toBe(ws.id);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });
  });

  describe("updateDetails", () => {
    it("cannot move a project-linked meeting out of its project's workspace", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: `place-upd-a-${Date.now()}` });
      const other = await createWorkspace(db, { ownerId: user.id, slug: `place-upd-b-${Date.now()}` });
      const project = await createProject(db, { createdById: user.id, workspaceId: ws.id });
      const meeting = await db.transcriptionSession.create({
        data: {
          sessionId: `s-${Date.now()}`,
          transcription: "hello",
          userId: user.id,
          projectId: project.id,
          workspaceId: ws.id,
        },
      });

      await expect(
        createTestCaller(user.id).transcription.updateDetails({ id: meeting.id, workspaceId: other.id }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const row = await db.transcriptionSession.findUniqueOrThrow({ where: { id: meeting.id } });
      expect(row.workspaceId).toBe(ws.id);
    });
  });
});
