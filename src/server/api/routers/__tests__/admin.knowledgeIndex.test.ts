/**
 * Unit tests for the admin knowledge-index procedures
 * (admin.getKnowledgeIndexStats / admin.backfillKnowledgeIndex).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). KnowledgeService is mocked so no
 * embedding provider is called.
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

const embedTranscription = vi.hoisted(() => vi.fn<(id: string) => Promise<number>>());
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ embedTranscription }),
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
import { summarizeKnowledgeIndex } from "~/server/services/knowledgeIndexAdmin";

const ADMIN_ID = "admin-1";

describe("admin knowledge index procedures", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    embedTranscription.mockReset();
  });

  function caller(isAdmin: boolean) {
    return createMockCaller({
      userId: isAdmin ? ADMIN_ID : "user-1",
      db: db as unknown as PrismaClient,
      isAdmin,
    });
  }

  it("rejects non-admins with FORBIDDEN", async () => {
    await expect(caller(false).admin.getKnowledgeIndexStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller(false).admin.backfillKnowledgeIndex({ limit: 1, excludeIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(embedTranscription).not.toHaveBeenCalled();
  });

  it("passes excludeIds and limit to the candidate query and reports counts", async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { id: "t-ok", title: "Standup" },
        { id: "t-empty", title: "Silence" },
        { id: "t-bad", title: "Broken" },
      ])
      .mockResolvedValueOnce([{ count: 4 }]);
    embedTranscription.mockImplementation(async (id: string) => {
      if (id === "t-bad") throw new Error("embedding provider down");
      return id === "t-ok" ? 7 : 0;
    });

    const result = await caller(true).admin.backfillKnowledgeIndex({
      limit: 3,
      excludeIds: ["t-old-fail"],
    });

    // Candidate query: values are [excludeIds, limit].
    const candidateCall = db.$queryRaw.mock.calls[0]!;
    expect(candidateCall.slice(1)).toEqual([["t-old-fail"], 3]);
    // Remaining query skips both the excluded ids and everything just attempted.
    const remainingCall = db.$queryRaw.mock.calls[1]!;
    expect(remainingCall.slice(1)).toEqual([["t-old-fail", "t-ok", "t-empty", "t-bad"]]);

    expect(embedTranscription.mock.calls.map((c) => c[0])).toEqual(["t-ok", "t-empty", "t-bad"]);
    expect(result).toMatchObject({
      processed: 3,
      successful: 1,
      empty: 1,
      failed: 1,
      attemptedIds: ["t-ok", "t-empty", "t-bad"],
      remaining: 4,
    });
  });

  it("reports an empty batch when nothing is pending", async () => {
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

    const result = await caller(true).admin.backfillKnowledgeIndex({ excludeIds: [] });

    expect(db.$queryRaw.mock.calls[0]!.slice(1)).toEqual([[], 5]);
    expect(embedTranscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 0, attemptedIds: [], remaining: 0 });
  });

  it("rejects a limit above 20", async () => {
    await expect(
      caller(true).admin.backfillKnowledgeIndex({ limit: 21, excludeIds: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns stats with orphan chunks counted separately", async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { sourceType: "transcription", total: 10, indexed: 6, pendingWithoutOwner: 1, indexedWithoutWorkspace: 2, chunkedWithoutText: 0 },
        { sourceType: "resource", total: 1, indexed: 1, pendingWithoutOwner: 0, indexedWithoutWorkspace: 0, chunkedWithoutText: 1 },
      ])
      .mockResolvedValueOnce([
        { sourceType: "resource", chunks: 5, sources: 3, orphanChunks: 2, orphanSources: 1 },
        { sourceType: "transcription", chunks: 40, sources: 6, orphanChunks: 0, orphanSources: 0 },
      ]);

    const stats = await caller(true).admin.getKnowledgeIndexStats();

    expect(stats.transcriptions).toEqual({
      total: 10,
      indexed: 6,
      pending: 4,
      pendingWithoutOwner: 1,
      indexedWithoutWorkspace: 2,
      chunkedWithoutText: 0,
    });
    // The "2 / 1, -1 pending" case: chunks for a deleted resource are orphans,
    // not extra indexed resources.
    expect(stats.resources).toEqual({ total: 1, indexed: 1, pending: 0, chunkedWithoutText: 1 });
    expect(stats.totalChunks).toBe(45);
    expect(stats.orphanChunks).toBe(2);
    expect(stats.orphanSources).toBe(1);
  });
});

describe("summarizeKnowledgeIndex", () => {
  it("never reports negative numbers, even from inconsistent rows", () => {
    const stats = summarizeKnowledgeIndex(
      [
        { sourceType: "transcription", total: 1, indexed: 3, pendingWithoutOwner: 5, indexedWithoutWorkspace: 9, chunkedWithoutText: -2 },
        { sourceType: "resource", total: -1, indexed: 2, pendingWithoutOwner: 0, indexedWithoutWorkspace: 0, chunkedWithoutText: 0 },
      ],
      [{ sourceType: "page", chunks: -1, sources: -1, orphanChunks: -1, orphanSources: -1 }],
    );

    const numbers = [
      ...Object.values(stats.transcriptions),
      ...Object.values(stats.resources),
      ...stats.chunksBySource.flatMap((r) => [r.chunks, r.sources, r.orphanChunks, r.orphanSources]),
      stats.totalChunks,
      stats.orphanChunks,
      stats.orphanSources,
    ];
    for (const n of numbers) expect(n).toBeGreaterThanOrEqual(0);
    expect(stats.transcriptions.indexed).toBeLessThanOrEqual(stats.transcriptions.total);
    expect(stats.transcriptions.pendingWithoutOwner).toBeLessThanOrEqual(stats.transcriptions.pending);
    expect(stats.transcriptions.indexedWithoutWorkspace).toBeLessThanOrEqual(stats.transcriptions.indexed);
  });

  it("returns zeros when there are no rows", () => {
    const stats = summarizeKnowledgeIndex([], []);
    expect(stats.transcriptions.pending).toBe(0);
    expect(stats.resources.pending).toBe(0);
    expect(stats.totalChunks).toBe(0);
  });
});
