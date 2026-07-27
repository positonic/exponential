import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { NotificationServiceFactory } from "~/server/services/notifications/NotificationServiceFactory";

const { canAccessMock } = vi.hoisted(() => ({ canAccessMock: vi.fn() }));
vi.mock("~/server/services/access/AccessControlService", () => ({
  AccessControlService: class {
    canAccess = canAccessMock;
  },
}));
vi.mock("~/server/services/notifications/NotificationServiceFactory", () => ({
  NotificationServiceFactory: { createService: vi.fn() },
}));
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  shouldSendEmailNotification: vi.fn().mockResolvedValue(true),
}));

const db = mockDeep<PrismaClient>();
const sendNotificationSpy = vi.fn().mockResolvedValue({ success: true });

function subject(overrides: Record<string, unknown> = {}) {
  return {
    commentId: "c1",
    commentContent: "hey @[Member One](member1)",
    workspaceId: "ws1",
    workspaceSlug: "acme",
    workspaceName: "Acme",
    targetName: "Ship the thing",
    targetPath: "/w/acme/actions/a1",
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  sendNotificationSpy.mockResolvedValue({ success: true });
  canAccessMock.mockResolvedValue({ allowed: true });
  vi.mocked(NotificationServiceFactory.createService).mockImplementation(
    (type: string) =>
      Promise.resolve({
        name: type,
        type,
        sendNotification: sendNotificationSpy,
        validateConfig: vi.fn(),
        testConnection: vi.fn(),
      } as never),
  );
  // Author lookup for the title.
  db.user.findUnique.mockResolvedValue({ name: "Author", email: "a@acme.test" } as never);
  db.notification.findUnique.mockResolvedValue(null as never);
  db.notification.create.mockResolvedValue({ id: "n1", scheduledFor: null } as never);
  db.notificationDelivery.create.mockResolvedValue({ id: "d1" } as never);
  db.notificationDelivery.update.mockResolvedValue({ id: "d1" } as never);
  db.notificationChannelPreference.findMany.mockResolvedValue([
    { channel: "push", enabled: true },
    { channel: "email", enabled: false },
  ] as never);
});

describe("emitNotification — Mention", () => {
  it("notifies a mentioned workspace member with the right title, deeplink, and dedupe key", async () => {
    db.user.findMany.mockResolvedValue([{ id: "member1" }] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: "author1",
      subject: subject(),
      db,
    });

    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member1",
          category: "mention",
          title: "Author mentioned you in Ship the thing",
          deeplink: "/w/acme/actions/a1",
          dedupeKey: "mention:c1:member1",
        }),
      }),
    );
  });

  it("notifies no one when the only mentioned id is a non-member (or agent)", async () => {
    // Membership-filtered query returns nobody.
    db.user.findMany.mockResolvedValue([] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: "author1",
      subject: subject({ commentContent: "ping @[Zoe](agent-zoe)" }),
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(NotificationServiceFactory.createService).not.toHaveBeenCalled();
  });

  it("skips users already mentioned before an edit (only new mentions notify)", async () => {
    // member1 was in the previous body; member2 is newly added.
    db.user.findMany.mockResolvedValue([{ id: "member2" }] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: "author1",
      subject: subject({
        commentContent: "@[Member One](member1) @[Member Two](member2)",
        previousContent: "@[Member One](member1)",
      }),
      db,
    });

    // The membership query must have been asked only about the new mention.
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["member2"] } }),
      }),
    );
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "member2" }),
      }),
    );
  });

  it("never notifies the comment author, even if they mention themselves", async () => {
    db.user.findMany.mockResolvedValue([{ id: "author1" }, { id: "member1" }] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: "author1",
      subject: subject({
        commentContent: "note @[Author](author1) and @[Member One](member1)",
      }),
      db,
    });

    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "member1" }) }),
    );
  });
});
