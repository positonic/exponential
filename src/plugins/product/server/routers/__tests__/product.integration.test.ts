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

  // Every prefs key a user saves in a workspace lives in one PluginConfig
  // row, so these need the real database: only Postgres decides whether
  // overlapping saves can drop each other's changes.
  describe("saveViewPrefs", () => {
    it("keeps every prefs key when saves for different keys overlap", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);

      // The keys the Backlog, Insights and Features pages use, for a few
      // products: enough concurrent saves that a read-then-write merge would
      // drop some. There is no row yet, so they also race to create it.
      const keys = ["a", "b", "c", "d"].flatMap((slug) => [slug, `${slug}/insights`, `${slug}/features`]);
      await Promise.all(
        keys.map((productSlug) =>
          caller.product.product.saveViewPrefs({
            productSlug,
            workspaceId: ws.id,
            prefs: { view: productSlug },
          }),
        ),
      );

      for (const productSlug of keys) {
        expect(
          await caller.product.product.getViewPrefs({ productSlug, workspaceId: ws.id }),
        ).toEqual({ view: productSlug });
      }
    });

    it("keeps every field when saves to the same prefs key overlap", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);
      const key = { productSlug: "app", workspaceId: ws.id };
      await caller.product.product.saveViewPrefs({ ...key, prefs: { view: "list" } });

      await Promise.all([
        caller.product.product.saveViewPrefs({ ...key, prefs: { groupBy: "status" } }),
        caller.product.product.saveViewPrefs({ ...key, prefs: { sortField: "priority", sortDir: "desc" } }),
        caller.product.product.saveViewPrefs({ ...key, prefs: { visibleColumns: ["id", "title"] } }),
        caller.product.product.saveViewPrefs({ ...key, prefs: { entity: "epics" } }),
        caller.product.product.saveViewPrefs({ ...key, prefs: { filters: { status: ["OPEN"] } } }),
      ]);

      expect(await caller.product.product.getViewPrefs(key)).toEqual({
        view: "list",
        groupBy: "status",
        sortField: "priority",
        sortDir: "desc",
        visibleColumns: ["id", "title"],
        entity: "epics",
        filters: { status: ["OPEN"] },
      });
    });

    it("replaces each saved pref and leaves everything else as stored", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);
      await db.pluginConfig.create({
        data: {
          pluginId: "product",
          workspaceId: ws.id,
          userId: user.id,
          enabled: false,
          settings: {
            other: 1,
            viewPrefs: {
              app: { view: "board", filters: { status: ["OPEN"], priority: ["HIGH"] } },
              "app/features": { filters: { area: ["a1"] } },
            },
          },
        },
      });

      const saved = await caller.product.product.saveViewPrefs({
        productSlug: "app",
        workspaceId: ws.id,
        prefs: { filters: { status: ["DONE"] } },
      });

      // A saved pref replaces its old value whole (no deep merge of filters).
      expect(saved.settings).toEqual({
        other: 1,
        viewPrefs: {
          app: { view: "board", filters: { status: ["DONE"] } },
          "app/features": { filters: { area: ["a1"] } },
        },
      });
      // Still the row itself, with only its settings changed.
      expect(saved).toMatchObject({
        pluginId: "product",
        workspaceId: ws.id,
        userId: user.id,
        enabled: false,
      });
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });

    it("treats a malformed stored value as empty", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);
      await db.pluginConfig.create({
        data: {
          pluginId: "product",
          workspaceId: ws.id,
          userId: user.id,
          settings: { viewPrefs: { app: "junk", other: { view: "board" } } },
        },
      });

      await caller.product.product.saveViewPrefs({
        productSlug: "app",
        workspaceId: ws.id,
        prefs: { view: "list" },
      });

      const config = await db.pluginConfig.findFirstOrThrow({ where: { userId: user.id } });
      expect(config.settings).toEqual({
        viewPrefs: { app: { view: "list" }, other: { view: "board" } },
      });
    });

    it("rejects non-members without writing anything", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });

      await expect(
        createTestCaller(stranger.id).product.product.saveViewPrefs({
          productSlug: "app",
          workspaceId: ws.id,
          prefs: { view: "list" },
        }),
      ).rejects.toThrow(TRPCError);
      expect(await db.pluginConfig.count({ where: { userId: stranger.id } })).toBe(0);
    });
  });
});
