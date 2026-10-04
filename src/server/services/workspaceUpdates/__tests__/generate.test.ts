import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const triggerPageEmbedding = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding }),
}));

import { generateWorkspaceUpdate, regenerateWorkspaceUpdate, type GenerateDeps } from "../generate";
import { templateWriter, type UpdateWriter } from "../writer";

const db = mockDeep<PrismaClient>();
const notify = vi.fn<GenerateDeps["notify"]>();
const input = {
  workspaceId: "ws-1",
  kind: "weekly" as const,
  periodKey: "2026-10-02",
  windowStart: new Date("2026-09-25T07:00:00.000Z"),
  windowEnd: new Date("2026-10-02T07:00:00.000Z"),
  actorUserId: null,
};

function deps(writer?: UpdateWriter): GenerateDeps {
  return {
    writer: writer ?? templateWriter,
    notify,
    baseUrl: "https://app.test",
  };
}

function stubWorkspace() {
  db.workspaceUpdate.create.mockResolvedValue({ id: "upd-1" } as never);
  db.workspace.findUniqueOrThrow.mockResolvedValue({ name: "Acme", slug: "acme" } as never);
  db.workspaceUpdateConfig.findUnique.mockResolvedValue({
    timezone: "Europe/Berlin",
    reviewerIds: [],
    assistantId: null,
    indexPageId: "index-1",
  } as never);
  db.workspaceUser.findMany.mockResolvedValue([{ userId: "owner-1" }] as never);
}

function stubShipped() {
  db.featureScope.findMany.mockResolvedValue([
    {
      id: "scope-1",
      version: "V2",
      description: "Bulk edit for tickets",
      shippedAt: new Date("2026-09-30T10:00:00.000Z"),
      feature: { id: "feat-1", name: "Backlog", product: { slug: "core" } },
    },
  ] as never);
  db.ticket.findMany.mockResolvedValue([
    { id: "t-1", number: 42, title: "Fix CSV export", type: "BUG", completedAt: new Date("2026-09-29T10:00:00.000Z"), product: { slug: "core" } },
    { id: "t-2", number: 43, title: "Bump deps", type: "CHORE", completedAt: new Date("2026-09-29T11:00:00.000Z"), product: { slug: "core" } },
  ] as never);
}

beforeEach(() => {
  mockReset(db);
  // Sources this suite doesn't exercise ship nothing.
  db.workspaceActivityEvent.findMany.mockResolvedValue([]);
  db.list.findMany.mockResolvedValue([]);
  db.goalUpdate.findMany.mockResolvedValue([]);
  db.gitHubActivity.findMany.mockResolvedValue([]);
  notify.mockReset().mockResolvedValue(undefined);
  triggerPageEmbedding.mockReset();
});

describe("generateWorkspaceUpdate", () => {
  it("drafts a Page from what shipped, links it from the index and notifies reviewers", async () => {
    stubWorkspace();
    stubShipped();
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue({
      id: "index-1",
      workspaceId: "ws-1",
      bodyDoc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Intro" }] }] },
      body: "Intro",
      docVersion: 3,
    } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    db.workspaceUpdate.findMany.mockResolvedValue([
      { pageId: "page-1", page: { title: "Backlog V2, and 1 more change" } },
    ] as never);

    const result = await generateWorkspaceUpdate(db, input, deps());

    expect(result).toEqual({ kind: "drafted", updateId: "upd-1", pageId: "page-1" });

    // Template writer; the chore never appears.
    const pageData = db.knowledgePage.create.mock.calls[0]![0].data;
    // The scope is told under its feature's name.
    expect(pageData).toMatchObject({ workspaceId: "ws-1", projectId: null, createdById: "owner-1", title: "Backlog" });
    expect(pageData.body).toContain("Fix CSV export");
    expect(pageData.body).not.toContain("Bump deps");

    // The draft is recorded with the selection the writer was limited to.
    expect(db.workspaceUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "upd-1" }, data: expect.objectContaining({ pageId: "page-1", model: "template" }) }),
    );

    // Linked on the index with a compare-and-set on the version read.
    const linkWrite = db.knowledgePage.updateMany.mock.calls[0]![0];
    expect(linkWrite.where).toEqual({ id: "index-1", docVersion: 3 });
    expect(JSON.stringify(linkWrite.data.bodyDoc)).toContain('"pageId":"page-1"');

    expect(notify).toHaveBeenCalledWith({ updateId: "upd-1", version: 1, variant: "draft", reviewerIds: ["owner-1"], actorUserId: null });
  });

  it("still notifies the reviewers when the Updates index cannot be updated", async () => {
    stubWorkspace();
    stubShipped();
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.knowledgePage.findUnique.mockRejectedValue(new Error("index unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await generateWorkspaceUpdate(db, input, deps());

    expect(result).toEqual({ kind: "drafted", updateId: "upd-1", pageId: "page-1" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ updateId: "upd-1", variant: "draft" }));
    // The draft row is kept, not released: it is the reviewers' to act on.
    expect(db.workspaceUpdate.deleteMany).not.toHaveBeenCalled();
  });

  it("re-links earlier drafts missing from the index", async () => {
    stubWorkspace();
    stubShipped();
    db.knowledgePage.create.mockResolvedValue({ id: "page-new" } as never);
    db.knowledgePage.findUnique.mockResolvedValue({
      id: "index-1",
      workspaceId: "ws-1",
      bodyDoc: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
          { type: "pageLink", attrs: { pageId: "page-old", title: "Old", href: "/w/acme/pages/page-old" } },
        ],
      },
      body: "Intro",
      docVersion: 1,
    } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    db.workspaceUpdate.findMany.mockResolvedValue([
      { pageId: "page-new", page: { title: "New" } },
      { pageId: "page-missed", page: { title: "Missed last week" } },
      { pageId: "page-old", page: { title: "Old" } },
    ] as never);

    await generateWorkspaceUpdate(db, input, deps());

    const doc = db.knowledgePage.updateMany.mock.calls[0]![0].data.bodyDoc as { content: { type: string; attrs?: { pageId: string } }[] };
    expect(doc.content.map((n) => n.attrs?.pageId ?? n.type)).toEqual(["paragraph", "page-new", "page-missed", "page-old"]);
  });

  it("marks a quiet week EMPTY, creates no Page and tells the reviewers", async () => {
    stubWorkspace();
    db.featureScope.findMany.mockResolvedValue([]);
    db.ticket.findMany.mockResolvedValue([
      { id: "t-2", number: 43, title: "Bump deps", type: "CHORE", completedAt: new Date(), product: { slug: "core" } },
    ] as never);

    const result = await generateWorkspaceUpdate(db, input, deps());

    expect(result).toEqual({ kind: "empty", updateId: "upd-1" });
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
    expect(db.workspaceUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EMPTY" }) }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ variant: "empty", reviewerIds: ["owner-1"] }));
  });

  it("is a no-op when the period is already claimed", async () => {
    db.workspaceUpdate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );

    const result = await generateWorkspaceUpdate(db, input, deps());

    expect(result).toEqual({ kind: "already-claimed" });
    expect(db.featureScope.findMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("releases the claim when drafting fails before a Page exists", async () => {
    stubWorkspace();
    db.featureScope.findMany.mockRejectedValue(new Error("db down"));
    db.ticket.findMany.mockResolvedValue([]);
    db.workspaceUpdate.deleteMany.mockResolvedValue({ count: 1 });

    await expect(generateWorkspaceUpdate(db, input, deps())).rejects.toThrow("db down");
    expect(db.workspaceUpdate.deleteMany).toHaveBeenCalledWith({
      where: { id: "upd-1", pageId: null, status: "DRAFT" },
    });
  });

  it("falls back to the template when the writer throws", async () => {
    stubWorkspace();
    stubShipped();
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue(null);
    db.workspaceUpdateConfig.upsert.mockResolvedValue({} as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await generateWorkspaceUpdate(db, input, deps({ write: () => Promise.reject(new Error("model down")) }));

    expect(result.kind).toBe("drafted");
    expect(db.workspaceUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ model: "template (Claude failed: model down)" }) }),
    );
  });

  it("uses the writer's prose but only for selected items", async () => {
    stubWorkspace();
    stubShipped();
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue(null);
    db.workspaceUpdateConfig.upsert.mockResolvedValue({} as never);
    const writer: UpdateWriter = {
      write: () =>
        Promise.resolve({
          headline: "Bulk edit lands",
          intro: "Edit many tickets at once.",
          highlights: [
            { itemId: "story:feat-1", title: "Bulk edit", body: "Select rows and edit together." },
            { itemId: "ticket:made-up", title: "Teleportation", body: "Not real." },
          ],
          also: [],
          model: "claude-test",
        }),
    };

    await generateWorkspaceUpdate(db, input, deps(writer));

    const body = db.knowledgePage.create.mock.calls[0]![0].data.body!;
    expect(body).toContain("Select rows and edit together.");
    expect(body).not.toContain("Teleportation");
  });
});

describe("regenerateWorkspaceUpdate", () => {
  const selection = {
    highlights: [{ id: "ticket:t-1", source: "ticket", title: "Fix CSV export", weight: 20, at: "2026-09-29T10:00:00.000Z" }],
    also: [],
    moreCount: 0,
  };

  function stubDraft(overrides: Record<string, unknown> = {}) {
    db.workspaceUpdate.findUnique.mockResolvedValue({
      workspaceId: "ws-1",
      status: "DRAFT",
      version: 2,
      pageId: "page-1",
      items: selection,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      page: { docVersion: 7 },
      ...overrides,
    } as never);
    db.workspace.findUniqueOrThrow.mockResolvedValue({ name: "Acme", slug: "acme" } as never);
    db.workspaceUpdateConfig.findUnique.mockResolvedValue({ timezone: "UTC", reviewerIds: [], assistantId: null, indexPageId: null } as never);
    db.workspaceUser.findMany.mockResolvedValue([{ userId: "owner-1" }, { userId: "rev-2" }] as never);
  }

  it("rewrites from the stored selection with feedback, holding the draft while the Page is replaced", async () => {
    stubDraft();
    db.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    const write = vi.fn<UpdateWriter["write"]>().mockResolvedValue({
      headline: "Exports fixed",
      intro: "CSV export works again.",
      highlights: [{ itemId: "ticket:t-1", title: "CSV export", body: "Large exports finish now." }],
      also: [],
      model: "claude-test",
    });

    const result = await regenerateWorkspaceUpdate(
      db,
      { updateId: "upd-1", feedback: "  lead with exports  ", actorUserId: "owner-1" },
      deps({ write }),
    );

    expect(result).toEqual({ kind: "regenerated", version: 3 });
    // No re-gather: the writer sees the stored selection, plus the feedback.
    expect(db.ticket.findMany).not.toHaveBeenCalled();
    expect(write.mock.calls[0]![0]).toEqual(selection);
    expect(write.mock.calls[0]![1]).toMatchObject({ feedback: "lead with exports" });
    // Held (DRAFT → REGENERATING at the version read), so nothing can approve mid-rewrite…
    expect(db.workspaceUpdate.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: "upd-1", status: "DRAFT", version: 2 },
      data: { status: "REGENERATING" },
    });
    // …the Page replaced only at the docVersion read before writing…
    expect(db.knowledgePage.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "page-1", docVersion: 7 },
      data: { title: "Exports fixed" },
    });
    // …then released with the new version.
    expect(db.workspaceUpdate.updateMany.mock.calls[1]![0]).toEqual({
      where: { id: "upd-1", status: "REGENERATING" },
      data: { status: "DRAFT", version: { increment: 1 }, feedback: "lead with exports", model: "claude-test" },
    });
    // The other reviewers hear about it; the requester is excluded.
    expect(notify).toHaveBeenCalledWith({
      updateId: "upd-1",
      version: 3,
      variant: "draft",
      reviewerIds: ["owner-1", "rev-2"],
      actorUserId: "owner-1",
    });
  });

  it("never overwrites a save that landed while rewriting, and releases the hold", async () => {
    stubDraft();
    db.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgePage.updateMany.mockResolvedValue({ count: 0 });

    const result = await regenerateWorkspaceUpdate(db, { updateId: "upd-1", feedback: null, actorUserId: "owner-1" }, deps());

    expect(result).toEqual({ kind: "conflict" });
    // One compare-and-set, no retry against the newer version.
    expect(db.knowledgePage.updateMany).toHaveBeenCalledTimes(1);
    expect(db.workspaceUpdate.updateMany.mock.calls[1]![0]).toEqual({
      where: { id: "upd-1", status: "REGENERATING" },
      data: { status: "DRAFT" },
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses anything that is no longer a draft", async () => {
    stubDraft({ status: "APPROVED" });
    const result = await regenerateWorkspaceUpdate(db, { updateId: "upd-1", feedback: null, actorUserId: "owner-1" }, deps());
    expect(result).toEqual({ kind: "not-draft" });
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
  });

  it("reports a conflict when another decision won the race", async () => {
    stubDraft();
    db.workspaceUpdate.updateMany.mockResolvedValue({ count: 0 });
    const result = await regenerateWorkspaceUpdate(db, { updateId: "upd-1", feedback: null, actorUserId: "owner-1" }, deps());
    expect(result).toEqual({ kind: "conflict" });
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
