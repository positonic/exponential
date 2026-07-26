/**
 * Unit tests for the feature-ideation procedures on the `transcription` router:
 * `generateDraftFeatures`, `publishSelectedDraftFeatures` and
 * `discardDraftFeatures`.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` rather than a real
 * database, so these run in milliseconds and CANNOT touch any real DB. Header
 * (env seeding + module stubs) mirrors `transcription.test.ts` /
 * `ticket.test.ts` — the wider router tree pulls in heavy IO modules at import
 * time and they all have to be stubbed before the graph evaluates.
 *
 * These assert EXTERNAL BEHAVIOUR: the rows that come out and whether
 * extraction ran. Deliberately no assertions on `prisma.feature.create` call
 * counts — the created rows themselves are the contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

// Singleton dbMock shared between the global `~/server/db` import (which
// `FeatureIdeationService` reads directly) and the per-test `ctx.db`.
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

// Side-effect-free stubs for modules the router tree pulls in transitively.
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));
vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({
    embedTranscription: vi.fn(),
    search: vi.fn(),
  })),
}));
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

// The LLM extraction step is spied on so tests can prove whether it ran. The
// default implementation delegates to the REAL service, so the "no API key"
// test still exercises the genuine degrade-to-zero-drafts path. Only
// `FeatureExtractionService` is replaced — `parseProposedTickets` from the same
// module is used on the read/publish path and must stay real.
const extractFromTranscript = vi.hoisted(() => vi.fn());

vi.mock("~/server/services/FeatureExtractionService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/server/services/FeatureExtractionService")
    >();
  return {
    ...actual,
    FeatureExtractionService: { extractFromTranscript },
  };
});

// The shared ticket-create path (ADR-0016). Mocked so publish assertions are
// about the arguments it receives, not about ticket numbering (that is the
// integration test's job).
vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: vi.fn(() =>
    Promise.resolve({ id: "ticket-created", number: 1 }),
  ),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";
const transcriptionId = "trx-1";

/** The columns `loadTranscriptionForAccess` selects, owned by the caller. */
function stubOwnedSession(
  dbMock: DeepMockProxy<PrismaClient>,
  overrides: Record<string, unknown> = {},
) {
  dbMock.transcriptionSession.findUnique.mockResolvedValue({
    id: transcriptionId,
    userId: callerId,
    projectId: null,
    workspaceId,
    transcription: "We should build bulk CSV import.",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Product lookup + workspace membership probe that publish runs. */
function stubProductAccess(
  dbMock: DeepMockProxy<PrismaClient>,
  role = "member",
) {
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: productId, workspaceId, slug: "p" } as any,
  );
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { userId: callerId, workspaceId, role } as any,
  );
}

describe("transcription router — feature ideation (mocked Prisma)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let caller: ReturnType<typeof createMockCaller>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.clearAllMocks();

    // Default: extraction delegates to the real implementation.
    extractFromTranscript.mockImplementation(async (...args: unknown[]) => {
      const actual = await vi.importActual<
        typeof import("~/server/services/FeatureExtractionService")
      >("~/server/services/FeatureExtractionService");
      return actual.FeatureExtractionService.extractFromTranscript(
        args[0] as string,
        args[1] as undefined,
      );
    });
    (
      createTicketWithNumber as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "ticket-created", number: 1 });

    caller = createMockCaller({ userId: callerId, db: dbMock });
  });

  // ── Router-boundary access on ideation ─────────────────────────────
  //
  // The service's own check waves through a project-less meeting for any
  // caller, so the router must assert access itself. A meeting belonging to
  // someone else, filed under no project, must not be ideatable by a stranger.
  it("refuses ideation by a non-member on someone else's project-less meeting", async () => {
    stubOwnedSession(dbMock, { userId: "someone-else", projectId: null });
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);

    await expect(
      caller.transcription.generateDraftFeatures({ transcriptionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(extractFromTranscript).not.toHaveBeenCalled();
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
  });

  it("refuses ideation by a workspace viewer — ideating writes draft rows", async () => {
    stubOwnedSession(dbMock, { userId: "someone-else", projectId: null });
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "viewer" } as any,
    );

    await expect(
      caller.transcription.generateDraftFeatures({ transcriptionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(extractFromTranscript).not.toHaveBeenCalled();
  });

  it("reports a missing meeting as NOT_FOUND, not BAD_REQUEST", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(null);

    await expect(
      caller.transcription.generateDraftFeatures({ transcriptionId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── Guard rail 1: no transcript declines and says why ──────────────
  it("declines ideation on a meeting with no transcript and says why", async () => {
    stubOwnedSession(dbMock, { transcription: null });
    dbMock.meetingFeatureDraft.count.mockResolvedValue(0);

    await expect(
      caller.transcription.generateDraftFeatures({ transcriptionId }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/transcript/i) as unknown as string,
    });

    // Nothing was written to the holding table.
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
    expect(dbMock.feature.create).not.toHaveBeenCalled();
  });

  // ── Guard rail 2: re-run idempotence ──────────────────────────────
  it("re-running on a meeting that already has drafts surfaces them without extracting again", async () => {
    stubOwnedSession(dbMock);
    dbMock.meetingFeatureDraft.count.mockResolvedValue(3);

    const result = await caller.transcription.generateDraftFeatures({
      transcriptionId,
    });

    expect(result).toMatchObject({
      success: true,
      alreadyDrafted: true,
      draftCount: 3,
      featuresCreated: 0,
    });
    expect(extractFromTranscript).not.toHaveBeenCalled();
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
  });

  // ── Guard rail 3: no API key degrades, doesn't fail ────────────────
  it("succeeds with zero drafts when OPENAI_API_KEY is unset", async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      stubOwnedSession(dbMock);
      dbMock.meetingFeatureDraft.count.mockResolvedValue(0);

      const result = await caller.transcription.generateDraftFeatures({
        transcriptionId,
      });

      expect(result).toMatchObject({
        success: true,
        featuresCreated: 0,
        draftCount: 0,
        alreadyDrafted: false,
      });
      expect(result.errors).toEqual([]);
      expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
    } finally {
      if (savedKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = savedKey;
      }
    }
  });

  // ── Guard rail 4: missing meeting reports failure ──────────────────
  it("does not reach extraction when the meeting does not exist", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(null);

    await expect(
      caller.transcription.generateDraftFeatures({
        transcriptionId: "does-not-exist",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(extractFromTranscript).not.toHaveBeenCalled();
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
  });

  // ── Guard rail 5: publish requires an explicit product ─────────────
  describe("publishSelectedDraftFeatures input contract", () => {
    // Untyped view of the procedure so the deliberately-invalid inputs below
    // compile — the point of these tests is the runtime Zod rejection.
    function publish(input: Record<string, unknown>): Promise<unknown> {
      const proc = caller.transcription.publishSelectedDraftFeatures as unknown as (
        i: Record<string, unknown>,
      ) => Promise<unknown>;
      return proc(input);
    }

    it("rejects a publish with no productId — the target product is never inferred", async () => {
      stubOwnedSession(dbMock);
      stubProductAccess(dbMock);

      await expect(
        publish({ transcriptionId, draftIds: ["draft-1"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(dbMock.feature.create).not.toHaveBeenCalled();
      expect(createTicketWithNumber).not.toHaveBeenCalled();
    });

    it("rejects a publish with an empty draftIds array", async () => {
      stubOwnedSession(dbMock);
      stubProductAccess(dbMock);

      await expect(
        publish({ transcriptionId, draftIds: [], productId }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(dbMock.feature.create).not.toHaveBeenCalled();
      expect(createTicketWithNumber).not.toHaveBeenCalled();
    });
  });

  // ── Guard rail 6: the accept path shape ───────────────────────────
  it("accepting one draft with two proposed tickets creates one Feature in the target product and two BACKLOG tickets under it", async () => {
    stubOwnedSession(dbMock);
    stubProductAccess(dbMock);

    dbMock.meetingFeatureDraft.findMany.mockResolvedValue([
      {
        id: "draft-1",
        transcriptionSessionId: transcriptionId,
        productId: null,
        createdById: callerId,
        name: "Bulk CSV import",
        description: "Import contacts from a CSV file.",
        vision: "Nobody types a contact in by hand again.",
        tickets: [
          { title: "Parse the CSV", body: null, type: "FEATURE" },
          { title: "Wire the upload button", body: "Front end only", type: "CHORE" },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    dbMock.feature.create.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "feature-1", name: "Bulk CSV import" } as any,
    );
    dbMock.meetingFeatureDraft.deleteMany.mockResolvedValue({ count: 1 });

    const result = await caller.transcription.publishSelectedDraftFeatures({
      transcriptionId,
      draftIds: ["draft-1"],
      productId,
    });

    expect(result).toEqual({
      featuresCreated: 1,
      ticketsCreated: 2,
      featureIds: ["feature-1"],
    });

    // The Feature rows that resulted — exactly one, in the chosen product.
    const createdFeatures = dbMock.feature.create.mock.calls.map(
      (call) => call[0]?.data,
    );
    expect(createdFeatures).toEqual([
      expect.objectContaining({
        productId,
        name: "Bulk CSV import",
        description: "Import contacts from a CSV file.",
        vision: "Nobody types a contact in by hand again.",
        status: "IDEA",
        createdById: callerId,
        // Provenance (V3): the originating meeting is recorded on the Feature.
        sourceTranscriptionId: transcriptionId,
      }),
    ]);

    // The tickets that resulted — both BACKLOG, both under the new Feature.
    const ticketCalls = (
      createTicketWithNumber as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(ticketCalls).toHaveLength(2);
    for (const ticket of ticketCalls) {
      expect(ticket).toMatchObject({
        productId,
        workspaceId,
        createdById: callerId,
        status: "BACKLOG",
        featureId: "feature-1",
      });
    }
    expect(ticketCalls.map((t) => t.title)).toEqual([
      "Parse the CSV",
      "Wire the upload button",
    ]);
    expect(ticketCalls.map((t) => t.type)).toEqual(["FEATURE", "CHORE"]);

    // Accepted drafts are drained — the real Features carry them now.
    expect(dbMock.meetingFeatureDraft.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["draft-1"] } },
    });
  });

  // ── Role gate: membership is not permission to write ──────────────
  //
  // `assertWorkspaceMember` admits viewers, so without the explicit editor
  // check a read-only member of the workspace could create Features and
  // Tickets by accepting a draft.
  it("refuses a workspace viewer accepting a draft, and writes nothing", async () => {
    stubOwnedSession(dbMock);
    stubProductAccess(dbMock, "viewer");
    dbMock.meetingFeatureDraft.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "draft-1", name: "CSV import", tickets: [] } as any,
    ]);

    await expect(
      caller.transcription.publishSelectedDraftFeatures({
        transcriptionId,
        draftIds: ["draft-1"],
        productId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(dbMock.feature.create).not.toHaveBeenCalled();
    expect(createTicketWithNumber).not.toHaveBeenCalled();
    expect(dbMock.meetingFeatureDraft.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a non-member accepting a draft", async () => {
    stubOwnedSession(dbMock);
    dbMock.product.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: productId, workspaceId, slug: "p" } as any,
    );
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);

    await expect(
      caller.transcription.publishSelectedDraftFeatures({
        transcriptionId,
        draftIds: ["draft-1"],
        productId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(dbMock.feature.create).not.toHaveBeenCalled();
  });

  // ── Guard rail 7: discarding writes nothing to the registry ───────
  it("discarding deletes only the holding rows and creates no Feature", async () => {
    stubOwnedSession(dbMock);
    dbMock.meetingFeatureDraft.deleteMany.mockResolvedValue({ count: 2 });

    const result = await caller.transcription.discardDraftFeatures({
      transcriptionId,
      draftIds: ["draft-1", "draft-2"],
    });

    expect(result).toEqual({ discardedCount: 2 });
    expect(dbMock.meetingFeatureDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["draft-1", "draft-2"] },
        transcriptionSessionId: transcriptionId,
      },
    });
    expect(dbMock.feature.create).not.toHaveBeenCalled();
    expect(createTicketWithNumber).not.toHaveBeenCalled();
  });
});
