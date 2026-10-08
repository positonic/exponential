import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { TRPCError } from "@trpc/server";
import { syncPageLinks } from "~/server/services/pages/page-links";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProject,
  addWorkspaceMember,
  addProjectMember,
} from "~/test/factories";

async function createPage(
  db: ReturnType<typeof getTestDb>,
  args: {
    createdById: string;
    workspaceId: string;
    projectId?: string | null;
    title?: string;
    includeInSearch?: boolean;
  },
) {
  return db.knowledgePage.create({
    data: {
      createdById: args.createdById,
      workspaceId: args.workspaceId,
      projectId: args.projectId ?? null,
      title: args.title ?? "A page",
      body: "hello world",
      includeInSearch: args.includeInSearch ?? true,
    },
  });
}

/** A ProseMirror doc of `pageLink` nodes to the given page ids, in order. */
function linkDoc(...ids: string[]) {
  return {
    type: "doc",
    content: ids.map((pageId) => ({
      type: "pageLink",
      attrs: { pageId, title: "Linked", href: `/pages/${pageId}` },
    })),
  };
}

/** The editor's body save: a compare-and-set from the page's current version. */
async function saveDoc(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  pageId: string,
  bodyDoc: Record<string, unknown>,
) {
  const { docVersion } = await db.knowledgePage.findUniqueOrThrow({
    where: { id: pageId },
    select: { docVersion: true },
  });
  return createTestCaller(userId).page.update({
    id: pageId,
    baseVersion: docVersion,
    bodyDoc,
    body: "",
  });
}

async function storedRows(db: ReturnType<typeof getTestDb>, fromPageId: string) {
  return db.pageLink.findMany({
    where: { fromPageId },
    orderBy: { position: "asc" },
  });
}

async function storedLinks(db: ReturnType<typeof getTestDb>, fromPageId: string) {
  const rows = await db.pageLink.findMany({
    where: { fromPageId },
    orderBy: { position: "asc" },
    select: { toPageId: true },
  });
  return rows.map((r) => r.toPageId);
}

describe("page router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("get — visibility mirrors Meetings", () => {
    it("workspace member can view a page on an unrestricted project", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-open" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: false,
      });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(member.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("denies a workspace member when the project is restricted", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-restricted" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(member.id);
      await expect(caller.page.get({ id: page.id })).rejects.toThrow(TRPCError);
    });

    it("allows a ProjectMember on a restricted project", async () => {
      const owner = await createUser(db);
      const projectMember = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-pm" });
      await addWorkspaceMember(db, ws.id, projectMember.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      await addProjectMember(db, project.id, projectMember.id, "viewer");
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(projectMember.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("workspace owner is the escape hatch for a restricted project", async () => {
      const owner = await createUser(db);
      const projectCreator = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-escape" });
      await addWorkspaceMember(db, ws.id, projectCreator.id, "member");
      const project = await createProject(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        isRestricted: true,
      });
      const page = await createPage(db, {
        createdById: projectCreator.id,
        workspaceId: ws.id,
        projectId: project.id,
      });

      const caller = createTestCaller(owner.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("project-less page is visible to any workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-projless" });
      await addWorkspaceMember(db, ws.id, member.id, "viewer");
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
      });

      const caller = createTestCaller(member.id);
      const result = await caller.page.get({ id: page.id });
      expect(result.id).toBe(page.id);
    });

    it("denies a non-member of the workspace on a project-less page", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-get-stranger" });
      const page = await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
      });

      const caller = createTestCaller(stranger.id);
      await expect(caller.page.get({ id: page.id })).rejects.toThrow(TRPCError);
    });
  });

  describe("list — scoped to visible pages", () => {
    it("hides a restricted-project page from a non-member workspace member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-list-hide" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const restricted = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
        name: "Restricted",
      });
      await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: restricted.id,
        title: "Hidden page",
      });
      await createPage(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        projectId: null,
        title: "Open page",
      });

      const caller = createTestCaller(member.id);
      const list = await caller.page.list({ workspaceId: ws.id });
      const titles = list.map((p) => p.title);
      expect(titles).toContain("Open page");
      expect(titles).not.toContain("Hidden page");
    });

    it("filters by title search", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-list-search" });
      await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Roadmap" });
      await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Onboarding" });

      const caller = createTestCaller(owner.id);
      const list = await caller.page.list({ workspaceId: ws.id, search: "road" });
      expect(list.map((p) => p.title)).toEqual(["Roadmap"]);
    });
  });

  describe("create — placement gating", () => {
    it("a non-viewer workspace member can create a project-less page", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-ok" });
      await addWorkspaceMember(db, ws.id, member.id, "member");

      const caller = createTestCaller(member.id);
      const page = await caller.page.create({ workspaceId: ws.id, title: "Notes" });
      expect(page.title).toBe("Notes");
      expect(page.createdById).toBe(member.id);
    });

    it("a viewer cannot create a page", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");

      const caller = createTestCaller(viewer.id);
      await expect(
        caller.page.create({ workspaceId: ws.id, title: "Nope" }),
      ).rejects.toThrow(TRPCError);
    });

    it("cannot create a page on a restricted project without edit access", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-create-restricted" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const project = await createProject(db, {
        createdById: owner.id,
        workspaceId: ws.id,
        isRestricted: true,
      });

      const caller = createTestCaller(member.id);
      await expect(
        caller.page.create({ workspaceId: ws.id, projectId: project.id, title: "X" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update — optimistic concurrency", () => {
    it("rejects a stale body save (docVersion conflict)", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-update-stale" });
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });

      const caller = createTestCaller(owner.id);
      // First save from base 0 succeeds and bumps to 1.
      const first = await caller.page.update({
        id: page.id,
        baseVersion: 0,
        bodyDoc: { type: "doc", content: [] },
        body: "v1",
      });
      expect(first).toMatchObject({ docVersion: 1 });

      // A second save still claiming base 0 is stale.
      await expect(
        caller.page.update({
          id: page.id,
          baseVersion: 0,
          bodyDoc: { type: "doc", content: [] },
          body: "v2",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("a viewer cannot edit a project-less page", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-update-viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });

      const caller = createTestCaller(viewer.id);
      await expect(
        caller.page.update({ id: page.id, title: "hijack" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("update — Markdown-source writes", () => {
    it("re-derives the doc and keeps comment marks whose text survived", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-md-carry" });
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });
      await db.knowledgePage.update({
        where: { id: page.id },
        data: {
          bodyDoc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "check the " },
                  { type: "text", text: "indicator", marks: [{ type: "comment", attrs: { threadId: "t1" } }] },
                  { type: "text", text: " value" },
                ],
              },
            ],
          },
        },
      });

      await createTestCaller(owner.id).page.update({
        id: page.id,
        body: "An agent's new intro.\n\ncheck the indicator value",
      });

      const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
      expect(stored.docVersion).toBe(1);
      expect(stored.bodyDoc).not.toBeNull();
      expect(JSON.stringify(stored.bodyDoc)).toContain('"threadId":"t1"');
    });

    it("still nulls the doc when there are no comment marks to keep", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-md-null" });
      const page = await createPage(db, { createdById: owner.id, workspaceId: ws.id });
      await db.knowledgePage.update({
        where: { id: page.id },
        data: { bodyDoc: { type: "doc", content: [{ type: "paragraph" }] } },
      });

      await createTestCaller(owner.id).page.update({ id: page.id, body: "new body" });

      const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
      expect(stored.bodyDoc).toBeNull();
      expect(stored.docVersion).toBe(1);
    });
  });

  describe("page links — the PageLink index behind tree / parentCrumb / children", () => {
    it("editing links updates the tree, the crumb and the children", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-edit" });
      const caller = createTestCaller(owner.id);
      const parent = await caller.page.create({ workspaceId: ws.id, title: "Parent" });
      const a = await caller.page.create({ workspaceId: ws.id, title: "A" });
      const b = await caller.page.create({ workspaceId: ws.id, title: "B" });

      // Link B then A: children come out in document order, not creation order.
      await saveDoc(db, owner.id, parent.id, linkDoc(b.id, a.id));
      // Keep Parent the newest-edited page so it leads the roots.
      await db.knowledgePage.update({ where: { id: parent.id }, data: { updatedAt: new Date(Date.now() + 60_000) } });

      let tree = await caller.page.tree({ workspaceId: ws.id });
      expect(tree.map((r) => [r.title, r.depth])).toEqual([
        ["Parent", 0],
        ["B", 1],
        ["A", 1],
      ]);
      expect(tree[0]!.hasChildren).toBe(true);
      expect(await caller.page.parentCrumb({ id: a.id })).toEqual({ id: parent.id, title: "Parent" });
      expect((await caller.page.children({ id: parent.id })).map((c) => c.title)).toEqual(["B", "A"]);

      // Drop the link to A: A becomes a root, B stays nested.
      await saveDoc(db, owner.id, parent.id, linkDoc(b.id));
      tree = await caller.page.tree({ workspaceId: ws.id });
      expect(tree.find((r) => r.id === a.id)?.depth).toBe(0);
      expect(tree.find((r) => r.id === b.id)?.depth).toBe(1);
      expect(await caller.page.parentCrumb({ id: a.id })).toBeNull();
      expect(await caller.page.parentCrumb({ id: b.id })).toEqual({ id: parent.id, title: "Parent" });
      expect((await caller.page.children({ id: parent.id })).map((c) => c.id)).toEqual([b.id]);
    });

    it("picks the newest-edited linker as the canonical parent", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-newest" });
      const caller = createTestCaller(owner.id);
      const older = await caller.page.create({ workspaceId: ws.id, title: "Older" });
      const newer = await caller.page.create({ workspaceId: ws.id, title: "Newer" });
      const child = await caller.page.create({ workspaceId: ws.id, title: "Child" });
      await saveDoc(db, owner.id, older.id, linkDoc(child.id));
      await saveDoc(db, owner.id, newer.id, linkDoc(child.id));
      const now = Date.now();
      await db.knowledgePage.update({ where: { id: older.id }, data: { updatedAt: new Date(now + 1_000) } });
      await db.knowledgePage.update({ where: { id: newer.id }, data: { updatedAt: new Date(now + 2_000) } });

      expect(await caller.page.parentCrumb({ id: child.id })).toEqual({ id: newer.id, title: "Newer" });
      const tree = await caller.page.tree({ workspaceId: ws.id });
      expect(tree.map((r) => [r.title, r.depth])).toEqual([
        ["Newer", 0],
        ["Child", 1],
        ["Older", 0],
      ]);
    });

    it("drops self-links and links to pages outside the workspace", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-self" });
      const other = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-other" });
      const caller = createTestCaller(owner.id);
      const foreign = await caller.page.create({ workspaceId: other.id, title: "Foreign" });
      const target = await caller.page.create({ workspaceId: ws.id, title: "Target" });
      const page = await caller.page.create({
        workspaceId: ws.id,
        title: "Page",
        bodyDoc: linkDoc("pg-nonexistent", foreign.id, target.id, target.id),
      });
      await saveDoc(db, owner.id, page.id, linkDoc(page.id, foreign.id, target.id, "pg-nonexistent", target.id));

      expect(await storedLinks(db, page.id)).toEqual([target.id]);
      const tree = await caller.page.tree({ workspaceId: ws.id });
      expect(tree.map((r) => [r.title, r.depth])).toEqual([
        ["Page", 0],
        ["Target", 1],
      ]);
    });

    it("skips a linker the caller cannot view when resolving the crumb", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-access" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      const restricted = await createProject(db, { createdById: owner.id, workspaceId: ws.id, isRestricted: true });
      const ownerCaller = createTestCaller(owner.id);
      const visible = await ownerCaller.page.create({ workspaceId: ws.id, title: "Visible" });
      const hidden = await ownerCaller.page.create({ workspaceId: ws.id, projectId: restricted.id, title: "Hidden" });
      const child = await ownerCaller.page.create({ workspaceId: ws.id, title: "Child" });
      await saveDoc(db, owner.id, visible.id, linkDoc(child.id));
      await saveDoc(db, owner.id, hidden.id, linkDoc(child.id));
      const now = Date.now();
      await db.knowledgePage.update({ where: { id: visible.id }, data: { updatedAt: new Date(now + 1_000) } });
      await db.knowledgePage.update({ where: { id: hidden.id }, data: { updatedAt: new Date(now + 2_000) } });

      // The owner sees the newer (restricted) linker; the member falls back to the one they can view.
      expect(await ownerCaller.page.parentCrumb({ id: child.id })).toEqual({ id: hidden.id, title: "Hidden" });
      const memberCaller = createTestCaller(member.id);
      expect(await memberCaller.page.parentCrumb({ id: child.id })).toEqual({ id: visible.id, title: "Visible" });
      const tree = await memberCaller.page.tree({ workspaceId: ws.id });
      expect(tree.map((r) => r.title)).not.toContain("Hidden");
      expect(tree.find((r) => r.id === child.id)?.depth).toBe(1);
    });

    it("indexes links on create and initBodyDoc, and clears them on a Markdown-source write", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-writes" });
      const caller = createTestCaller(owner.id);
      const child = await caller.page.create({ workspaceId: ws.id, title: "Child" });
      const created = await caller.page.create({ workspaceId: ws.id, title: "Created", bodyDoc: linkDoc(child.id) });
      expect(await storedLinks(db, created.id)).toEqual([child.id]);

      const lazy = await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Lazy" });
      await caller.page.initBodyDoc({ id: lazy.id, doc: linkDoc(child.id) });
      expect(await storedLinks(db, lazy.id)).toEqual([child.id]);

      // An agent's Markdown rewrite nulls the doc; pageLinks don't survive Markdown.
      await caller.page.update({ id: created.id, body: "Rewritten by an agent" });
      expect(await storedLinks(db, created.id)).toEqual([]);
      // A metadata-only update leaves the links alone.
      await caller.page.update({ id: lazy.id, title: "Renamed" });
      expect(await storedLinks(db, lazy.id)).toEqual([child.id]);
    });

    it("leaves the links untouched when a body save loses the version race", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-cas" });
      const caller = createTestCaller(owner.id);
      const a = await caller.page.create({ workspaceId: ws.id, title: "A" });
      const b = await caller.page.create({ workspaceId: ws.id, title: "B" });
      const page = await caller.page.create({ workspaceId: ws.id, title: "Page" });
      await caller.page.update({ id: page.id, baseVersion: 0, bodyDoc: linkDoc(a.id), body: "" });

      await expect(
        caller.page.update({ id: page.id, baseVersion: 0, bodyDoc: linkDoc(b.id), body: "" }),
      ).rejects.toThrow(TRPCError);
      expect(await storedLinks(db, page.id)).toEqual([a.id]);
    });

    it("removes a deleted page's links in both directions", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-delete" });
      const caller = createTestCaller(owner.id);
      const child = await caller.page.create({ workspaceId: ws.id, title: "Child" });
      const grandchild = await caller.page.create({ workspaceId: ws.id, title: "Grandchild" });
      const parent = await caller.page.create({ workspaceId: ws.id, title: "Parent", bodyDoc: linkDoc(child.id) });
      await saveDoc(db, owner.id, child.id, linkDoc(grandchild.id));

      await caller.page.delete({ id: child.id });
      expect(await storedLinks(db, parent.id)).toEqual([]);
      expect(await db.pageLink.count({ where: { fromPageId: child.id } })).toBe(0);
      expect(await caller.page.parentCrumb({ id: grandchild.id })).toBeNull();
    });

    it("walks the sub-tree for linkedUnpublished and duplicates it with links remapped", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-dup" });
      const caller = createTestCaller(owner.id);
      const leaf = await caller.page.create({ workspaceId: ws.id, title: "Leaf" });
      const mid = await caller.page.create({ workspaceId: ws.id, title: "Mid", bodyDoc: linkDoc(leaf.id) });
      const root = await caller.page.create({ workspaceId: ws.id, title: "Root", bodyDoc: linkDoc(mid.id) });

      const unpublished = await caller.page.linkedUnpublished({ id: root.id });
      expect(unpublished.map((p) => p.title)).toEqual(["Mid", "Leaf"]);

      const copy = await caller.page.duplicate({ id: root.id, withSubpages: true });
      const [midCopy] = await storedLinks(db, copy.id);
      expect(midCopy).toBeDefined();
      expect(midCopy).not.toBe(mid.id);
      const [leafCopy] = await storedLinks(db, midCopy!);
      expect(leafCopy).toBeDefined();
      expect(leafCopy).not.toBe(leaf.id);
      expect(await caller.page.parentCrumb({ id: midCopy! })).toEqual({ id: copy.id, title: "Root (copy)" });
    });

    it("the migration's backfill SQL derives the same rows as syncPageLinks", async () => {
      const owner = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-backfill" });
      const other = await createWorkspace(db, { ownerId: owner.id, slug: "pg-links-backfill-2" });
      const foreign = await createPage(db, { createdById: owner.id, workspaceId: other.id });
      const a = await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "A" });
      const b = await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "B" });
      const c = await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "C" });
      const src = await createPage(db, { createdById: owner.id, workspaceId: ws.id, title: "Src" });
      // Nested links, a repeat, a self-link, a foreign and a dead target, and a
      // malformed pageLink with no attrs — in an order that differs from ids.
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "intro" }] },
          { type: "pageLink", attrs: { pageId: c.id, title: "C" } },
          { type: "pageLink" },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "pageLink", attrs: { pageId: a.id, title: "A" } },
                  { type: "pageLink", attrs: { pageId: src.id, title: "self" } },
                ],
              },
            ],
          },
          { type: "pageLink", attrs: { pageId: foreign.id, title: "F" } },
          { type: "pageLink", attrs: { pageId: "dead-page-id", title: "D" } },
          { type: "pageLink", attrs: { pageId: c.id, title: "C again" } },
          { type: "pageLink", attrs: { pageId: b.id, title: "B" } },
        ],
      };
      await db.knowledgePage.update({ where: { id: src.id }, data: { bodyDoc: doc } });
      await db.knowledgePage.update({ where: { id: a.id }, data: { bodyDoc: linkDoc(b.id) } });

      const migration = readFileSync(
        path.join(process.cwd(), "prisma/migrations/20261008120000_add_page_link/migration.sql"),
        "utf8",
      );
      const backfill = migration.slice(migration.indexOf('INSERT INTO "PageLink"'));
      await db.pageLink.deleteMany({});
      await db.$executeRawUnsafe(backfill);
      const fromBackfill = { src: await storedRows(db, src.id), a: await storedRows(db, a.id) };

      await db.pageLink.deleteMany({});
      await syncPageLinks(db, src.id, doc);
      await syncPageLinks(db, a.id, linkDoc(b.id));
      const fromSync = { src: await storedRows(db, src.id), a: await storedRows(db, a.id) };

      const row = (fromPageId: string, toPageId: string, position: number) => ({
        fromPageId,
        toPageId,
        position,
        workspaceId: ws.id,
      });
      // Dense positions after dropping the repeat, self, foreign and dead links.
      expect(fromSync).toEqual({
        src: [row(src.id, c.id, 0), row(src.id, a.id, 1), row(src.id, b.id, 2)],
        a: [row(a.id, b.id, 0)],
      });
      // Row-for-row identical, positions included.
      expect(fromBackfill).toEqual(fromSync);
    });
  });
});
