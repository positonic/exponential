import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { NotificationServiceFactory } from "~/server/services/notifications/NotificationServiceFactory";
import { shouldSendEmailNotification } from "~/server/services/notifications/EmailNotificationService";

// Access gate is mocked so we can drive allow/deny without real membership data.
const { canAccessMock } = vi.hoisted(() => ({ canAccessMock: vi.fn() }));
vi.mock("~/server/services/access/AccessControlService", () => ({
  AccessControlService: class {
    canAccess = canAccessMock;
  },
}));
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
  db.notification.findUnique.mockResolvedValue(null as never);
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
  canAccessMock.mockResolvedValue({ allowed: true });
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

  it("does not create a second notification when one already exists for (dedupeKey, recipient)", async () => {
    db.notification.findUnique.mockResolvedValue({ id: "existing" } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notification.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey_userId: { dedupeKey: "assignment:a1:assignee1", userId: "assignee1" },
        },
      }),
    );
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(NotificationServiceFactory.createService).not.toHaveBeenCalled();
  });

  it("drops a recipient who can no longer view the action", async () => {
    canAccessMock.mockResolvedValue({ allowed: false, reason: "no access" });

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: "actor1",
      subject: { actionId: "a1", assignedUserIds: ["assignee1"] },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
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

describe("emitNotification — Due-date reminder dedup", () => {
  const dueSubject = {
    actionId: "a1",
    actionName: "Ship the thing",
    ownerUserId: "owner1",
    offsetMinutes: 60,
    dueDate: new Date("2026-07-22T13:00:00.000Z"),
    workspaceId: "ws1",
    workspaceSlug: "acme",
  };

  it("emits one reminder to the owner keyed per (action, offset)", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.DUE_DATE,
      actorUserId: null,
      subject: dueSubject,
      db,
    });

    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "owner1",
          category: "due_date",
          dedupeKey: "due_date:a1:60",
        }),
      }),
    );
  });

  it("does not re-send on the next cron tick (same action+offset already emitted)", async () => {
    db.notification.findUnique.mockResolvedValue({ id: "existing" } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.DUE_DATE,
      actorUserId: null,
      subject: dueSubject,
      db,
    });

    expect(db.notification.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey_userId: { dedupeKey: "due_date:a1:60", userId: "owner1" },
        },
      }),
    );
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe("emitNotification — Meeting participant added", () => {
  beforeEach(() => {
    // The content builder resolves the meeting to a title + workspace.
    db.transcriptionSession.findUnique.mockResolvedValue({
      title: "Weekly sync",
      workspace: WORKSPACE,
    } as never);
  });

  it("notifies each tagged member (excluding the actor) with a /recording deeplink", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED,
      actorUserId: "actor1",
      subject: { sessionId: "m1", participantUserIds: ["member1", "actor1"] },
      db,
    });

    // Actor excluded → exactly one recipient.
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member1",
          category: "meeting_participant_added",
          message: "Weekly sync",
          deeplink: "/recording/m1",
          dedupeKey: "meeting_participant_added:m1:member1",
        }),
      }),
    );
    expect(sendNotificationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Actor added you to a meeting" }),
    );
  });

  it("delivers to Matrix when the opt-in cell is enabled for the category", async () => {
    db.notificationChannelPreference.findMany.mockResolvedValue([
      { channel: "push", enabled: false },
      { channel: "matrix", enabled: true },
    ] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED,
      actorUserId: "actor1",
      subject: { sessionId: "m1", participantUserIds: ["member1"] },
      db,
    });

    expect(NotificationServiceFactory.createService).toHaveBeenCalledWith("matrix", {
      userId: "member1",
    });
  });

  it("skips the emit when the meeting can no longer be resolved", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue(null as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED,
      actorUserId: "actor1",
      subject: { sessionId: "gone", participantUserIds: ["member1"] },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe("emitNotification — Meeting notes ready", () => {
  beforeEach(() => {
    // Recipients are the meeting's member (userId) participants.
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([
      { userId: "member1" },
      { userId: "member2" },
    ] as never);
    // Content resolves the meeting to a title + workspace.
    db.transcriptionSession.findUnique.mockResolvedValue({
      title: "Weekly sync",
      workspace: WORKSPACE,
    } as never);
  });

  it("notifies member participants (excluding the actor/owner) when notes land", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_READY,
      actorUserId: "member2", // the owner/actor is dropped
      subject: { sessionId: "m1" },
      db,
    });

    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member1",
          category: "meeting_ready",
          title: "Meeting notes are ready",
          message: "Weekly sync",
          deeplink: "/recording/m1",
          dedupeKey: "meeting_ready:m1:member1",
        }),
      }),
    );
  });

  it("is a no-op when the meeting has no member participants", async () => {
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([] as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_READY,
      actorUserId: null,
      subject: { sessionId: "m1" },
      db,
    });

    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe("emitNotification — Agenda ready (ADR-0059)", () => {
  beforeEach(() => {
    // Recipients: ceremony participants + owner + team members; the actor is dropped.
    db.ceremonyOccurrence.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE.id,
      scheduledStart: new Date("2026-09-11T07:00:00Z"),
      agenda: { sections: [{ items: [{}, {}] }, { items: [] }] },
      agendaGeneratedAt: new Date("2026-09-10T08:00:00Z"),
      ceremony: {
        id: "cer-1",
        name: "Daily Standup",
        timezone: "Europe/Berlin",
        ownerId: "owner1",
        teamId: "team1",
        participants: [{ userId: "member1" }, { userId: "member2" }],
        workspace: WORKSPACE,
      },
    } as never);
    db.teamUser.findMany.mockResolvedValue([{ userId: "member3" }, { userId: "member1" }] as never);
    // Everyone resolved is still a member of the workspace.
    db.workspaceUser.findMany.mockResolvedValue(
      [{ userId: "member1" }, { userId: "member2" }, { userId: "member3" }, { userId: "owner1" }] as never,
    );
  });

  it("notifies participants, owner and team members once each, excluding the actor, with a deep link to the occurrence", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: "owner1",
      subject: { occurrenceId: "occ-1" },
      db,
    });

    const recipients = db.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { userId: string } }).data.userId,
    );
    expect(recipients.sort()).toEqual(["member1", "member2", "member3"]);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "agenda_ready",
          title: "Agenda ready: Daily Standup",
          message: expect.stringContaining("2 items to cover"),
          deeplink: `/w/${WORKSPACE.slug}/ceremonies/cer-1/occ-1`,
          dedupeKey: expect.stringMatching(/^agenda_ready:occ-1:\d+:member/),
        }),
      }),
    );
  });

  it("offers a skip when a standup's agenda is empty and nobody flagged a blocker", async () => {
    db.ceremonyOccurrence.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE.id,
      scheduledStart: new Date("2026-09-11T07:00:00Z"),
      status: "AGENDA_CIRCULATED",
      skipReason: null,
      agenda: { sections: [{ items: [] }] },
      agendaGeneratedAt: new Date("2026-09-10T08:00:00Z"),
      updates: [],
      ceremony: {
        id: "cer-1",
        name: "Daily Standup",
        kind: "STANDUP",
        timezone: "Europe/Berlin",
        ownerId: "owner1",
        teamId: "team1",
        participants: [{ userId: "member1" }],
        workspace: WORKSPACE,
      },
    } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: "owner1",
      subject: { occurrenceId: "occ-1" },
      db,
    });

    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Nothing to cover: Daily Standup",
          message: expect.stringContaining("nobody flagged a blocker"),
        }),
      }),
    );
  });

  it("does not offer a skip when a participant flagged a blocker", async () => {
    db.ceremonyOccurrence.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE.id,
      scheduledStart: new Date("2026-09-11T07:00:00Z"),
      status: "AGENDA_CIRCULATED",
      skipReason: null,
      agenda: { sections: [{ items: [] }] },
      agendaGeneratedAt: new Date("2026-09-10T08:00:00Z"),
      updates: [{ id: "upd-1" }],
      ceremony: {
        id: "cer-1",
        name: "Daily Standup",
        kind: "STANDUP",
        timezone: "Europe/Berlin",
        ownerId: "owner1",
        teamId: "team1",
        participants: [{ userId: "member1" }],
        workspace: WORKSPACE,
      },
    } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: "owner1",
      subject: { occurrenceId: "occ-1" },
      db,
    });

    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Agenda ready: Daily Standup" }) }),
    );
  });

  it("tells participants a skipped occurrence is off, with the reason", async () => {
    db.ceremonyOccurrence.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE.id,
      scheduledStart: new Date("2026-09-11T07:00:00Z"),
      status: "SKIPPED",
      skipReason: "Nothing on the agenda and nobody blocked",
      updatedAt: new Date("2026-09-10T09:00:00Z"),
      agenda: { sections: [{ items: [] }] },
      agendaGeneratedAt: new Date("2026-09-10T08:00:00Z"),
      updates: [],
      ceremony: {
        id: "cer-1",
        name: "Daily Standup",
        kind: "STANDUP",
        timezone: "Europe/Berlin",
        ownerId: "owner1",
        teamId: "team1",
        participants: [{ userId: "member1" }],
        workspace: WORKSPACE,
      },
    } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: "owner1",
      subject: { occurrenceId: "occ-1" },
      db,
    });

    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Skipped: Daily Standup",
          message: expect.stringContaining("Nothing on the agenda and nobody blocked"),
          // A skip notice must not collide with the agenda notice for the
          // same generation, or nobody is told the standup is off.
          dedupeKey: expect.stringMatching(/^agenda_ready:occ-1:skipped:\d+:member/),
        }),
      }),
    );
  });

  it("a second skip after an undo gets a fresh dedupe key, so participants are told again", async () => {
    const skipped = (updatedAt: Date) =>
      ({
        workspaceId: WORKSPACE.id,
        scheduledStart: new Date("2026-09-11T07:00:00Z"),
        status: "SKIPPED",
        skipReason: "Nothing to cover",
        updatedAt,
        agenda: { sections: [{ items: [] }] },
        agendaGeneratedAt: new Date("2026-09-10T08:00:00Z"),
        updates: [],
        ceremony: {
          id: "cer-1",
          name: "Daily Standup",
          kind: "STANDUP",
          timezone: "Europe/Berlin",
          ownerId: "owner1",
          teamId: null,
          participants: [{ userId: "member1" }],
          workspace: WORKSPACE,
        },
      }) as never;
    db.teamUser.findMany.mockResolvedValue([] as never);

    db.ceremonyOccurrence.findUnique.mockResolvedValue(skipped(new Date("2026-09-10T09:00:00Z")));
    await emitNotification({ category: NOTIFICATION_CATEGORIES.AGENDA_READY, actorUserId: "owner1", subject: { occurrenceId: "occ-1" }, db });
    db.ceremonyOccurrence.findUnique.mockResolvedValue(skipped(new Date("2026-09-10T09:30:00Z")));
    await emitNotification({ category: NOTIFICATION_CATEGORIES.AGENDA_READY, actorUserId: "owner1", subject: { occurrenceId: "occ-1" }, db });

    const rows = db.notification.create.mock.calls.map((c) => (c[0] as { data: { userId: string; dedupeKey: string } }).data);
    const perRecipient = new Map<string, Set<string>>();
    for (const r of rows) perRecipient.set(r.userId, (perRecipient.get(r.userId) ?? new Set()).add(r.dedupeKey));
    expect(perRecipient.size).toBeGreaterThan(0);
    // Every recipient was told twice, under two different keys.
    for (const keys of perRecipient.values()) expect(keys.size).toBe(2);
  });

  it("drops a participant who is no longer a member of the workspace", async () => {
    // member2 was removed from the workspace; their CeremonyParticipant row survives.
    db.workspaceUser.findMany.mockResolvedValue(
      [{ userId: "member1" }, { userId: "member3" }, { userId: "owner1" }] as never,
    );

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: "owner1",
      subject: { occurrenceId: "occ-1" },
      db,
    });

    const recipients = db.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { userId: string } }).data.userId,
    );
    expect(recipients.sort()).toEqual(["member1", "member3"]);
  });

  it("re-circulating a regenerated agenda gets a fresh dedupe key so participants are told again", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: null,
      subject: { occurrenceId: "occ-1" },
      db,
    });
    const first = (db.notification.create.mock.calls[0]![0] as { data: { dedupeKey: string } }).data.dedupeKey;

    db.notification.create.mockClear();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE.id,
      scheduledStart: new Date("2026-09-11T07:00:00Z"),
      agenda: { sections: [{ items: [{}, {}, {}] }] },
      // Regenerated: a later generation stamp.
      agendaGeneratedAt: new Date("2026-09-10T09:30:00Z"),
      ceremony: {
        id: "cer-1",
        name: "Daily Standup",
        timezone: "Europe/Berlin",
        ownerId: "owner1",
        teamId: "team1",
        participants: [{ userId: "member1" }, { userId: "member2" }],
        workspace: WORKSPACE,
      },
    } as never);

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: null,
      subject: { occurrenceId: "occ-1" },
      db,
    });
    const second = (db.notification.create.mock.calls[0]![0] as { data: { dedupeKey: string } }).data.dedupeKey;

    expect(second).not.toBe(first);
  });

  it("is a no-op for an unknown occurrence", async () => {
    db.ceremonyOccurrence.findUnique.mockResolvedValue(null as never);
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.AGENDA_READY,
      actorUserId: null,
      subject: { occurrenceId: "nope" },
      db,
    });
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe("emitNotification — Draft decisions ready (meeting_ready variant, ADR-0060 V2)", () => {
  beforeEach(() => {
    // Recipient is the meeting owner; content resolves title + workspace.
    db.transcriptionSession.findUnique.mockResolvedValue({
      userId: "owner1",
      title: "Daily Standup",
      workspace: WORKSPACE,
    } as never);
  });

  it("notifies the meeting owner with the draft count under its own dedupe key", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_READY,
      actorUserId: null,
      subject: { sessionId: "m1", draftDecisionCount: 3 },
      db,
    });

    expect(db.transcriptionSessionParticipant.findMany).not.toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "owner1",
          category: "meeting_ready",
          title: "3 draft decisions to review",
          message: "Daily Standup",
          deeplink: "/recording/m1",
          dedupeKey: "meeting_ready:decisions:m1:owner1",
          metadata: expect.objectContaining({ draftDecisionCount: 3 }),
        }),
      }),
    );
  });

  it("does not tell the owner about drafts they just extracted themselves", async () => {
    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MEETING_READY,
      actorUserId: "owner1",
      subject: { sessionId: "m1", draftDecisionCount: 1 },
      db,
    });
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
