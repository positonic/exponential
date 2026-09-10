/**
 * The post-summary decision-extraction hook (Decisions V2): fires only when
 * the workspace is opted in, only on the first summary landing, with the
 * meeting owner as the requester, and never fails the summary. Summarizer,
 * notifications and the extractor are all stubbed — no model calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { summarizeMock, generateDraftDecisionsMock, emitMock, recordActivityMock } = vi.hoisted(() => ({
  summarizeMock: vi.fn(),
  generateDraftDecisionsMock: vi.fn(),
  emitMock: vi.fn(async () => undefined),
  recordActivityMock: vi.fn(async () => true),
}));

vi.mock("~/server/services/TranscriptSummarizerService", () => ({
  TranscriptSummarizerService: { summarizeToFirefliesSummary: summarizeMock },
  SummarizationNotConfiguredError: class extends Error {},
}));
vi.mock("~/server/services/decisions/generateDraftDecisions", () => ({
  generateDraftDecisions: generateDraftDecisionsMock,
}));
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({ emitNotification: emitMock }));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: recordActivityMock }));

import { summarizeMeetingRow } from "../ensureMeetingSummary";
import { isPostSummaryDecisionExtractionEnabled } from "~/server/services/decisions/postSummaryExtraction";

const db = mockDeep<PrismaClient>();
const MEETING = {
  id: "m1",
  title: "Daily Standup",
  transcription: "Dev Fixture: Morning.\nPat Reviewer: Clear.",
  summary: null,
  workspaceId: "w1",
  userId: "owner1",
};

describe("isPostSummaryDecisionExtractionEnabled", () => {
  it("is off without the variable, on for a listed workspace or the wildcard", () => {
    expect(isPostSummaryDecisionExtractionEnabled("w1", {})).toBe(false);
    expect(isPostSummaryDecisionExtractionEnabled("w1", { DECISION_EXTRACTION_WORKSPACES: "w2, w1" })).toBe(true);
    expect(isPostSummaryDecisionExtractionEnabled("w3", { DECISION_EXTRACTION_WORKSPACES: "w2, w1" })).toBe(false);
    expect(isPostSummaryDecisionExtractionEnabled("w3", { DECISION_EXTRACTION_WORKSPACES: "*" })).toBe(true);
    expect(isPostSummaryDecisionExtractionEnabled(null, { DECISION_EXTRACTION_WORKSPACES: "*" })).toBe(false);
  });
});

describe("summarizeMeetingRow — post-summary decision extraction hook", () => {
  const originalEnv = process.env.DECISION_EXTRACTION_WORKSPACES;

  beforeEach(() => {
    mockReset(db);
    summarizeMock.mockReset();
    generateDraftDecisionsMock.mockReset();
    summarizeMock.mockResolvedValue({ overview: "Short standup.", keywords: [] });
    db.transcriptionSession.updateMany.mockResolvedValue({ count: 1 } as never);
    generateDraftDecisionsMock.mockResolvedValue({ success: true, draftsCreated: 2 });
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DECISION_EXTRACTION_WORKSPACES;
    else process.env.DECISION_EXTRACTION_WORKSPACES = originalEnv;
  });

  it("extracts for the owner after the first summary lands when the workspace is opted in", async () => {
    process.env.DECISION_EXTRACTION_WORKSPACES = "w1";
    const result = await summarizeMeetingRow(db, MEETING, { extractDecisions: true });
    expect(result.status).toBe("created");
    expect(generateDraftDecisionsMock).toHaveBeenCalledWith(db, "m1", "owner1", { trigger: "post_summary" });
  });

  it("does nothing when the workspace is not opted in", async () => {
    delete process.env.DECISION_EXTRACTION_WORKSPACES;
    await summarizeMeetingRow(db, MEETING, { extractDecisions: true });
    expect(generateDraftDecisionsMock).not.toHaveBeenCalled();
  });

  it("does not re-run when the summary was already there or a concurrent writer won", async () => {
    process.env.DECISION_EXTRACTION_WORKSPACES = "*";
    await summarizeMeetingRow(db, { ...MEETING, summary: "{}" }, { extractDecisions: true });
    db.transcriptionSession.updateMany.mockResolvedValue({ count: 0 } as never);
    await summarizeMeetingRow(db, MEETING, { extractDecisions: true });
    expect(generateDraftDecisionsMock).not.toHaveBeenCalled();
  });

  it("never fails the summary when extraction throws", async () => {
    process.env.DECISION_EXTRACTION_WORKSPACES = "*";
    generateDraftDecisionsMock.mockRejectedValue(new Error("model down"));
    const result = await summarizeMeetingRow(db, MEETING, { extractDecisions: true });
    expect(result.status).toBe("created");
  });
});
