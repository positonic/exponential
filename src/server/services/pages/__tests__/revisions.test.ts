/**
 * Page revisions (ADR-0074): a snapshot after each write, with editor
 * autosaves by one author folding into the open revision for a short window.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  diffRevisionBodies,
  recordPageRevision,
  REVISION_FOLD_WINDOW_MS,
} from "../revisions";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const NOW = new Date("2026-10-27T12:00:00Z");
const PAGE = {
  title: "Strategy",
  body: "# Strategy\n\nv2",
  bodyDoc: { type: "doc", content: [] },
  docVersion: 7,
};

function latest(overrides: Partial<{ kind: string; authorId: string | null; note: string | null; updatedAt: Date }>) {
  return {
    id: "rev-latest",
    kind: "editor",
    authorId: "alice",
    note: null,
    updatedAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
}

describe("recordPageRevision", () => {
  beforeEach(() => {
    mockReset(db);
    db.knowledgePage.findUnique.mockResolvedValue(PAGE as never);
    db.knowledgePageRevision.create.mockResolvedValue({ id: "rev-new" } as never);
    db.knowledgePageRevision.update.mockResolvedValue({} as never);
  });

  it("snapshots the page row as it is now, with author, kind and note", async () => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(null);
    const result = await recordPageRevision(db, {
      pageId: "p1",
      kind: "markdown",
      authorId: "zoe",
      note: "  Rewrote the goals  ",
      now: NOW,
    });
    expect(result).toEqual({ id: "rev-new", folded: false });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageId: "p1",
          docVersion: 7,
          title: "Strategy",
          body: PAGE.body,
          bodyDoc: PAGE.bodyDoc,
          kind: "markdown",
          note: "Rewrote the goals",
          authorId: "zoe",
          createdAt: NOW,
        }),
      }),
    );
    // Non-editor writes never look for a row to fold into.
    expect(db.knowledgePageRevision.findFirst).not.toHaveBeenCalled();
  });

  it("folds an editor save into the same author's open editor revision", async () => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(latest({}) as never);
    const result = await recordPageRevision(db, {
      pageId: "p1",
      kind: "editor",
      authorId: "alice",
      now: NOW,
    });
    expect(result).toEqual({ id: "rev-latest", folded: true });
    expect(db.knowledgePageRevision.create).not.toHaveBeenCalled();
    expect(db.knowledgePageRevision.update).toHaveBeenCalledWith({
      where: { id: "rev-latest" },
      data: expect.objectContaining({
        docVersion: 7,
        title: "Strategy",
        body: PAGE.body,
        updatedAt: NOW,
      }),
    });
  });

  it.each([
    ["another author", latest({ authorId: "bob" })],
    ["a non-editor latest revision", latest({ kind: "markdown" })],
    ["a latest revision that carries a note", latest({ note: "why" })],
    [
      "a latest revision older than the fold window",
      latest({ updatedAt: new Date(NOW.getTime() - REVISION_FOLD_WINDOW_MS) }),
    ],
  ])("inserts a new editor revision after %s", async (_label, row) => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(row as never);
    const result = await recordPageRevision(db, {
      pageId: "p1",
      kind: "editor",
      authorId: "alice",
      now: NOW,
    });
    expect(result.folded).toBe(false);
    expect(db.knowledgePageRevision.update).not.toHaveBeenCalled();
    expect(db.knowledgePageRevision.create).toHaveBeenCalledTimes(1);
  });

  it("an editor save with a note gets its own row even inside the window", async () => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(latest({}) as never);
    const result = await recordPageRevision(db, {
      pageId: "p1",
      kind: "editor",
      authorId: "alice",
      note: "Reworded the vision",
      now: NOW,
    });
    expect(result.folded).toBe(false);
    expect(db.knowledgePageRevision.findFirst).not.toHaveBeenCalled();
  });

  it("throws when the page is gone rather than snapshotting nothing", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(null);
    await expect(
      recordPageRevision(db, { pageId: "missing", kind: "create", authorId: null }),
    ).rejects.toThrow(/not found/);
  });
});

describe("diffRevisionBodies", () => {
  it("counts added and removed lines and renders a unified patch", () => {
    const diff = diffRevisionBodies(
      { label: "a", title: "T", body: "one\ntwo\nthree\n" },
      { label: "b", title: "T", body: "one\n2\nthree\nfour\n" },
    );
    expect(diff.stats).toEqual({ added: 2, removed: 1 });
    expect(diff.titleChanged).toBe(false);
    expect(diff.unified).toContain("--- a");
    expect(diff.unified).toContain("+++ b");
    expect(diff.unified).toContain("-two");
    expect(diff.unified).toContain("+2");
    expect(diff.unified).toContain("+four");
  });

  it("is empty for identical bodies and flags a title change", () => {
    const diff = diffRevisionBodies(
      { label: "a", title: "Old", body: "same" },
      { label: "b", title: "New", body: "same" },
    );
    expect(diff.unified).toBe("");
    expect(diff.stats).toEqual({ added: 0, removed: 0 });
    expect(diff.titleChanged).toBe(true);
  });

  it("treats a null body as empty", () => {
    const diff = diffRevisionBodies(
      { label: "a", title: "T", body: null },
      { label: "b", title: "T", body: "hello\n" },
    );
    expect(diff.stats).toEqual({ added: 1, removed: 0 });
  });
});
