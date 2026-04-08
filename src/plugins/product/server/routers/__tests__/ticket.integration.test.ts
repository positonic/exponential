import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createFeature,
  createTicket,
  createAction,
} from "~/test/factories";

describe("ticket router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("create", () => {
    it("creates a ticket with defaults", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const ticket = await caller.product.ticket.create({
        productId: product.id,
        title: "Fix the thing",
      });

      expect(ticket.title).toBe("Fix the thing");
      expect(ticket.type).toBe("FEATURE");
      expect(ticket.status).toBe("BACKLOG");
    });

    it("creates a ticket linked to a feature", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const feature = await createFeature(db, {
        productId: product.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const ticket = await caller.product.ticket.create({
        productId: product.id,
        title: "Implement email",
        type: "FEATURE",
        featureId: feature.id,
      });

      expect(ticket.featureId).toBe(feature.id);
    });

    it("auto-sets completedAt when status transitions to DONE", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const updated = await caller.product.ticket.update({
        id: ticket.id,
        status: "DONE",
      });

      expect(updated.completedAt).not.toBeNull();
    });
  });

  describe("comments", () => {
    it("adds and deletes own comments", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const comment = await caller.product.ticket.addComment({
        ticketId: ticket.id,
        content: "Looks good",
      });
      expect(comment.content).toBe("Looks good");

      await caller.product.ticket.deleteComment({ id: comment.id });
      const remaining = await db.ticketComment.findMany({
        where: { ticketId: ticket.id },
      });
      expect(remaining).toHaveLength(0);
    });

    it("cannot delete another user's comment", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      await db.workspaceUser.create({
        data: { workspaceId: ws.id, userId: member.id, role: "member" },
      });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: owner.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: owner.id,
      });

      const ownerCaller = createTestCaller(owner.id);
      const comment = await ownerCaller.product.ticket.addComment({
        ticketId: ticket.id,
        content: "By owner",
      });

      const memberCaller = createTestCaller(member.id);
      await expect(
        memberCaller.product.ticket.deleteComment({ id: comment.id }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("action linking", () => {
    it("links and unlinks an action", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: user.id,
      });
      const action = await createAction(db, { createdById: user.id });

      const caller = createTestCaller(user.id);
      await caller.product.ticket.linkAction({
        ticketId: ticket.id,
        actionId: action.id,
      });

      const linked = await db.action.findUnique({ where: { id: action.id } });
      expect(linked?.ticketId).toBe(ticket.id);

      await caller.product.ticket.unlinkAction({ actionId: action.id });
      const unlinked = await db.action.findUnique({ where: { id: action.id } });
      expect(unlinked?.ticketId).toBeNull();
    });
  });

  describe("access control", () => {
    it("non-member cannot list or create tickets", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: owner.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.product.ticket.list({ productId: product.id }),
      ).rejects.toThrow(TRPCError);

      await expect(
        strangerCaller.product.ticket.create({
          productId: product.id,
          title: "No access",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
