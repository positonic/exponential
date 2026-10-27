/**
 * Page history, lean reads and search by meaning (ADR-0074):
 *
 * - `page.get` formats: `markdown` drops the ProseMirror doc, `outline`
 *   returns headings only, `section` narrows the body to one heading.
 * - `page.history` lists revisions without bodies; `page.diff` compares them;
 *   `page.restore` is a compare-and-set write that records a "restore" row.
 * - `page.search` merges semantic hits with substring matches.
 * - Writes record revisions with the caller's note.
 *
 * Mocked Prisma, as in page-markdown-conflict.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));
vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({
  reportHandledErrorServer: vi.fn(),
}));
const triggerPageEmbedding = vi.fn();
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding }),
}));
const knowledgeSearch = vi.fn();
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ search: knowledgeSearch }),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";
import { presentRevisionAuthor } from "~/server/api/routers/page";

const OWNER = "user-owner";
const PAGE_ID = "page-1";
const WORKSPACE_ID = "ws-1";
const BODY = ["# Strategy", "", "Intro.", "", "## Goals", "", "- Grow", "", "## Risks", "", "Churn."].join("\n");

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    title: "Strategy",
    createdById: OWNER,
    projectId: null,
    workspaceId: WORKSPACE_ID,
    isInviteOnly: false,
    includeInSearch: true,
    isPublic: false,
    bodyDoc: { type: "doc", content: [{ type: "paragraph" }] },
    body: BODY,
    docVersion: 3,
    source: null,
    asOf: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-20T00:00:00Z"),
    project: null,
    createdBy: { id: OWNER, name: "Owner", image: null },
    ceremonyOccurrence: null,
    ...overrides,
  };
}

const T0 = new Date("2026-10-10T00:00:00Z");
const T1 = new Date("2026-10-15T00:00:00Z");
function revisionRows() {
  return [
    {
      id: "rev-2",
      pageId: PAGE_ID,
      docVersion: 3,
      title: "Strategy",
      body: BODY,
      bodyDoc: { type: "doc" },
      kind: "editor",
      note: null,
      source: "Board deck",
      asOf: new Date("2026-09-30T00:00:00Z"),
      bodyBytes: Buffer.byteLength(BODY),
      createdAt: T1,
      updatedAt: T1,
      author: { id: OWNER, name: "Owner", image: null },
    },
    {
      id: "rev-1",
      pageId: PAGE_ID,
      docVersion: 1,
      title: "Strategy draft",
      body: "# Strategy\n\nIntro.",
      bodyDoc: null,
      kind: "create",
      note: "First draft",
      source: null,
      asOf: null,
      bodyBytes: Buffer.byteLength("# Strategy\n\nIntro."),
      createdAt: T0,
      updatedAt: T0,
      author: { id: OWNER, name: "Owner", image: null },
    },
  ];
}

function installPage(db: DeepMockProxy<PrismaClient>) {
  db.knowledgePage.findUnique.mockImplementation((() => Promise.resolve(pageRow())) as never);
  db.knowledgePage.findUniqueOrThrow.mockImplementation((() => Promise.resolve(pageRow())) as never);
  db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE_ID } as never);
  db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(db)) as never);
  const revisions = revisionRows();
  db.knowledgePageRevision.findMany.mockResolvedValue(revisions as never);
  db.knowledgePageRevision.findUnique.mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(revisions.find((r) => r.id === args.where.id) ?? null)) as never);
  db.knowledgePageRevision.findFirst.mockImplementation(((args: { where: { OR?: unknown; pageId?: string } }) =>
    // Only `diff against previous` asks with an OR; the fold lookup never does here.
    Promise.resolve(args.where.OR ? revisions[1] : null)) as never);
  db.knowledgePageRevision.create.mockResolvedValue({ id: "rev-new" } as never);
}

describe("page.get formats", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    triggerPageEmbedding.mockReset();
    installPage(db);
  });

  it("defaults to the full editor payload, plus the body size", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID });
    expect(page.bodyDoc).toEqual(pageRow().bodyDoc);
    expect(page.body).toBe(BODY);
    expect(page.bodyBytes).toBe(Buffer.byteLength(BODY));
    expect(page.format).toBe("full");
    expect(page.outline).toBeNull();
    expect(page.section).toBeNull();
  });

  it("markdown drops the ProseMirror doc and keeps the Markdown", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, format: "markdown" });
    expect(page.bodyDoc).toBeNull();
    expect(page.body).toBe(BODY);
    expect(page.canEdit).toBe(true);
  });

  it("outline returns headings only and no body", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, format: "outline" });
    expect(page.body).toBeNull();
    expect(page.bodyDoc).toBeNull();
    expect(page.outline).toEqual([
      { level: 1, text: "Strategy", line: 0 },
      { level: 2, text: "Goals", line: 4 },
      { level: 2, text: "Risks", line: 8 },
    ]);
    expect(page.bodyBytes).toBe(Buffer.byteLength(BODY));
  });

  it("section narrows the body to one heading and never ships the doc", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, section: "goals" });
    expect(page.body).toBe("## Goals\n\n- Grow");
    expect(page.section).toEqual({ level: 2, text: "Goals", line: 4 });
    expect(page.bodyDoc).toBeNull();
  });

  it("an unknown section is NOT_FOUND and names the headings that exist", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const error = await caller.page.get({ id: PAGE_ID, section: "Budget" }).then(
      () => null,
      (e: unknown) => e as TRPCError,
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect(error?.code).toBe("NOT_FOUND");
    expect(error?.message).toContain("Strategy | Goals | Risks");
  });
});

describe("page history", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    triggerPageEmbedding.mockReset();
    installPage(db);
  });

  it("history lists revisions newest-first with sizes but without bodies", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.history({ id: PAGE_ID });
    // The stored size is read; the body never leaves Postgres.
    const select = (db.knowledgePageRevision.findMany.mock.calls[0]![0] as { select: Record<string, boolean> }).select;
    expect(select.bodyBytes).toBe(true);
    expect(select.body).toBeUndefined();
    expect(result.nextCursor).toBeNull();
    expect(result.revisions.map((r) => r.id)).toEqual(["rev-2", "rev-1"]);
    expect(result.revisions[0]).toMatchObject({
      docVersion: 3,
      kind: "editor",
      bodyBytes: Buffer.byteLength(BODY),
      author: { id: OWNER, name: "Owner" },
      authorHidden: false,
      source: "Board deck",
    });
    expect(result.revisions[1]).toMatchObject({ note: "First draft", kind: "create" });
  });

  it("history pages with a cursor when more rows exist", async () => {
    const rows = revisionRows();
    db.knowledgePageRevision.findMany.mockResolvedValue(rows as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.history({ id: PAGE_ID, limit: 1 });
    expect(result.revisions.map((r) => r.id)).toEqual(["rev-2"]);
    expect(result.nextCursor).toBe("rev-2");
  });

  it("revision returns one revision's Markdown and rejects a revision of another page", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const revision = await caller.page.revision({ id: PAGE_ID, revisionId: "rev-1" });
    expect(revision.body).toBe("# Strategy\n\nIntro.");
    // The doc stays server-side: the select never asks for it.
    const select = (db.knowledgePageRevision.findUnique.mock.calls[0]![0] as { select: Record<string, boolean> }).select;
    expect(select.body).toBe(true);
    expect(select.bodyDoc).toBeUndefined();

    db.knowledgePageRevision.findUnique.mockResolvedValue({ ...revisionRows()[1]!, pageId: "other" } as never);
    await expect(caller.page.revision({ id: PAGE_ID, revisionId: "rev-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("names authors only to workspace members (the audience rule)", () => {
    const author = { id: OWNER, name: "Owner", image: null };
    expect(presentRevisionAuthor(author, true)).toEqual({ author, authorHidden: false });
    expect(presentRevisionAuthor(author, false)).toEqual({ author: null, authorHidden: true });
    // A baseline row has no author to hide.
    expect(presentRevisionAuthor(null, false)).toEqual({ author: null, authorHidden: false });
  });

  it("diff flags a provenance change between revisions", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const diff = await caller.page.diff({ id: PAGE_ID, revisionId: "rev-2" });
    expect(diff.provenanceChanged).toBe(true);
    expect(diff.from).toMatchObject({ source: null, asOf: null });
    expect(diff.to).toMatchObject({ source: "Board deck" });
  });

  it("diff defaults to 'what this revision changed' against the one before it", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const diff = await caller.page.diff({ id: PAGE_ID, revisionId: "rev-2" });
    expect(diff.from).toMatchObject({ revisionId: "rev-1", docVersion: 1, title: "Strategy draft" });
    expect(diff.to).toMatchObject({ revisionId: "rev-2", docVersion: 3, title: "Strategy" });
    expect(diff.titleChanged).toBe(true);
    expect(diff.stats).toEqual({ added: 8, removed: 0 });
    expect(diff.unified).toContain("+## Goals");
    expect(diff.from).not.toHaveProperty("body");
  });

  it("diff against the first revision compares with an empty page", async () => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: OWNER, db });
    const diff = await caller.page.diff({ id: PAGE_ID, revisionId: "rev-1" });
    expect(diff.from).toMatchObject({ revisionId: null, docVersion: 0 });
    expect(diff.stats.removed).toBe(0);
    expect(diff.stats.added).toBeGreaterThan(0);
  });

  it("diff against current compares the revision with the live page", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const diff = await caller.page.diff({ id: PAGE_ID, revisionId: "rev-1", against: "current" });
    expect(diff.from).toMatchObject({ revisionId: "rev-1" });
    expect(diff.to).toMatchObject({ revisionId: null, docVersion: 3, title: "Strategy" });
    expect(diff.unified).toContain("+## Risks");
  });

  it("restore writes the revision back as a compare-and-set and records a restore revision", async () => {
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 } as never);
    db.pageLink.deleteMany.mockResolvedValue({ count: 0 } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.restore({ id: PAGE_ID, revisionId: "rev-1", note: "Back to the draft" });
    expect(result).toEqual({ id: PAGE_ID, docVersion: 4, revisionId: "rev-new" });
    // Without a base version it pins the version it just read.
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAGE_ID, docVersion: 3 } }),
    );
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAGE_ID, docVersion: 3 },
        data: expect.objectContaining({
          title: "Strategy draft",
          body: "# Strategy\n\nIntro.",
          // The whole snapshot comes back, provenance included.
          source: null,
          asOf: null,
          docVersion: { increment: 1 },
        }),
      }),
    );
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "restore", note: "Back to the draft", authorId: OWNER }),
      }),
    );
    expect(triggerPageEmbedding).toHaveBeenCalledWith(PAGE_ID);
  });

  it("restore pins the version the caller saw, so a newer save is a CONFLICT", async () => {
    db.knowledgePage.updateMany.mockResolvedValue({ count: 0 } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(
      caller.page.restore({ id: PAGE_ID, revisionId: "rev-1", baseVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAGE_ID, docVersion: 2 } }),
    );
  });

  it("restore reports CONFLICT when the page moved on underneath it", async () => {
    db.knowledgePage.updateMany.mockResolvedValue({ count: 0 } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(caller.page.restore({ id: PAGE_ID, revisionId: "rev-1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(db.knowledgePageRevision.create).not.toHaveBeenCalled();
  });
});

describe("writes record revisions", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    triggerPageEmbedding.mockReset();
    installPage(db);
    db.knowledgePage.update.mockImplementation((() => Promise.resolve(pageRow())) as never);
    db.pageLink.deleteMany.mockResolvedValue({ count: 0 } as never);
  });

  it("a Markdown-source write records a 'markdown' revision carrying the note", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.update({ id: PAGE_ID, body: "# New", baseVersion: 3, note: "Rewrote it" });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "markdown", note: "Rewrote it", authorId: OWNER }),
      }),
    );
  });

  it("a rename from the CLI or an agent is its own 'markdown' revision, never folded", async () => {
    const cli = createMockCaller({ userId: OWNER, db, tokenType: "api-token" });
    await cli.page.update({ id: PAGE_ID, title: "Renamed by CLI" });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "markdown" }) }),
    );
    // A non-editor kind never looks for a session to fold into.
    expect(db.knowledgePageRevision.findFirst).not.toHaveBeenCalled();
  });

  it("re-sending the stored title or provenance records nothing", async () => {
    const caller = createMockCaller({ userId: OWNER, db, tokenType: "agent-context" });
    await caller.page.update({ id: PAGE_ID, title: "Strategy", source: null, asOf: null });
    expect(db.knowledgePageRevision.create).not.toHaveBeenCalled();
  });

  it("a rename records an 'editor' revision; a search toggle alone records nothing", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.update({ id: PAGE_ID, title: "Renamed" });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledTimes(1);
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "editor" }) }),
    );

    db.knowledgePageRevision.create.mockClear();
    await caller.page.update({ id: PAGE_ID, includeInSearch: false });
    expect(db.knowledgePageRevision.create).not.toHaveBeenCalled();
  });

  it("a provenance-only change records an 'editor' revision", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.update({ id: PAGE_ID, asOf: new Date("2026-10-01T00:00:00Z") });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "editor" }) }),
    );
  });

  it("source and asOf are written with the page and an empty source clears it", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const asOf = new Date("2026-09-30T00:00:00Z");
    await caller.page.update({ id: PAGE_ID, source: " https://example.com/board-deck ", asOf });
    expect(db.knowledgePage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "https://example.com/board-deck", asOf }),
      }),
    );
    await caller.page.update({ id: PAGE_ID, source: "" });
    expect(db.knowledgePage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: null }) }),
    );
  });

  it("create records a 'create' revision with provenance on the page", async () => {
    db.knowledgePage.create.mockResolvedValue(pageRow({ id: "page-new" }) as never);
    db.knowledgePage.findUnique.mockImplementation((() => Promise.resolve(pageRow({ id: "page-new" }))) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.create({
      workspaceId: WORKSPACE_ID,
      title: "Facts",
      body: "x",
      source: "Board deck",
      asOf: new Date("2026-09-30T00:00:00Z"),
      note: "Seeded from the deck",
    });
    expect(db.knowledgePage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "Board deck" }) }),
    );
    expect(db.knowledgePageRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pageId: "page-new", kind: "create", note: "Seeded from the deck" }),
      }),
    );
  });
});

describe("page.search", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    knowledgeSearch.mockReset();
    installPage(db);
    db.workspace.findUnique.mockResolvedValue({ slug: "acme" } as never);
    db.knowledgePage.findFirst.mockResolvedValue({ id: PAGE_ID } as never);
  });

  it("returns semantic hits first, deduplicated per page, then substring matches", async () => {
    knowledgeSearch.mockResolvedValue([
      { sourceType: "page", sourceId: "p-a", sourceTitle: "Vision", content: "We   win by  focus", similarity: 0.8 },
      { sourceType: "page", sourceId: "p-a", sourceTitle: "Vision", content: "second chunk", similarity: 0.7 },
      { sourceType: "page", sourceId: "p-b", sourceTitle: "Risks", content: "churn", similarity: 0.5 },
      { sourceType: "page", sourceId: "p-noise", sourceTitle: "Noise", content: "zzz", similarity: 0.1 },
    ]);
    db.knowledgePage.findMany.mockResolvedValue([
      { id: "p-c", title: "Plan", body: "Long preamble. Our strategy is focus. Trailing text." },
    ] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.search({ workspaceId: WORKSPACE_ID, query: "strategy", limit: 5 });
    expect(result.results.map((r) => [r.id, r.matchedBy])).toEqual([
      ["p-a", "semantic"],
      ["p-b", "semantic"],
      ["p-c", "text"],
    ]);
    expect(result.results[0]).toMatchObject({
      title: "Vision",
      snippet: "We win by focus",
      similarity: 0.8,
      url: "/w/acme/pages/p-a",
    });
    expect(result.results[2]!.snippet).toContain("strategy is focus");
    expect(result.results[2]!.similarity).toBeNull();
    // The text pass skips pages the semantic pass already returned.
    expect(db.knowledgePage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: expect.arrayContaining([{ id: { notIn: ["p-a", "p-b"] } }]) },
        take: 3,
      }),
    );
    // Access is the page rule, not "chunks I authored".
    expect(knowledgeSearch).toHaveBeenCalledWith(
      "strategy",
      expect.objectContaining({ pageViewerId: OWNER, sourceTypes: ["page"] }),
    );
    expect(knowledgeSearch.mock.calls[0]![1]).not.toHaveProperty("userId");
  });

  it("degrades to substring matches when the vector search fails", async () => {
    knowledgeSearch.mockRejectedValue(new Error("embedding down"));
    db.knowledgePage.findMany.mockResolvedValue([{ id: "p-c", title: "Plan", body: "focus" }] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.search({ workspaceId: WORKSPACE_ID, query: "focus" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ id: "p-c", matchedBy: "text" });
  });

  it("returns nothing, without an embedding call, to someone who can view no page there", async () => {
    db.knowledgePage.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.search({ workspaceId: "ws-other", query: "focus" });
    expect(result.results).toEqual([]);
    expect(knowledgeSearch).not.toHaveBeenCalled();
  });

  it("searches for a project-only collaborator who is not a workspace member", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    knowledgeSearch.mockResolvedValue([
      { sourceType: "page", sourceId: "p-a", sourceTitle: "Plan", content: "focus", similarity: 0.6 },
    ]);
    db.knowledgePage.findMany.mockResolvedValue([] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.page.search({ workspaceId: WORKSPACE_ID, query: "focus" });
    expect(result.results.map((r) => r.id)).toEqual(["p-a"]);
  });
});
