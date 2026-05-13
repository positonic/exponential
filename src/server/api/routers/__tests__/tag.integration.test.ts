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
  createEpic,
  createAction,
  createTag,
} from "~/test/factories";

describe("tag router (polymorphic)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("setEntityTags", () => {
    it("sets, replaces, and clears tags on an Action", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const action = await createAction(db, {
        createdById: user.id,
        workspaceId: ws.id,
      });
      const tagA = await createTag(db, { workspaceId: ws.id, slug: `a-${action.id}` });
      const tagB = await createTag(db, { workspaceId: ws.id, slug: `b-${action.id}` });

      const caller = createTestCaller(user.id);

      const first = await caller.tag.setEntityTags({
        entityType: "action",
        entityId: action.id,
        tagIds: [tagA.id, tagB.id],
      });
      expect(first.tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());

      const replaced = await caller.tag.setEntityTags({
        entityType: "action",
        entityId: action.id,
        tagIds: [tagA.id],
      });
      expect(replaced.tags.map((t) => t.id)).toEqual([tagA.id]);

      const cleared = await caller.tag.setEntityTags({
        entityType: "action",
        entityId: action.id,
        tagIds: [],
      });
      expect(cleared.tags).toEqual([]);
    });

    it("sets and replaces tags on a Ticket", async () => {
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
      const tagA = await createTag(db, { workspaceId: ws.id, slug: `t-a-${ticket.id}` });
      const tagB = await createTag(db, { workspaceId: ws.id, slug: `t-b-${ticket.id}` });

      const caller = createTestCaller(user.id);

      const first = await caller.tag.setEntityTags({
        entityType: "ticket",
        entityId: ticket.id,
        tagIds: [tagA.id, tagB.id],
      });
      expect(first.tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());

      const replaced = await caller.tag.setEntityTags({
        entityType: "ticket",
        entityId: ticket.id,
        tagIds: [tagB.id],
      });
      expect(replaced.tags.map((t) => t.id)).toEqual([tagB.id]);
    });

    it("sets and replaces tags on a Feature", async () => {
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
      const tagA = await createTag(db, { workspaceId: ws.id, slug: `f-a-${feature.id}` });
      const tagB = await createTag(db, { workspaceId: ws.id, slug: `f-b-${feature.id}` });

      const caller = createTestCaller(user.id);

      const first = await caller.tag.setEntityTags({
        entityType: "feature",
        entityId: feature.id,
        tagIds: [tagA.id],
      });
      expect(first.tags.map((t) => t.id)).toEqual([tagA.id]);

      const replaced = await caller.tag.setEntityTags({
        entityType: "feature",
        entityId: feature.id,
        tagIds: [tagA.id, tagB.id],
      });
      expect(replaced.tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());
    });

    it("sets and replaces tags on an Epic", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const epic = await createEpic(db, {
        ownerId: user.id,
        workspaceId: ws.id,
      });
      const tagA = await createTag(db, { workspaceId: ws.id, slug: `e-a-${epic.id}` });
      const tagB = await createTag(db, { workspaceId: ws.id, slug: `e-b-${epic.id}` });

      const caller = createTestCaller(user.id);

      const first = await caller.tag.setEntityTags({
        entityType: "epic",
        entityId: epic.id,
        tagIds: [tagA.id, tagB.id],
      });
      expect(first.tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());

      const cleared = await caller.tag.setEntityTags({
        entityType: "epic",
        entityId: epic.id,
        tagIds: [],
      });
      expect(cleared.tags).toEqual([]);
    });

    it("rejects a tag from a different workspace", async () => {
      const user = await createUser(db);
      const wsA = await createWorkspace(db, { ownerId: user.id });
      const wsB = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: wsA.id,
        createdById: user.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: user.id,
      });
      const foreignTag = await createTag(db, { workspaceId: wsB.id });

      const caller = createTestCaller(user.id);

      await expect(
        caller.tag.setEntityTags({
          entityType: "ticket",
          entityId: ticket.id,
          tagIds: [foreignTag.id],
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws NOT_FOUND for a missing entity", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      await expect(
        caller.tag.setEntityTags({
          entityType: "epic",
          entityId: "does-not-exist",
          tagIds: [],
        }),
      ).rejects.toThrow();
    });

    it("rejects when the user is not a workspace member of the entity", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: owner.id,
      });
      const ticket = await createTicket(db, {
        productId: product.id,
        createdById: owner.id,
      });
      const tag = await createTag(db, { workspaceId: ws.id });

      const strangerCaller = createTestCaller(stranger.id);

      await expect(
        strangerCaller.tag.setEntityTags({
          entityType: "ticket",
          entityId: ticket.id,
          tagIds: [tag.id],
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("listForEntity", () => {
    it("returns the entity's current tags", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const epic = await createEpic(db, {
        ownerId: user.id,
        workspaceId: ws.id,
      });
      const tag = await createTag(db, { workspaceId: ws.id });

      const caller = createTestCaller(user.id);
      await caller.tag.setEntityTags({
        entityType: "epic",
        entityId: epic.id,
        tagIds: [tag.id],
      });

      const tags = await caller.tag.listForEntity({
        entityType: "epic",
        entityId: epic.id,
      });
      expect(tags.map((t) => t.id)).toEqual([tag.id]);
    });
  });
});
