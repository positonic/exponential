/**
 * A paused (On hold, Completed, Cancelled) project's actions are off the
 * person's plate, so the auto-scheduler must not spend their time on it: it
 * doesn't reschedule them, doesn't let their old slots block new work, and
 * doesn't report them at risk. Project-less actions are never paused.
 *
 * Prisma never runs here: each `findMany` evaluates the service's real
 * `where` against in-memory rows with `matchesWhere`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { AutoSchedulingService } from "~/server/services/AutoSchedulingService";
import { matchesWhere } from "~/test/prismaWhere";

type Row = Record<string, unknown>;

const db = mockDeep<PrismaClient>();

const serveFrom = (rows: Row[]) =>
  ((args: { where?: Record<string, unknown> }) =>
    Promise.resolve(rows.filter((r) => matchesWhere(r, args.where ?? {})))) as never;

const project = (status: string) => ({ status });

/** An ACTIVE, auto-scheduled action of mine (created by me, nobody assigned). */
function action(id: string, projectStatus: string | null, overrides: Row = {}): Row {
  return {
    id,
    name: id,
    createdById: "u1",
    assignees: [],
    status: "ACTIVE",
    workspaceId: "w1",
    isAutoScheduled: true,
    isReminderOnly: false,
    parentChunkId: null,
    priority: "Quick",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    duration: 60,
    etaStatus: null,
    projectId: projectStatus ? `p-${id}` : null,
    project: projectStatus ? project(projectStatus) : null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoSchedulingService — paused projects", () => {
  it("rescheduleAll leaves a paused project's actions alone: no new slot, old slot not cleared", async () => {
    const rows = [
      action("active", "ACTIVE"),
      action("loose", null),
      action("on-hold", "ON_HOLD"),
      action("completed", "COMPLETED"),
      action("cancelled", "CANCELLED"),
    ];
    db.action.findMany.mockImplementation(serveFrom(rows));
    db.action.updateMany.mockResolvedValue({ count: 0 });
    db.action.deleteMany.mockResolvedValue({ count: 0 });

    const service = new AutoSchedulingService(db);
    const scheduleTask = vi.spyOn(service, "scheduleTask").mockResolvedValue(null);

    await service.rescheduleAll("u1");

    const scheduled = scheduleTask.mock.calls.map(([id]) => id).sort();
    expect(scheduled).toEqual(["active", "loose"]);
    // Only the actions being rescheduled have their slot cleared.
    const cleared = (db.action.updateMany.mock.calls[0]![0]!.where!.id as { in: string[] }).in;
    expect([...cleared].sort()).toEqual(["active", "loose"]);
  });

  it("a paused project's old slot does not block new work", async () => {
    // Monday 16 Nov 2026, 07:00 local; the working day is 09:00–17:00.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 16, 7));
    const at = (h: number) => new Date(2026, 10, 16, h);

    db.action.findMany.mockImplementation(
      serveFrom([
        // Holds 09:00–12:00 but its project is On hold.
        action("on-hold", "ON_HOLD", { scheduledStart: at(9), scheduledEnd: at(12) }),
        // Holds 13:00–17:00 and is live work.
        action("active", "ACTIVE", { scheduledStart: at(13), scheduledEnd: at(17) }),
      ]),
    );

    const service = new AutoSchedulingService(db);
    const slots = await service.findAvailableSlots(
      "u1",
      60,
      at(17), // hard deadline today, so only today is scanned
      { startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2, 3, 4, 5] },
      null,
      true,
    );

    const starts = slots.map((s) => s.start.getHours() * 60 + s.start.getMinutes()).sort((a, b) => a - b);
    // The On hold project's 09:00–12:00 is free again…
    expect(starts).toContain(9 * 60);
    expect(starts).toContain(11 * 60);
    // …and the live action's 13:00–17:00 is still busy.
    expect(starts.every((m) => m + 60 <= 13 * 60)).toBe(true);
  });

  it("checkDeadlineConflicts does not report a paused project's actions at risk", async () => {
    const due = new Date(2026, 10, 20);
    const atRisk = { dueDate: due, etaStatus: "at_risk" };
    db.action.findMany.mockImplementation(
      serveFrom([
        action("active", "ACTIVE", atRisk),
        action("loose", null, atRisk),
        action("on-hold", "ON_HOLD", atRisk),
        action("cancelled", "CANCELLED", { dueDate: due, etaStatus: "overdue" }),
      ]),
    );

    const conflicts = await new AutoSchedulingService(db).checkDeadlineConflicts("u1");

    expect(conflicts.map((c) => c.actionId).sort()).toEqual(["active", "loose"]);
  });
});
