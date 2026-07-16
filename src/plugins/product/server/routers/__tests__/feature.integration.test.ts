import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createFeature,
  createGoal,
} from "~/test/factories";

describe("feature router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("create", () => {
    it("creates a feature", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const feature = await caller.product.feature.create({
        productId: product.id,
        name: "Notifications",
        description: "Cross-channel delivery",
      });

      expect(feature.name).toBe("Notifications");
      expect(feature.productId).toBe(product.id);
      expect(feature.status).toBe("IDEA");
    });

    it("links feature to a Goal (strategic alignment)", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const goal = await createGoal(db, {
        userId: user.id,
        workspaceId: ws.id,
        title: "Q1 Objective",
      });

      const caller = createTestCaller(user.id);
      const feature = await caller.product.feature.create({
        productId: product.id,
        name: "Aligned feature",
        goalId: goal.id,
      });

      expect(feature.goalId).toBe(goal.id);
    });

    it("rejects cross-workspace feature creation", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: owner.id,
      });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.product.feature.create({
          productId: product.id,
          name: "Not allowed",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update", () => {
    it("re-derives descriptionDoc from a Markdown-only description write (ADR-0024)", async () => {
      // Exercises the real server path: node environment, no DOM globals —
      // the regeneration must still produce the canonical ProseMirror doc.
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const feature = await createFeature(db, {
        productId: product.id,
        createdById: user.id,
        name: "Doc sync",
      });
      // Simulate a feature whose PRD was already opened in the editor.
      await db.feature.update({
        where: { id: feature.id },
        data: {
          descriptionDoc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "stale body" }],
              },
            ],
          },
          docVersion: 3,
        },
      });

      const caller = createTestCaller(user.id);
      await caller.product.feature.update({
        id: feature.id,
        description: "# Fresh body\n\n- [x] shipped it",
      });

      const stored = await db.feature.findUniqueOrThrow({
        where: { id: feature.id },
        select: { description: true, descriptionDoc: true, docVersion: true },
      });
      expect(stored.description).toBe("# Fresh body\n\n- [x] shipped it");
      expect(stored.docVersion).toBe(4);
      const doc = stored.descriptionDoc as {
        type: string;
        content: Array<{ type: string }>;
      };
      expect(doc.type).toBe("doc");
      expect(doc.content.map((n) => n.type)).toEqual(["heading", "taskList"]);
      expect(JSON.stringify(doc)).not.toContain("stale body");
    });
  });

  describe("scopes", () => {
    it("adds scopes in display order", async () => {
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
      const s1 = await caller.product.feature.addScope({
        featureId: feature.id,
        version: "v1",
        description: "Email",
      });
      const s2 = await caller.product.feature.addScope({
        featureId: feature.id,
        version: "v2",
        description: "+ SMS",
      });

      expect(s1.displayOrder).toBe(0);
      expect(s2.displayOrder).toBe(1);
    });

    it("cascades scope deletion when feature is deleted", async () => {
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
      await caller.product.feature.addScope({
        featureId: feature.id,
        version: "v1",
        description: "Email",
      });
      await caller.product.feature.delete({ id: feature.id });

      const scopes = await db.featureScope.findMany({
        where: { featureId: feature.id },
      });
      expect(scopes).toHaveLength(0);
    });
  });

  describe("user stories", () => {
    it("creates a user story optionally linked to a scope", async () => {
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
      const scope = await caller.product.feature.addScope({
        featureId: feature.id,
        version: "v1",
        description: "Email",
      });

      const story = await caller.product.feature.addUserStory({
        featureId: feature.id,
        scopeId: scope.id,
        asA: "user",
        iWant: "an email when mentioned",
        soThat: "I know right away",
      });

      expect(story.scopeId).toBe(scope.id);
      expect(story.featureId).toBe(feature.id);
    });

    it("rejects user story with scope from a different feature", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const product = await createProduct(db, {
        workspaceId: ws.id,
        createdById: user.id,
      });
      const feature1 = await createFeature(db, {
        productId: product.id,
        createdById: user.id,
      });
      const feature2 = await createFeature(db, {
        productId: product.id,
        createdById: user.id,
      });

      const caller = createTestCaller(user.id);
      const scopeOfF2 = await caller.product.feature.addScope({
        featureId: feature2.id,
        version: "v1",
        description: "Scope on f2",
      });

      await expect(
        caller.product.feature.addUserStory({
          featureId: feature1.id,
          scopeId: scopeOfF2.id,
          iWant: "impossible cross-link",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
