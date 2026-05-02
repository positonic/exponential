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

describe("aiInteraction router — access gating", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("logInteraction", () => {
    it("denies logging tied to a restricted project the caller cannot view", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "ai-log-deny" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      await expect(
        createTestCaller(stranger.id).aiInteraction.logInteraction({
          platform: "direct",
          userMessage: "hi",
          aiResponse: "ok",
          projectId: project.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("allows logging on an accessible project for a ProjectMember", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "ai-log-pm" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, member.id, "viewer");

      const result = await createTestCaller(member.id).aiInteraction.logInteraction({
        platform: "direct",
        userMessage: "hi",
        aiResponse: "ok",
        projectId: project.id,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("startConversation", () => {
    it("denies starting a conversation tied to a restricted project the caller cannot view", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "ai-start-deny" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      await expect(
        createTestCaller(stranger.id).aiInteraction.startConversation({
          platform: "direct",
          projectId: project.id,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("getInteractionHistory", () => {
    it("denies filtering by a project the caller cannot view", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "ai-history-deny" });
      await addWorkspaceMember(db, ws.id, stranger.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      await expect(
        createTestCaller(stranger.id).aiInteraction.getInteractionHistory({
          limit: 10,
          projectId: project.id,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
