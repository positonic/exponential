/**
 * Unit tests for the workspaceScheduling router (V3).
 *
 * Mocked Prisma; the workspace-membership middleware is stubbed to pass so
 * these tests isolate what THIS router owns: the explicit viewer rejection
 * on every procedure (the middleware's "view" level is deliberately not
 * trusted — cf. the feature.update viewer gap), member-only attendees, and
 * the invite dispatch with a well-formed METHOD:REQUEST payload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "MMeRcJFimqp98NsQ5i2cawtF4LbcftnfiCNJWLhO/YQ=";
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

// The membership middleware is covered by the access-control suites; pass it
// through so these tests exercise the router's own checks.
vi.mock("~/server/services/access/middleware", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("~/server/services/access/middleware")
  >();
  return {
    ...original,
    requireWorkspaceMembership: () => (opts: { next: () => unknown }) => opts.next(),
  };
});

const { sendMeetingInviteEmailMock } = vi.hoisted(() => ({
  sendMeetingInviteEmailMock: vi.fn(),
}));
vi.mock("~/server/services/EmailService", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/server/services/EmailService")>();
  return { ...original, sendMeetingInviteEmail: sendMeetingInviteEmailMock };
});

import { createMockCaller } from "~/test/trpc-helpers";

const WORKSPACE_ID = "ws-1";
const ORGANIZER_ID = "user-organizer";

// assertSaneRange rejects ranges entirely in the past, so range-bearing
// tests build dates relative to "now" — a UTC midnight a week out — instead
// of fixed calendar days that would time-bomb the suite.
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = new Date(Math.ceil(Date.now() / DAY_MS) * DAY_MS + 7 * DAY_MS);
const at = (hours: number, minutes = 0) =>
  new Date(BASE.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);

describe("workspaceScheduling router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    sendMeetingInviteEmailMock.mockReset().mockResolvedValue(undefined);
  });

  function memberRoster(userIds: string[]) {
    dbMock.workspaceUser.findMany.mockResolvedValue(
      userIds.map((userId) => ({ userId })) as never,
    );
    dbMock.teamUser.findMany.mockResolvedValue([] as never);
  }

  describe("viewer exclusion (every procedure)", () => {
    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "viewer" } as never);
    });

    it("rejects viewers on listSchedulableMembers", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.listSchedulableMembers({ workspaceId: WORKSPACE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects viewers on suggestSlots", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.suggestSlots({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          durationMinutes: 30,
          rangeStart: new Date("2026-08-18T00:00:00Z"),
          rangeEnd: new Date("2026-08-19T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects viewers on availabilityGrid", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.availabilityGrid({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          rangeStart: new Date("2026-08-18T00:00:00Z"),
          rangeEnd: new Date("2026-08-19T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects viewers on createMeeting", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.createMeeting({
          workspaceId: WORKSPACE_ID,
          title: "Nope",
          startsAt: new Date("2026-08-18T09:00:00Z"),
          endsAt: new Date("2026-08-18T10:00:00Z"),
          attendeeUserIds: ["user-a"],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.meeting.create).not.toHaveBeenCalled();
      expect(sendMeetingInviteEmailMock).not.toHaveBeenCalled();
    });

    it("rejects viewers on cancelMeeting", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.cancelMeeting({
          workspaceId: WORKSPACE_ID,
          meetingId: "meeting-1",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.meeting.update).not.toHaveBeenCalled();
    });

    it("rejects viewers on listMeetings", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.listMeetings({ workspaceId: WORKSPACE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("createMeeting", () => {
    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
    });

    it("rejects attendees who are not workspace members", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.createMeeting({
          workspaceId: WORKSPACE_ID,
          title: "With an outsider",
          startsAt: new Date("2026-08-18T09:00:00Z"),
          endsAt: new Date("2026-08-18T10:00:00Z"),
          attendeeUserIds: ["user-a", "user-outsider"],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.meeting.create).not.toHaveBeenCalled();
    });

    it("creates the meeting and emails each attendee a METHOD:REQUEST invite", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);
      dbMock.meeting.create.mockResolvedValue({
        id: "meeting-1",
        title: "Design sync",
        description: null,
        location: null,
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        icalUid: "uid-1@exponential.im",
        sequence: 0,
        status: "confirmed",
        organizer: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
        attendees: [
          { user: { id: "user-a", name: "A", email: "a@example.com" } },
          { user: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" } },
        ],
      } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.createMeeting({
        workspaceId: WORKSPACE_ID,
        title: "Design sync",
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        attendeeUserIds: ["user-a"],
      });

      expect(result.invitesSent).toBe(2);
      expect(sendMeetingInviteEmailMock).toHaveBeenCalledTimes(2);
      const call = sendMeetingInviteEmailMock.mock.calls[0]![0] as {
        method: string;
        icsContent: string;
        to: string;
      };
      expect(call.method).toBe("REQUEST");
      expect(call.icsContent).toContain("METHOD:REQUEST");
      expect(call.icsContent).toContain("UID:uid-1@exponential.im");
      expect(call.icsContent).toContain("SEQUENCE:0");

      // The organizer rides along as an attendee.
      const createArg = dbMock.meeting.create.mock.calls[0]![0] as {
        data: { attendees: { create: { userId: string }[] } };
      };
      expect(createArg.data.attendees.create.map((a) => a.userId)).toEqual(
        expect.arrayContaining(["user-a", ORGANIZER_ID]),
      );
    });

    it("a failed invite send does not roll back the meeting", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);
      sendMeetingInviteEmailMock.mockRejectedValue(new Error("postmark down"));
      dbMock.meeting.create.mockResolvedValue({
        id: "meeting-1",
        title: "Design sync",
        description: null,
        location: null,
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        icalUid: "uid-1@exponential.im",
        sequence: 0,
        status: "confirmed",
        organizer: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
        attendees: [{ user: { id: "user-a", name: "A", email: "a@example.com" } }],
      } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.createMeeting({
        workspaceId: WORKSPACE_ID,
        title: "Design sync",
        startsAt: new Date("2026-08-18T09:00:00Z"),
        endsAt: new Date("2026-08-18T10:00:00Z"),
        attendeeUserIds: ["user-a"],
      });

      expect(result.id).toBe("meeting-1");
      expect(result.invitesSent).toBe(0);
    });
  });

  describe("cancelMeeting", () => {
    const storedMeeting = {
      id: "meeting-1",
      workspaceId: WORKSPACE_ID,
      organizerId: ORGANIZER_ID,
      title: "Design sync",
      description: null,
      location: null,
      startsAt: new Date("2026-08-18T09:00:00Z"),
      endsAt: new Date("2026-08-18T10:00:00Z"),
      icalUid: "uid-1@exponential.im",
      sequence: 0,
      status: "confirmed",
      organizer: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      attendees: [{ user: { id: "user-a", name: "A", email: "a@example.com" } }],
    };

    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
    });

    it("only the organizer can cancel", async () => {
      dbMock.meeting.findFirst.mockResolvedValue(storedMeeting as never);

      const caller = createMockCaller({ userId: "user-a", db: dbMock });
      await expect(
        caller.workspaceScheduling.cancelMeeting({
          workspaceId: WORKSPACE_ID,
          meetingId: "meeting-1",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.meeting.update).not.toHaveBeenCalled();
    });

    it("bumps SEQUENCE, flips status, and sends METHOD:CANCEL against the original UID", async () => {
      dbMock.meeting.findFirst.mockResolvedValue(storedMeeting as never);
      dbMock.meeting.update.mockResolvedValue({ sequence: 1 } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.cancelMeeting({
        workspaceId: WORKSPACE_ID,
        meetingId: "meeting-1",
      });

      expect(result).toMatchObject({ status: "cancelled", invitesSent: 1 });
      expect(dbMock.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "cancelled", sequence: { increment: 1 } },
        }),
      );
      const call = sendMeetingInviteEmailMock.mock.calls[0]![0] as {
        method: string;
        icsContent: string;
      };
      expect(call.method).toBe("CANCEL");
      expect(call.icsContent).toContain("METHOD:CANCEL");
      expect(call.icsContent).toContain("STATUS:CANCELLED");
      expect(call.icsContent).toContain("UID:uid-1@exponential.im");
      expect(call.icsContent).toContain("SEQUENCE:1");
    });

    it("cancelling an already-cancelled meeting is a no-op", async () => {
      dbMock.meeting.findFirst.mockResolvedValue({
        ...storedMeeting,
        status: "cancelled",
      } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.cancelMeeting({
        workspaceId: WORKSPACE_ID,
        meetingId: "meeting-1",
      });

      expect(result.invitesSent).toBe(0);
      expect(dbMock.meeting.update).not.toHaveBeenCalled();
      expect(sendMeetingInviteEmailMock).not.toHaveBeenCalled();
    });
  });

  describe("suggestSlots", () => {
    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
    });

    it("rejects attendees outside the workspace", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.suggestSlots({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-outsider"],
          durationMinutes: 30,
          rangeStart: at(0),
          rangeEnd: at(24),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects a range longer than 30 days", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.suggestSlots({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          durationMinutes: 30,
          rangeStart: at(0),
          rangeEnd: at(31 * 24),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects an inverted range", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.suggestSlots({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          durationMinutes: 30,
          rangeStart: at(24),
          rangeEnd: at(0),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects a range entirely in the past (no free/busy history mining)", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.suggestSlots({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          durationMinutes: 30,
          rangeStart: new Date(Date.now() - 10 * DAY_MS),
          rangeEnd: new Date(Date.now() - 3 * DAY_MS),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns free slots and flags attendees with no calendar data", async () => {
      memberRoster([ORGANIZER_ID, "user-a", "user-nodata"]);
      // Free/busy read (the structural contract) returns one block for user-a.
      dbMock.calendarEvent.findMany.mockResolvedValue([
        {
          userId: "user-a",
          startsAt: at(9),
          endsAt: at(17),
          isAllDay: false,
          sourceType: "microsoft",
        },
      ] as never);
      // user-nodata has no synced rows at all → truly unknown.
      dbMock.calendarEvent.groupBy.mockResolvedValue([] as never);
      // Work hours off for both attendees — this test is about free/busy
      // (the 07:00–20:00 scheduling window still applies, in UTC here).
      dbMock.user.findMany.mockResolvedValue([
        {
          id: "user-a",
          workHoursEnabled: false,
          workDaysJson: null,
          workHoursStart: null,
          workHoursEnd: null,
          timezone: null,
        },
        {
          id: "user-nodata",
          workHoursEnabled: false,
          workDaysJson: null,
          workHoursStart: null,
          workHoursEnd: null,
          timezone: null,
        },
      ] as never);
      dbMock.user.findUnique.mockResolvedValue({ timezone: "UTC" } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.suggestSlots({
        workspaceId: WORKSPACE_ID,
        attendeeUserIds: ["user-a", "user-nodata"],
        durationMinutes: 60,
        rangeStart: at(8),
        rangeEnd: at(19),
      });

      // 08:00 works; 09:00–17:00 blocked; 17:00 and 17:30 fit before 19:00.
      expect(result.slots.map((s) => s.startsAt.toISOString())).toEqual([
        at(8).toISOString(),
        at(17).toISOString(),
        at(17, 30).toISOString(),
        at(18).toISOString(),
      ]);
      // The organizer rides along in the availability computation and has no
      // synced calendar either — flagged honestly.
      expect(result.availabilityUnknownUserIds).toEqual(["user-nodata", ORGANIZER_ID]);
    });
  });

  describe("availabilityGrid", () => {
    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
    });

    it("rejects attendees outside the workspace", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.availabilityGrid({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-outsider"],
          rangeStart: at(0),
          rangeEnd: at(24),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects ranges beyond its own 10-day cap (tighter than suggestSlots)", async () => {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      await expect(
        caller.workspaceScheduling.availabilityGrid({
          workspaceId: WORKSPACE_ID,
          attendeeUserIds: ["user-a"],
          rangeStart: at(0),
          rangeEnd: at(11 * 24),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns per-attendee cell statuses including the organizer", async () => {
      memberRoster([ORGANIZER_ID, "user-a"]);
      dbMock.calendarEvent.findMany.mockResolvedValue([
        {
          userId: "user-a",
          startsAt: at(9),
          endsAt: at(10),
          isAllDay: false,
          sourceType: "microsoft",
        },
      ] as never);
      dbMock.calendarEvent.groupBy.mockResolvedValue([] as never);
      dbMock.user.findMany.mockResolvedValue([
        {
          id: "user-a",
          workHoursEnabled: false,
          workDaysJson: null,
          workHoursStart: null,
          workHoursEnd: null,
          timezone: null,
        },
      ] as never);
      dbMock.user.findUnique.mockResolvedValue({ timezone: "UTC" } as never);

      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      const result = await caller.workspaceScheduling.availabilityGrid({
        workspaceId: WORKSPACE_ID,
        attendeeUserIds: ["user-a"],
        rangeStart: at(9),
        rangeEnd: at(10),
      });

      const byUser = new Map(result.attendees.map((a) => [a.userId, a.statuses]));
      expect(byUser.get("user-a")).toEqual(["busy", "busy"]);
      expect(byUser.get(ORGANIZER_ID)).toEqual(["free", "free"]);
      // The statuses expose quantized times only — never event details.
      expect(JSON.stringify(result)).not.toContain("title");
    });
  });
});
