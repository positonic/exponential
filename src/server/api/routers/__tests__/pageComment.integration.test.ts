import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
} from "~/test/factories";

async function createPage(
  db: ReturnType<typeof getTestDb>,
  args: { createdById: string; workspaceId: string; title?: string },
) {
  return db.knowledgePage.create({
    data: {
      createdById: args.createdById,
      workspaceId: args.workspaceId,
      title: args.title ?? "A page",
      body: "hello world",
    },
  });
}

describe("pageComment router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates a comment and lists it with its author", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const page = await createPage(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });

    const caller = createTestCaller(user.id);
    const created = await caller.pageComment.create({
      pageId: page.id,
      body: "First comment",
    });
    expect(created.createdBy.id).toBe(user.id);

    const list = await caller.pageComment.list({ pageId: page.id });
    expect(list).toHaveLength(1);
    expect(list[0]?.body).toBe("First comment");
    expect(list[0]?.createdBy.name).toBe(user.name);
  });

  it("lets any workspace member with view access comment", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const page = await createPage(db, {
      createdById: owner.id,
      workspaceId: ws.id,
    });

    const caller = createTestCaller(member.id);
    const created = await caller.pageComment.create({
      pageId: page.id,
      body: "Member comment",
    });
    expect(created.createdBy.id).toBe(member.id);
  });

  it("rejects list and create from a non-member", async () => {
    const owner = await createUser(db);
    const outsider = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const page = await createPage(db, {
      createdById: owner.id,
      workspaceId: ws.id,
    });

    const caller = createTestCaller(outsider.id);
    await expect(
      caller.pageComment.list({ pageId: page.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.pageComment.create({ pageId: page.id, body: "nope" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("update and delete are author-only", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const page = await createPage(db, {
      createdById: owner.id,
      workspaceId: ws.id,
    });

    const ownerCaller = createTestCaller(owner.id);
    const comment = await ownerCaller.pageComment.create({
      pageId: page.id,
      body: "Original",
    });

    const memberCaller = createTestCaller(member.id);
    await expect(
      memberCaller.pageComment.update({
        commentId: comment.id,
        body: "hijacked",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      memberCaller.pageComment.delete({ commentId: comment.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updated = await ownerCaller.pageComment.update({
      commentId: comment.id,
      body: "Edited",
    });
    expect(updated.body).toBe("Edited");

    const deleted = await ownerCaller.pageComment.delete({
      commentId: comment.id,
    });
    expect(deleted.success).toBe(true);
    const list = await ownerCaller.pageComment.list({ pageId: page.id });
    expect(list).toHaveLength(0);
  });

  it("comments cascade away when the page is deleted", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const page = await createPage(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });

    const caller = createTestCaller(user.id);
    await caller.pageComment.create({ pageId: page.id, body: "doomed" });
    await db.knowledgePage.delete({ where: { id: page.id } });

    const orphans = await db.knowledgePageComment.findMany({
      where: { pageId: page.id },
    });
    expect(orphans).toHaveLength(0);
  });

  describe("anchored threads pin their mark into bodyDoc", () => {
    // "indicator" sits at positions 11..20: 1 for the paragraph's opening,
    // plus its offset in the text.
    const bodyDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "check the indicator value" }] }],
    };
    const anchor = { baseVersion: 2, from: 11, to: 20, prefix: "check the ", suffix: " value" };

    async function pageWithDoc(ownerId: string, workspaceId: string) {
      const page = await createPage(db, { createdById: ownerId, workspaceId });
      return db.knowledgePage.update({
        where: { id: page.id },
        data: { bodyDoc, docVersion: 2 },
      });
    }

    it("an editor's new thread lands in the stored doc", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      const page = await pageWithDoc(owner.id, ws.id);

      const created = await createTestCaller(owner.id).pageComment.create({
        pageId: page.id,
        threadId: "thread-1",
        body: "Which indicator?",
        quotedText: "indicator",
        anchor,
      });

      expect(created.anchor).toEqual({ anchored: true, docVersion: 3, fastForward: true });
      const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
      expect(stored.docVersion).toBe(3);
      expect(JSON.stringify(stored.bodyDoc)).toContain('"threadId":"thread-1"');
    });

    it("a viewer's thread doesn't write to a doc they can't edit", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
      const page = await pageWithDoc(owner.id, ws.id);

      const created = await createTestCaller(viewer.id).pageComment.create({
        pageId: page.id,
        threadId: "thread-1",
        body: "Which indicator?",
        quotedText: "indicator",
        anchor,
      });

      expect(created.anchor).toEqual({ anchored: false, fastForward: false });
      const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
      expect(stored.docVersion).toBe(2);
    });
  });
});
