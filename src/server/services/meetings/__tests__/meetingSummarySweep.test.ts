/**
 * The auto-summarize sweep (ADR-0018) is the only automatic route to
 * post-summary decision extraction (ADR-0060): the cron and the on-view
 * list trigger both run it. These tests pin that the sweep asks
 * `summarizeMeetingRow` for extraction on every eligible meeting while within
 * its time budget, and never asks it to overwrite. The summarizer and the ceremony catch-up are
 * stubbed — no DB, no model calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { summarizeMeetingRowMock, attachUnlinkedMeetingsMock } = vi.hoisted(() => ({
  summarizeMeetingRowMock: vi.fn(),
  attachUnlinkedMeetingsMock: vi.fn(async () => ({ scanned: 0, attached: 0 })),
}));

vi.mock("~/server/services/meetings/ensureMeetingSummary", () => ({
  summarizeMeetingRow: summarizeMeetingRowMock,
}));
vi.mock("~/server/services/ceremonies/autoAttach", () => ({
  attachUnlinkedMeetings: attachUnlinkedMeetingsMock,
}));

import { runMeetingSummarySweep } from "../meetingSummarySweep";

const db = mockDeep<PrismaClient>();

const row = (id: string, transcription: string | null = "Dev Fixture: Morning.") => ({
  id,
  title: `Meeting ${id}`,
  transcription,
  summary: null,
  workspaceId: "w1",
  userId: "owner1",
  occurrenceId: null,
});

describe("runMeetingSummarySweep — decision extraction request", () => {
  beforeEach(() => {
    mockReset(db);
    summarizeMeetingRowMock.mockReset();
    summarizeMeetingRowMock.mockResolvedValue({ status: "created", summary: "{}", eventEmitted: true });
  });

  it("asks for decision extraction on every eligible meeting, without overwriting", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([row("m1"), row("m2")] as never);

    const result = await runMeetingSummarySweep(db);

    expect(result).toMatchObject({ candidates: 2, summarized: 2, eventsEmitted: 2, skipped: 0 });
    expect(summarizeMeetingRowMock).toHaveBeenCalledTimes(2);
    for (const call of summarizeMeetingRowMock.mock.calls) {
      const [calledDb, meeting, options] = call as [unknown, { id: string }, Record<string, unknown>];
      expect(calledDb).toBe(db);
      expect(["m1", "m2"]).toContain(meeting.id);
      expect(options).toEqual({ extractDecisions: true });
    }
  });

  it("never reaches the summarizer for rows the pure selector drops", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([row("m1"), row("blank", "   ")] as never);

    const result = await runMeetingSummarySweep(db);

    expect(result.candidates).toBe(1);
    expect(summarizeMeetingRowMock).toHaveBeenCalledTimes(1);
    expect(summarizeMeetingRowMock).toHaveBeenCalledWith(db, expect.objectContaining({ id: "m1" }), {
      extractDecisions: true,
    });
  });

  it("never requests extraction when the budget is zero, but keeps summarizing", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([row("m1"), row("m2")] as never);

    const result = await runMeetingSummarySweep(db, { extractionBudgetMs: 0 });

    expect(result.summarized).toBe(2);
    expect(summarizeMeetingRowMock).toHaveBeenCalledTimes(2);
    for (const call of summarizeMeetingRowMock.mock.calls) {
      expect(call[2]).toEqual({ extractDecisions: false });
    }
  });

  describe("mid-run budget exhaustion", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("stops requesting extraction once the budget is spent, but keeps summarizing", async () => {
      db.transcriptionSession.findMany.mockResolvedValue([row("m1"), row("m2"), row("m3")] as never);
      // Each summarize "takes" 100ms on the fake clock; the budget covers two.
      summarizeMeetingRowMock.mockImplementation(async () => {
        vi.advanceTimersByTime(100);
        return { status: "created", summary: "{}", eventEmitted: true };
      });

      const result = await runMeetingSummarySweep(db, { extractionBudgetMs: 150 });

      expect(result.summarized).toBe(3);
      expect(summarizeMeetingRowMock.mock.calls.map((call) => call[2])).toEqual([
        { extractDecisions: true },
        { extractDecisions: true },
        { extractDecisions: false },
      ]);
    });
  });

  it("stops the batch cleanly when summarization is not configured", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([row("m1"), row("m2")] as never);
    summarizeMeetingRowMock.mockResolvedValue({ status: "not-configured", eventEmitted: false });

    const result = await runMeetingSummarySweep(db);

    expect(result.notConfigured).toBe(true);
    expect(summarizeMeetingRowMock).toHaveBeenCalledTimes(1);
  });
});
