import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { generateScheduledSummaries } from "~/server/services/notifications/emit/summaries";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";

vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

const db = mockDeep<PrismaClient>();

function pref(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    timezone: "UTC",
    dailySummaryTime: "09:00",
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  // Digest data fixtures (real templates render from these).
  db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@acme.test" } as never);
  db.action.findMany.mockResolvedValue([] as never);
  db.action.count.mockResolvedValue(0 as never);
});

describe("generateScheduledSummaries", () => {
  it("emits a daily summary at the configured local time (within the fire window)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    const result = await generateScheduledSummaries(db, new Date("2026-07-23T09:05:00.000Z"));

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "summary",
        actorUserId: null,
        subject: expect.objectContaining({
          userId: "u1",
          kind: "daily",
          periodKey: "2026-07-23",
        }),
      }),
    );
    expect(result.emitted).toBe(1);
  });

  it("does not emit before the configured time", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T08:00:00.000Z"));

    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("does not emit outside the fire window (well after the configured time)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T11:00:00.000Z"));

    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("respects the user's timezone (09:00 New York = 13:00 UTC in July)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([
      pref({ timezone: "America/New_York" }),
    ] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T13:05:00.000Z"));

    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ kind: "daily", periodKey: "2026-07-23" }),
      }),
    );
  });
});
