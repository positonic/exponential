/**
 * Unit tests for the feature-ideation seam.
 *
 * Everything asserted here is external behaviour: what rows exist afterwards
 * and whether extraction was invoked. Extraction itself is stubbed — the point
 * of putting ideation behind a service rather than an agent tool is that the
 * whole path is testable with a mocked LLM and no agent in the loop.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

vi.mock("~/server/db", () => ({
  get db() {
    return dbMock;
  },
}));

vi.mock("../FeatureExtractionService", () => ({
  FeatureExtractionService: {
    extractFromTranscript: vi.fn(),
  },
}));

import { FeatureExtractionService } from "../FeatureExtractionService";
import { FeatureIdeationService } from "../FeatureIdeationService";

const extractMock = vi.mocked(FeatureExtractionService.extractFromTranscript);

const OWNER = "user-1";
const TRANSCRIPTION_ID = "meeting-1";

/** A meeting owned by OWNER, with a transcript, not filed under a project. */
function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSCRIPTION_ID,
    userId: OWNER,
    projectId: null,
    transcription: "We should let people import a CSV of contacts.",
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(dbMock);
  vi.clearAllMocks();
});

describe("FeatureIdeationService.generateDraftFeatures", () => {
  it("writes a draft row per extracted feature and nothing to the registry", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow() as never,
    );
    dbMock.meetingFeatureDraft.count.mockResolvedValue(0);
    dbMock.meetingFeatureDraft.createMany.mockResolvedValue({ count: 2 });
    extractMock.mockResolvedValue([
      { name: "CSV contact import", description: "Bulk load", tickets: [] },
      {
        name: "Dedupe on import",
        tickets: [{ title: "Match on email", type: "FEATURE" }],
      },
    ]);

    const result = await FeatureIdeationService.generateDraftFeatures(
      TRANSCRIPTION_ID,
      OWNER,
    );

    expect(result.success).toBe(true);
    expect(result.featuresCreated).toBe(2);
    expect(result.draftCount).toBe(2);

    const written = dbMock.meetingFeatureDraft.createMany.mock.calls[0]?.[0]
      ?.data as unknown[];
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({
      transcriptionSessionId: TRANSCRIPTION_ID,
      createdById: OWNER,
      name: "CSV contact import",
    });

    // The registry is untouched — drafts are not Features.
    expect(dbMock.feature.create).not.toHaveBeenCalled();
  });

  it("declines and reports why when the meeting has no transcript", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow({ transcription: null }) as never,
    );
    dbMock.meetingFeatureDraft.count.mockResolvedValue(0);

    const result = await FeatureIdeationService.generateDraftFeatures(
      TRANSCRIPTION_ID,
      OWNER,
    );

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toMatch(/no transcript/i);
    expect(extractMock).not.toHaveBeenCalled();
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
  });

  it("surfaces existing drafts instead of extracting a second time", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow() as never,
    );
    dbMock.meetingFeatureDraft.count.mockResolvedValue(3);

    const result = await FeatureIdeationService.generateDraftFeatures(
      TRANSCRIPTION_ID,
      OWNER,
    );

    expect(result.success).toBe(true);
    expect(result.alreadyDrafted).toBe(true);
    expect(result.draftCount).toBe(3);
    expect(result.featuresCreated).toBe(0);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("succeeds with zero drafts when extraction yields nothing", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(
      meetingRow() as never,
    );
    dbMock.meetingFeatureDraft.count.mockResolvedValue(0);
    extractMock.mockResolvedValue([]);

    const result = await FeatureIdeationService.generateDraftFeatures(
      TRANSCRIPTION_ID,
      OWNER,
    );

    expect(result.success).toBe(true);
    expect(result.draftCount).toBe(0);
    expect(dbMock.meetingFeatureDraft.createMany).not.toHaveBeenCalled();
  });

  it("reports a missing meeting rather than throwing", async () => {
    dbMock.transcriptionSession.findUnique.mockResolvedValue(null);

    const result = await FeatureIdeationService.generateDraftFeatures(
      "nope",
      OWNER,
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Transcription not found");
  });
});
