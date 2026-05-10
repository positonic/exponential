/**
 * Unit tests for the knowledgeChunk router's one2b agent integration
 * procedures (`ingestTranscription`, `semanticSearch`, `deleteForSource`).
 *
 * Mirrors the pattern in `action.test.ts`: `vitest-mock-extended`'s
 * `mockDeep<PrismaClient>` for the database and a `vi.mock` of
 * `~/server/services/KnowledgeService` so the chunking/embedding side-effects
 * are stubbed. No real DB or OpenAI call is ever made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// See action.test.ts for why these env vars must be seeded BEFORE the module
// graph evaluates — `createCaller` pulls in routers that read env at import.
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

// ── Module mocks ─────────────────────────────────────────────────────

vi.mock("openai", () => ({
  default: class MockOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

// Singleton dbMock shared between the global `~/server/db` import and the
// per-test ctx.db. See action.test.ts for the rationale on the proxy.
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };

function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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

// Side-effect-free stubs (action router pulls these in transitively).
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── KnowledgeService mock ────────────────────────────────────────────
// KnowledgeService is an instance class with a `getKnowledgeService(db)`
// singleton factory. We mock the factory to return a stub object whose
// methods are vi.fn()s, so the router exercises real logic but never
// touches OpenAI or pgvector.
const mockEmbedTranscription = vi.fn<[string], Promise<number>>();
const mockSearch = vi.fn();

vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({
    embedTranscription: mockEmbedTranscription,
    search: mockSearch,
  })),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

describe("knowledgeChunk router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const workspaceId = "w1";
  const sessionId = "ts-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    mockEmbedTranscription.mockReset();
    mockSearch.mockReset();
  });

  function stubMembership(authorized: boolean) {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      authorized
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
        : null,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // ingestTranscription
  // ────────────────────────────────────────────────────────────────────
  describe("ingestTranscription", () => {
    it("calls KnowledgeService.embedTranscription with the right id and returns chunk count", async () => {
      stubMembership(true);
      dbMock.transcriptionSession.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: sessionId, workspaceId } as any,
      );
      mockEmbedTranscription.mockResolvedValue(7);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.knowledgeChunk.updateMany.mockResolvedValue({ count: 7 } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.knowledgeChunk.ingestTranscription({
        transcriptionSessionId: sessionId,
        workspaceId,
      });

      expect(mockEmbedTranscription).toHaveBeenCalledWith(sessionId);
      expect(result.chunksCreated).toBe(7);
      expect(result.transcriptionSessionId).toBe(sessionId);
      expect(result.embeddingProvider).toBe("openai");
      expect(result.embeddingModel).toBe("text-embedding-3-small");
      expect(result.embeddingDim).toBe(1536);
    });

    it("stamps workspaceId on created chunks via updateMany", async () => {
      stubMembership(true);
      dbMock.transcriptionSession.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: sessionId, workspaceId } as any,
      );
      mockEmbedTranscription.mockResolvedValue(3);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.knowledgeChunk.updateMany.mockResolvedValue({ count: 3 } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.knowledgeChunk.ingestTranscription({
        transcriptionSessionId: sessionId,
        workspaceId,
      });

      expect(dbMock.knowledgeChunk.updateMany).toHaveBeenCalledWith({
        where: {
          sourceType: "transcription",
          sourceId: sessionId,
        },
        data: { workspaceId },
      });
    });

    it("skips updateMany when no chunks were created", async () => {
      stubMembership(true);
      dbMock.transcriptionSession.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: sessionId, workspaceId } as any,
      );
      mockEmbedTranscription.mockResolvedValue(0);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.knowledgeChunk.ingestTranscription({
        transcriptionSessionId: sessionId,
        workspaceId,
      });

      expect(result.chunksCreated).toBe(0);
      expect(dbMock.knowledgeChunk.updateMany).not.toHaveBeenCalled();
    });

    it("rejects unauthorized workspace (FORBIDDEN)", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.knowledgeChunk.ingestTranscription({
          transcriptionSessionId: sessionId,
          workspaceId,
        }),
      ).rejects.toThrow(TRPCError);

      expect(mockEmbedTranscription).not.toHaveBeenCalled();
    });

    it("rejects mismatched transcript workspace (FORBIDDEN)", async () => {
      stubMembership(true);
      dbMock.transcriptionSession.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: sessionId, workspaceId: "other-workspace" } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.knowledgeChunk.ingestTranscription({
          transcriptionSessionId: sessionId,
          workspaceId,
        }),
      ).rejects.toThrow(TRPCError);

      expect(mockEmbedTranscription).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND if transcript doesn't exist", async () => {
      stubMembership(true);
      dbMock.transcriptionSession.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.knowledgeChunk.ingestTranscription({
          transcriptionSessionId: sessionId,
          workspaceId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mockEmbedTranscription).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // semanticSearch
  // ────────────────────────────────────────────────────────────────────
  describe("semanticSearch", () => {
    it("returns mapped results with hydrated meetingTitle when sourceType=transcription", async () => {
      stubMembership(true);
      const meetingDate = new Date("2026-01-15T10:00:00Z");
      mockSearch.mockResolvedValue([
        {
          id: "k1",
          content: "Talked about Q1 OKRs",
          sourceType: "transcription",
          sourceId: "ts-99",
          chunkIndex: 0,
          similarity: 0.9,
          sourceTitle: "Q1 Planning",
          sourceMeta: { meetingDate },
        },
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.knowledgeChunk.semanticSearch({
        query: "Q1 OKRs",
        workspaceId,
        sourceType: "transcription",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.meetingTitle).toBe("Q1 Planning");
      expect(result[0]!.meetingDate).toEqual(meetingDate);
      expect(result[0]!.sourceType).toBe("transcription");
      expect(result[0]!.similarity).toBe(0.9);
    });

    it("filters by similarityThreshold", async () => {
      stubMembership(true);
      mockSearch.mockResolvedValue([
        {
          id: "k1",
          content: "very relevant",
          sourceType: "transcription",
          sourceId: "ts-1",
          chunkIndex: 0,
          similarity: 0.85,
          sourceTitle: "T1",
        },
        {
          id: "k2",
          content: "barely relevant",
          sourceType: "transcription",
          sourceId: "ts-2",
          chunkIndex: 0,
          similarity: 0.2,
          sourceTitle: "T2",
        },
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.knowledgeChunk.semanticSearch({
        query: "x",
        workspaceId,
        similarityThreshold: 0.5,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("k1");
    });

    it("respects limit", async () => {
      stubMembership(true);
      mockSearch.mockResolvedValue([
        {
          id: "k1",
          content: "a",
          sourceType: "resource",
          sourceId: "r1",
          chunkIndex: 0,
          similarity: 0.9,
        },
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.knowledgeChunk.semanticSearch({
        query: "x",
        workspaceId,
        limit: 5,
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "x",
        expect.objectContaining({ limit: 5 }),
      );
    });

    it("scopes the search to the calling workspace and userId", async () => {
      stubMembership(true);
      mockSearch.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.knowledgeChunk.semanticSearch({
        query: "x",
        workspaceId,
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "x",
        expect.objectContaining({
          workspaceId,
          userId: callerId,
        }),
      );
    });

    it("rejects unauthorized workspace", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.knowledgeChunk.semanticSearch({
          query: "x",
          workspaceId,
        }),
      ).rejects.toThrow(TRPCError);

      expect(mockSearch).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // deleteForSource
  // ────────────────────────────────────────────────────────────────────
  describe("deleteForSource", () => {
    it("deletes only chunks matching workspaceId + sourceType + sourceId, returns count", async () => {
      stubMembership(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 4 } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.knowledgeChunk.deleteForSource({
        workspaceId,
        sourceType: "transcription",
        sourceId: sessionId,
      });

      expect(result.deleted).toBe(4);
      expect(dbMock.knowledgeChunk.deleteMany).toHaveBeenCalledWith({
        where: {
          workspaceId,
          sourceType: "transcription",
          sourceId: sessionId,
        },
      });
    });

    it("rejects unauthorized workspace", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.knowledgeChunk.deleteForSource({
          workspaceId,
          sourceType: "transcription",
          sourceId: sessionId,
        }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.knowledgeChunk.deleteMany).not.toHaveBeenCalled();
    });
  });
});
