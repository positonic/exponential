/**
 * `page.update`'s Markdown-source path is a compare-and-set on `docVersion`
 * when the caller sends the `baseVersion` it read (Agent principles PRD,
 * Phase 3: change integrity; ADR-0071).
 *
 * This is the path `exponential pages update --body-file` and Zoe
 * (`mastra.updatePage`) take: `body` with no `bodyDoc`. Before, it bumped
 * `docVersion` unconditionally, so an agent silently overwrote a newer human
 * edit. Now a stale base leaves the page unchanged and throws CONFLICT with a
 * structured `data.conflict`. `baseVersion` stays optional here (a later
 * ticket makes it required for agents), so a write without one behaves as
 * before.
 *
 * Mocked Prisma backed by a one-row in-memory page, so a compare-and-set
 * miss behaves like Postgres would (Prisma `update` with a non-matching
 * `where` throws P2025). The real-DB race lives in page.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
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
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding: vi.fn() }),
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
import { appRouter } from "~/server/api/root";

const OWNER = "user-owner";
const PAGE_ID = "page-1";
const WORKSPACE_ID = "ws-1";

interface StoredPage {
  docVersion: number;
  body: string;
  writes: number;
}

/**
 * Back the mock with one page row. `update` honours a `docVersion` in its
 * `where` the way Postgres does, throwing P2025 when it doesn't match.
 */
function installPage(db: DeepMockProxy<PrismaClient>, store: StoredPage) {
  const row = () => ({
    id: PAGE_ID,
    title: "Spec",
    createdById: OWNER,
    projectId: null,
    workspaceId: WORKSPACE_ID,
    isInviteOnly: false,
    includeInSearch: true,
    bodyDoc: null,
    body: store.body,
    docVersion: store.docVersion,
  });
  db.knowledgePage.findUnique.mockImplementation((() =>
    Promise.resolve(row())) as never);
  db.workspaceUser.findUnique.mockResolvedValue({
    role: "member",
    workspaceId: WORKSPACE_ID,
  } as never);
  db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
    fn(db)) as never);
  db.knowledgePage.update.mockImplementation(((args: {
    where: { id: string; docVersion?: number };
    data: { body?: string; docVersion?: { increment: number } };
  }) => {
    const expected = args.where.docVersion;
    if (expected !== undefined && expected !== store.docVersion) {
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
    }
    if (args.data.body !== undefined) store.body = args.data.body;
    if (args.data.docVersion) store.docVersion += args.data.docVersion.increment;
    store.writes += 1;
    return Promise.resolve(row());
  }) as never);
}

async function conflictOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  expect((error as TRPCError).code).toBe("CONFLICT");
  return error as TRPCError;
}

describe("page.update: Markdown-source writes are conflict-checked", () => {
  const db = getDbMock();
  let store: StoredPage;

  beforeEach(() => {
    mockReset(db);
    store = { docVersion: 3, body: "original", writes: 0 };
    installPage(db, store);
  });

  it("writes and bumps docVersion when the base matches, as a compare-and-set", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    await caller.page.update({ id: PAGE_ID, body: "edited", baseVersion: 3 });

    expect(store).toMatchObject({ body: "edited", docVersion: 4 });
    expect(db.knowledgePage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAGE_ID, docVersion: 3 } }),
    );
  });

  it("rejects a stale base with a structured conflict and leaves the page unchanged", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    const error = await conflictOf(
      caller.page.update({ id: PAGE_ID, body: "clobber", baseVersion: 2 }),
    );

    expect(store).toMatchObject({ body: "original", docVersion: 3, writes: 0 });
    // The structured payload the errorFormatter turns into data.conflict.
    const formatted = appRouter._def._config.errorFormatter({
      error,
      shape: { message: error.message, code: -32009, data: {} },
      type: "mutation",
      path: "page.update",
      input: undefined,
      ctx: undefined,
    } as never) as { data: { conflict: unknown } };
    expect(formatted.data.conflict).toEqual({
      kind: "revision_conflict",
      entity: "page",
      id: PAGE_ID,
      field: "body",
      expectedRevision: 2,
      currentRevision: 3,
    });
  });

  it("two agent writes from the same base: the second gets CONFLICT and the first write stands", async () => {
    // Two Zoe sessions (agent-context JWTs for the same person) both read v3.
    const first = createMockCaller({ userId: OWNER, db, tokenType: "agent-context" });
    const second = createMockCaller({ userId: OWNER, db, tokenType: "agent-context" });

    await first.page.update({ id: PAGE_ID, body: "first", baseVersion: 3 });
    const error = await conflictOf(
      second.page.update({ id: PAGE_ID, body: "second", baseVersion: 3 }),
    );

    expect(error.cause).toMatchObject({
      conflict: { expectedRevision: 3, currentRevision: 4 },
    });
    expect(store).toMatchObject({ body: "first", docVersion: 4, writes: 1 });
  });

  it("a save landing between the check and the write is caught by the WHERE", async () => {
    // The access read sees v3; another save moves the row to v4 before the
    // compare-and-set runs.
    const realUpdate = db.knowledgePage.update.getMockImplementation()!;
    db.knowledgePage.update.mockImplementationOnce(((args: never) => {
      store.docVersion = 4;
      store.body = "someone else";
      return realUpdate(args);
    }) as never);
    const caller = createMockCaller({ userId: OWNER, db });

    const error = await conflictOf(
      caller.page.update({ id: PAGE_ID, body: "mine", baseVersion: 3 }),
    );

    expect(error.cause).toMatchObject({
      conflict: { entity: "page", expectedRevision: 3, currentRevision: 4 },
    });
    expect(store).toMatchObject({ body: "someone else", docVersion: 4 });
  });

  it("without a base version the write lands as before (baseVersion stays optional)", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    await caller.page.update({ id: PAGE_ID, body: "unguarded" });

    expect(store).toMatchObject({ body: "unguarded", docVersion: 4 });
    expect(db.knowledgePage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAGE_ID } }),
    );
  });

  it("a metadata-only update ignores baseVersion", async () => {
    const caller = createMockCaller({ userId: OWNER, db });

    await caller.page.update({ id: PAGE_ID, title: "Renamed", baseVersion: 0 });

    expect(store).toMatchObject({ docVersion: 3, writes: 1 });
  });
});
