import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { generateDueDateReminders } from "~/server/services/notifications/emit/dueDateReminders";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";

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
    db.notificationPreference.findUnique.mockResolvedValue({
      reminderMinutesBefore: [60],
    } as never);
    db.action.findMany.mockResolvedValue([action({ dueDate: inMinutes(5) })] as never);

    const result = await generateDueDateReminders(db, NOW);

    expect(emitNotification).not.toHaveBeenCalled();
    expect(result.emitted).toBe(0);
  });

  it("uses the owner's configured reminderMinutesBefore offsets", async () => {
    // Owner wants a single 30-min reminder; action due in 30 min → fires it.
    db.notificationPreference.findUnique.mockResolvedValue({
      reminderMinutesBefore: [30],
    } as never);
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
});
