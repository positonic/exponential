/**
 * Authz + sequencing tests for the `decision` router (ADR-0060):
 *
 * - `protectedProcedure`, NOT human-only: an agent principal may log a
 *   decision (Zoe reuses the human path, ADR-0016);
 * - reads gate at workspace `view` (a viewer may list), writes at `edit`
 *   (a viewer may not create), non-members are denied on both;
 * - `list` goes through the resolver: workspace-scoped, CONFIRMED only, so
 *   drafts never reach the Decision Log;
 * - a meeting-linked create requires edit access to the meeting;
 * - the create transaction advances `Workspace.decisionCounter` and uses the
 *   returned value as the label number.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Mirrors adr.test.ts.
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
const MEETING_ID = "meeting-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/** Satisfy requireWorkspaceMembership at a given workspace role (null = not a member). */
function withWorkspaceRole(db: DeepMockProxy<PrismaClient>, role: string | null) {
  db.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ userId: USER_ID, workspaceId: WORKSPACE_ID, role } as never) : null,
  );
  db.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID,
    ownerId: "someone-else",
  } as never);
}

/** A project-less meeting in the workspace, owned by someone else. */
function withMeeting(
  db: DeepMockProxy<PrismaClient>,
  overrides: Partial<{ userId: string; workspaceId: string; projectId: string | null }> = {},
) {
  db.transcriptionSession.findUnique.mockResolvedValue({
    id: MEETING_ID,
    userId: "someone-else",
    projectId: null,
    workspaceId: WORKSPACE_ID,
    occurrenceId: null,
    meetingDate: new Date("2026-09-08T07:00:00.000Z"),
    participants: [
      { userId: USER_ID, name: "Dev Fixture", email: "dev@example.test" },
      { userId: null, name: "Pat Reviewer", email: "pat@example.test" },
    ],
    ...overrides,
  } as never);
  // Attendance lookup used by getTranscriptionAccess: not a participant by
  // default so the workspace-role path is what's under test.
  db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
}

/** Run the `$transaction` callback against the same mock. */
function withTransaction(db: DeepMockProxy<PrismaClient>) {
  db.$transaction.mockImplementation((async (fn: (tx: PrismaClient) => Promise<unknown>) =>
    fn(db as unknown as PrismaClient)) as never);
}

describe("decision router", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceActivityEvent.create.mockResolvedValue({} as never);
  });

  describe("membership gating", () => {
    it("denies a non-member on list and create", async () => {
      withWorkspaceRole(db, null);
      await expect(caller(db).decision.list({ workspaceId: WORKSPACE_ID })).rejects.toThrow();
      await expect(
        caller(db).decision.create({ workspaceId: WORKSPACE_ID, statement: "x" }),
      ).rejects.toThrow();
    });

    it("lets a viewer read but not create", async () => {
      withWorkspaceRole(db, "viewer");
      db.decision.findMany.mockResolvedValue([] as never);
      await expect(caller(db).decision.list({ workspaceId: WORKSPACE_ID })).resolves.toEqual([]);
      await expect(
        caller(db).decision.create({ workspaceId: WORKSPACE_ID, statement: "x" }),
      ).rejects.toThrow(/insufficient/i);
      expect(db.decision.create).not.toHaveBeenCalled();
    });

    it("is NOT human-only: an agent principal member may create (ADR-0016)", async () => {
      // humanOnlyProcedure would read user.isAgent; the decision router never asks.
      db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
      withWorkspaceRole(db, "member");
      withTransaction(db);
      db.workspace.update.mockResolvedValue({ decisionCounter: 7 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1",
        number: 7,
        statement: "Ship it",
        status: "ACCEPTED",
        source: "AGENT",
        transcriptionSessionId: null,
      } as never);

      const result = await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Ship it",
        status: "ACCEPTED",
        source: "AGENT",
      });
      expect(result.label).toBe("D-0007");
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("list goes through the resolver", () => {
    it("scopes to the workspace and CONFIRMED rows — drafts never reach the log", async () => {
      withWorkspaceRole(db, "member");
      db.decision.findMany.mockResolvedValue([] as never);

      await caller(db).decision.list({ workspaceId: WORKSPACE_ID, statuses: ["OPEN"] });

      const args = db.decision.findMany.mock.calls[0]![0]!;
      const where = args.where as { AND: Array<Record<string, unknown>> };
      const accessWhere = where.AND[0] as { workspaceId: string; reviewState: string; OR: unknown[] };
      expect(accessWhere.workspaceId).toBe(WORKSPACE_ID);
      expect(accessWhere.reviewState).toBe("CONFIRMED");
      expect(accessWhere.OR).toHaveLength(3);
      expect(where.AND).toContainEqual({ status: { in: ["OPEN"] } });
    });
  });

  describe("create", () => {
    it("advances Workspace.decisionCounter inside the transaction and uses the returned number", async () => {
      withWorkspaceRole(db, "member");
      withTransaction(db);
      db.workspace.update.mockResolvedValue({ decisionCounter: 42 } as never);
      db.decision.create.mockImplementation(((args: { data: { number: number } }) =>
        Promise.resolve({
          id: "dec-42",
          number: args.data.number,
          statement: "Use tRPC",
          status: "PROPOSED",
          source: "MANUAL",
          transcriptionSessionId: null,
        })) as never);

      const result = await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Use tRPC",
      });

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WORKSPACE_ID },
          data: { decisionCounter: { increment: 1 } },
        }),
      );
      expect(db.decision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            number: 42,
            reviewState: "CONFIRMED",
            source: "MANUAL",
            createdById: USER_ID,
          }),
        }),
      );
      expect(result.label).toBe("D-0042");
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: "decision",
            entityId: "dec-42",
            action: "created",
          }),
        }),
      );
    });

    it("refuses a birth state of SUPERSEDED or DEPRECATED", async () => {
      withWorkspaceRole(db, "member");
      await expect(
        caller(db).decision.create({
          workspaceId: WORKSPACE_ID,
          statement: "x",
          status: "SUPERSEDED",
        }),
      ).rejects.toThrow(/cannot start/i);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("meeting-linked: defaults decided-at, deciders, source from the meeting", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db);
      withTransaction(db);
      db.workspace.update.mockResolvedValue({ decisionCounter: 1 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1",
        number: 1,
        statement: "Park it",
        status: "ACCEPTED",
        source: "MEETING",
        transcriptionSessionId: MEETING_ID,
      } as never);

      await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Park it",
        status: "ACCEPTED",
        transcriptionSessionId: MEETING_ID,
        evidence: [{ turnIndex: 3, speaker: "Pat Reviewer", text: "Let's park it." }],
      });

      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.source).toBe("MEETING");
      expect(data.decidedAt).toEqual(new Date("2026-09-08T07:00:00.000Z"));
      expect(data.transcriptionSessionId).toBe(MEETING_ID);
      expect(data.evidence).toEqual([
        { turnIndex: 3, speaker: "Pat Reviewer", startTime: null, text: "Let's park it." },
      ]);
      expect(data.deciders).toEqual({
        create: [
          { userId: USER_ID, name: "Dev Fixture", email: "dev@example.test" },
          { userId: null, name: "Pat Reviewer", email: "pat@example.test" },
        ],
      });
    });

    it("meeting-linked: a workspace viewer who may see the meeting still cannot log from it", async () => {
      // Viewer role fails the workspace `edit` gate before the meeting is even read.
      withWorkspaceRole(db, "viewer");
      withMeeting(db);
      await expect(
        caller(db).decision.create({
          workspaceId: WORKSPACE_ID,
          statement: "x",
          transcriptionSessionId: MEETING_ID,
        }),
      ).rejects.toThrow();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("meeting-linked: a member without project access to a restricted-project meeting is denied", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db, { projectId: "proj-restricted" });
      // getProjectAccess: restricted project, caller is neither creator nor member.
      db.project.findUnique.mockResolvedValue({
        id: "proj-restricted",
        createdById: "someone-else",
        isPublic: false,
        isRestricted: true,
        teamId: null,
        workspaceId: WORKSPACE_ID,
      } as never);
      db.projectMember.findUnique.mockResolvedValue(null);
      db.projectMember.findFirst.mockResolvedValue(null);
      db.teamUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);

      await expect(
        caller(db).decision.create({
          workspaceId: WORKSPACE_ID,
          statement: "x",
          transcriptionSessionId: MEETING_ID,
        }),
      ).rejects.toThrow(/edit access to this meeting/i);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("meeting-linked: refuses a meeting from another workspace", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db, { workspaceId: "ws-other" });
      await expect(
        caller(db).decision.create({
          workspaceId: WORKSPACE_ID,
          statement: "x",
          transcriptionSessionId: MEETING_ID,
        }),
      ).rejects.toThrow(/meeting not found/i);
    });
  });

  describe("listForMeeting", () => {
    it("includes drafts only for people who may edit the meeting", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db);
      db.decision.findMany.mockResolvedValue([] as never);

      const asMember = await caller(db).decision.listForMeeting({
        transcriptionSessionId: MEETING_ID,
      });
      expect(asMember.canLogDecision).toBe(true);
      let where = db.decision.findMany.mock.calls[0]![0]!.where as { reviewState: unknown };
      expect(where.reviewState).toEqual({ in: ["CONFIRMED", "DRAFT"] });

      db.decision.findMany.mockClear();
      withWorkspaceRole(db, "viewer");
      const asViewer = await caller(db).decision.listForMeeting({
        transcriptionSessionId: MEETING_ID,
      });
      expect(asViewer.canLogDecision).toBe(false);
      where = db.decision.findMany.mock.calls[0]![0]!.where as { reviewState: unknown };
      expect(where.reviewState).toBe("CONFIRMED");
    });

    it("hides the meeting entirely from someone who cannot view it", async () => {
      withWorkspaceRole(db, null);
      withMeeting(db);
      await expect(
        caller(db).decision.listForMeeting({ transcriptionSessionId: MEETING_ID }),
      ).rejects.toThrow(/meeting not found/i);
    });
  });
});
