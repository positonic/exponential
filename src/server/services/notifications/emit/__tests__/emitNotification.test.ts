import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { NotificationServiceFactory } from "~/server/services/notifications/NotificationServiceFactory";
import { shouldSendEmailNotification } from "~/server/services/notifications/EmailNotificationService";

// Mock the factory: every emit delivery goes through createService, so a fake
// service lets us assert channel dispatch without real push/email I/O.
vi.mock("~/server/services/notifications/NotificationServiceFactory", () => ({
  NotificationServiceFactory: { createService: vi.fn() },
}));
// Mock the whole module so the real EmailService → db.ts → env chain isn't
// pulled into this unit test; the email override is a boolean gate we drive.
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  shouldSendEmailNotification: vi.fn().mockResolvedValue(true),
}));

const db = mockDeep<PrismaClient>();

const WORKSPACE = { id: "ws1", slug: "acme", name: "Acme" };

/** Shared spy standing in for any channel service's sendNotification. */
const sendNotificationSpy = vi.fn().mockResolvedValue({ success: true });

function fakeServiceFor(type: string) {
  return {
    name: type,
    type,
    sendNotification: sendNotificationSpy,
    validateConfig: vi.fn(),
    testConnection: vi.fn(),
  };
}

/** Happy-path DB fixtures for an assignment emit. */
function stubAssignmentLookups() {
  db.action.findUnique.mockResolvedValue({
    id: "a1",
    name: "Ship the thing",
    workspace: WORKSPACE,
    project: null,
  } as never);
  db.user.findUnique.mockResolvedValue({
    id: "actor1",
    name: "Actor",
    email: "actor@acme.test",
  } as never);
  db.notification.create.mockResolvedValue({ id: "n1", scheduledFor: null } as never);
  db.notificationDelivery.create.mockResolvedValue({ id: "d1" } as never);
  db.notificationDelivery.update.mockResolvedValue({ id: "d1" } as never);
  // Matrix: only Push enabled for assignment (deterministic). Tests override.
  db.notificationChannelPreference.findMany.mockResolvedValue([
    { channel: "push", enabled: true },
    { channel: "email", enabled: false },
    { channel: "matrix", enabled: false },
    { channel: "whatsapp", enabled: false },
    { channel: "zulip", enabled: false },
  ] as never);
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  sendNotificationSpy.mockResolvedValue({ success: true });
  vi.mocked(NotificationServiceFactory.createService).mockImplementation(
    (type: string) => Promise.resolve(fakeServiceFor(type) as never),
  );
  vi.mocked(shouldSendEmailNotification).mockResolvedValue(true);
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

    // Delivered through the Push channel service for that recipient.
    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("push", {
      userId: "assignee1",
    });
    expect(sendNotificationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Actor assigned you a task",
        message: "Ship the thing",
        metadata: expect.objectContaining({ deeplink: "/w/acme/actions/a1" }),
      }),
    );

    // Delivery recorded as sent.
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
    expect(NotificationServiceFactory.createService).not.toHaveBeenCalled();
  });

  it("marks the delivery failed when the channel service reports failure (for the cron to retry)", async () => {
    sendNotificationSpy.mockResolvedValue({ success: false, error: "push failed" });

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", lastError: "push failed" }),
      }),
    );
  });

  it("marks the delivery failed when no service exists for the channel", async () => {
    vi.mocked(NotificationServiceFactory.createService).mockResolvedValue(null);

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

  it("skips the emit when the action can no longer be resolved", async () => {
    db.action.findUnique.mockResolvedValue(null as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "gone", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(NotificationServiceFactory.createService).not.toHaveBeenCalled();
  });
});

describe("emitNotification — channel resolution", () => {
  it("writes a delivery only for enabled channels (Push on, everything else off)", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notificationDelivery.create).toHaveBeenCalledTimes(1);
    expect(db.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "push" }) }),
    );
  });

  it("delivers to Email too when the matrix enables it and the workspace allows email", async () => {
    db.notificationChannelPreference.findMany.mockResolvedValue([
      { channel: "push", enabled: true },
      { channel: "email", enabled: true },
    ] as never);
    vi.mocked(shouldSendEmailNotification).mockResolvedValue(true);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("email", {
      userId: "assignee1",
    });
    expect(db.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "email" }) }),
    );
  });

  it("delivers to Matrix when the opt-in cell is enabled for the category", async () => {
    db.notificationChannelPreference.findMany.mockResolvedValue([
      { channel: "push", enabled: false },
      { channel: "matrix", enabled: true },
    ] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("matrix", {
      userId: "assignee1",
    });
    expect(db.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "matrix" }) }),
    );
  });

  it("suppresses Email when the per-workspace override is off, even if the matrix enables it", async () => {
    db.notificationChannelPreference.findMany.mockResolvedValue([
      { channel: "push", enabled: true },
      { channel: "email", enabled: true },
    ] as never);
    vi.mocked(shouldSendEmailNotification).mockResolvedValue(false);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    const emailDeliveryCreated = db.notificationDelivery.create.mock.calls.some(
      ([arg]) => (arg as { data?: { channel?: string } })?.data?.channel === "email",
    );
    expect(emailDeliveryCreated).toBe(false);
    expect(NotificationServiceFactory.createService).not.toHaveBeenCalledWith("email", {
      userId: "assignee1",
    });
  });
});
