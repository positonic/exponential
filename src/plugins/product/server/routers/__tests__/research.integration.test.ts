import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createFeature,
} from "~/test/factories";

describe("research router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates research and adds insights", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    const caller = createTestCaller(user.id);
    const research = await caller.product.research.create({
      productId: product.id,
      title: "User interview - round 1",
      type: "INTERVIEW",
    });

    const insight = await caller.product.research.addInsight({
      researchId: research.id,
      type: "PAIN_POINT",
      title: "Activity visibility issue",
      description: "Users don't notice new activity",
    });

    expect(insight.researchId).toBe(research.id);
    expect(insight.status).toBe("INBOX");
  });

  it("links insight to feature and updates status to LINKED", async () => {
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
    const research = await caller.product.research.create({
      productId: product.id,
      title: "Survey",
      type: "SURVEY",
    });
    const insight = await caller.product.research.addInsight({
      researchId: research.id,
      type: "OPPORTUNITY",
      title: "Cross-channel notifications",
      description: "Want cross-channel notifications",
    });

    await caller.product.research.linkInsightToFeature({
      insightId: insight.id,
      featureId: feature.id,
    });

    const refreshedInsight = await db.insight.findUnique({
      where: { id: insight.id },
    });
    expect(refreshedInsight?.status).toBe("LINKED");

    const link = await db.featureInsight.findUnique({
      where: {
        featureId_insightId: {
          featureId: feature.id,
          insightId: insight.id,
        },
      },
    });
    expect(link).not.toBeNull();
  });

  it("unlinks insight from feature", async () => {
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
    const research = await caller.product.research.create({
      productId: product.id,
      title: "Research",
    });
    const insight = await caller.product.research.addInsight({
      researchId: research.id,
      type: "OPPORTUNITY",
      title: "AI suggestion opportunity",
      description: "Could use AI suggestions",
    });

    await caller.product.research.linkInsightToFeature({
      insightId: insight.id,
      featureId: feature.id,
    });
    await caller.product.research.unlinkInsightFromFeature({
      insightId: insight.id,
      featureId: feature.id,
    });

    const links = await db.featureInsight.findMany({
      where: { insightId: insight.id },
    });
    expect(links).toHaveLength(0);
  });

  it("non-members are rejected", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: owner.id,
    });

    const strangerCaller = createTestCaller(stranger.id);
    await expect(
      strangerCaller.product.research.create({
        productId: product.id,
        title: "Nope",
      }),
    ).rejects.toThrow(TRPCError);
  });
});
