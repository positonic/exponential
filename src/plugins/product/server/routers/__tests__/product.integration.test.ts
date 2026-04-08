import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createProduct,
  createFeature,
} from "~/test/factories";

describe("product router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("create", () => {
    it("creates a product for a workspace owner", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });

      const caller = createTestCaller(user.id);
      const product = await caller.product.product.create({
        workspaceId: ws.id,
        name: "My Product",
        slug: "my-product",
        description: "A test product",
      });

      expect(product.name).toBe("My Product");
      expect(product.workspaceId).toBe(ws.id);
      expect(product.createdById).toBe(user.id);
    });

    it("creates a product for a workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const caller = createTestCaller(member.id);
      const product = await caller.product.product.create({
        workspaceId: ws.id,
        name: "Member Product",
        slug: "member-product",
      });

      expect(product.createdById).toBe(member.id);
    });

    it("rejects non-members", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });

      const caller = createTestCaller(stranger.id);
      await expect(
        caller.product.product.create({
          workspaceId: ws.id,
          name: "Sneaky",
          slug: "sneaky",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("rejects invalid slugs", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);

      await expect(
        caller.product.product.create({
          workspaceId: ws.id,
          name: "Bad Slug",
          slug: "Not A Slug!",
        }),
      ).rejects.toThrow();
    });

    it("enforces unique slug within workspace", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);

      await caller.product.product.create({
        workspaceId: ws.id,
        name: "First",
        slug: "same-slug",
      });

      await expect(
        caller.product.product.create({
          workspaceId: ws.id,
          name: "Second",
          slug: "same-slug",
        }),
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("returns products in workspace", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
        name: "Alpha",
      });
      await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
        name: "Beta",
      });

      const caller = createTestCaller(user.id);
      const list = await caller.product.product.list({ workspaceId: ws.id });
      expect(list).toHaveLength(2);
    });

    it("does not leak products across workspaces", async () => {
      const userA = await createUser(db);
      const userB = await createUser(db);
      const wsA = await createWorkspace(db, { ownerId: userA.id });
      const wsB = await createWorkspace(db, { ownerId: userB.id });

      await createProduct(db, {
        workspaceId: wsA.id,
        createdById: userA.id,
        name: "A product",
      });
      await createProduct(db, {
        workspaceId: wsB.id,
        createdById: userB.id,
        name: "B product",
      });

      const callerA = createTestCaller(userA.id);
      const aList = await callerA.product.product.list({
        workspaceId: wsA.id,
      });
      expect(aList).toHaveLength(1);
      expect(aList[0]!.name).toBe("A product");

      // userA can't list wsB
      await expect(
        callerA.product.product.list({ workspaceId: wsB.id }),
      ).rejects.toThrow();
    });
  });

  describe("getBySlug", () => {
    it("returns product by slug within workspace", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
        name: "Findable",
        slug: "findable",
      });

      const caller = createTestCaller(user.id);
      const found = await caller.product.product.getBySlug({
        workspaceId: ws.id,
        slug: "findable",
      });
      expect(found.name).toBe("Findable");
    });

    it("throws NOT_FOUND for missing slug", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);

      await expect(
        caller.product.product.getBySlug({
          workspaceId: ws.id,
          slug: "nope",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update & delete", () => {
    it("updates product fields", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
        name: "Original",
      });

      const caller = createTestCaller(user.id);
      const updated = await caller.product.product.update({
        id: product.id,
        name: "Renamed",
        description: "Now with description",
      });

      expect(updated.name).toBe("Renamed");
      expect(updated.description).toBe("Now with description");
    });

    it("deletes a product and cascades to features", async () => {
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
      await caller.product.product.delete({ id: product.id });

      const productStillExists = await db.product.findUnique({
        where: { id: product.id },
      });
      expect(productStillExists).toBeNull();

      // Feature should be gone due to cascade
      const featureStillExists = await db.feature.findUnique({
        where: { id: feature.id },
      });
      expect(featureStillExists).toBeNull();
    });

    it("non-member cannot delete", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: owner.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.product.product.delete({ id: product.id }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
