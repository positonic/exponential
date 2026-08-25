/**
 * Unit tests for notification.list cursor pagination.
 *
 * Regression test for an off-by-one: the query fetches `limit + 1` rows to
 * detect a next page, and the (limit+1)-th row was popped AND used as the
 * nextCursor. Because the follow-up query passes `skip: 1` (skip the cursor
 * row itself), that popped row was never returned on any page — every page
 * boundary silently dropped one notification. The cursor must instead be the
 * last row actually returned.
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
      /* noop */
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

const USER_ID = "user-1";

/** 7 notifications, newest first (n1 newest … n7 oldest) — the DB order. */
const ALL_ROWS = Array.from({ length: 7 }, (_, i) => ({
  id: `n${i + 1}`,
  category: "mention",
  title: `Mention ${i + 1}`,
  message: null,
  deeplink: null,
  createdAt: new Date(Date.UTC(2026, 0, 31 - i)),
  readAt: null,
}));

/**
 * Simulate Prisma's cursor pagination over the fixed row set: `cursor` is
 * inclusive (positions the window ON that row), `skip` then skips from there,
 * `take` limits. This is exactly the semantics the router relies on.
 */
function fakeFindMany(args: { cursor?: { id: string }; skip?: number; take?: number }) {
  let start = 0;
  if (args.cursor) {
    start = ALL_ROWS.findIndex((r) => r.id === args.cursor!.id);
    if (start === -1) throw new Error(`cursor ${args.cursor.id} not found`);
  }
  start += args.skip ?? 0;
  return Promise.resolve(ALL_ROWS.slice(start, start + (args.take ?? ALL_ROWS.length)));
}

describe("notification.list cursor pagination", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.notification.findMany.mockImplementation(fakeFindMany as never);
  });

  it("pages are contiguous — no dropped or duplicated rows across the boundary", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });

    // Page 1: rows 1–3, cursor points at the LAST RETURNED row (n3), not the
    // peeked 4th row — otherwise n4 would be skipped by the next query's skip:1.
    const page1 = await caller.notification.list({ limit: 3 });
    expect(page1.notifications.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(page1.nextCursor).toBe("n3");

    // Page 2 resumes from that cursor.
    const page2 = await caller.notification.list({ limit: 3, cursor: page1.nextCursor });
    expect(page2.notifications.map((n) => n.id)).toEqual(["n4", "n5", "n6"]);
    expect(page2.nextCursor).toBe("n6");

    // The second query carried the inclusive cursor + skip:1 + peek row.
    expect(dbMock.notification.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: "n3" }, skip: 1, take: 4 }),
    );

    // Page 3: the final partial page, no further cursor.
    const page3 = await caller.notification.list({ limit: 3, cursor: page2.nextCursor });
    expect(page3.notifications.map((n) => n.id)).toEqual(["n7"]);
    expect(page3.nextCursor).toBeUndefined();

    // Contiguity: the three pages together are exactly the 7 rows, in order.
    const walked = [page1, page2, page3].flatMap((p) => p.notifications.map((n) => n.id));
    expect(walked).toEqual(ALL_ROWS.map((r) => r.id));
  });

  it("orders newest-first with an id tie-break for determinism", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.notification.list({ limit: 3 });
    expect(dbMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });
});
