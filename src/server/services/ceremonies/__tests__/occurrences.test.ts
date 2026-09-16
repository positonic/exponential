import { describe, expect, it, vi } from "vitest";
import type { Ceremony, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const recordActivity = vi.hoisted(() => vi.fn(async () => true));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity }));
import { ensureOccurrences, expandActiveCeremonies, snapshotCeremony } from "../occurrences";

function ceremony(overrides: Partial<Ceremony> = {}): Ceremony {
  return {
    id: "cer-1",
    workspaceId: "ws-1",
    productId: null,
    teamId: null,
    projectId: null,
    name: "Daily Standup",
    slug: "daily-standup",
    aliases: ["Standup"],
    kind: "STANDUP",
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
    agendaTemplate: [{ key: "blockers", type: "blockers", title: "Blockers" }],
    matrixRoomId: null,
    isActive: true,
    createdById: "u-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("ensureOccurrences", () => {
  it("expands from the anchor date through 14 days ahead, idempotently, with the definition snapshot", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-09-09T12:00:00.000Z"); // Wednesday

    const created = await ensureOccurrences(db, ceremony(), { now });

    expect(created).toBe(3);
    const args = db.ceremonyOccurrence.createMany.mock.calls[0]![0];
    expect(args.skipDuplicates).toBe(true);
    const rows = args.data as Array<{ scheduledStart: Date; workspaceId: string; definitionSnapshot: { slug: string } }>;
    // 1 Sep (Tue) .. 23 Sep (Wed): 17 weekday ticks, none before startsOn.
    expect(rows).toHaveLength(17);
    expect(rows[0]!.scheduledStart.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(rows.at(-1)!.scheduledStart.toISOString()).toBe("2026-09-23T07:00:00.000Z");
    expect(rows[0]!.workspaceId).toBe("ws-1");
    expect(rows[0]!.definitionSnapshot.slug).toBe("daily-standup");
  });

  it("falls back to the single next tick when the window has none", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 1 });
    const monthly = ceremony({
      cadenceRule: "FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=15;BYMINUTE=0",
      startsOn: new Date("2026-10-01T00:00:00.000Z"),
    });
    await ensureOccurrences(db, monthly, { now: new Date("2026-09-09T12:00:00.000Z") });
    const rows = db.ceremonyOccurrence.createMany.mock.calls[0]![0].data as Array<{ scheduledStart: Date }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scheduledStart.toISOString()).toBe("2026-10-30T14:00:00.000Z");
  });

  it("writes nothing when a COUNT-limited rule is exhausted", async () => {
    const db = mockDeep<PrismaClient>();
    const done = ceremony({ cadenceRule: "FREQ=DAILY;COUNT=1;BYHOUR=9;BYMINUTE=0" });
    const created = await ensureOccurrences(db, done, {
      now: new Date("2026-09-09T12:00:00.000Z"),
      windowStart: new Date("2026-09-05T00:00:00.000Z"),
    });
    expect(created).toBe(0);
    expect(db.ceremonyOccurrence.createMany).not.toHaveBeenCalled();
  });
});

describe("expandActiveCeremonies", () => {
  it("sweeps active ceremonies and isolates a bad rule as an error", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([
      ceremony(),
      ceremony({ id: "cer-bad", cadenceRule: "FREQ=SOMETIMES" }),
    ]);
    db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 2 });

    const result = await expandActiveCeremonies(db, new Date("2026-09-09T12:00:00.000Z"));

    expect(db.ceremony.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
    expect(result.ceremonies).toBe(2);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.ceremonyId).toBe("cer-bad");
  });

  it("emits one system-actor `created` event per ceremony that gained rows", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremony.findMany.mockResolvedValue([ceremony()]);
    db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 3 });
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-next", scheduledStart: new Date("2026-09-10T07:00:00Z") } as never);
    recordActivity.mockClear();

    await expandActiveCeremonies(db, new Date("2026-09-09T12:00:00.000Z"));

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: null, entityType: "ceremony_occurrence", entityId: "occ-next", action: "created" }),
    );
  });
});

describe("snapshotCeremony", () => {
  it("captures the definition fields and a timestamp", () => {
    vi.useFakeTimers({ now: new Date("2026-09-09T12:00:00.000Z") });
    try {
      const snap = snapshotCeremony(ceremony());
      expect(snap).toMatchObject({ name: "Daily Standup", slug: "daily-standup", kind: "STANDUP", timezone: "Europe/Berlin" });
      expect(snap.snapshotAt).toBe("2026-09-09T12:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
