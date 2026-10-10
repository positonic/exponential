/**
 * The ceremony auto-extract sweep: picks up only unstamped, quiet recordings
 * of opted-in ceremonies, runs the same extraction as the meeting page's
 * button with the owner as actor, and stamps only the failures a retry
 * cannot fix. The extractor is stubbed — no model calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { extractMock, reportMock } = vi.hoisted(() => ({
  extractMock: vi.fn(),
  reportMock: vi.fn(),
}));
vi.mock("~/server/services/TranscriptionProcessingService", () => ({
  TranscriptionProcessingService: { extractMeetingOutputs: extractMock },
}));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: reportMock }));

import {
  AUTO_EXTRACT_LOOKBACK_MS,
  AUTO_EXTRACT_QUIET_PERIOD_MS,
  isTerminalExtractionFailure,
  runAutoExtractOutputsSweep,
} from "../autoExtractOutputs";

const db = mockDeep<PrismaClient>();
const NOW = new Date("2026-10-09T10:00:00.000Z");

const ok = (overrides: Partial<{ actions: boolean; decisions: boolean; errors: string[] }> = {}) => ({
  extracted: (overrides.actions ?? true) && (overrides.decisions ?? true),
  actions: { success: overrides.actions ?? true, errors: overrides.errors ?? [] },
  decisions: { success: overrides.decisions ?? true, errors: overrides.errors ?? [] },
});

describe("isTerminalExtractionFailure", () => {
  it("is true only when every error is one a retry cannot fix", () => {
    expect(isTerminalExtractionFailure(["User does not have access to this transcription"])).toBe(true);
    expect(isTerminalExtractionFailure(["You do not have edit access to this meeting"])).toBe(true);
    expect(isTerminalExtractionFailure(["This meeting is not in a workspace, so it has no decision sequence"])).toBe(true);
    expect(isTerminalExtractionFailure(["Meeting not found"])).toBe(true);
    expect(isTerminalExtractionFailure(["Rate limit exceeded"])).toBe(false);
    expect(isTerminalExtractionFailure(["You do not have edit access to this meeting", "Rate limit exceeded"])).toBe(false);
    expect(isTerminalExtractionFailure([])).toBe(false);
  });

  it("does not mistake a provider message that merely contains the words for a terminal failure", () => {
    expect(isTerminalExtractionFailure(["Could not access the transcription service"])).toBe(false);
    expect(isTerminalExtractionFailure(["Model not found (temporarily unavailable)"])).toBe(false);
    expect(isTerminalExtractionFailure(["Database access error"])).toBe(false);
  });
});

describe("runAutoExtractOutputsSweep", () => {
  beforeEach(() => {
    mockReset(db);
    extractMock.mockReset();
    reportMock.mockReset();
    db.transcriptionSession.update.mockResolvedValue({} as never);
  });

  it("selects quiet, recent, unstamped recordings of opted-in ceremonies, oldest first and bounded", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([] as never);
    const result = await runAutoExtractOutputsSweep(db, { now: NOW, limit: 2 });

    expect(result).toEqual({ candidates: 0, extracted: 0, givenUp: 0, failed: 0 });
    const args = db.transcriptionSession.findMany.mock.calls[0]![0]!;
    expect(args.where).toMatchObject({
      outputsExtractedAt: null,
      archivedAt: null,
      userId: { not: null },
      occurrence: { ceremony: { autoExtractOutputs: true, isActive: true } },
    });
    expect(args.where!.updatedAt).toEqual({ lte: new Date(NOW.getTime() - AUTO_EXTRACT_QUIET_PERIOD_MS) });
    expect(args.where!.createdAt).toEqual({ gte: new Date(NOW.getTime() - AUTO_EXTRACT_LOOKBACK_MS) });
    expect(args.orderBy).toEqual({ updatedAt: "asc" });
    expect(args.take).toBe(2);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("runs the meeting page's extraction for each row with the owner as actor", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "m-1", title: "Standup", userId: "owner-1" },
      { id: "m-2", title: "Planning", userId: "owner-2" },
    ] as never);
    extractMock.mockResolvedValue(ok());

    const result = await runAutoExtractOutputsSweep(db, { now: NOW });

    expect(result).toEqual({ candidates: 2, extracted: 2, givenUp: 0, failed: 0 });
    expect(extractMock).toHaveBeenNthCalledWith(1, "m-1", "owner-1", { trigger: "auto_extract" });
    expect(extractMock).toHaveBeenNthCalledWith(2, "m-2", "owner-2", { trigger: "auto_extract" });
    // The stamp is the service's job on success; the sweep writes nothing.
    expect(db.transcriptionSession.update).not.toHaveBeenCalled();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("stamps a terminal failure so it stops taking a slot, and reports it", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([{ id: "m-1", title: "Standup", userId: "owner-1" }] as never);
    extractMock.mockResolvedValue(
      ok({ actions: false, decisions: false, errors: ["User does not have access to this transcription"] }),
    );

    const result = await runAutoExtractOutputsSweep(db, { now: NOW });

    expect(result).toEqual({ candidates: 1, extracted: 0, givenUp: 1, failed: 0 });
    expect(db.transcriptionSession.update).toHaveBeenCalledWith({
      where: { id: "m-1" },
      data: { outputsExtractedAt: NOW },
    });
    expect(reportMock).toHaveBeenCalledTimes(1);
  });

  it("leaves a transient failure unstamped, sends it to the back of the queue, and keeps going", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "m-1", title: "Standup", userId: "owner-1" },
      { id: "m-2", title: "Planning", userId: "owner-2" },
    ] as never);
    extractMock
      .mockResolvedValueOnce(ok({ actions: false, decisions: false, errors: ["Rate limit exceeded"] }))
      .mockResolvedValueOnce(ok());

    const result = await runAutoExtractOutputsSweep(db, { now: NOW });

    expect(result).toEqual({ candidates: 2, extracted: 1, givenUp: 0, failed: 1 });
    // No stamp; only the bump that re-arms the quiet period and moves it behind the rest.
    expect(db.transcriptionSession.update).toHaveBeenCalledTimes(1);
    expect(db.transcriptionSession.update).toHaveBeenCalledWith({ where: { id: "m-1" }, data: { updatedAt: NOW } });
    expect(extractMock).toHaveBeenCalledTimes(2);
  });

  it("retries a half-failed run: no stamp from the sweep, the row is deferred", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([{ id: "m-1", title: "Standup", userId: "owner-1" }] as never);
    extractMock.mockResolvedValue(ok({ actions: false, errors: ["Rate limit exceeded"] }));

    const result = await runAutoExtractOutputsSweep(db, { now: NOW });

    expect(result).toEqual({ candidates: 1, extracted: 0, givenUp: 0, failed: 1 });
    expect(db.transcriptionSession.update).toHaveBeenCalledWith({ where: { id: "m-1" }, data: { updatedAt: NOW } });
  });

  it("counts a thrown extraction as failed without sinking the batch", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "m-1", title: "Standup", userId: "owner-1" },
      { id: "m-2", title: "Planning", userId: "owner-2" },
    ] as never);
    extractMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok());

    const result = await runAutoExtractOutputsSweep(db, { now: NOW });

    expect(result).toEqual({ candidates: 2, extracted: 1, givenUp: 0, failed: 1 });
    expect(reportMock).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: { meetingId: "m-1" } }));
  });
});
