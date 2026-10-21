import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Ceremony, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const recordActivity = vi.hoisted(() => vi.fn(async () => true));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity }));
import { addOccurrence, isCadenceTick, rescheduleOccurrence } from "../schedule";

/** Weekday standup, 09:00 Berlin: 07:00Z in September. */
function ceremony(overrides: Partial<Ceremony> = {}): Ceremony {
  return {
    id: "cer-1",
    workspaceId: "ws-1",
    productId: null,
    teamId: null,
    name: "Daily Standup",
    slug: "daily-standup",
    aliases: ["Standup"],
    kind: "STANDUP",
    icon: null,
    purpose: null,
    notFor: null,
    inputs: null,
    outputs: null,
    cadenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
    timezone: "Europe/Berlin",
    startsOn: new Date("2026-09-01T00:00:00.000Z"),
    durationMinutes: 15,
    leadTimeHours: 24,
    ownerId: "u-1",
    agendaTemplate: [],
    includeProjects: true,
    matrixRoomId: null,
    autoExtractOutputs: false,
    isActive: true,
    isOneOff: false,
    createdById: "u-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const TICK = new Date("2026-09-09T07:00:00.000Z"); // Wed 09:00 Berlin
const OFF_TICK = new Date("2026-09-09T13:30:00.000Z"); // Wed 15:30 Berlin

beforeEach(() => recordActivity.mockClear());

describe("isCadenceTick", () => {
  it("is true exactly on a tick and false a minute off it", () => {
    expect(isCadenceTick(ceremony(), TICK)).toBe(true);
    expect(isCadenceTick(ceremony(), new Date(TICK.getTime() + 60_000))).toBe(false);
    expect(isCadenceTick(ceremony(), OFF_TICK)).toBe(false);
  });
  it("is false for a one-off or a ceremony without a rule", () => {
    expect(isCadenceTick(ceremony({ isOneOff: true }), TICK)).toBe(false);
    expect(isCadenceTick(ceremony({ cadenceRule: null }), TICK)).toBe(false);
  });
});

describe("addOccurrence", () => {
  it("writes an ad hoc occurrence (null cadenceStart) off the cadence, with the ceremony's duration", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null);
    db.ceremonyOccurrence.create.mockResolvedValue({ id: "occ-new", scheduledStart: OFF_TICK } as never);

    await addOccurrence(db, { ceremony: ceremony(), scheduledStart: OFF_TICK, actorUserId: "u-1" });

    const data = db.ceremonyOccurrence.create.mock.calls[0]![0].data;
    expect(data.cadenceStart).toBeNull();
    expect(data.scheduledStart).toEqual(OFF_TICK);
    expect(data.scheduledEnd).toEqual(new Date(OFF_TICK.getTime() + 15 * 60_000));
    expect(data.workspaceId).toBe("ws-1");
    expect(recordActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: "created", entityId: "occ-new", metadata: expect.objectContaining({ adHoc: true, count: 1 }) }),
    );
  });

  it("becomes the tick's own occurrence when the time is on the cadence", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null);
    db.ceremonyOccurrence.create.mockResolvedValue({ id: "occ-new", scheduledStart: TICK } as never);

    await addOccurrence(db, { ceremony: ceremony(), scheduledStart: TICK, actorUserId: "u-1" });

    const data = db.ceremonyOccurrence.create.mock.calls[0]![0].data;
    expect(data.cadenceStart).toEqual(TICK);
    expect(recordActivity).toHaveBeenCalledWith(db, expect.objectContaining({ metadata: expect.objectContaining({ adHoc: false }) }));
  });

  it("refuses a time another occurrence already holds, by start or by tick", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-existing" } as never);

    await expect(addOccurrence(db, { ceremony: ceremony(), scheduledStart: TICK, actorUserId: "u-1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // An add has no row of its own to exclude.
    expect(db.ceremonyOccurrence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ceremonyId: "cer-1", OR: [{ scheduledStart: TICK }, { cadenceStart: TICK }] } }),
    );
    expect(db.ceremonyOccurrence.create).not.toHaveBeenCalled();
  });

  it("refuses a one-off", async () => {
    const db = mockDeep<PrismaClient>();
    await expect(
      addOccurrence(db, { ceremony: ceremony({ isOneOff: true, cadenceRule: null }), scheduledStart: OFF_TICK, actorUserId: "u-1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.ceremonyOccurrence.create).not.toHaveBeenCalled();
  });
});

describe("rescheduleOccurrence", () => {
  const planned = {
    id: "occ-1",
    status: "PLANNED",
    scheduledStart: TICK,
    scheduledEnd: new Date(TICK.getTime() + 15 * 60_000),
    scheduledMeetingId: null,
    ceremony: { id: "cer-1", name: "Daily Standup", timezone: "Europe/Berlin", isOneOff: false },
  };

  it("moves the start, keeps the duration and leaves cadenceStart alone", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(planned as never).mockResolvedValueOnce(null);
    db.ceremonyOccurrence.update.mockResolvedValue({ id: "occ-1", scheduledStart: OFF_TICK } as never);

    const res = await rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-1", scheduledStart: OFF_TICK, actorUserId: "u-1" });

    const data = db.ceremonyOccurrence.update.mock.calls[0]![0].data;
    expect(data).toEqual({ scheduledStart: OFF_TICK, scheduledEnd: new Date(OFF_TICK.getTime() + 15 * 60_000) });
    expect(res.movedFrom).toEqual(TICK);
    expect(recordActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: "updated", metadata: expect.objectContaining({ moved: true, movedFrom: TICK.toISOString() }) }),
    );
  });

  it("can be moved back onto its own tick — the clash check excludes the row itself", async () => {
    const db = mockDeep<PrismaClient>();
    const movedAway = { ...planned, scheduledStart: OFF_TICK, scheduledEnd: new Date(OFF_TICK.getTime() + 15 * 60_000) };
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(movedAway as never).mockResolvedValueOnce(null);
    db.ceremonyOccurrence.update.mockResolvedValue({ id: "occ-1", scheduledStart: TICK } as never);

    await rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-1", scheduledStart: TICK, actorUserId: "u-1" });

    expect(db.ceremonyOccurrence.findFirst.mock.calls[1]![0]!.where).toEqual({
      ceremonyId: "cer-1",
      OR: [{ scheduledStart: TICK }, { cadenceStart: TICK }],
      id: { not: "occ-1" },
    });
    expect(db.ceremonyOccurrence.update).toHaveBeenCalled();
  });

  it("is a no-op at the same time", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(planned as never);
    const res = await rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-1", scheduledStart: TICK, actorUserId: "u-1" });
    expect(res.movedFrom).toBeNull();
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });

  it("refuses a time another occurrence already holds", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(planned as never).mockResolvedValueOnce({ id: "occ-2" } as never);
    await expect(
      rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-1", scheduledStart: OFF_TICK, actorUserId: "u-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });

  it.each([
    ["captured", { ...planned, status: "CAPTURED" }],
    ["skipped", { ...planned, status: "SKIPPED" }],
    ["booked in calendars", { ...planned, scheduledMeetingId: "meeting-1" }],
    ["a one-off", { ...planned, ceremony: { ...planned.ceremony, isOneOff: true } }],
  ])("refuses an occurrence that is %s", async (_label, row) => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(row as never);
    await expect(
      rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-1", scheduledStart: OFF_TICK, actorUserId: "u-1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });

  it("404s outside the workspace", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValueOnce(null);
    await expect(
      rescheduleOccurrence(db, { occurrenceId: "occ-1", workspaceId: "ws-other", scheduledStart: OFF_TICK, actorUserId: "u-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
