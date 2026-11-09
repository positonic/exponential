import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import {
  applyCadenceChange,
  CADENCE_CHANGE_SKIP_REASON,
  cadenceChanged,
  holdsHumanInput,
  planCadenceChange,
  type CadenceCandidate,
} from "../cadenceChange";

/** Weekly Monday 09:00 Berlin: 08:00Z in November (CET). */
const before = {
  cadenceRule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
  timezone: "Europe/Berlin",
  startsOn: new Date("2026-09-01T00:00:00.000Z"),
  durationMinutes: 15,
};
const MON_16 = new Date("2026-11-16T08:00:00.000Z");
const MON_23 = new Date("2026-11-23T08:00:00.000Z");
const MON_30 = new Date("2026-11-30T08:00:00.000Z");
const NOW = new Date("2026-11-09T12:00:00.000Z");

function row(id: string, start: Date, overrides: Partial<CadenceCandidate> = {}): CadenceCandidate {
  return {
    id,
    scheduledStart: start,
    scheduledEnd: new Date(start.getTime() + 15 * 60_000),
    cadenceStart: start,
    agenda: null,
    agendaCirculatedAt: null,
    notesPageId: null,
    _count: { updates: 0, decisions: 0, actions: 0 },
    ...overrides,
  };
}

describe("cadenceChanged", () => {
  it("is false when nothing that places occurrences moved, true for each field that does", () => {
    expect(cadenceChanged(before, { ...before, startsOn: new Date(before.startsOn) })).toBe(false);
    expect(cadenceChanged(before, { ...before, cadenceRule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0" })).toBe(true);
    expect(cadenceChanged(before, { ...before, timezone: "Europe/London" })).toBe(true);
    expect(cadenceChanged(before, { ...before, startsOn: new Date("2026-10-01T00:00:00.000Z") })).toBe(true);
    expect(cadenceChanged(before, { ...before, durationMinutes: 30 })).toBe(true);
  });
});

describe("holdsHumanInput", () => {
  it("is false for an untouched row and true for each kind of input", () => {
    expect(holdsHumanInput(row("a", MON_16))).toBe(false);
    expect(holdsHumanInput(row("a", MON_16, { agenda: { version: 2, sections: [] } }))).toBe(true);
    expect(holdsHumanInput(row("a", MON_16, { agendaCirculatedAt: NOW }))).toBe(true);
    expect(holdsHumanInput(row("a", MON_16, { notesPageId: "page-1" }))).toBe(true);
    expect(holdsHumanInput(row("a", MON_16, { _count: { updates: 1, decisions: 0, actions: 0 } }))).toBe(true);
    expect(holdsHumanInput(row("a", MON_16, { _count: { updates: 0, decisions: 1, actions: 0 } }))).toBe(true);
    expect(holdsHumanInput(row("a", MON_16, { _count: { updates: 0, decisions: 0, actions: 1 } }))).toBe(true);
  });
});

describe("planCadenceChange", () => {
  it("keeps every row on a duration-only change and re-times it", () => {
    const plan = planCadenceChange(
      { ...before, durationMinutes: 45, isOneOff: false },
      [row("occ-16", MON_16, { notesPageId: "page-1" }), row("occ-23", MON_23), row("occ-30", MON_30)],
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.skipIds).toEqual([]);
    expect(plan.retime).toEqual([
      { id: "occ-16", scheduledEnd: new Date(MON_16.getTime() + 45 * 60_000) },
      { id: "occ-23", scheduledEnd: new Date(MON_23.getTime() + 45 * 60_000) },
      { id: "occ-30", scheduledEnd: new Date(MON_30.getTime() + 45 * 60_000) },
    ]);
  });

  it("deletes empty rows the new rule drops, skips the ones holding input, and leaves moved rows alone", () => {
    const plan = planCadenceChange(
      { ...before, cadenceRule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0", isOneOff: false },
      [
        row("occ-empty", MON_16),
        row("occ-notes", MON_23, { notesPageId: "page-1" }),
        row("occ-decided", MON_30, { _count: { updates: 0, decisions: 2, actions: 0 } }),
        // Moved to Tuesday 11:00 from its Monday tick: a deliberate act.
        row("occ-moved", new Date("2026-11-17T10:00:00.000Z"), { cadenceStart: MON_16 }),
      ],
    );
    expect(plan.deleteIds).toEqual(["occ-empty"]);
    expect(plan.skipIds).toEqual(["occ-notes", "occ-decided"]);
    expect(plan.retime).toEqual([]);
  });

  it("keeps rows whose tick the new rule still produces, under their existing id", () => {
    // Monday becomes Monday + Wednesday: the Monday rows are still on it.
    const plan = planCadenceChange(
      { ...before, cadenceRule: "FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0", isOneOff: false },
      [row("occ-16", MON_16), row("occ-23", MON_23)],
    );
    expect(plan).toEqual({ retime: [], deleteIds: [], skipIds: [] });
  });

  it("treats a later anchor date as dropping the ticks before it", () => {
    const plan = planCadenceChange(
      { ...before, startsOn: new Date("2026-11-20T00:00:00.000Z"), isOneOff: false },
      [row("occ-16", MON_16), row("occ-23", MON_23)],
    );
    expect(plan.deleteIds).toEqual(["occ-16"]);
    expect(plan.retime).toEqual([]);
  });
});

describe("applyCadenceChange", () => {
  const after = { ...before, id: "cer-1", isOneOff: false, cadenceRule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0" };

  it("does nothing when no cadence field changed", async () => {
    const db = mockDeep<PrismaClient>();
    const res = await applyCadenceChange(db, before, { ...before, id: "cer-1", isOneOff: false }, NOW);
    expect(res).toEqual({ occurrencesDeleted: 0, occurrencesSkipped: 0, skippedOccurrenceIds: [] });
    expect(db.ceremonyOccurrence.findMany).not.toHaveBeenCalled();
  });

  it("skips rows with input, deletes only rows still empty at delete time, and reports both counts", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([
      row("occ-empty", MON_16),
      row("occ-updates", MON_23, { _count: { updates: 3, decisions: 0, actions: 0 } }),
    ] as never);
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    db.ceremonyOccurrence.deleteMany.mockResolvedValue({ count: 1 });

    const res = await applyCadenceChange(db, before, after, NOW);

    expect(res).toEqual({ occurrencesDeleted: 1, occurrencesSkipped: 1, skippedOccurrenceIds: ["occ-updates"] });
    const where = db.ceremonyOccurrence.findMany.mock.calls[0]![0]!.where;
    expect(where).toMatchObject({
      ceremonyId: "cer-1",
      status: "PLANNED",
      scheduledStart: { gt: NOW },
      scheduledMeetingId: null,
      recordedMeetings: { none: {} },
      cadenceStart: { not: null },
    });
    expect(db.ceremonyOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["occ-updates"] } },
      data: { status: "SKIPPED", skipReason: CADENCE_CHANGE_SKIP_REASON },
    });
    expect(db.ceremonyOccurrence.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["occ-empty"] },
        agenda: { equals: Prisma.AnyNull },
        agendaCirculatedAt: null,
        notesPageId: null,
        updates: { none: {} },
        decisions: { none: {} },
        actions: { none: {} },
      },
    });
  });

  it("re-times kept rows on a duration change without deleting or skipping anything", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([row("occ-16", MON_16, { notesPageId: "page-1" })] as never);

    const res = await applyCadenceChange(db, before, { ...before, id: "cer-1", isOneOff: false, durationMinutes: 30 }, NOW);

    expect(res).toEqual({ occurrencesDeleted: 0, occurrencesSkipped: 0, skippedOccurrenceIds: [] });
    expect(db.ceremonyOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-16" },
      data: { scheduledEnd: new Date(MON_16.getTime() + 30 * 60_000) },
    });
    expect(db.ceremonyOccurrence.deleteMany).not.toHaveBeenCalled();
    expect(db.ceremonyOccurrence.updateMany).not.toHaveBeenCalled();
  });
});
