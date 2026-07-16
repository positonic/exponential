import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  sendMentionNotifications,
  sendFeatureMentionNotifications,
} from "~/server/services/notifications/EmailNotificationService";
import { sendMentionNotificationEmail } from "~/server/services/EmailService";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";

vi.mock("~/server/services/EmailService", () => ({
  sendAssignmentNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendMentionNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/notifications/WebPushService", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/notifications/ZulipNotificationService", () => ({
  ZulipNotificationService: vi.fn(),
}));

const db = mockDeep<PrismaClient>();

const WORKSPACE = { id: "ws1", slug: "acme", name: "Acme" };

/** Default happy-path DB fixtures shared by both wrappers. */
function stubCommonLookups() {
  // Recipient user rows (membership-filtered query in the fan-out core)
  db.user.findMany.mockResolvedValue([
    { id: "member1", name: "Member One", email: "member1@acme.test" },
  ] as never);
  // Author lookup
  db.user.findUnique.mockResolvedValue({
    id: "author1",
    name: "Author",
    email: "author@acme.test",
  } as never);
  // Per-recipient email gating: no global pref, no override, workspace allows
  db.notificationPreference.findUnique.mockResolvedValue(null);
  db.workspaceNotificationOverride.findUnique.mockResolvedValue(null);
  db.workspace.findUnique.mockResolvedValue({
    enableEmailNotifications: true,
  } as never);
  // Zulip DM: no mapping — skipped
  db.integrationUserMapping.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  stubCommonLookups();
});

describe("sendMentionNotifications (action comments)", () => {
  beforeEach(() => {
    db.action.findUnique.mockResolvedValue({
      id: "a1",
      name: "Ship the thing",
      workspace: WORKSPACE,
      project: null,
    } as never);
  });

  it("notifies a mentioned workspace member via push and email, excluding the author", async () => {
    await sendMentionNotifications(db, {
      actionId: "a1",
      commentContent: "cc @[Member One](member1) and @[Author](author1)",
      commentAuthorId: "author1",
    });

    // Author excluded from the recipient query
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["member1"] } }),
      }),
    );
    expect(sendPushToUser).toHaveBeenCalledWith(
      "member1",
      expect.objectContaining({
        tag: "mention",
        url: "/w/acme/actions/a1",
        title: expect.stringContaining("mentioned you in Ship the thing"),
      }),
      db,
    );
    expect(sendMentionNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member1@acme.test",
        actionName: "Ship the thing",
      }),
    );
  });

  it("only queries recipients who belong to the workspace (directly or via a linked team)", async () => {
    await sendMentionNotifications(db, {
      actionId: "a1",
      commentContent: "hi @[Outsider](outsider1)",
      commentAuthorId: "author1",
    });

    // The recipient query itself must carry the membership constraint —
    // crafted @[Name](id) markup must never reach non-members.
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { workspaceMemberships: { some: { workspaceId: "ws1" } } },
            { teams: { some: { team: { workspaceId: "ws1" } } } },
          ],
        }),
      }),
    );
  });

  it("does nothing when the comment has no mentions", async () => {
    await sendMentionNotifications(db, {
      actionId: "a1",
      commentContent: "no mentions here",
      commentAuthorId: "author1",
    });

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendMentionNotificationEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the only mention is the author", async () => {
    await sendMentionNotifications(db, {
      actionId: "a1",
      commentContent: "note to self @[Author](author1)",
      commentAuthorId: "author1",
    });

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendMentionNotificationEmail).not.toHaveBeenCalled();
  });
});

describe("sendFeatureMentionNotifications (feature/scope comments)", () => {
  beforeEach(() => {
    db.feature.findUnique.mockResolvedValue({
      name: "Comment mentions",
      product: { slug: "agent-skills", workspace: WORKSPACE },
    } as never);
  });

  it("deep-links to the feature page and uses the feature name", async () => {
    await sendFeatureMentionNotifications(db, {
      featureId: "f1",
      commentContent: "ping @[Member One](member1)",
      commentAuthorId: "author1",
    });

    expect(sendPushToUser).toHaveBeenCalledWith(
      "member1",
      expect.objectContaining({
        tag: "mention",
        url: "/w/acme/products/agent-skills/features/f1",
        title: expect.stringContaining("mentioned you in Comment mentions"),
      }),
      db,
    );
    expect(sendMentionNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member1@acme.test",
        actionName: "Comment mentions",
        actionUrl: expect.stringContaining(
          "/w/acme/products/agent-skills/features/f1",
        ),
      }),
    );
  });

  it("deep-links to the scope thread when scopeId is set", async () => {
    await sendFeatureMentionNotifications(db, {
      featureId: "f1",
      scopeId: "s1",
      commentContent: "ping @[Member One](member1)",
      commentAuthorId: "author1",
    });

    expect(sendPushToUser).toHaveBeenCalledWith(
      "member1",
      expect.objectContaining({
        url: "/w/acme/products/agent-skills/features/f1/scopes/s1",
      }),
      db,
    );
  });

  it("does nothing when the feature or its workspace cannot be resolved", async () => {
    db.feature.findUnique.mockResolvedValue(null);

    await sendFeatureMentionNotifications(db, {
      featureId: "gone",
      commentContent: "ping @[Member One](member1)",
      commentAuthorId: "author1",
    });

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendMentionNotificationEmail).not.toHaveBeenCalled();
  });

  it("never notifies anyone the membership-filtered query does not return", async () => {
    // DB returns no rows for the mentioned id (non-member / agent id)
    db.user.findMany.mockResolvedValue([] as never);

    await sendFeatureMentionNotifications(db, {
      featureId: "f1",
      commentContent: "ping @[Zoe Agent](agent-zoe)",
      commentAuthorId: "author1",
    });

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendMentionNotificationEmail).not.toHaveBeenCalled();
  });
});
