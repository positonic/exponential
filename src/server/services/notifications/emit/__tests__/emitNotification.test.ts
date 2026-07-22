import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";

vi.mock("~/server/services/notifications/WebPushService", () => ({
  sendPushToUser: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }),
}));

const db = mockDeep<PrismaClient>();

const WORKSPACE = { id: "ws1", slug: "acme", name: "Acme" };

/** Happy-path DB fixtures for an assignment emit. */
function stubAssignmentLookups() {
  // Both the name lookup and resolveActionWorkspace read from action.findUnique.
  db.action.findUnique.mockResolvedValue({
    id: "a1",
    name: "Ship the thing",
    workspace: WORKSPACE,
    project: null,
  } as never);
  // Actor (assigner) lookup for the notification title.
  db.user.findUnique.mockResolvedValue({
    id: "actor1",
    name: "Actor",
    email: "actor@acme.test",
  } as never);
  db.notification.create.mockResolvedValue({
    id: "n1",
    scheduledFor: null,
  } as never);
  db.notificationDelivery.create.mockResolvedValue({ id: "d1" } as never);
  db.notificationDelivery.update.mockResolvedValue({ id: "d1" } as never);
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  vi.mocked(sendPushToUser).mockResolvedValue({ sent: 1, failed: 0 });
  stubAssignmentLookups();
});

describe("emitNotification — Assignment tracer", () => {
  it("persists one Notification per assignee and delivers to push, excluding the actor", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1", "actor1"] },
      db,
    });

    // Actor excluded → exactly one recipient.
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "assignee1",
          category: "assignment",
          message: "Ship the thing",
          deeplink: "/w/acme/actions/a1",
          dedupeKey: "assignment:a1:assignee1",
        }),
      }),
    );

    // A pending push delivery is written...
    expect(db.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notificationId: "n1",
          channel: "push",
          status: "pending",
        }),
      }),
    );

    // ...delivered synchronously to the assignee...
    expect(sendPushToUser).toHaveBeenCalledWith(
      "assignee1",
      expect.objectContaining({
        title: "Actor assigned you a task",
        body: "Ship the thing",
        tag: "assignment",
        url: "/w/acme/actions/a1",
      }),
      db,
    );

    // ...and marked sent.
    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({ status: "sent" }),
      }),
    );
  });

  it("never notifies the actor about their own action (self-assign)", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["actor1"] },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("marks the delivery failed when a push endpoint errors (for the cron to retry)", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, failed: 1 });

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("treats no push subscriptions (0 sent / 0 failed) as a delivered no-op", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, failed: 0 });

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "sent" }),
      }),
    );
  });

  it("skips the emit when the action can no longer be resolved", async () => {
    db.action.findUnique.mockResolvedValue(null as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "gone", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
