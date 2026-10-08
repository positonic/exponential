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

const { generateAgendaMock, projectAccessMock } = vi.hoisted(() => ({
  generateAgendaMock: vi.fn(),
  projectAccessMock: vi.fn(),
}));
vi.mock("~/server/services/ceremonies/agenda/generateAgenda", () => ({
  generateAgenda: generateAgendaMock,
}));
vi.mock("~/server/services/access/resolvers/projectResolver", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("~/server/services/access/resolvers/projectResolver")
  >();
  return { ...original, getProjectAccess: projectAccessMock };
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
    generateAgendaMock.mockReset().mockResolvedValue({ occurrenceId: "occ-1", agenda: {}, itemCount: 0 });
    projectAccessMock.mockReset().mockResolvedValue({ isWorkspaceMember: true });
    dbMock.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(dbMock)) as never);
  });

  /** Users by id, for the organizer lookup and member resolution. */
  function attendeeUsers(users: Array<{ id: string; name: string | null; email: string | null }>) {
    dbMock.user.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(users.find((u) => u.id === args.where.id) ? { ...users.find((u) => u.id === args.where.id), timezone: null } : null)) as never);
  }

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
        workspace: { slug: "acme" },
        attendees: [
          { userId: "user-a", name: "A", email: "a@example.com" },
          { userId: ORGANIZER_ID, name: "Org", email: "org@example.com" },
        ],
      } as never);
      attendeeUsers([
        { id: "user-a", name: "A", email: "A@Example.com" },
        { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      ]);

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

      // The organizer rides along as an attendee; rows carry a lowercased email and name.
      const createArg = dbMock.meeting.create.mock.calls[0]![0] as {
        data: { attendees: { create: { userId: string; email: string; name: string | null }[] } };
      };
      expect(createArg.data.attendees.create).toEqual(
        expect.arrayContaining([
          { userId: "user-a", contactId: null, email: "a@example.com", name: "A" },
          { userId: ORGANIZER_ID, contactId: null, email: "org@example.com", name: "Org" },
        ]),
      );
      // No project, no ceremony: exactly a calendar booking.
      expect(dbMock.ceremony.create).not.toHaveBeenCalled();
      expect(dbMock.ceremonyOccurrence.create).not.toHaveBeenCalled();
      expect(generateAgendaMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ceremonyId: null, occurrenceId: null });
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
        workspace: { slug: "acme" },
        attendees: [{ userId: "user-a", name: "A", email: "a@example.com" }],
      } as never);
      attendeeUsers([
        { id: "user-a", name: "A", email: "a@example.com" },
        { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      ]);

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

  describe("createMeeting attendees of three kinds", () => {
    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
      memberRoster([ORGANIZER_ID, "user-a"]);
      attendeeUsers([
        { id: "user-a", name: "A", email: "a@example.com" },
        { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
        { id: "user-noemail", name: "No Mail", email: null },
      ]);
      dbMock.meeting.create.mockImplementation(((args: { data: { attendees: { create: unknown[] } } }) =>
        Promise.resolve({
          id: "meeting-1",
          title: "Partner sync",
          description: null,
          location: null,
          startsAt: at(9),
          endsAt: at(10),
          icalUid: "uid-1@exponential.im",
          sequence: 0,
          status: "confirmed",
          organizer: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
          workspace: { slug: "acme" },
          attendees: args.data.attendees.create,
        })) as never);
    });

    function book(attendees: Array<Record<string, string>>, extra: Record<string, unknown> = {}) {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      return caller.workspaceScheduling.createMeeting({
        workspaceId: WORKSPACE_ID,
        title: "Partner sync",
        startsAt: at(9),
        endsAt: at(10),
        attendees,
        ...extra,
      });
    }

    it("writes a member, a CRM contact and a new email as attendee rows, and invites all of them", async () => {
      dbMock.crmContact.findUnique.mockImplementation(((args: { where: { id?: string } }) =>
        Promise.resolve(
          args.where.id === "contact-1"
            ? { id: "contact-1", workspaceId: WORKSPACE_ID, firstName: "Zineb", lastName: null, email: null }
            : null,
        )) as never);
      dbMock.crmContact.create.mockResolvedValue({ id: "contact-new", firstName: "Ada", lastName: null } as never);

      const result = await book([
        { userId: "user-a" },
        { contactId: "contact-1", email: "Zineb@Partner.com" },
        { name: "Ada", email: "ada@partner.com" },
      ]);

      const createArg = dbMock.meeting.create.mock.calls[0]![0] as {
        data: { attendees: { create: unknown[] } };
      };
      expect(createArg.data.attendees.create).toEqual([
        { userId: ORGANIZER_ID, contactId: null, email: "org@example.com", name: "Org" },
        { userId: "user-a", contactId: null, email: "a@example.com", name: "A" },
        { userId: null, contactId: "contact-1", email: "zineb@partner.com", name: "Zineb" },
        { userId: null, contactId: "contact-new", email: "ada@partner.com", name: "Ada" },
      ]);
      expect(result.invitesSent).toBe(4);
      const ics = (sendMeetingInviteEmailMock.mock.calls[0]![0] as { icsContent: string }).icsContent.replace(/\r\n /g, "");
      expect(ics).toContain("mailto:ada@partner.com");
      expect(ics).toContain("mailto:zineb@partner.com");
    });

    it("refuses a person who resolves to no email (BAD_REQUEST) and books nothing", async () => {
      await expect(book([{ name: "Nameless" }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
      memberRoster([ORGANIZER_ID, "user-noemail"]);
      await expect(book([{ userId: "user-noemail" }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.meeting.create).not.toHaveBeenCalled();
    });

    it("refuses an empty attendee list", async () => {
      await expect(book([])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("dedupes by email, keeping the member row", async () => {
      dbMock.crmContact.findUnique.mockResolvedValue({ id: "contact-a", firstName: "A", lastName: null } as never);
      await book([{ userId: "user-a" }, { email: "A@example.com" }], { attendeeUserIds: ["user-a"] });
      const createArg = dbMock.meeting.create.mock.calls[0]![0] as {
        data: { attendees: { create: Array<{ email: string; userId: string | null }> } };
      };
      expect(createArg.data.attendees.create.filter((a) => a.email === "a@example.com")).toEqual([
        expect.objectContaining({ userId: "user-a" }),
      ]);
    });

    it("with a project, only member attendees become ceremony participants", async () => {
      dbMock.project.findFirst.mockResolvedValue({ id: "project-1" } as never);
      dbMock.ceremony.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "cer-1", ...args.data })) as never);
      dbMock.ceremonyOccurrence.create.mockResolvedValue({ id: "occ-1" } as never);
      dbMock.crmContact.findUnique.mockResolvedValue(null as never);
      dbMock.crmContact.create.mockResolvedValue({ id: "contact-new", firstName: "Ada", lastName: null } as never);

      await book([{ userId: "user-a" }, { name: "Ada", email: "ada@partner.com" }], { projectId: "project-1" });

      const ceremonyArg = dbMock.ceremony.create.mock.calls[0]![0] as {
        data: { participants: { create: { userId: string }[] } };
      };
      expect(ceremonyArg.data.participants.create.map((p) => p.userId).sort()).toEqual([ORGANIZER_ID, "user-a"].sort());
    });
  });

  describe("createMeeting with a project (one-off ceremony)", () => {
    const PROJECT_ID = "project-1";
    const booked = {
      id: "meeting-1",
      title: "Launch scope",
      description: null,
      location: null,
      startsAt: at(9),
      endsAt: at(9, 45),
      icalUid: "uid-1@exponential.im",
      sequence: 0,
      status: "confirmed",
      organizer: { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      workspace: { slug: "acme" },
      attendees: [
        { userId: "user-a", name: "A", email: "a@example.com" },
        { userId: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      ],
    };

    beforeEach(() => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({ role: "member" } as never);
      memberRoster([ORGANIZER_ID, "user-a"]);
      attendeeUsers([
        { id: "user-a", name: "A", email: "a@example.com" },
        { id: ORGANIZER_ID, name: "Org", email: "org@example.com" },
      ]);
      dbMock.project.findFirst.mockResolvedValue({ id: PROJECT_ID } as never);
      dbMock.meeting.create.mockResolvedValue(booked as never);
      dbMock.ceremony.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "cer-1", ...args.data })) as never);
      dbMock.ceremonyOccurrence.create.mockResolvedValue({ id: "occ-1" } as never);
    });

    function book(extra: Record<string, unknown> = {}) {
      const caller = createMockCaller({ userId: ORGANIZER_ID, db: dbMock });
      return caller.workspaceScheduling.createMeeting({
        workspaceId: WORKSPACE_ID,
        title: "Launch scope",
        projectId: PROJECT_ID,
        startsAt: at(9),
        endsAt: at(9, 45),
        attendeeUserIds: ["user-a"],
        purpose: "Agree the Q4 launch scope",
        ...extra,
      });
    }

    it("writes ceremony, participants, project link and occurrence in the booking transaction", async () => {
      const result = await book();

      expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
      const ceremonyArg = dbMock.ceremony.create.mock.calls[0]![0] as {
        data: Record<string, unknown> & {
          participants: { create: { userId: string }[] };
          projects: { create: { projectId: string }[] };
          agendaTemplate: Array<{ type: string; config?: { items: string[] } }>;
        };
      };
      expect(ceremonyArg.data).toMatchObject({
        workspaceId: WORKSPACE_ID,
        name: "Launch scope",
        aliases: ["Launch scope"],
        kind: "CUSTOM",
        purpose: "Agree the Q4 launch scope",
        cadenceRule: null,
        isOneOff: true,
        timezone: "UTC",
        durationMinutes: 45,
        ownerId: ORGANIZER_ID,
        includeProjects: true,
      });
      expect(ceremonyArg.data.slug).toMatch(/^launch-scope-[a-z0-9]+$/);
      expect(ceremonyArg.data.participants.create.map((p) => p.userId).sort()).toEqual(
        [ORGANIZER_ID, "user-a"].sort(),
      );
      expect(ceremonyArg.data.projects.create).toEqual([{ projectId: PROJECT_ID }]);
      // Review progress by default, purpose as item 1 of the free text section.
      expect(ceremonyArg.data.agendaTemplate.map((s) => s.type)).toEqual([
        "project_state",
        "okr_review",
        "blockers",
        "free_text",
      ]);
      expect(ceremonyArg.data.agendaTemplate[3]!.config).toEqual({ items: ["Agree the Q4 launch scope"] });

      expect(dbMock.ceremonyOccurrence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ceremonyId: "cer-1",
            workspaceId: WORKSPACE_ID,
            scheduledStart: at(9),
            scheduledEnd: at(9, 45),
            scheduledMeetingId: "meeting-1",
          }) as unknown,
        }),
      );
      expect(generateAgendaMock).toHaveBeenCalledTimes(1);
      expect(generateAgendaMock).toHaveBeenCalledWith(dbMock, "occ-1");
      expect(result).toMatchObject({ ceremonyId: "cer-1", occurrenceId: "occ-1" });
    });

    it("sends an invite whose DESCRIPTION carries the purpose and the occurrence link", async () => {
      await book();

      const call = sendMeetingInviteEmailMock.mock.calls[0]![0] as {
        icsContent: string;
        description: string;
        url: string;
      };
      const unfolded = call.icsContent.replace(/\r\n /g, "");
      expect(unfolded).toContain("DESCRIPTION:Agree the Q4 launch scope\\n\\n");
      expect(unfolded).toMatch(/\/w\/acme\/ceremonies\/cer-1\/occ-1/);
      expect(call.description).toBe("Agree the Q4 launch scope");
      expect(call.url).toMatch(/\/w\/acme\/ceremonies\/cer-1\/occ-1$/);
    });

    it("defaults the purpose to the title and honours ticked sections", async () => {
      await book({ purpose: undefined, agendaSectionTypes: ["blockers"] });
      const ceremonyArg = dbMock.ceremony.create.mock.calls[0]![0] as {
        data: { purpose: string; agendaTemplate: Array<{ type: string; config?: unknown }> };
      };
      expect(ceremonyArg.data.purpose).toBe("Launch scope");
      expect(ceremonyArg.data.agendaTemplate.map((s) => s.type)).toEqual(["blockers", "free_text"]);
    });

    it("refuses recurring-only agenda sections", async () => {
      await expect(book({ agendaSectionTypes: ["carried_over"] })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(dbMock.meeting.create).not.toHaveBeenCalled();
    });

    it("refuses a project outside the workspace or out of the organizer's reach", async () => {
      dbMock.project.findFirst.mockResolvedValue(null as never);
      await expect(book()).rejects.toMatchObject({ code: "BAD_REQUEST" });

      dbMock.project.findFirst.mockResolvedValue({ id: PROJECT_ID } as never);
      projectAccessMock.mockResolvedValue({ isRestricted: true, isWorkspaceMember: true });
      await expect(book()).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.meeting.create).not.toHaveBeenCalled();
    });

    it("a failed agenda generation keeps the booking and still sends invites", async () => {
      generateAgendaMock.mockRejectedValue(new Error("section query failed"));
      const result = await book();
      expect(result.occurrenceId).toBe("occ-1");
      expect(sendMeetingInviteEmailMock).toHaveBeenCalledTimes(2);
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
      attendees: [{ userId: "user-a", name: "A", email: "a@example.com" }],
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
