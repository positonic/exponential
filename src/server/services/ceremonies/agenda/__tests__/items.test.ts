import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { carryOverToNext, markOccurrenceCaptured, setAgendaItemResolved } from "../items";

const agenda = {
  version: 1,
  generatedAt: "x",
  sections: [
    { key: "blk", type: "blockers", title: "Blockers", items: [
      { id: "blk:action:a-1", sectionKey: "blk", title: "A", refType: "action", refId: "a-1", order: 0 },
      { id: "blk:action:a-2", sectionKey: "blk", title: "B", refType: "action", refId: "a-2", order: 1, resolvedAt: "2026-09-09T09:00:00Z" },
    ] },
  ],
};
const now = new Date("2026-09-10T08:00:00Z");

describe("setAgendaItemResolved", () => {
  it("stamps resolvedAt on the item and persists the snapshot", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    const next = await setAgendaItemResolved(db, "occ-1", "blk:action:a-1", true, now);
    expect(next.sections[0]!.items[0]!.resolvedAt).toBe(now.toISOString());
    expect(db.ceremonyOccurrence.update).toHaveBeenCalledWith({ where: { id: "occ-1" }, data: { agenda: next } });
    const reopened = await setAgendaItemResolved(db, "occ-1", "blk:action:a-2", false, now);
    expect(reopened.sections[0]!.items[1]!.resolvedAt).toBeNull();
  });

  it("refuses unknown items and agenda-less occurrences", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda } as never);
    await expect(setAgendaItemResolved(db, "occ-1", "nope", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda: null } as never);
    await expect(setAgendaItemResolved(db, "occ-1", "blk:action:a-1", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("carryOverToNext", () => {
  it("seeds unresolved items into the next occurrence's carried_over section when it already has an agenda", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda } as never);
    db.ceremonyOccurrence.findFirst.mockResolvedValue({
      id: "occ-2",
      agenda: { version: 1, generatedAt: "y", sections: [{ key: "carry", type: "carried_over", title: "Carried over", items: [], emptyReason: "Nothing to raise" }] },
    } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    expect(await carryOverToNext(db, "occ-1")).toBe(1);
    const data = db.ceremonyOccurrence.update.mock.calls[0]![0].data as { agenda: { sections: Array<{ items: Array<Record<string, unknown>>; emptyReason: unknown }> } };
    expect(data.agenda.sections[0]!.items).toEqual([
      expect.objectContaining({ id: "carry:carried:action:a-1", sectionKey: "carry", carriedFromOccurrenceId: "occ-1", resolvedAt: null }),
    ]);
    expect(data.agenda.sections[0]!.emptyReason).toBeNull();
    // Idempotent: seeding again adds nothing.
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-2", agenda: data.agenda } as never);
    expect(await carryOverToNext(db, "occ-1")).toBe(0);
  });

  it("does nothing when the next occurrence has no agenda yet (the section derives it at generation)", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda } as never);
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-2", agenda: null } as never);
    expect(await carryOverToNext(db, "occ-1")).toBe(0);
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});

describe("markOccurrenceCaptured", () => {
  it("moves only pre-meeting states to CAPTURED and then carries over; never throws", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda: null } as never);
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(true);
    expect(db.ceremonyOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: "occ-1", status: { in: ["PLANNED", "AGENDA_CIRCULATED", "IN_PROGRESS"] } },
      data: { status: "CAPTURED" },
    });
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 0 });
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(false);
    db.ceremonyOccurrence.updateMany.mockRejectedValue(new Error("db down"));
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(false);
  });
});
