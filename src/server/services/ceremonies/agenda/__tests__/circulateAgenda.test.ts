import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const emitNotification = vi.hoisted(() => vi.fn(async () => undefined));
const recordActivity = vi.hoisted(() => vi.fn(async () => true));
const generateAgenda = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({ emitNotification }));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity }));
vi.mock("../generateAgenda", () => ({ generateAgenda }));
const postAgendaToMatrix = vi.hoisted(() => vi.fn(async () => ({ kind: "no-room" })));
vi.mock("../postAgendaToMatrix", () => ({ postAgendaToMatrix }));
// Imports the Prisma singleton at module load, which blows up under the
// unit environment's client-side env guard.
const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

import { circulateAgenda, sweepDueAgendas } from "../circulateAgenda";

const now = new Date("2026-09-10T08:00:00Z");
const occ = {
  id: "occ-1",
  workspaceId: "ws-1",
  status: "PLANNED",
  scheduledStart: new Date("2026-09-11T07:00:00Z"),
  agenda: { sections: [] },
  agendaCirculatedAt: null,
  ceremony: { id: "cer-1", name: "Daily Standup", timezone: "Europe/Berlin" },
};

describe("circulateAgenda", () => {
  beforeEach(() => {
    emitNotification.mockClear();
    recordActivity.mockClear();
  });

  it("emits agenda_ready, moves PLANNED to AGENDA_CIRCULATED and records the event", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue(occ as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    const res = await circulateAgenda(db, "occ-1", { actorUserId: null, now });

    expect(res).toEqual({ circulated: true });
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({ category: "agenda_ready", actorUserId: null, subject: { occurrenceId: "occ-1" } }),
    );
    expect(db.ceremonyOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-1" },
      data: { agendaCirculatedAt: now, status: "AGENDA_CIRCULATED" },
    });
    expect(recordActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ entityType: "ceremony_occurrence", entityId: "occ-1", action: "agenda_circulated", userId: null }),
    );
  });

  it("is a no-op without an agenda, or when already circulated unless forced", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ ...occ, agenda: null } as never);
    expect(await circulateAgenda(db, "occ-1", { actorUserId: "u-1", now })).toEqual({ circulated: false });
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ ...occ, agendaCirculatedAt: new Date(), status: "AGENDA_CIRCULATED" } as never);
    expect(await circulateAgenda(db, "occ-1", { actorUserId: "u-1", now })).toEqual({ circulated: false });
    expect(emitNotification).not.toHaveBeenCalled();

    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ ...occ, agendaCirculatedAt: new Date(), status: "AGENDA_CIRCULATED" } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    expect(await circulateAgenda(db, "occ-1", { actorUserId: "u-1", now, force: true })).toEqual({ circulated: true });
    // Already past PLANNED: the status is left alone.
    expect(db.ceremonyOccurrence.update).toHaveBeenCalledWith({ where: { id: "occ-1" }, data: { agendaCirculatedAt: now } });
  });
});

describe("circulateAgenda on a skipped occurrence", () => {
  it("never circulates, even when forced — the skip notice is the only word participants get", async () => {
    emitNotification.mockClear();
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ ...occ, status: "SKIPPED", agendaCirculatedAt: null } as never);
    expect(await circulateAgenda(db, "occ-1", { actorUserId: "u-1", now, force: true })).toEqual({ circulated: false });
    expect(emitNotification).not.toHaveBeenCalled();
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});

describe("sweepDueAgendas", () => {
  it("generates and circulates only occurrences inside their ceremony's lead time, isolating errors", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findMany.mockResolvedValue([
      { id: "due", scheduledStart: new Date("2026-09-10T20:00:00Z"), ceremony: { leadTimeHours: 24 } }, // 12h away, lead 24 → due
      { id: "not-yet", scheduledStart: new Date("2026-09-12T08:00:00Z"), ceremony: { leadTimeHours: 12 } }, // 48h away, lead 12 → wait
      { id: "boom", scheduledStart: new Date("2026-09-10T09:00:00Z"), ceremony: { leadTimeHours: 2 } },
    ] as never);
    generateAgenda.mockImplementation(async (_db: unknown, id: string) => {
      if (id === "boom") throw new Error("section failed");
      return { occurrenceId: id, agenda: { sections: [] }, itemCount: 0 };
    });
    db.ceremonyOccurrence.findUnique.mockResolvedValue(occ as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    const res = await sweepDueAgendas(db, now);

    expect(res.candidates).toBe(2);
    expect(res.generated).toBe(1);
    expect(res.circulated).toBe(1);
    expect(res.errors).toEqual([{ occurrenceId: "boom", message: "section failed" }]);
    expect(generateAgenda).not.toHaveBeenCalledWith(expect.anything(), "not-yet", expect.anything());
    const where = db.ceremonyOccurrence.findMany.mock.calls[0]![0]!.where!;
    // Selected on "not yet circulated", never on "has no agenda": an
    // occurrence stranded between the two writes must stay a candidate.
    expect(where).toMatchObject({ status: "PLANNED", agendaCirculatedAt: null, ceremony: { isActive: true } });
    expect(where).not.toHaveProperty("agenda");
  });

  it("circulates an occurrence stranded with an agenda by an earlier run, without regenerating it", async () => {
    const db = mockDeep<PrismaClient>();
    generateAgenda.mockReset();
    db.ceremonyOccurrence.findMany.mockResolvedValue([
      {
        id: "stranded",
        scheduledStart: new Date("2026-09-10T20:00:00Z"),
        // Generated by a previous sweep that died before circulating.
        agenda: { version: 1, generatedAt: "x", sections: [] },
        ceremony: { leadTimeHours: 24 },
      },
    ] as never);
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ ...occ, id: "stranded" } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    const res = await sweepDueAgendas(db, now);

    expect(generateAgenda).not.toHaveBeenCalled();
    expect(res.generated).toBe(0);
    expect(res.circulated).toBe(1);
  });

  it("treats a leadTimeHours: 0 occurrence as due at its start rather than never", async () => {
    const db = mockDeep<PrismaClient>();
    generateAgenda.mockReset();
    generateAgenda.mockImplementation(async (_db: unknown, id: string) => ({ occurrenceId: id, agenda: { sections: [] }, itemCount: 0 }));
    db.ceremonyOccurrence.findMany.mockResolvedValue([
      { id: "starting", scheduledStart: new Date("2026-09-10T07:55:00Z"), agenda: null, ceremony: { leadTimeHours: 0 } },
    ] as never);
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ ...occ, id: "starting" } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    const res = await sweepDueAgendas(db, now);

    expect(res.candidates).toBe(1);
    expect(res.generated).toBe(1);
    // The window reaches back before `now`, so a just-started occurrence is
    // still selectable; the old `scheduledStart > now` made lead time 0 a
    // configuration that could never produce an agenda.
    const range = db.ceremonyOccurrence.findMany.mock.calls[0]![0]!.where!.scheduledStart as { gt: Date };
    expect(range.gt.getTime()).toBeLessThan(now.getTime());
  });
});
