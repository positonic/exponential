import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const report = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: report }));

import { attachMeetingToOccurrence, attachUnlinkedMeetings } from "../autoAttach";

const occurrenceRow = {
  id: "occ-1",
  workspaceId: "ws-1",
  scheduledStart: new Date("2026-09-08T07:00:00.000Z"),
  ceremony: { aliases: ["Daily Standup"], durationMinutes: 15 },
  scheduledMeeting: null,
};

describe("attachMeetingToOccurrence", () => {
  beforeEach(() => report.mockReset());

  it("loads candidates from the meeting's workspace and persists the match", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([occurrenceRow] as never);
    db.transcriptionSession.update.mockResolvedValue({} as never);

    const outcome = await attachMeetingToOccurrence(db, {
      id: "m-1",
      title: "Daily Standup",
      meetingDate: new Date("2026-09-08T07:01:00.000Z"),
      workspaceId: "ws-1",
      userId: "u-1",
    });

    expect(outcome.match).toEqual({ occurrenceId: "occ-1", reason: "alias", alias: "Daily Standup" });
    expect(outcome.workspaceAssigned).toBeUndefined();
    const where = db.ceremonyOccurrence.findMany.mock.calls[0]![0]!.where!;
    expect(where.workspaceId).toBe("ws-1");
    expect(where.ceremony).toEqual({ isActive: true });
    expect(db.transcriptionSession.update).toHaveBeenCalledWith({
      where: { id: "m-1" },
      data: { occurrenceId: "occ-1" },
    });
  });

  it("falls back to the user's workspaces for a workspace-less import and assigns the workspace", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([occurrenceRow] as never);
    db.transcriptionSession.update.mockResolvedValue({} as never);

    const outcome = await attachMeetingToOccurrence(db, {
      id: "m-2",
      title: "Daily Standup",
      meetingDate: new Date("2026-09-08T07:00:00.000Z"),
      workspaceId: null,
      userId: "u-1",
    });

    expect(outcome.workspaceAssigned).toBe("ws-1");
    const where = db.ceremonyOccurrence.findMany.mock.calls[0]![0]!.where!;
    expect(where.workspace).toEqual({ members: { some: { userId: "u-1" } } });
    expect(db.transcriptionSession.update).toHaveBeenCalledWith({
      where: { id: "m-2" },
      data: { occurrenceId: "occ-1", workspaceId: "ws-1" },
    });
  });

  it("does nothing for an undated, untitled device session and never queries", async () => {
    const db = mockDeep<PrismaClient>();
    const outcome = await attachMeetingToOccurrence(db, { id: "m-3", title: null, meetingDate: null, workspaceId: "ws-1", userId: "u-1" });
    expect(outcome.match).toBeNull();
    expect(db.ceremonyOccurrence.findMany).not.toHaveBeenCalled();
    expect(db.transcriptionSession.update).not.toHaveBeenCalled();
  });

  it("dry run computes without writing", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([occurrenceRow] as never);
    const outcome = await attachMeetingToOccurrence(
      db,
      { id: "m-1", title: "Standup", meetingDate: new Date("2026-09-08T07:00:00.000Z"), workspaceId: "ws-1", userId: "u-1" },
      { dryRun: true },
    );
    expect(outcome.match).toBeNull(); // "Standup" alone is not an alias here
    expect(db.transcriptionSession.update).not.toHaveBeenCalled();
  });

  it("reports and swallows errors so ingestion continues", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockRejectedValue(new Error("db down"));
    const outcome = await attachMeetingToOccurrence(db, {
      id: "m-1",
      title: "Daily Standup",
      meetingDate: new Date(),
      workspaceId: "ws-1",
      userId: "u-1",
    });
    expect(outcome.match).toBeNull();
    expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ area: "ceremonies.autoAttach" }));
  });
});

describe("attachUnlinkedMeetings", () => {
  it("scans recent unattached, dated, titled, workspace-scoped rows and counts attachments", async () => {
    const db = mockDeep<PrismaClient>();
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "m-1", title: "Daily Standup", meetingDate: new Date("2026-09-08T07:00:00.000Z"), workspaceId: "ws-1", userId: "u-1" },
      { id: "m-2", title: "Coffee", meetingDate: new Date("2026-09-08T10:00:00.000Z"), workspaceId: "ws-1", userId: "u-1" },
    ] as never);
    db.ceremonyOccurrence.findMany.mockResolvedValue([occurrenceRow] as never);
    db.transcriptionSession.update.mockResolvedValue({} as never);

    const result = await attachUnlinkedMeetings(db, { now: new Date("2026-09-09T12:00:00.000Z"), lookbackDays: 7 });

    expect(result).toEqual({ scanned: 2, attached: 1 });
    const where = db.transcriptionSession.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ occurrenceId: null, archivedAt: null, workspaceId: { not: null }, title: { not: null } });
    expect((where.meetingDate as { gte: Date }).gte.toISOString()).toBe("2026-09-02T12:00:00.000Z");
  });
});
