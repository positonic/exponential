import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { generateDueDateReminders } from "~/server/services/notifications/emit/dueDateReminders";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { matchesWhere } from "~/test/prismaWhere";

vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

const db = mockDeep<PrismaClient>();
const NOW = new Date("2026-07-22T12:00:00.000Z");
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "Ship the thing",
    dueDate: inMinutes(60),
    createdById: "creator1",
    workspace: { id: "ws1", slug: "acme" },
    project: null,
    assignees: [{ userId: "assignee1" }],
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  db.notificationPreference.findMany.mockResolvedValue([]);
  db.notification.findMany.mockResolvedValue([]);
});

describe("generateDueDateReminders", () => {
  it("emits one Due-date reminder to the assignee as the 60-min offset is crossed", async () => {
    db.action.findMany.mockResolvedValue([action()] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "due_date",
        actorUserId: null,
        subject: expect.objectContaining({
          actionId: "a1",
          ownerUserId: "assignee1",
          offsetMinutes: 60,
          workspaceId: "ws1",
          workspaceSlug: "acme",
        }),
      }),
    );
    expect(result.emitted).toBe(1);
  });

  it("falls back to the creator as owner when there are no assignees", async () => {
    db.action.findMany.mockResolvedValue([action({ assignees: [] })] as never);

    await generateDueDateReminders(db, NOW);

    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ ownerUserId: "creator1" }),
      }),
    );
  });

  it("does not fire before the offset boundary is reached", async () => {
    // Due in 120 min → the 60-min reminder time is 60 min in the future.
    db.action.findMany.mockResolvedValue([action({ dueDate: inMinutes(120) })] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(emitNotification).not.toHaveBeenCalled();
    expect(result.emitted).toBe(0);
  });

  it("does not back-fill an offset that elapsed long before now", async () => {
    // Owner configured only the 60-min offset; the action is due in 5 min, so
    // that offset's reminder time is 55 min in the past (outside the lookback
    // window) and must not be belatedly fired.
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: "assignee1", reminderMinutesBefore: [60] },
    ] as never);
    db.action.findMany.mockResolvedValue([action({ dueDate: inMinutes(5) })] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(emitNotification).not.toHaveBeenCalled();
    expect(result.emitted).toBe(0);
  });

  it("uses the owner's configured reminderMinutesBefore offsets", async () => {
    // Owner wants a single 30-min reminder; action due in 30 min → fires it.
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: "assignee1", reminderMinutesBefore: [30] },
    ] as never);
    db.action.findMany.mockResolvedValue([action({ dueDate: inMinutes(30) })] as never);

    await generateDueDateReminders(db, NOW);

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ offsetMinutes: 30 }),
      }),
    );
  });

  it("resolves the workspace via the project when the action has none directly", async () => {
    db.action.findMany.mockResolvedValue([
      action({ workspace: null, project: { workspace: { id: "ws2", slug: "beta" } } }),
    ] as never);

    await generateDueDateReminders(db, NOW);

    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ workspaceId: "ws2", workspaceSlug: "beta" }),
      }),
    );
  });

  it("only scans actions due within one lookback window of an offset in use", async () => {
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: "assignee1", reminderMinutesBefore: [30] },
    ] as never);
    db.action.findMany.mockResolvedValue([] as never);

    await generateDueDateReminders(db, NOW);

    const where = db.action.findMany.mock.calls[0]?.[0]?.where;
    // The defaults (15, 60, 1440) plus the configured 30, each a 15-min slice.
    expect(where?.OR).toEqual(
      expect.arrayContaining([
        { dueDate: { gt: inMinutes(30 - 15), lte: inMinutes(30) } },
        { dueDate: { gt: inMinutes(1440 - 15), lte: inMinutes(1440) } },
      ]),
    );
    expect(where?.OR).toHaveLength(4);
  });

  it("loads every owner's offsets in one query, however many owners there are", async () => {
    db.action.findMany.mockResolvedValue([
      action({ id: "a1", assignees: [{ userId: "u1" }, { userId: "u2" }] }),
      action({ id: "a2", assignees: [{ userId: "u3" }] }),
    ] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(db.notificationPreference.findMany).toHaveBeenCalledTimes(1);
    expect(db.notificationPreference.findUnique).not.toHaveBeenCalled();
    expect(result.emitted).toBe(3);
  });

  it("skips reminders already sent with one lookup, instead of a full emit per reminder", async () => {
    // Three actions all crossing their 60-min offset this tick; two of the
    // reminders went out on an earlier tick of the lookback window.
    db.action.findMany.mockResolvedValue([
      action({ id: "a1", assignees: [{ userId: "u1" }] }),
      action({ id: "a2", assignees: [{ userId: "u2" }] }),
      action({ id: "a3", assignees: [{ userId: "u3" }] }),
    ] as never);
    db.notification.findMany.mockResolvedValue([
      { dedupeKey: "due_date:a1:60", userId: "u1" },
      { dedupeKey: "due_date:a3:60", userId: "u3" },
      // The right key for a different owner does not count as sent to u2.
      { dedupeKey: "due_date:a2:60", userId: "someone-else" },
    ] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(db.notification.findMany).toHaveBeenCalledTimes(1);
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey: { in: ["due_date:a1:60", "due_date:a2:60", "due_date:a3:60"] },
          userId: { in: ["u1", "u2", "u3"] },
        },
      }),
    );
    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.objectContaining({ actionId: "a2", ownerUserId: "u2" }) }),
    );
    expect(result.emitted).toBe(1);
  });

  it("does not query for sent reminders when nothing crosses an offset", async () => {
    db.action.findMany.mockResolvedValue([action({ dueDate: inMinutes(120) })] as never);

    await generateDueDateReminders(db, NOW);

    expect(db.notification.findMany).not.toHaveBeenCalled();
  });
});

// A paused (On hold, Completed, Cancelled) project's actions are off the
// owner's plate, so their due dates remind nobody. The mocked findMany
// evaluates the emitter's real `where` against in-memory rows with
// `matchesWhere`, so these assert which actions it actually reaches.
describe("generateDueDateReminders: paused projects", () => {
  function row(id: string, projectStatus: string | null) {
    return {
      ...action({ id, assignees: [{ userId: `owner-${id}` }] }),
      status: "ACTIVE",
      projectId: projectStatus ? `p-${id}` : null,
      project: projectStatus
        ? { status: projectStatus, workspace: { id: "ws1", slug: "acme" } }
        : null,
    };
  }

  const PAUSED = ["ON_HOLD", "COMPLETED", "CANCELLED"];

  beforeEach(() => {
    const rows = [
      row("loose", null),
      row("live", "ACTIVE"),
      ...PAUSED.map((s) => row(s.toLowerCase(), s)),
    ];
    db.action.findMany.mockImplementation(((args: { where?: Record<string, unknown> }) =>
      Promise.resolve(rows.filter((r) => matchesWhere(r, args.where ?? {})))) as never);
  });

  it("reminds the owners of project-less and Active-project actions only", async () => {
    const result = await generateDueDateReminders(db, NOW);

    const remindedActionIds = vi
      .mocked(emitNotification)
      .mock.calls.map(([arg]) => (arg.subject as { actionId: string }).actionId)
      .sort();
    expect(remindedActionIds).toEqual(["live", "loose"]);
    expect(result.emitted).toBe(2);
  });

  it("does not look up sent reminders for a paused project's actions", async () => {
    await generateDueDateReminders(db, NOW);

    const where = db.notification.findMany.mock.calls[0]?.[0]?.where as {
      userId: { in: string[] };
    };
    expect(where.userId.in.sort()).toEqual(["owner-live", "owner-loose"]);
  });
});
