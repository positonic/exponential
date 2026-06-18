import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createFeature,
} from "~/test/factories";

async function setupFeature() {
  const db = getTestDb();
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
  return { db, user, ws, product, feature };
}

describe("featureComment router", () => {
  beforeEach(() => {
    getTestDb();
  });

  it("creates an anchored comment and lists it with its author", async () => {
    const { user, feature } = await setupFeature();
    const caller = createTestCaller(user.id);

    const created = await caller.product.featureComment.create({
      featureId: feature.id,
      threadId: "thread-1",
      body: "This sentence needs work.",
      quotedText: "the original words",
    });

    expect(created.threadId).toBe("thread-1");
    expect(created.quotedText).toBe("the original words");
    expect(created.createdBy.id).toBe(user.id);

    const list = await caller.product.featureComment.list({
      featureId: feature.id,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.body).toBe("This sentence needs work.");
    expect(list[0]?.createdBy.name).toBe(user.name);
  });

  it("supports a doc-level comment (null threadId)", async () => {
    const { user, feature } = await setupFeature();
    const caller = createTestCaller(user.id);

    const created = await caller.product.featureComment.create({
      featureId: feature.id,
      body: "Overall this looks good.",
    });
    expect(created.threadId).toBeNull();
  });

  it("groups multiple comments under one thread (list returns all)", async () => {
    const { user, feature } = await setupFeature();
    const caller = createTestCaller(user.id);

    await caller.product.featureComment.create({
      featureId: feature.id,
      threadId: "t-shared",
      body: "first",
      quotedText: "span",
    });
    await caller.product.featureComment.create({
      featureId: feature.id,
      threadId: "t-shared",
      body: "second",
    });

    const list = await caller.product.featureComment.list({
      featureId: feature.id,
    });
    const inThread = list.filter((c) => c.threadId === "t-shared");
    expect(inThread).toHaveLength(2);
  });

  it("threads a reply under its parent's thread", async () => {
    const { user, feature } = await setupFeature();
    const caller = createTestCaller(user.id);

    const root = await caller.product.featureComment.create({
      featureId: feature.id,
      threadId: "t-reply",
      body: "root question",
      quotedText: "span",
    });
    const reply = await caller.product.featureComment.reply({
      parentId: root.id,
      body: "an answer",
    });

    expect(reply.parentId).toBe(root.id);
    expect(reply.threadId).toBe("t-reply");
    expect(reply.featureId).toBe(feature.id);

    // A reply to a reply still hangs off the root (one level deep).
    const nested = await caller.product.featureComment.reply({
      parentId: reply.id,
      body: "follow-up",
    });
    expect(nested.parentId).toBe(root.id);
  });

  it("resolves and unresolves a thread (root resolvedAt toggles, never deletes)", async () => {
    const { user, feature } = await setupFeature();
    const caller = createTestCaller(user.id);

    const root = await caller.product.featureComment.create({
      featureId: feature.id,
      threadId: "t-resolve",
      body: "discuss this",
      quotedText: "span",
    });

    await caller.product.featureComment.resolve({
      featureId: feature.id,
      threadId: "t-resolve",
    });
    let list = await caller.product.featureComment.list({ featureId: feature.id });
    expect(list.find((c) => c.id === root.id)?.resolvedAt).not.toBeNull();
    expect(list).toHaveLength(1); // still present, not deleted

    await caller.product.featureComment.unresolve({
      featureId: feature.id,
      threadId: "t-resolve",
    });
    list = await caller.product.featureComment.list({ featureId: feature.id });
    expect(list.find((c) => c.id === root.id)?.resolvedAt).toBeNull();
  });

  it("denies a non-member from commenting or listing", async () => {
    const { db, feature } = await setupFeature();
    const outsider = await createUser(db);
    const caller = createTestCaller(outsider.id);

    await expect(
      caller.product.featureComment.create({
        featureId: feature.id,
        body: "I shouldn't be able to post this.",
      }),
    ).rejects.toThrow();

    await expect(
      caller.product.featureComment.list({ featureId: feature.id }),
    ).rejects.toThrow();
  });
});
