/**
 * Authz + behaviour tests for the `ceremony` router (ADR-0059):
 *
 * - reads (`list`, `get`, `listOccurrences`) gate on workspace membership —
 *   a non-member is denied, a viewer may read;
 * - ceremony mutations (`create`) gate at `edit` — a viewer is denied;
 * - `attachMeeting` / `detachMeeting` gate on `canEditTranscription` for the
 *   meeting and refuse an occurrence outside the meeting's workspace;
 * - `get` returns a linked recording the caller cannot view as an
 *   existence-only stub;
 * - `create` derives the slug, refuses duplicates, and seeds occurrences.
 *
 * Mocked Prisma only (`mockDeep<PrismaClient>()`); no real DB.
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
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
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

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/** Satisfy requireWorkspaceMembership at a given workspace role. */
function withWorkspaceRole(db: DeepMockProxy<PrismaClient>, role: string) {
  db.workspaceUser.findUnique.mockResolvedValue({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role,
  } as never);
  db.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, ownerId: "someone-else" } as never);
}

function asNonMember(db: DeepMockProxy<PrismaClient>) {
  db.workspaceUser.findUnique.mockResolvedValue(null);
  db.teamUser.findFirst.mockResolvedValue(null);
  db.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, ownerId: "someone-else" } as never);
}

const cadence = {
  cadenceRule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
  timezone: "Europe/Berlin",
  startsOn: new Date("2026-09-01T00:00:00.000Z"),
};

describe("ceremony router", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  describe("reads gate on workspace membership", () => {
    it("denies a non-member on list, get and listOccurrences", async () => {
      asNonMember(db);
      const c = caller(db);
      await expect(c.ceremony.list({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(c.ceremony.get({ workspaceId: WORKSPACE_ID, id: "cer-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        c.ceremony.listOccurrences({ workspaceId: WORKSPACE_ID, from: new Date(), to: new Date() }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets a viewer list active ceremonies", async () => {
      withWorkspaceRole(db, "viewer");
      db.ceremony.findMany.mockResolvedValue([{ id: "cer-1", name: "Daily Standup" }] as never);
      const rows = await caller(db).ceremony.list({ workspaceId: WORKSPACE_ID });
      expect(rows).toHaveLength(1);
      expect(db.ceremony.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID, isActive: true } }),
      );
    });
  });

  describe("create", () => {
    const input = {
      workspaceId: WORKSPACE_ID,
      name: "Daily Standup",
      kind: "STANDUP" as const,
      ...cadence,
      participantUserIds: ["u-2", "u-2", "u-3"],
    };

    it("denies a viewer", async () => {
      withWorkspaceRole(db, "viewer");
      await expect(caller(db).ceremony.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.ceremony.create).not.toHaveBeenCalled();
    });

    it("rejects an unparseable cadence rule with BAD_REQUEST", async () => {
      withWorkspaceRole(db, "member");
      await expect(
        caller(db).ceremony.create({ ...input, cadenceRule: "FREQ=SOMETIMES" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses a duplicate slug", async () => {
      withWorkspaceRole(db, "member");
      db.ceremony.findUnique.mockResolvedValue({ id: "cer-existing" } as never);
      await expect(caller(db).ceremony.create(input)).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("derives the slug, de-duplicates participants, defaults the owner and seeds occurrences", async () => {
      withWorkspaceRole(db, "member");
      db.ceremony.findUnique.mockResolvedValue(null);
      db.ceremony.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "cer-1",
          workspaceId: WORKSPACE_ID,
          ...args.data,
          durationMinutes: 30,
          leadTimeHours: 24,
          agendaTemplate: [],
        })) as never);
      db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 2 });
      db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-next", scheduledStart: new Date("2026-09-14T07:00:00Z") } as never);
      db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);

      const result = await caller(db).ceremony.create(input);

      expect(result.ceremony.slug).toBe("daily-standup");
      expect(result.occurrencesCreated).toBe(2);
      // One `ceremony_occurrence`/`created` event per expansion, not per row.
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          entityType: "ceremony_occurrence",
          entityId: "occ-next",
          action: "created",
          metadata: expect.objectContaining({ name: "2 occurrences of Daily Standup", count: 2 }),
        }),
      });
      const createArgs = db.ceremony.create.mock.calls[0]![0];
      expect(createArgs.data.ownerId).toBe(USER_ID);
      expect(createArgs.data.createdById).toBe(USER_ID);
      expect(createArgs.data.participants).toEqual({ create: [{ userId: "u-2" }, { userId: "u-3" }] });
      const occArgs = db.ceremonyOccurrence.createMany.mock.calls[0]![0];
      expect(occArgs.skipDuplicates).toBe(true);
      const rows = occArgs.data as Array<{ ceremonyId: string; workspaceId: string; definitionSnapshot: { slug: string } }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toMatchObject({ ceremonyId: "cer-1", workspaceId: WORKSPACE_ID });
      expect(rows[0]!.definitionSnapshot.slug).toBe("daily-standup");
    });
  });

  describe("get", () => {
    it("returns a linked recording the caller cannot view as an existence-only stub", async () => {
      withWorkspaceRole(db, "member");
      db.ceremony.findFirst.mockResolvedValue({ id: "cer-1", workspaceId: WORKSPACE_ID, name: "Daily Standup", participants: [] } as never);
      db.ceremonyOccurrence.findMany
        .mockResolvedValueOnce([] as never) // upcoming
        .mockResolvedValueOnce([
          {
            id: "occ-1",
            scheduledStart: new Date("2026-09-07T07:00:00Z"),
            status: "CAPTURED",
            recordedMeetings: [{ id: "m-visible" }, { id: "m-hidden" }],
          },
        ] as never); // past
      db.transcriptionSession.findMany.mockResolvedValue([
        { id: "m-visible", title: "Standup", meetingDate: new Date(), processedAt: null },
      ] as never);

      const res = await caller(db).ceremony.get({ workspaceId: WORKSPACE_ID, id: "cer-1" });

      expect(res.occurrences[0]!.recordedMeetings).toEqual([
        expect.objectContaining({ id: "m-visible", exists: true, title: "Standup" }),
        { id: "m-hidden", exists: true, title: null, meetingDate: null, processedAt: null },
      ]);
      // Past and upcoming are fetched separately so neither can crowd out the other.
      expect(db.ceremonyOccurrence.findMany).toHaveBeenCalledTimes(2);
      // The visibility filter came from the transcription resolver.
      const where = db.transcriptionSession.findMany.mock.calls[0]![0]!.where!;
      expect(where).toHaveProperty("OR");
      expect(where.id).toEqual({ in: ["m-visible", "m-hidden"] });
    });
  });

  describe("attachMeeting / detachMeeting", () => {
    const meeting = { id: "m-1", userId: "someone-else", projectId: null, workspaceId: WORKSPACE_ID };

    it("denies a caller who can only view the meeting", async () => {
      db.transcriptionSession.findUnique.mockResolvedValue(meeting as never);
      // Not owner, not participant, project-less: workspace role viewer → no edit.
      db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
      withWorkspaceRole(db, "viewer");
      await expect(
        caller(db).ceremony.attachMeeting({ meetingId: "m-1", occurrenceId: "occ-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(db).ceremony.detachMeeting({ meetingId: "m-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.transcriptionSession.update).not.toHaveBeenCalled();
    });

    it("refuses an occurrence from another workspace", async () => {
      db.transcriptionSession.findUnique.mockResolvedValue({ ...meeting, userId: USER_ID } as never);
      db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
      withWorkspaceRole(db, "member");
      db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", workspaceId: "ws-other", scheduledStart: new Date(), ceremony: { name: "Daily Standup", timezone: "Europe/Berlin" } } as never);
      await expect(
        caller(db).ceremony.attachMeeting({ meetingId: "m-1", occurrenceId: "occ-1" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.transcriptionSession.update).not.toHaveBeenCalled();
    });

    it("links and unlinks for the meeting owner", async () => {
      db.transcriptionSession.findUnique.mockResolvedValue({ ...meeting, userId: USER_ID } as never);
      db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
      withWorkspaceRole(db, "member");
      db.ceremonyOccurrence.findUnique.mockResolvedValue({
        id: "occ-1",
        workspaceId: WORKSPACE_ID,
        scheduledStart: new Date("2026-09-08T07:00:00Z"),
        ceremony: { name: "Daily Standup", timezone: "Europe/Berlin" },
      } as never);
      db.transcriptionSession.update.mockResolvedValue({ title: "Standup" } as never);
      db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);

      const c = caller(db);
      await expect(c.ceremony.attachMeeting({ meetingId: "m-1", occurrenceId: "occ-1" })).resolves.toEqual({
        meetingId: "m-1",
        occurrenceId: "occ-1",
      });
      // Manual attach emits `captured` against the occurrence, naming the meeting.
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: "ceremony_occurrence",
          entityId: "occ-1",
          action: "captured",
          userId: USER_ID,
          metadata: expect.objectContaining({ meetingId: "m-1", meetingTitle: "Standup", via: "manual" }),
        }),
      });
      expect(db.transcriptionSession.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: "m-1" }, data: { occurrenceId: "occ-1" } }),
      );
      await c.ceremony.detachMeeting({ meetingId: "m-1" });
      expect(db.transcriptionSession.update).toHaveBeenLastCalledWith({
        where: { id: "m-1" },
        data: { occurrenceId: null },
      });
    });
  });

  describe("importDefinitions / backfillAttachments gate at owner/admin", () => {
    const definition = {
      slug: "daily-standup",
      name: "Daily Standup",
      kind: "STANDUP" as const,
      cadenceRule: cadence.cadenceRule,
      ownerName: "Andi",
      participantNames: ["Zed"],
    };

    it("denies a plain member on both", async () => {
      withWorkspaceRole(db, "member");
      const c = caller(db);
      await expect(
        c.ceremony.importDefinitions({ workspaceId: WORKSPACE_ID, definitions: [definition], timezone: "Europe/Berlin", startsOn: new Date("2026-06-01") }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(c.ceremony.backfillAttachments({ workspaceId: WORKSPACE_ID, dryRun: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.ceremony.create).not.toHaveBeenCalled();
      expect(db.transcriptionSession.update).not.toHaveBeenCalled();
    });

    it("upserts by slug, resolves names against members and reports unresolved ones", async () => {
      withWorkspaceRole(db, "admin");
      db.workspaceUser.findMany.mockResolvedValue([{ user: { id: "u-andi", name: "Andi", email: "andi@x.test" } }] as never);
      db.ceremony.findUnique.mockResolvedValue(null);
      db.ceremony.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "cer-1", workspaceId: WORKSPACE_ID, ...args.data, durationMinutes: 30, leadTimeHours: 24, agendaTemplate: [] })) as never);
      db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 5 });

      const res = await caller(db).ceremony.importDefinitions({
        workspaceId: WORKSPACE_ID,
        definitions: [definition],
        timezone: "Europe/Berlin",
        startsOn: new Date("2026-06-01"),
      });

      expect(res).toEqual([{ slug: "daily-standup", action: "created", occurrencesCreated: 5, unresolved: ["Zed"] }]);
      const data = db.ceremony.create.mock.calls[0]![0].data;
      expect(data.ownerId).toBe("u-andi");
      expect(data.timezone).toBe("Europe/Berlin");
      expect(data.participants).toEqual({ create: [] });
    });

    it("re-import keeps the owner and participants unless the file resolves them", async () => {
      withWorkspaceRole(db, "admin");
      db.workspaceUser.findMany.mockResolvedValue([] as never);
      const existingRow = { id: "cer-1", workspaceId: WORKSPACE_ID, name: "Daily Standup", slug: "daily-standup", kind: "STANDUP", aliases: ["Daily Standup", "Standup"], startsOn: new Date("2026-06-01"), cadenceRule: cadence.cadenceRule, timezone: "Europe/Berlin", durationMinutes: 15, leadTimeHours: 12, agendaTemplate: [{ key: "blockers", type: "blockers", title: "Blockers" }] };
      db.ceremony.findUnique.mockResolvedValue(existingRow as never);
      db.ceremony.update.mockResolvedValue(existingRow as never);
      db.ceremonyOccurrence.createMany.mockResolvedValue({ count: 0 });

      // A partial file: slug + name only, plus an owner that does not resolve.
      const res = await caller(db).ceremony.importDefinitions({
        workspaceId: WORKSPACE_ID,
        definitions: [{ slug: "daily-standup", name: "Daily Standup (renamed)", ownerName: "Nobody" }],
      });

      expect(res[0]).toMatchObject({ action: "updated", unresolved: ["Nobody"] });
      const data = db.ceremony.update.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data.name).toBe("Daily Standup (renamed)");
      // Nothing the file did not mention is touched: no Zod defaults leak in.
      for (const key of ["ownerId", "participants", "aliases", "kind", "agendaTemplate", "durationMinutes", "leadTimeHours"]) {
        expect(data).not.toHaveProperty(key);
      }
      // Timezone and anchor come from the existing row when the file has none.
      expect(data.timezone).toBe("Europe/Berlin");
      expect(db.ceremony.create).not.toHaveBeenCalled();
    });

    it("refuses a partial definition for a ceremony that does not exist yet", async () => {
      withWorkspaceRole(db, "admin");
      db.workspaceUser.findMany.mockResolvedValue([] as never);
      db.ceremony.findUnique.mockResolvedValue(null);
      await expect(
        caller(db).ceremony.importDefinitions({
          workspaceId: WORKSPACE_ID,
          definitions: [{ slug: "brand-new", name: "Brand new" }],
          timezone: "Europe/Berlin",
          startsOn: new Date("2026-06-01"),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.ceremony.create).not.toHaveBeenCalled();
    });

    it("dry-run backfill reports matches without writing", async () => {
      withWorkspaceRole(db, "owner");
      db.ceremony.findMany.mockResolvedValue([]);
      db.transcriptionSession.findMany.mockResolvedValue([
        { id: "m-1", title: "Daily Standup", meetingDate: null, createdAt: new Date("2026-09-08T10:00:00Z"), workspaceId: WORKSPACE_ID, userId: USER_ID },
      ] as never);
      db.ceremonyOccurrence.findMany.mockResolvedValue([
        { id: "occ-1", workspaceId: WORKSPACE_ID, scheduledStart: new Date("2026-09-08T07:30:00Z"), ceremony: { name: "Daily Standup", timezone: "Europe/Berlin", aliases: ["Daily Standup"], durationMinutes: 15 }, scheduledMeeting: null },
      ] as never);
      const res = await caller(db).ceremony.backfillAttachments({ workspaceId: WORKSPACE_ID, dryRun: true });

      // One occurrence load for the whole workspace, not one per recording.
      expect(db.ceremonyOccurrence.findMany).toHaveBeenCalledTimes(1);

      expect(res.dryRun).toBe(true);
      expect(res.matched).toBe(1);
      expect(res.rows[0]).toMatchObject({ meetingId: "m-1", occurrenceId: "occ-1", ceremonyName: "Daily Standup" });
      expect(res.rows[0]!.reason).toContain("anchored on title date or import date");
      expect(db.transcriptionSession.update).not.toHaveBeenCalled();
    });
  });

  describe("generateAgenda gates on the ceremony owner (or workspace owner/admin)", () => {
    it("denies a plain member who does not own the ceremony", async () => {
      withWorkspaceRole(db, "member");
      db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-1", ceremony: { ownerId: "someone-else" } } as never);
      await expect(
        caller(db).ceremony.generateAgenda({ workspaceId: WORKSPACE_ID, occurrenceId: "occ-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
    });

    it("lets the owner generate: runs the template sections and stores the snapshot", async () => {
      withWorkspaceRole(db, "member");
      db.ceremonyOccurrence.findFirst
        .mockResolvedValueOnce({ id: "occ-1", ceremony: { ownerId: USER_ID } } as never) // gate
        .mockResolvedValueOnce(null as never); // previous occurrence
      db.ceremonyOccurrence.findUnique.mockResolvedValue({
        id: "occ-1",
        scheduledStart: new Date("2026-09-11T07:00:00Z"),
        agenda: null,
        ceremony: {
          id: "cer-1",
          workspaceId: WORKSPACE_ID,
          teamId: null,
          projectId: null,
          productId: null,
          agendaTemplate: [{ key: "okr", type: "okr_review", title: "OKRs" }, { key: "free", type: "free_text", title: "Else" }],
          participants: [],
          workspace: { slug: "ws" },
        },
      } as never);
      db.keyResult.findMany.mockResolvedValue([
        { id: "kr-1", title: "KR", status: "on-track", statusOverride: null, statusOverrideAt: null, currentValue: 0, targetValue: 1, unit: "count", goalId: 1, goal: { id: 1, title: "G" }, checkIns: [] },
      ] as never);
      db.ceremonyOccurrence.update.mockResolvedValue({} as never);

      const res = await caller(db).ceremony.generateAgenda({ workspaceId: WORKSPACE_ID, occurrenceId: "occ-1" });

      expect(res.itemCount).toBe(1);
      expect(res.agenda.sections.map((s) => [s.key, s.items.length])).toEqual([["okr", 1], ["free", 0]]);
      const data = db.ceremonyOccurrence.update.mock.calls[0]![0].data as { agendaGeneratedAt: Date; agenda: { sections: unknown[] } };
      expect(data.agendaGeneratedAt).toBeInstanceOf(Date);
      expect(data.agenda.sections).toHaveLength(2);
    });
  });
});
