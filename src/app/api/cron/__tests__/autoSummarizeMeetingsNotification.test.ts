// @vitest-environment node
/**
 * The auto-summarize cron must not return before the meeting-ready
 * notification settles. A `void`ed emit can be frozen with the Vercel function
 * once the response goes out, silently dropping the notification. The real
 * route → sweep → summarizeMeetingRow path runs here; only the model, the
 * notification seam and the DB are stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, dbMock, summarizeMock, emitMock, reportMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  dbMock: {
    transcriptionSession: { findMany: vi.fn(), updateMany: vi.fn() },
  },
  summarizeMock: vi.fn(),
  emitMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: dbMock }));
vi.mock("~/server/services/ceremonies/autoAttach", () => ({
  attachUnlinkedMeetings: vi.fn(async () => ({ scanned: 0, attached: 0 })),
}));
vi.mock("~/server/services/TranscriptSummarizerService", () => ({
  TranscriptSummarizerService: { summarizeToFirefliesSummary: summarizeMock },
  SummarizationNotConfiguredError: class extends Error {},
}));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: vi.fn(async () => true) }));
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({ emitNotification: emitMock }));
vi.mock("~/server/services/decisions/generateDraftDecisions", () => ({ generateDraftDecisions: vi.fn() }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: reportMock }));

import { GET } from "../auto-summarize-meetings/route";

const request = {} as NextRequest;
const KEYS = ["CRON_SECRET", "OPENAI_API_KEY", "DECISION_EXTRACTION_WORKSPACES"] as const;
const MEETING = {
  id: "m1",
  title: "Daily Standup",
  transcription: "Dev Fixture: Morning.\nPat Reviewer: Clear.",
  summary: null,
  workspaceId: "w1",
  userId: "owner1",
  occurrenceId: null,
};

/** Resolves on the next macrotask, after every pending microtask has run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("/api/cron/auto-summarize-meetings — meeting-ready notification", () => {
  const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.DECISION_EXTRACTION_WORKSPACES;
    headersMock.mockResolvedValue(new Headers({ authorization: "Bearer test-secret" }));
    dbMock.transcriptionSession.findMany.mockResolvedValue([MEETING]);
    dbMock.transcriptionSession.updateMany.mockResolvedValue({ count: 1 });
    summarizeMock.mockResolvedValue({ overview: "Short standup.", keywords: [] });
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.restoreAllMocks();
  });

  it("does not respond until the notification has settled", async () => {
    let settleEmit: (recipients: string[]) => void = () => undefined;
    emitMock.mockImplementation(
      () => new Promise<string[]>((resolve) => { settleEmit = resolve; }),
    );

    let responded = false;
    const pending = GET(request).then((response) => {
      responded = true;
      return response;
    });

    // Let everything up to the emit run; the handler must still be waiting on it.
    for (let i = 0; i < 5; i += 1) await flush();
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: expect.any(String), subject: { sessionId: "m1" } }),
    );
    expect(responded).toBe(false);

    settleEmit(["member1"]);
    const response = await pending;
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, summarized: 1 });
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("reports a failed notification instead of dropping it, and still summarizes", async () => {
    emitMock.mockResolvedValue(null);

    const response = await GET(request);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ success: true, summarized: 1 });
    expect(reportMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: "meetings.summary.notifyMeetingReady",
        context: { meetingId: "m1", workspaceId: "w1" },
      }),
    );
  });
});
