/**
 * `pageComment.create` with `quotedText` and no `threadId` — the path the CLI,
 * SDK and MCP take, since they have no editor selection. The server mints the
 * threadId, finds the quote, and writes the mark and the root comment in one
 * transaction; a quote that doesn't resolve is refused before anything lands.
 * Pages written as Markdown only (`bodyDoc` null) get their doc derived first.
 *
 * Mocked Prisma backed by a one-row in-memory page whose `updateMany` honours
 * the `docVersion` compare-and-set. The real-DB path lives in
 * pageComment.integration.test.ts.
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
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendPageMentionNotifications: vi.fn(),
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

const OWNER = "user-owner";
const VIEWER = "user-viewer";
const PAGE_ID = "page-1";
const WORKSPACE_ID = "ws-1";

interface StoredPage {
  docVersion: number;
  body: string;
  bodyDoc: unknown;
}

function installPage(db: DeepMockProxy<PrismaClient>, store: StoredPage) {
  db.knowledgePage.findUnique.mockImplementation((() =>
    Promise.resolve({
      id: PAGE_ID,
      title: "Spec",
      createdById: OWNER,
      projectId: null,
      workspaceId: WORKSPACE_ID,
      isInviteOnly: false,
      bodyDoc: store.bodyDoc,
      body: store.body,
      docVersion: store.docVersion,
    })) as never);
  db.workspaceUser.findUnique.mockImplementation(((args: {
    where: { userId_workspaceId: { userId: string } };
  }) =>
    Promise.resolve({
      role: args.where.userId_workspaceId.userId === VIEWER ? "viewer" : "member",
      workspaceId: WORKSPACE_ID,
    })) as never);
  db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
    fn(db)) as never);
  db.knowledgePage.updateMany.mockImplementation(((args: {
    where: { docVersion: number };
    data: { bodyDoc: unknown };
  }) => {
    if (args.where.docVersion !== store.docVersion) return Promise.resolve({ count: 0 });
    store.bodyDoc = args.data.bodyDoc;
    store.docVersion += 1;
    return Promise.resolve({ count: 1 });
  }) as never);
  db.knowledgePageComment.create.mockImplementation(((args: {
    data: Record<string, unknown>;
  }) =>
    Promise.resolve({
      id: "comment-1",
      ...args.data,
      createdBy: { id: args.data.createdById, name: null, image: null },
    })) as never);
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

describe("pageComment.create: anchoring by quote", () => {
  const db = getDbMock();
  let store: StoredPage;

  beforeEach(() => {
    mockReset(db);
    store = {
      docVersion: 0,
      body: "# Plan\n\nWe pick the indicator later.\n\nThe indicator must be cheap.",
      bodyDoc: null,
    };
    installPage(db, store);
  });

  it("derives a Markdown-only page's doc and pins a minted thread into it", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const created = await caller.pageComment.create({
      pageId: PAGE_ID,
      body: "Which one?",
      quotedText: "indicator",
      quoteContext: { prefix: "We pick the " },
    });

    expect(created.threadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.quotedText).toBe("indicator");
    expect(created.anchor).toEqual({ anchored: true, docVersion: 1, fastForward: false });
    expect(store.docVersion).toBe(1);
    const stored = JSON.stringify(store.bodyDoc);
    expect(stored).toContain('"type":"heading"');
    expect(stored).toContain(`"threadId":"${created.threadId}"`);
    // Only the first "indicator" is marked: the context picked it.
    expect(stored.split(created.threadId!).length - 1).toBe(1);
  });

  it("refuses a repeated quote with no context, writing nothing", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const error = await errorOf(
      caller.pageComment.create({ pageId: PAGE_ID, body: "?", quotedText: "indicator" }),
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toContain("quoteContext");
    expect(store.docVersion).toBe(0);
    expect(db.knowledgePageComment.create).not.toHaveBeenCalled();
  });

  it("refuses a quote that isn't in the page", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const error = await errorOf(
      caller.pageComment.create({ pageId: PAGE_ID, body: "?", quotedText: "not here" }),
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(db.knowledgePageComment.create).not.toHaveBeenCalled();
  });

  it("re-anchors once after a concurrent write moves docVersion", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    // The first compare-and-set loses to a write that lands between read and write.
    db.knowledgePage.updateMany.mockImplementationOnce((() => {
      store.docVersion += 1;
      return Promise.resolve({ count: 0 });
    }) as never);

    const created = await caller.pageComment.create({
      pageId: PAGE_ID,
      body: "Cheap how?",
      quotedText: "must be cheap",
    });

    expect(created.anchor).toEqual({ anchored: true, docVersion: 2, fastForward: false });
    expect(db.knowledgePageComment.create).toHaveBeenCalledTimes(1);
  });

  it("stores a viewer's thread with its quote but leaves the body alone", async () => {
    const caller = createMockCaller({ userId: VIEWER, db });

    const created = await caller.pageComment.create({
      pageId: PAGE_ID,
      body: "Cheap how?",
      quotedText: "must be cheap",
    });

    expect(created.threadId).toBeTruthy();
    expect(created.anchor).toEqual({ anchored: false, fastForward: false });
    expect(store).toMatchObject({ docVersion: 0, bodyDoc: null });
  });

  it("still checks a viewer's quote", async () => {
    const caller = createMockCaller({ userId: VIEWER, db });

    const error = await errorOf(
      caller.pageComment.create({ pageId: PAGE_ID, body: "?", quotedText: "not here" }),
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("rejects quoteContext without a quote to go with it", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const error = await errorOf(
      caller.pageComment.create({ pageId: PAGE_ID, body: "?", quoteContext: { prefix: "x" } }),
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("leaves a doc-level comment unanchored", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const created = await caller.pageComment.create({ pageId: PAGE_ID, body: "Looks good" });

    expect(created.threadId).toBeUndefined();
    expect(created.anchor).toEqual({ anchored: false, fastForward: false });
    expect(store.docVersion).toBe(0);
  });
});
