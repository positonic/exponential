import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { retryPendingDeliveries } from "~/server/services/notifications/emit/processNotifications";
import { NotificationServiceFactory } from "~/server/services/notifications/NotificationServiceFactory";

vi.mock("~/server/services/notifications/NotificationServiceFactory", () => ({
  NotificationServiceFactory: { createService: vi.fn() },
}));

const db = mockDeep<PrismaClient>();
const sendNotificationSpy = vi.fn().mockResolvedValue({ success: true });

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    channel: "push",
    status: "failed",
    attempts: 1,
    notification: {
      id: "n1",
      userId: "u1",
      category: "assignment",
      title: "Assigned",
      message: "Ship it",
      deeplink: "/w/acme/actions/a1",
      metadata: { workspaceId: "ws1", workspaceSlug: "acme" },
      dedupeKey: "assignment:a1:u1",
      scheduledFor: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  sendNotificationSpy.mockResolvedValue({ success: true });
  vi.mocked(NotificationServiceFactory.createService).mockResolvedValue({
    name: "Push",
    type: "push",
    sendNotification: sendNotificationSpy,
    validateConfig: vi.fn(),
    testConnection: vi.fn(),
  } as never);
  db.notificationDelivery.update.mockResolvedValue({ id: "d1" } as never);
});

describe("retryPendingDeliveries", () => {
  it("only selects unsuccessful deliveries under the attempt cap that are due", async () => {
    db.notificationDelivery.findMany.mockResolvedValue([] as never);

    await retryPendingDeliveries(db, new Date("2026-07-22T12:00:00Z"));

    const where = db.notificationDelivery.findMany.mock.calls[0]?.[0]?.where as {
      attempts?: { lt?: number };
      OR?: Array<{ status?: string }>;
    };
    expect(where.attempts).toEqual({ lt: 5 });
    expect(where.OR?.map((o) => o.status)).toEqual(["failed", "pending"]);
  });

  it("re-delivers a failed delivery and marks it sent on success", async () => {
    db.notificationDelivery.findMany.mockResolvedValue([delivery()] as never);

    const result = await retryPendingDeliveries(db, new Date("2026-07-22T12:00:00Z"));

    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("push", {
      userId: "u1",
    });
    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "sent",
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(result).toEqual({ considered: 1, sent: 1, failed: 0 });
  });

  it("keeps a delivery failed (and increments attempts) when re-delivery fails", async () => {
    db.notificationDelivery.findMany.mockResolvedValue([delivery()] as never);
    sendNotificationSpy.mockResolvedValue({ success: false, error: "gateway down" });

    const result = await retryPendingDeliveries(db, new Date("2026-07-22T12:00:00Z"));

    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          lastError: "gateway down",
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(result).toEqual({ considered: 1, sent: 0, failed: 1 });
  });
});
