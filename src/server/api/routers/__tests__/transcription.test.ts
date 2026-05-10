/**
 * Unit tests for the transcription router's `findRelated` procedure used by
 * the meetingContextAgent for deterministic related-meeting matching in
 * pre-meeting briefs.
 *
 * Mirrors the pattern in `transcriptionSessionParticipant.test.ts`:
 * `vitest-mock-extended`'s `mockDeep<PrismaClient>` for the database, and
 * `createMockCaller` to drive the full tRPC middleware chain. No real DB or
 * external service is touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Env vars must be seeded BEFORE the module graph evaluates.
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
// per-test ctx.db.
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};

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

// Side-effect-free stubs (action router and others pull these in transitively
// when root.ts is loaded by createCaller).
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// KnowledgeService is pulled in by knowledgeChunkRouter via root.ts.
vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({
    embedTranscription: vi.fn(),
    search: vi.fn(),
  })),
}));

// FirefliesSyncService is pulled in by transcriptionRouter directly.
vi.mock("~/server/services/FirefliesSyncService", () => ({
  FirefliesSyncService: {
    getUserFirefliesIntegrations: vi.fn(),
    getFirefliesIntegration: vi.fn(),
    estimateNewTranscripts: vi.fn(),
    bulkSyncFromFireflies: vi.fn(),
  },
}));

vi.mock("~/server/services/TranscriptionProcessingService", () => ({
  TranscriptionProcessingService: {
    associateWithProject: vi.fn(),
    processTranscription: vi.fn(),
    generateDraftActions: vi.fn(),
    sendSlackNotification: vi.fn(),
    sendSlackSummary: vi.fn(),
  },
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

describe("transcription router (mocked) — findRelated", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const workspaceId = "w1";
  const otherWorkspaceId = "w2";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  function stubMembership(authorized: boolean) {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      authorized
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({
            userId: callerId,
            workspaceId,
            role: "member",
            joinedAt: new Date(),
          } as any)
        : null,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Authorization
  // ────────────────────────────────────────────────────────────────────
  it("rejects unauthorized workspace (FORBIDDEN)", async () => {
    stubMembership(false);

    const caller = createMockCaller({ userId: "stranger", db: dbMock });
    await expect(
      caller.transcription.findRelated({
        workspaceId,
        meetingTitle: "Acme product roadmap",
      }),
    ).rejects.toThrow(TRPCError);

    expect(dbMock.transcriptionSession.findMany).not.toHaveBeenCalled();
    expect(
      dbMock.transcriptionSessionParticipant.findMany,
    ).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // Stopword filtering
  // ────────────────────────────────────────────────────────────────────
  it("filters stopwords from the input title before matching", async () => {
    stubMembership(true);
    // Candidate's title contains "acme" plus its own stopwords. Tokenization
    // should reduce both sides to the same single token.
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "ts-1",
        title: "Acme weekly check-in",
        meetingDate: new Date("2026-04-01T10:00:00Z"),
        summary: null,
      } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Weekly meeting with Acme",
    });

    // "weekly", "meeting", "with" are all stopwords — only "acme" should
    // drive the match. Score = 1/1 = 1.0.
    expect(result.byTitle).toHaveLength(1);
    expect(result.byTitle[0]!.matchedTokens).toEqual(["acme"]);
    expect(result.byTitle[0]!.titleScore).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // Title match — ranked results
  // ────────────────────────────────────────────────────────────────────
  it("returns ranked title matches with correct scores", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "ts-strategy",
        title: "Acme product strategy",
        meetingDate: new Date("2026-04-10T10:00:00Z"),
        summary: "Strategy discussion",
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "ts-acme-only",
        title: "Acme intro",
        meetingDate: new Date("2026-04-15T10:00:00Z"),
        summary: null,
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "ts-noise",
        title: "Internal team lunch",
        meetingDate: new Date("2026-04-20T10:00:00Z"),
        summary: null,
      } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Acme product roadmap",
    });

    // Input tokens: acme, product, roadmap (3 tokens).
    //   ts-strategy matches acme + product → score 2/3
    //   ts-acme-only matches acme → score 1/3
    //   ts-noise matches nothing → dropped
    expect(result.byTitle).toHaveLength(2);
    expect(result.byTitle[0]!.transcriptionSessionId).toBe("ts-strategy");
    expect(result.byTitle[0]!.matchedTokens.sort()).toEqual(
      ["acme", "product"].sort(),
    );
    expect(result.byTitle[0]!.titleScore).toBeCloseTo(2 / 3, 5);
    expect(result.byTitle[1]!.transcriptionSessionId).toBe("ts-acme-only");
    expect(result.byTitle[1]!.titleScore).toBeCloseTo(1 / 3, 5);
  });

  // ────────────────────────────────────────────────────────────────────
  // Empty title bucket when title is all stopwords
  // ────────────────────────────────────────────────────────────────────
  it("returns empty byTitle when all input tokens are stopwords", async () => {
    stubMembership(true);
    // No findMany expected — but stub it just in case so we can assert it
    // wasn't called.
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Weekly sync meeting",
    });

    expect(result.byTitle).toEqual([]);
    expect(dbMock.transcriptionSession.findMany).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // Participant match — ranked results
  // ────────────────────────────────────────────────────────────────────
  it("returns ranked participant overlap matches", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);

    // Two sessions: one with 2/2 attendee overlap, one with 1/2.
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        email: "alice@example.com",
        transcriptionSessionId: "ts-strong",
        transcriptionSession: {
          id: "ts-strong",
          title: "Strong overlap",
          meetingDate: new Date("2026-04-10T10:00:00Z"),
          summary: null,
        },
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        email: "bob@example.com",
        transcriptionSessionId: "ts-strong",
        transcriptionSession: {
          id: "ts-strong",
          title: "Strong overlap",
          meetingDate: new Date("2026-04-10T10:00:00Z"),
          summary: null,
        },
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        email: "alice@example.com",
        transcriptionSessionId: "ts-weak",
        transcriptionSession: {
          id: "ts-weak",
          title: "Weak overlap",
          meetingDate: new Date("2026-04-15T10:00:00Z"),
          summary: null,
        },
      } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Project kickoff",
      participantEmails: ["alice@example.com", "bob@example.com"],
      matchThreshold: 0.5,
    });

    expect(result.byParticipantOverlap).toHaveLength(2);
    expect(result.byParticipantOverlap[0]!.transcriptionSessionId).toBe(
      "ts-strong",
    );
    expect(result.byParticipantOverlap[0]!.overlapRatio).toBe(1);
    expect(result.byParticipantOverlap[0]!.matchedEmails.sort()).toEqual(
      ["alice@example.com", "bob@example.com"].sort(),
    );
    expect(result.byParticipantOverlap[1]!.transcriptionSessionId).toBe(
      "ts-weak",
    );
    expect(result.byParticipantOverlap[1]!.overlapRatio).toBe(0.5);
  });

  // ────────────────────────────────────────────────────────────────────
  // Participant match respects matchThreshold
  // ────────────────────────────────────────────────────────────────────
  it("drops participant matches below matchThreshold", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);

    // Only 1 of 3 input emails matches → 1/3 ≈ 0.33, below threshold 0.5.
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        email: "alice@example.com",
        transcriptionSessionId: "ts-low",
        transcriptionSession: {
          id: "ts-low",
          title: "Low overlap",
          meetingDate: new Date("2026-04-10T10:00:00Z"),
          summary: null,
        },
      } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Project kickoff",
      participantEmails: [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
      ],
      matchThreshold: 0.5,
    });

    expect(result.byParticipantOverlap).toEqual([]);
  });

  // ────────────────────────────────────────────────────────────────────
  // Empty participant bucket when participantEmails is empty
  // ────────────────────────────────────────────────────────────────────
  it("returns empty byParticipantOverlap when participantEmails is empty", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Project kickoff",
      // no participantEmails
    });

    expect(result.byParticipantOverlap).toEqual([]);
    expect(
      dbMock.transcriptionSessionParticipant.findMany,
    ).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // lookbackDays filter
  // ────────────────────────────────────────────────────────────────────
  it("passes a lookbackDays cutoff to the title-candidate query", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const before = Date.now();
    await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Acme strategy",
      lookbackDays: 30,
    });
    const after = Date.now();

    expect(dbMock.transcriptionSession.findMany).toHaveBeenCalledTimes(1);
    const callArg = dbMock.transcriptionSession.findMany.mock.calls[0]?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (callArg as any).where as {
      workspaceId: string;
      meetingDate: { gte: Date };
      title: { not: null };
    };

    expect(where.workspaceId).toBe(workspaceId);
    expect(where.meetingDate.gte).toBeInstanceOf(Date);

    // Cutoff should be ~30 days ago (allow generous slop for test execution).
    const expectedCutoffLow = before - 30 * 24 * 60 * 60 * 1000;
    const expectedCutoffHigh = after - 30 * 24 * 60 * 60 * 1000;
    const actualCutoff = where.meetingDate.gte.getTime();
    expect(actualCutoff).toBeGreaterThanOrEqual(expectedCutoffLow - 5);
    expect(actualCutoff).toBeLessThanOrEqual(expectedCutoffHigh + 5);
  });

  it("passes the same lookbackDays cutoff to the participant query", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Acme strategy",
      participantEmails: ["alice@example.com"],
      lookbackDays: 7,
    });

    const callArg =
      dbMock.transcriptionSessionParticipant.findMany.mock.calls[0]?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (callArg as any).where as {
      workspaceId: string;
      transcriptionSession: { meetingDate: { gte: Date } };
    };

    expect(where.workspaceId).toBe(workspaceId);
    expect(where.transcriptionSession.meetingDate.gte).toBeInstanceOf(Date);
  });

  // ────────────────────────────────────────────────────────────────────
  // Workspace scoping
  // ────────────────────────────────────────────────────────────────────
  it("scopes both queries to the calling workspace", async () => {
    stubMembership(true);
    dbMock.transcriptionSession.findMany.mockResolvedValue([]);
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Acme strategy",
      participantEmails: ["alice@example.com"],
    });

    const titleCall =
      dbMock.transcriptionSession.findMany.mock.calls[0]?.[0];
    const participantCall =
      dbMock.transcriptionSessionParticipant.findMany.mock.calls[0]?.[0];

    // Neither query should reference the other workspace.
    expect(JSON.stringify(titleCall)).not.toContain(otherWorkspaceId);
    expect(JSON.stringify(participantCall)).not.toContain(otherWorkspaceId);

    // Both queries must filter on the calling workspace.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((titleCall as any).where.workspaceId).toBe(workspaceId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((participantCall as any).where.workspaceId).toBe(workspaceId);
  });

  // ────────────────────────────────────────────────────────────────────
  // Limit
  // ────────────────────────────────────────────────────────────────────
  it("caps each bucket at the input limit", async () => {
    stubMembership(true);

    // Generate 15 candidates, all matching — limit is 3.
    const titleCandidates = Array.from({ length: 15 }, (_, i) => ({
      id: `ts-${i}`,
      title: `Acme ${i}`,
      meetingDate: new Date(2026, 3, i + 1, 10, 0, 0),
      summary: null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSession.findMany.mockResolvedValue(
      titleCandidates as any,
    );
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcription.findRelated({
      workspaceId,
      meetingTitle: "Acme",
      limit: 3,
    });

    expect(result.byTitle).toHaveLength(3);
  });
});
