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

// Ceremony side effects of createManualTranscription, stubbed so tests can
// assert which path ran (hand-picked occurrence vs title/date auto-attach).
vi.mock("~/server/services/ceremonies/autoAttach", () => ({
  attachMeetingToOccurrence: vi.fn().mockResolvedValue({ match: null }),
}));
vi.mock("~/server/services/ceremonies/activity", () => ({
  recordOccurrenceCaptured: vi.fn().mockResolvedValue(undefined),
  recordOccurrencesScheduled: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";
import { attachMeetingToOccurrence } from "~/server/services/ceremonies/autoAttach";
import { recordOccurrenceCaptured } from "~/server/services/ceremonies/activity";
import { uploadToBlob } from "~/lib/blob";
import { MAX_MEETING_IMAGE_BASE64_LENGTH } from "~/lib/meetings/meetingImages";

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

// ──────────────────────────────────────────────────────────────────────
// saveTranscription — optional `notes` (exponential-ios ADR 0006 amendment).
// The transcript always appends; notes REPLACE when provided and are left
// untouched (field omitted from the update) when absent.
// ──────────────────────────────────────────────────────────────────────
describe("transcription router (mocked) — saveTranscription notes", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // An existing session owned by the caller, with prior transcript text.
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "sess1",
      userId: callerId,
      transcription: "earlier text",
      notes: "old notes",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSession.update.mockResolvedValue({} as any);
  });

  function updateData() {
    const call = dbMock.transcriptionSession.update.mock.calls[0]?.[0] as
      | { data: { transcription: string; notes?: string } }
      | undefined;
    return call?.data;
  }

  it("replaces notes and appends the transcript when notes are provided", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.saveTranscription({
      id: "sess1",
      transcription: "new line",
      notes: "ask Sam about pricing",
    });

    const data = updateData();
    expect(data?.transcription).toBe("earlier text new line");
    expect(data?.notes).toBe("ask Sam about pricing");
  });

  it("leaves notes untouched (field omitted) when notes are absent", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.saveTranscription({
      id: "sess1",
      transcription: "new line",
    });

    const data = updateData();
    expect(data?.transcription).toBe("earlier text new line");
    // No `notes` key at all — the server must not overwrite existing notes.
    expect(data).not.toHaveProperty("notes");
  });

  it("re-submitting replaces (does not duplicate) the notes", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.saveTranscription({
      id: "sess1",
      transcription: "more",
      notes: "edited notes",
    });

    // Replace semantics: the update sets notes to exactly the new value, never
    // appending to "old notes".
    expect(updateData()?.notes).toBe("edited notes");
  });
});

// ──────────────────────────────────────────────────────────────────────
// uploadScreenshot — images dropped onto the Add Meeting modal or the
// meeting's Screenshots tab land as Screenshot rows on the session.
// ──────────────────────────────────────────────────────────────────────
describe("transcription router (mocked) — uploadScreenshot", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.mocked(uploadToBlob).mockClear();
    dbMock.screenshot.create.mockResolvedValue({
      id: "shot1",
      url: "blob://test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("stores the image as a Screenshot linked to the meeting", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "sess1",
      userId: callerId,
      projectId: null,
      workspaceId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.uploadScreenshot({
      transcriptionSessionId: "sess1",
      base64Data: "aGVsbG8=",
      contentType: "image/jpeg",
    });

    expect(result).toEqual({ id: "shot1", url: "blob://test" });
    const data = dbMock.screenshot.create.mock.calls[0]?.[0]?.data;
    expect(data?.transcriptionSessionId).toBe("sess1");
    expect(data?.url).toBe("blob://test");
  });

  it("rejects callers without edit access to the meeting", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "sess1",
      userId: "someone-else",
      projectId: null,
      workspaceId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.uploadScreenshot({
        transcriptionSessionId: "sess1",
        base64Data: "aGVsbG8=",
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.screenshot.create).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload before uploading anything", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.uploadScreenshot({
        transcriptionSessionId: "sess1",
        base64Data: "A".repeat(MAX_MEETING_IMAGE_BASE64_LENGTH + 4),
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(uploadToBlob).not.toHaveBeenCalled();
    expect(dbMock.transcriptionSession.findUnique).not.toHaveBeenCalled();
  });

  it("404s for an unknown meeting", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.uploadScreenshot({
        transcriptionSessionId: "missing",
        base64Data: "aGVsbG8=",
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("transcription router (mocked) — createManualTranscription", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const base = { title: "Planning", transcription: "Pat: hello" };

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.mocked(attachMeetingToOccurrence).mockClear();
    vi.mocked(recordOccurrenceCaptured).mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dbMock.$transaction as any).mockImplementation((fn: (tx: unknown) => unknown) => fn(dbMock));
    dbMock.transcriptionSession.create.mockResolvedValue({
      id: "m1",
      title: "Planning",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("refuses to file a meeting into a project the caller can't see", async () => {
    dbMock.project.findUnique.mockResolvedValue({
      createdById: "someone-else",
      teamId: null,
      workspaceId: "ws-other",
      isPublic: false,
      isRestricted: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.createManualTranscription({ ...base, projectId: "p-secret" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.transcriptionSession.create).not.toHaveBeenCalled();
  });

  it("creates the meeting with its feature links in the same write", async () => {
    dbMock.feature.count.mockResolvedValue(2);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.createManualTranscription({
      ...base,
      workspaceId: "ws-A",
      featureIds: ["f1", "f2", "f1"],
    });

    const data = dbMock.transcriptionSession.create.mock.calls[0]?.[0]?.data;
    expect(data?.featureLinks).toEqual({
      create: [
        { featureId: "f1", createdById: callerId },
        { featureId: "f2", createdById: callerId },
      ],
    });
    expect(attachMeetingToOccurrence).toHaveBeenCalled();
  });

  it("rejects features from another workspace before creating anything", async () => {
    dbMock.feature.count.mockResolvedValue(0);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.createManualTranscription({
        ...base,
        workspaceId: "ws-A",
        featureIds: ["f-elsewhere"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMock.transcriptionSession.create).not.toHaveBeenCalled();
  });

  it("links a hand-picked occurrence and skips auto-attach", async () => {
    dbMock.ceremonyOccurrence.findUnique.mockResolvedValue({
      id: "occ1",
      workspaceId: "ws-A",
      scheduledStart: new Date("2026-09-08T09:00:00Z"),
      ceremony: { name: "Daily Standup", timezone: "Europe/Berlin" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.createManualTranscription({
      ...base,
      workspaceId: "ws-A",
      occurrenceId: "occ1",
    });

    const data = dbMock.transcriptionSession.create.mock.calls[0]?.[0]?.data;
    expect(data?.occurrenceId).toBe("occ1");
    expect(recordOccurrenceCaptured).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({ occurrenceId: "occ1", meetingId: "m1", via: "manual" }),
    );
    expect(attachMeetingToOccurrence).not.toHaveBeenCalled();
  });

  it("rejects an occurrence from another workspace", async () => {
    dbMock.ceremonyOccurrence.findUnique.mockResolvedValue({
      id: "occ1",
      workspaceId: "ws-other",
      scheduledStart: new Date(),
      ceremony: { name: "Retro", timezone: "UTC" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.transcription.createManualTranscription({
        ...base,
        workspaceId: "ws-A",
        occurrenceId: "occ1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMock.transcriptionSession.create).not.toHaveBeenCalled();
  });
});

describe("transcription router (mocked) — linkFeature / unlinkFeature", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const link = { transcriptionId: "m1", featureId: "f1" };

  function meeting(userId: string) {
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "m1",
      userId,
      projectId: null,
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.feature.count.mockResolvedValue(1);
  });

  it("upserts the link on the compound key, so relinking is a no-op", async () => {
    meeting(callerId);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.linkFeature(link);

    expect(dbMock.meetingFeature.upsert).toHaveBeenCalledWith({
      where: { transcriptionSessionId_featureId: { transcriptionSessionId: "m1", featureId: "f1" } },
      create: { transcriptionSessionId: "m1", featureId: "f1", createdById: callerId },
      update: {},
    });
  });

  it("rejects a feature outside the meeting's workspace", async () => {
    meeting(callerId);
    dbMock.feature.count.mockResolvedValue(0);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.transcription.linkFeature(link)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(dbMock.meetingFeature.upsert).not.toHaveBeenCalled();
  });

  it("rejects linking and unlinking without edit access to the meeting", async () => {
    meeting("someone-else");
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "viewer",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.transcription.linkFeature(link)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.transcription.unlinkFeature(link)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(dbMock.meetingFeature.upsert).not.toHaveBeenCalled();
    expect(dbMock.meetingFeature.deleteMany).not.toHaveBeenCalled();
  });

  it("unlinks only this meeting's link to the feature", async () => {
    meeting(callerId);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.transcription.unlinkFeature(link);

    expect(dbMock.meetingFeature.deleteMany).toHaveBeenCalledWith({
      where: { transcriptionSessionId: "m1", featureId: "f1" },
    });
  });
});

describe("transcription router (mocked) — getById feature links", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  function meetingWithLinks(userId: string) {
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "m1",
      userId,
      projectId: null,
      workspaceId: "ws-A",
      featureLinks: [{ feature: { id: "f1", name: "Secret roadmap item" } }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("shows links, and lets a member who can edit link more", async () => {
    meetingWithLinks(callerId);
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.getById({ id: "m1" });

    expect(result.featureLinks).toHaveLength(1);
    expect(result.canLinkFeatures).toBe(true);
  });

  it("strips links for a viewer outside the workspace (e.g. an attendee)", async () => {
    meetingWithLinks("someone-else");
    dbMock.transcriptionSessionParticipant.findFirst.mockResolvedValue({
      id: "p1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.getById({ id: "m1" });

    expect(result.featureLinks).toEqual([]);
    expect(result.canLinkFeatures).toBe(false);
  });
});

describe("transcription router (mocked) — getDetail / getTranscript", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  function meeting(userId: string) {
    dbMock.transcriptionSession.findUnique.mockResolvedValue({
      id: "m1",
      userId,
      projectId: null,
      workspaceId: "ws-A",
      notes: "private scratch notes",
      transcription: "Me: hello\nThem: hi there\nMe: shall we start?",
      sentencesJson: null,
      analyticsJson: {
        speakers: [
          { name: "Ana", duration: 30 },
          { name: "Ben", duration: 90 },
        ],
      },
      featureLinks: [{ feature: { id: "f1", name: "Secret roadmap item" } }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("omits the heavy columns and precomputes the transcript count and talk-time", async () => {
    meeting(callerId);
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: "ws-A",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.getDetail({ id: "m1" });

    expect(result).not.toHaveProperty("transcription");
    expect(result).not.toHaveProperty("sentencesJson");
    expect(result).not.toHaveProperty("analyticsJson");
    expect(result).not.toHaveProperty("notes");
    expect(result.hasTranscript).toBe(true);
    expect(result.transcriptTurnCount).toBeGreaterThan(0);
    expect(result.talkTime).toEqual({ Ana: "25%", Ben: "75%" });
    expect(result.featureLinks).toHaveLength(1);
    expect(result.canLinkFeatures).toBe(true);
  });

  it("strips feature links for a viewer outside the workspace", async () => {
    meeting("someone-else");
    dbMock.transcriptionSessionParticipant.findFirst.mockResolvedValue({
      id: "p1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.getDetail({ id: "m1" });

    expect(result.featureLinks).toEqual([]);
    expect(result.canLinkFeatures).toBe(false);
  });

  it("refuses the detail and the transcript to a non-viewer", async () => {
    meeting("someone-else");
    dbMock.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    dbMock.teamUser.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.transcription.getDetail({ id: "m1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.transcription.getTranscript({ id: "m1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("serves the transcript to a viewer", async () => {
    meeting(callerId);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.transcription.getTranscript({ id: "m1" });

    expect(result).toEqual({
      transcription: "Me: hello\nThem: hi there\nMe: shall we start?",
      sentencesJson: null,
    });
  });
});
