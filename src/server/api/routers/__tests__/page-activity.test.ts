/**
 * Page activity in the feed: `page/created` and `page/updated` events.
 *
 * - Creating a page records one event naming it.
 * - Editing records one event per editing session, as page history defines a
 *   session: an editor save that folds into the author's open revision records
 *   nothing more. A Markdown write (CLI, MCP, an agent) never folds, so each
 *   one is an event.
 * - A database Row and a write with no author record nothing.
 *
 * Mocked Prisma, as in page-history.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

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
import { REVISION_FOLD_WINDOW_MS } from "~/server/services/pages/revisions";
import { recordPageActivity } from "~/server/services/pages/pageActivity";

const OWNER = "user-owner";
const PAGE_ID = "page-1";
const WORKSPACE_ID = "ws-1";
const DOC = { type: "doc", content: [{ type: "paragraph" }] };

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    title: "Pages home PRD",
    createdById: OWNER,
    projectId: null,
    workspaceId: WORKSPACE_ID,
    isInviteOnly: false,
    includeInSearch: true,
    isPublic: false,
    databaseId: null,
    bodyDoc: DOC,
    body: "# Pages home",
    docVersion: 3,
    source: null,
    asOf: null,
    properties: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-20T00:00:00Z"),
    project: null,
    createdBy: { id: OWNER, name: "Owner", image: null },
    ceremonyOccurrence: null,
    ...overrides,
  };
}

/** The author's latest revision, as history's fold lookup would find it. */
function openEditorRevision(lastSavedMsAgo: number) {
  return {
    id: "rev-open",
    kind: "editor",
    authorId: OWNER,
    note: null,
    updatedAt: new Date(Date.now() - lastSavedMsAgo),
  };
}

/** The `page/*` events written, as `[action, entityId, title]`. */
function pageEvents(db: DeepMockProxy<PrismaClient>) {
  return db.workspaceActivityEvent.create.mock.calls
    .map((call) => call[0].data as Record<string, unknown>)
    .filter((data) => data.entityType === "page")
    .map((data) => [
      data.action,
      data.entityId,
      (data.metadata as { title?: string } | undefined)?.title,
    ]);
}

describe("page activity", () => {
  const db = getDbMock();

  beforeEach(() => {
    mockReset(db);
    triggerPageEmbedding.mockReset();
    db.knowledgePage.findUnique.mockImplementation((() => Promise.resolve(pageRow())) as never);
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE_ID } as never);
    db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(db)) as never);
    db.knowledgePage.update.mockImplementation((() => Promise.resolve(pageRow())) as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 } as never);
    db.pageLink.deleteMany.mockResolvedValue({ count: 0 } as never);
    db.pageDatabase.updateMany.mockResolvedValue({ count: 0 } as never);
    // No open revision to fold into, unless a test says otherwise.
    db.knowledgePageRevision.findFirst.mockResolvedValue(null);
    db.knowledgePageRevision.create.mockResolvedValue({ id: "rev-new" } as never);
    db.knowledgePageRevision.update.mockResolvedValue({ id: "rev-open" } as never);
    db.workspaceActivityEvent.create.mockResolvedValue({} as never);
  });

  const asOwner = (tokenType?: string) =>
    createMockCaller({ userId: OWNER, db, tokenType });
  const editorSave = () =>
    asOwner().page.update({ id: PAGE_ID, bodyDoc: DOC, body: "# Pages home", baseVersion: 3 });

  it("creating a page records one event naming it", async () => {
    db.knowledgePage.create.mockResolvedValue(pageRow({ id: "page-new" }) as never);
    db.knowledgePage.findUnique.mockImplementation((() =>
      Promise.resolve(pageRow({ id: "page-new", title: "Launch notes" }))) as never);

    await asOwner().page.create({ workspaceId: WORKSPACE_ID, title: "Launch notes" });

    expect(pageEvents(db)).toEqual([["created", "page-new", "Launch notes"]]);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: WORKSPACE_ID, userId: OWNER }),
    });
  });

  it("the first editor save of a session records one 'edited' event", async () => {
    await editorSave();

    expect(pageEvents(db)).toEqual([["updated", PAGE_ID, "Pages home PRD"]]);
  });

  it("two editor saves inside the fold window record one event; a save after it records a second", async () => {
    // First save: nothing to fold into, so it opens a session.
    await editorSave();
    expect(pageEvents(db)).toHaveLength(1);

    // An autosave a minute later folds into that revision: same session.
    db.knowledgePageRevision.findFirst.mockResolvedValue(openEditorRevision(60_000) as never);
    await editorSave();
    expect(pageEvents(db)).toHaveLength(1);
    expect(db.knowledgePageRevision.update).toHaveBeenCalledTimes(1);

    // The next save comes after the window has closed: a new session.
    db.knowledgePageRevision.findFirst.mockResolvedValue(
      openEditorRevision(REVISION_FOLD_WINDOW_MS + 60_000) as never,
    );
    await editorSave();
    expect(pageEvents(db)).toEqual([
      ["updated", PAGE_ID, "Pages home PRD"],
      ["updated", PAGE_ID, "Pages home PRD"],
    ]);
  });

  it("a Markdown write records its own event every time, even right after another", async () => {
    // An open editor revision by the same author would fold an editor save,
    // but a Markdown write never looks for one. The editing-session guard asks
    // for someone *else's* open revision (`authorId: { not }`), which the
    // owner's own is not, so honour that filter here.
    const open = openEditorRevision(60_000);
    db.knowledgePageRevision.findFirst.mockImplementation(((args?: {
      where?: { authorId?: { not?: string } };
    }) => Promise.resolve(args?.where?.authorId?.not === open.authorId ? null : open)) as never);

    await asOwner("api-token").page.update({ id: PAGE_ID, body: "# Rewritten", baseVersion: 3 });
    await asOwner("api-token").page.update({ id: PAGE_ID, body: "# Rewritten again", baseVersion: 3 });

    expect(pageEvents(db)).toHaveLength(2);
  });

  it("re-sending the stored Markdown writes nothing and records nothing", async () => {
    await asOwner("api-token").page.update({ id: PAGE_ID, body: "# Pages home" });

    expect(pageEvents(db)).toEqual([]);
  });

  it("a rename that folds into the open session records nothing more", async () => {
    db.knowledgePageRevision.findFirst.mockResolvedValue(openEditorRevision(60_000) as never);

    await asOwner().page.update({ id: PAGE_ID, title: "Renamed" });

    expect(pageEvents(db)).toEqual([]);
  });

  it("a change history does not record (a search toggle) is not an activity event", async () => {
    await asOwner().page.update({ id: PAGE_ID, includeInSearch: false });

    expect(pageEvents(db)).toEqual([]);
  });

  it("restoring a version records an 'edited' event", async () => {
    db.knowledgePageRevision.findUnique.mockResolvedValue({
      id: "rev-1",
      pageId: PAGE_ID,
      title: "Pages home PRD",
      body: "# Older",
      bodyDoc: null,
      source: null,
      asOf: null,
      properties: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
    } as never);

    await asOwner().page.restore({ id: PAGE_ID, revisionId: "rev-1" });

    expect(pageEvents(db)).toEqual([["updated", PAGE_ID, "Pages home PRD"]]);
  });

  it("a database Row records nothing: it is a table cell, not a page someone wrote", async () => {
    db.knowledgePage.findUnique.mockImplementation((() =>
      Promise.resolve(pageRow({ databaseId: "db-1" }))) as never);

    await recordPageActivity(db, { pageId: PAGE_ID, action: "created", authorId: OWNER });
    await recordPageActivity(db, { pageId: PAGE_ID, action: "updated", authorId: OWNER });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("a write with no author records nothing, and does not even look the page up", async () => {
    await recordPageActivity(db, { pageId: PAGE_ID, action: "updated", authorId: null });

    expect(db.knowledgePage.findUnique).not.toHaveBeenCalled();
    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("never fails the page write when recording the event fails", async () => {
    db.workspaceActivityEvent.create.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(editorSave()).resolves.toMatchObject({ id: PAGE_ID });

    errorSpy.mockRestore();
  });
});
