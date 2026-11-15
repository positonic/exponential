/**
 * KnowledgePage comment mentions go through the unified pipeline (shiny.gust):
 * `emitPageCommentMention` → `emitNotification` writes a Notification row (so
 * the mention reaches the inbox), recipients are gated by page view access on
 * top of workspace membership, and nothing is sent directly — every channel
 * goes through the NotificationService factory, never the old push / Zulip /
 * email fan-out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { emitPageCommentMention } from "~/server/services/notifications/emit/mentionAdapters";
import { NotificationServiceFactory } from "~/server/services/notifications/NotificationServiceFactory";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { sendMentionNotificationEmail } from "~/server/services/EmailService";

const { viewers } = vi.hoisted(() => ({ viewers: new Set<string>() }));
vi.mock("~/server/services/access/resolvers/knowledgePageResolver", () => ({
  // The access info just carries the user id; `canView` reads it against the
  // test's viewer set, standing in for invite-only / restricted page rules.
  getKnowledgePageAccess: vi.fn((_db: unknown, userId: string) => Promise.resolve({ userId })),
  canViewKnowledgePage: vi.fn((access: { userId: string }) => viewers.has(access.userId)),
}));
vi.mock("~/server/services/access/AccessControlService", () => ({
  AccessControlService: class {
    canAccess = vi.fn().mockResolvedValue({ allowed: true });
  },
}));
vi.mock("~/server/services/notifications/NotificationServiceFactory", () => ({
  NotificationServiceFactory: { createService: vi.fn() },
}));
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  shouldSendEmailNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock("~/server/services/notifications/WebPushService", () => ({
  sendPushToUser: vi.fn(),
}));
vi.mock("~/server/services/EmailService", () => ({
  sendMentionNotificationEmail: vi.fn(),
}));

const db = mockDeep<PrismaClient>();
const sendNotificationSpy = vi.fn().mockResolvedValue({ success: true });

const PAGE = {
  id: "p1",
  title: "Launch plan",
  createdById: "owner1",
  projectId: null,
  workspaceId: "ws1",
  isInviteOnly: true,
  databaseId: null,
  workspace: { id: "ws1", slug: "acme", name: "Acme" },
};

function mention(overrides: Partial<Parameters<typeof emitPageCommentMention>[1]> = {}) {
  return emitPageCommentMention(db, {
    pageId: "p1",
    commentId: "c1",
    commentContent: "hey @[Member One](member1)",
    commentAuthorId: "author1",
    ...overrides,
  });
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  viewers.clear();
  sendNotificationSpy.mockResolvedValue({ success: true });
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
  db.knowledgePage.findUnique.mockResolvedValue(PAGE as never);
  db.user.findUnique.mockResolvedValue({ name: "Author", email: "a@acme.test" } as never);
  db.notification.findUnique.mockResolvedValue(null as never);
  db.notification.create.mockResolvedValue({ id: "n1", scheduledFor: null } as never);
  db.notificationDelivery.create.mockResolvedValue({ id: "d1" } as never);
  db.notificationDelivery.update.mockResolvedValue({ id: "d1" } as never);
  db.notificationChannelPreference.findMany.mockResolvedValue([
    { channel: "push", enabled: true },
    { channel: "email", enabled: true },
  ] as never);
});

describe("emitPageCommentMention", () => {
  it("writes a Notification row for a mentioned member who can view the page, deep-linked to the page", async () => {
    viewers.add("member1");
    db.user.findMany.mockResolvedValue([{ id: "member1" }] as never);

    await mention();

    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member1",
          category: "mention",
          title: "Author mentioned you in Launch plan",
          deeplink: "/w/acme/pages/p1",
          dedupeKey: "mention:c1:member1",
        }),
      }),
    );
  });

  it("restricts the recipient query to workspace members who are not an Assistant", async () => {
    viewers.add("member1");
    db.user.findMany.mockResolvedValue([{ id: "member1" }] as never);

    await mention();

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["member1"] },
          OR: [
            { workspaceMemberships: { some: { workspaceId: "ws1" } } },
            { teams: { some: { team: { workspaceId: "ws1" } } } },
          ],
          NOT: { externalAgentShadow: { is: { assistant: { isNot: null } } } },
        }),
      }),
    );
  });

  it("notifies no one when the mentioned id is not a workspace member", async () => {
    viewers.add("outsider");
    // The membership-filtered query returns nobody.
    db.user.findMany.mockResolvedValue([] as never);

    await mention({ commentContent: "ping @[Outsider](outsider)" });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(db.notificationDelivery.create).not.toHaveBeenCalled();
  });

  it("notifies no member who can't view the invite-only page", async () => {
    // member2 is in the workspace but was never invited to the page.
    viewers.add("member1");
    db.user.findMany.mockResolvedValue([{ id: "member1" }, { id: "member2" }] as never);

    await mention({ commentContent: "@[Member One](member1) @[Member Two](member2)" });

    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "member1" }) }),
    );
  });

  it("never notifies an Assistant's shadow user, even when it could view the page", async () => {
    viewers.add("assistant-shadow");
    // The recipient query excludes Assistant principals; Postgres returns nobody.
    db.user.findMany.mockResolvedValue([] as never);

    await mention({ commentContent: "@[Aria](assistant-shadow) please look" });

    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("never notifies the comment author, even when they mention themselves", async () => {
    viewers.add("author1");
    db.user.findMany.mockResolvedValue([{ id: "author1" }] as never);

    await mention({ commentContent: "note to self @[Author](author1)" });

    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("on an edit, only notifies mentions the edit added", async () => {
    viewers.add("member1");
    viewers.add("member2");
    db.user.findMany.mockResolvedValue([{ id: "member2" }] as never);

    await mention({
      commentContent: "@[Member One](member1) @[Member Two](member2)",
      previousContent: "@[Member One](member1)",
    });

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["member2"] } }),
      }),
    );
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "member2" }) }),
    );
  });

  it("does not write a second row when the same comment's mention is emitted again", async () => {
    viewers.add("member1");
    db.user.findMany.mockResolvedValue([{ id: "member1" }] as never);
    db.notification.findUnique.mockResolvedValue({ id: "existing" } as never);

    await mention();

    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("delivers through the channel preference matrix, never the legacy direct push / email send", async () => {
    viewers.add("member1");
    db.user.findMany.mockResolvedValue([{ id: "member1" }] as never);

    await mention();

    expect(db.notificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("push", { userId: "member1" });
    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("email", { userId: "member1" });
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendMentionNotificationEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the page no longer exists", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(null as never);

    await mention();

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
