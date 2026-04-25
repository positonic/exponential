import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, addWorkspaceMember } from "~/test/factories";

describe("workspace router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("create", () => {
    it("creates workspace with owner membership", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      const workspace = await caller.workspace.create({
        name: "My Workspace",
        slug: "my-workspace",
        type: "team",
      });

      expect(workspace.name).toBe("My Workspace");
      expect(workspace.slug).toBe("my-workspace");
      expect(workspace.members).toHaveLength(1);
      expect(workspace.members[0]!.role).toBe("owner");
      expect(workspace.members[0]!.userId).toBe(user.id);
    });

    it("rejects duplicate slug", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      await caller.workspace.create({
        name: "First",
        slug: "taken-slug",
      });

      await expect(
        caller.workspace.create({
          name: "Second",
          slug: "taken-slug",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("validates slug format", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      await expect(
        caller.workspace.create({
          name: "Bad Slug",
          slug: "Has Spaces",
        }),
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("returns only workspaces user belongs to", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      await createWorkspace(db, { ownerId: user1.id, name: "User1 WS", slug: "user1-ws" });
      await createWorkspace(db, { ownerId: user2.id, name: "User2 WS", slug: "user2-ws" });

      const caller1 = createTestCaller(user1.id);
      const result = await caller1.workspace.list();

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("User1 WS");
    });

    it("includes workspaces where user is a member (not owner)", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);

      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "shared-ws" });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const memberCaller = createTestCaller(member.id);
      const result = await memberCaller.workspace.list();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(ws.id);
    });
  });

  describe("getBySlug", () => {
    it("returns workspace for member", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "findable" });

      const caller = createTestCaller(owner.id);
      const result = await caller.workspace.getBySlug({ slug: "findable" });

      expect(result.id).toBe(ws.id);
      expect(result.currentUserRole).toBe("owner");
    });

    it("throws FORBIDDEN for non-member", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);

      await createWorkspace(db, { ownerId: owner.id, slug: "private-ws" });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.workspace.getBySlug({ slug: "private-ws" }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws NOT_FOUND for nonexistent slug", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      await expect(
        caller.workspace.getBySlug({ slug: "does-not-exist" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update", () => {
    it("owner can update", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "updatable" });

      const caller = createTestCaller(owner.id);
      const updated = await caller.workspace.update({
        workspaceId: ws.id,
        name: "Updated Name",
      });

      expect(updated.name).toBe("Updated Name");
    });

    it("admin can update", async () => {
      const owner = await createUser(db);
      const admin = await createUser(db);

      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "admin-update" });
      await addWorkspaceMember(db, ws.id, admin.id, "admin");

      const adminCaller = createTestCaller(admin.id);
      const updated = await adminCaller.workspace.update({
        workspaceId: ws.id,
        name: "Admin Updated",
      });

      expect(updated.name).toBe("Admin Updated");
    });

    it("member cannot update", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);

      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "member-no-update" });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const memberCaller = createTestCaller(member.id);
      await expect(
        memberCaller.workspace.update({
          workspaceId: ws.id,
          name: "Should Fail",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
