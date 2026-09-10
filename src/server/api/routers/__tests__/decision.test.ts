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

const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

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
/** Turn indices 0-3; turn 3 is "Let's park it." by Pat Reviewer. */
const MEETING_TRANSCRIPT = [
  "Dev Fixture: Morning. Blockers first?",
  "Pat Reviewer: The accordion PR is waiting on a review.",
  "Dev Fixture: Should the peek drawer ship before the hover affordances?",
  "Pat Reviewer: Let's park it.",
].join("\n");

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
    // Evidence turns are checked against the real transcript, so the fixture
    // needs one. Turn 3 is the quote the create tests cite.
    transcription: MEETING_TRANSCRIPT,
    sentencesJson: null,
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
      // The creator lookup (deciders default) may read the user, but never isAgent.
      for (const call of db.user.findUnique.mock.calls) {
        const select = (call[0] as { select?: Record<string, unknown> }).select ?? {};
        expect(select).not.toHaveProperty("isAgent");
      }
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

  describe("list by number and limit", () => {
    it("resolves a D-label to one row server-side and bounds the page", async () => {
      withWorkspaceRole(db, "member");
      db.decision.findMany.mockResolvedValue([] as never);

      await caller(db).decision.list({ workspaceId: WORKSPACE_ID, number: 3, limit: 25 });

      const args = db.decision.findMany.mock.calls[0]![0]!;
      const and = (args.where as { AND: Array<Record<string, unknown>> }).AND;
      expect(and).toContainEqual({ number: 3 });
      // Without a bound this pulled every decision in the workspace — with
      // its evidence JSON — to find one number.
      expect(args.take).toBe(25);
    });

    it("stays uncapped when no limit is given, so the Decision Log is unchanged", async () => {
      withWorkspaceRole(db, "member");
      db.decision.findMany.mockResolvedValue([] as never);

      await caller(db).decision.list({ workspaceId: WORKSPACE_ID });

      expect(db.decision.findMany.mock.calls[0]![0]!.take).toBeUndefined();
    });
  });

  describe("list filters", () => {
    it("search covers statement and body, case-insensitively", async () => {
      withWorkspaceRole(db, "member");
      db.decision.findMany.mockResolvedValue([] as never);
      await caller(db).decision.list({ workspaceId: WORKSPACE_ID, search: "Consequences" });
      const where = db.decision.findMany.mock.calls[0]![0]!.where as { AND: unknown[] };
      expect(where.AND).toContainEqual({
        OR: [
          { statement: { contains: "Consequences", mode: "insensitive" } },
          { body: { contains: "Consequences", mode: "insensitive" } },
        ],
      });
    });

    it("the product lens folds workspace-wide (null-product) decisions into a product scope", async () => {
      withWorkspaceRole(db, "member");
      db.decision.findMany.mockResolvedValue([] as never);
      await caller(db).decision.list({
        workspaceId: WORKSPACE_ID,
        productId: "prod-1",
        includeWorkspaceWide: true,
      });
      let where = db.decision.findMany.mock.calls[0]![0]!.where as { AND: unknown[] };
      expect(where.AND).toContainEqual({ OR: [{ productId: "prod-1" }, { productId: null }] });

      // The workspace page keeps a product scope exact, and "workspace" means null-product only.
      db.decision.findMany.mockClear();
      await caller(db).decision.list({ workspaceId: WORKSPACE_ID, productId: "prod-1" });
      where = db.decision.findMany.mock.calls[0]![0]!.where as { AND: unknown[] };
      expect(where.AND).toContainEqual({ productId: "prod-1" });
      db.decision.findMany.mockClear();
      await caller(db).decision.list({ workspaceId: WORKSPACE_ID, productId: "workspace" });
      where = db.decision.findMany.mock.calls[0]![0]!.where as { AND: unknown[] };
      expect(where.AND).toContainEqual({ productId: null });
    });
  });

  describe("create", () => {
    it("refuses an owner who is not a member of the workspace (directly or via a team)", async () => {
      withWorkspaceRole(db, "member");
      withTransaction(db);
      db.workspaceUser.findFirst.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);

      await expect(
        caller(db).decision.create({ workspaceId: WORKSPACE_ID, statement: "Use tRPC", ownerId: "outsider" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.decision.create).not.toHaveBeenCalled();
    });

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

    it("manual create: deciders default to the creator when none are named", async () => {
      withWorkspaceRole(db, "member");
      withTransaction(db);
      db.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: "Dev Fixture",
        email: "dev@example.test",
      } as never);
      db.workspace.update.mockResolvedValue({ decisionCounter: 2 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-2",
        number: 2,
        statement: "x",
        status: "ACCEPTED",
        source: "MANUAL",
        transcriptionSessionId: null,
      } as never);

      await caller(db).decision.create({ workspaceId: WORKSPACE_ID, statement: "x" });

      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.deciders).toEqual({
        create: [{ userId: USER_ID, name: "Dev Fixture", email: "dev@example.test" }],
      });
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

    it("drops evidence turns that do not resolve to a real transcript turn", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db);
      withTransaction(db);
      db.workspace.update.mockResolvedValue({ decisionCounter: 1 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1", number: 1, statement: "Park it", status: "ACCEPTED", source: "MEETING", transcriptionSessionId: MEETING_ID,
      } as never);

      await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Park it",
        source: "AGENT",
        transcriptionSessionId: MEETING_ID,
        evidence: [
          { turnIndex: 3, speaker: "Pat Reviewer", text: "Let's park it." },
          // Out of range for this transcript.
          { turnIndex: 99, speaker: "Pat Reviewer", text: "We agreed to ship on Friday." },
          // In range, but the words are not in that turn — a fabricated quote.
          { turnIndex: 1, speaker: "Pat Reviewer", text: "Headcount is cut by 20% in Q4." },
        ],
      });

      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      // Evidence is rendered to a reader as a verbatim quote with a
      // click-through index, so an unverifiable one must not be stored.
      expect(data.evidence).toEqual([
        { turnIndex: 3, speaker: "Pat Reviewer", startTime: null, text: "Let's park it." },
      ]);
    });

    it("takes speaker and text from the transcript, not from the caller", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db);
      withTransaction(db);
      db.workspace.update.mockResolvedValue({ decisionCounter: 1 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1", number: 1, statement: "Park it", status: "ACCEPTED", source: "MEETING", transcriptionSessionId: MEETING_ID,
      } as never);

      await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Park it",
        source: "AGENT",
        transcriptionSessionId: MEETING_ID,
        // Right turn, misattributed and loosely quoted.
        evidence: [{ turnIndex: 3, speaker: "Someone Else", text: "lets park it" }],
      });

      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.evidence).toEqual([
        { turnIndex: 3, speaker: "Pat Reviewer", startTime: null, text: "Let's park it." },
      ]);
    });

    it("will not let a trivially short turn stand as evidence for a longer quote, and reports the wholesale rejection", async () => {
      withWorkspaceRole(db, "member");
      withTransaction(db);
      reportHandledErrorServer.mockClear();
      // Turn 0 is a bare acknowledgement; it appears inside almost any
      // sentence, so reverse containment must not accept it.
      db.transcriptionSession.findUnique.mockResolvedValue({
        id: MEETING_ID,
        userId: "someone-else",
        projectId: null,
        workspaceId: WORKSPACE_ID,
        occurrenceId: null,
        meetingDate: new Date("2026-09-08T07:00:00.000Z"),
        participants: [{ userId: USER_ID, name: "Dev Fixture", email: "dev@example.test" }],
        transcription: "Dev Fixture: Yeah.",
        sentencesJson: null,
      } as never);
      db.transcriptionSessionParticipant.findFirst.mockResolvedValue(null);
      db.workspace.update.mockResolvedValue({ decisionCounter: 1 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1", number: 1, statement: "Ship the drawer", status: "ACCEPTED", source: "MEETING", transcriptionSessionId: MEETING_ID,
      } as never);

      await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Ship the drawer",
        status: "ACCEPTED",
        transcriptionSessionId: MEETING_ID,
        evidence: [{ turnIndex: 0, speaker: "Dev Fixture", text: "yeah we should ship the drawer before the hover affordances" }],
      });

      // The decision still lands — a bad quote must not lose it — but with no
      // evidence, and the fabricated citation is reported rather than logged.
      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.evidence).toEqual([]);
      expect(reportHandledErrorServer).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ area: "decision.create.evidence" }),
      );
    });

    it("still accepts a quote that spans turns and cites a substantial one", async () => {
      withWorkspaceRole(db, "member");
      withMeeting(db);
      withTransaction(db);
      reportHandledErrorServer.mockClear();
      db.workspace.update.mockResolvedValue({ decisionCounter: 1 } as never);
      db.decision.create.mockResolvedValue({
        id: "dec-1", number: 1, statement: "Park it", status: "ACCEPTED", source: "MEETING", transcriptionSessionId: MEETING_ID,
      } as never);

      await caller(db).decision.create({
        workspaceId: WORKSPACE_ID,
        statement: "Park it",
        status: "ACCEPTED",
        transcriptionSessionId: MEETING_ID,
        // Wider than turn 3, but turn 3's words are really in it.
        evidence: [{ turnIndex: 3, speaker: "Pat Reviewer", text: "Let's park it. We can revisit next cycle." }],
      });

      const data = (db.decision.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.evidence).toEqual([
        { turnIndex: 3, speaker: "Pat Reviewer", startTime: null, text: "Let's park it." },
      ]);
      expect(reportHandledErrorServer).not.toHaveBeenCalled();
    });

    it("refuses evidence with no meeting to resolve it against", async () => {
      withWorkspaceRole(db, "member");
      await expect(
        caller(db).decision.create({
          workspaceId: WORKSPACE_ID,
          statement: "Park it",
          evidence: [{ turnIndex: 3, speaker: "Pat", text: "Let's park it." }],
        }),
      ).rejects.toThrow(/need a transcriptionSessionId/i);
      expect(db.$transaction).not.toHaveBeenCalled();
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

  describe("setStatus", () => {
    /** A confirmed, meeting-less, project-less decision in the workspace. */
    function withDecision(
      overrides: Partial<{
        id: string;
        status: string;
        reviewState: string;
        decidedAt: Date | null;
      }> = {},
    ) {
      const row = {
        id: "dec-1",
        workspaceId: WORKSPACE_ID,
        number: 1,
        statement: "Use tRPC",
        status: "PROPOSED",
        reviewState: "CONFIRMED",
        decidedAt: null,
        supersededById: null,
        source: "MANUAL",
        transcriptionSessionId: null,
        transcriptionSession: null,
        projectId: null,
        ...overrides,
      };
      // Router subject load (findFirst by id + workspace) and the service's
      // own re-read (findUnique) see the same row.
      db.decision.findFirst.mockImplementation(((args: { where: { id: string } }) =>
        Promise.resolve(args.where.id === row.id ? row : null)) as never);
      db.decision.findUnique.mockResolvedValue(row as never);
      db.decision.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...args.data, supersededBy: null })) as never);
      return row;
    }

    it("a viewer may not change status (workspace edit gate)", async () => {
      withWorkspaceRole(db, "viewer");
      withDecision();
      await expect(
        caller(db).decision.setStatus({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          status: "ACCEPTED",
        }),
      ).rejects.toThrow();
      expect(db.decision.update).not.toHaveBeenCalled();
    });

    it("accepting stamps decided-at when unset and records an `accepted` event", async () => {
      withWorkspaceRole(db, "member");
      withDecision({ decidedAt: null });

      const result = await caller(db).decision.setStatus({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        status: "ACCEPTED",
      });

      const data = (db.decision.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data.status).toBe("ACCEPTED");
      expect(data.supersededById).toBeNull();
      expect(data.decidedAt).toBeInstanceOf(Date);
      expect(result.label).toBe("D-0001");
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: "decision", action: "accepted" }),
        }),
      );
    });

    it("SUPERSEDED requires a successor", async () => {
      withWorkspaceRole(db, "member");
      withDecision();
      await expect(
        caller(db).decision.setStatus({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          status: "SUPERSEDED",
        }),
      ).rejects.toThrow(/choose the decision/i);
      expect(db.decision.update).not.toHaveBeenCalled();
    });

    it("SUPERSEDED refuses a successor outside the workspace (or the caller's sight)", async () => {
      withWorkspaceRole(db, "member");
      withDecision();
      // findFirst is scoped by workspaceId, so an unknown/foreign id is not found.
      await expect(
        caller(db).decision.setStatus({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          status: "SUPERSEDED",
          supersededById: "dec-elsewhere",
        }),
      ).rejects.toThrow(/decision not found/i);
      expect(db.decision.update).not.toHaveBeenCalled();
    });

    it("SUPERSEDED links the successor and records a `superseded` event", async () => {
      withWorkspaceRole(db, "member");
      const row = withDecision({ status: "ACCEPTED" });
      const successor = { ...row, id: "dec-2", number: 2, statement: "Use REST" };
      db.decision.findFirst.mockImplementation(((args: { where: { id: string } }) =>
        Promise.resolve(
          args.where.id === row.id ? row : args.where.id === successor.id ? successor : null,
        )) as never);

      await caller(db).decision.setStatus({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        status: "SUPERSEDED",
        supersededById: "dec-2",
      });

      const data = (db.decision.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({ status: "SUPERSEDED", supersededById: "dec-2" });
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "superseded",
            metadata: expect.objectContaining({ from: "ACCEPTED", to: "SUPERSEDED" }),
          }),
        }),
      );
    });

    it("leaving SUPERSEDED clears the successor; deprecating records `deprecated`", async () => {
      withWorkspaceRole(db, "member");
      withDecision({ status: "SUPERSEDED" });

      await caller(db).decision.setStatus({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        status: "DEPRECATED",
      });

      const data = (db.decision.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({ status: "DEPRECATED", supersededById: null });
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: "deprecated" }) }),
      );
    });

    it("a draft cannot change status until it is confirmed", async () => {
      withWorkspaceRole(db, "member");
      // A meeting-less draft is a V2 shape, but the rule is the service's, not the resolver's.
      withDecision({ reviewState: "DRAFT", status: "PROPOSED" });
      withMeeting(db);
      await expect(
        caller(db).decision.setStatus({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          status: "ACCEPTED",
        }),
      ).rejects.toThrow();
      expect(db.decision.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteDraft", () => {
    function withRow(reviewState: string) {
      const row = {
        id: "dec-1",
        workspaceId: WORKSPACE_ID,
        reviewState,
        transcriptionSession: null,
        projectId: null,
      };
      db.decision.findFirst.mockResolvedValue(row as never);
      db.decision.findUnique.mockResolvedValue(row as never);
      db.decision.delete.mockResolvedValue(row as never);
    }

    it("refuses to delete a confirmed decision — deprecate or supersede instead", async () => {
      withWorkspaceRole(db, "member");
      withRow("CONFIRMED");
      await expect(
        caller(db).decision.deleteDraft({ workspaceId: WORKSPACE_ID, decisionId: "dec-1" }),
      ).rejects.toThrow(/never deleted/i);
      expect(db.decision.delete).not.toHaveBeenCalled();
    });

    it("deletes a rejected row", async () => {
      withWorkspaceRole(db, "member");
      withRow("REJECTED");
      await expect(
        caller(db).decision.deleteDraft({ workspaceId: WORKSPACE_ID, decisionId: "dec-1" }),
      ).resolves.toEqual({ id: "dec-1" });
      expect(db.decision.delete).toHaveBeenCalledWith({ where: { id: "dec-1", workspaceId: WORKSPACE_ID } });
    });

    it("rejectDraft refuses a confirmed decision", async () => {
      withWorkspaceRole(db, "member");
      withRow("CONFIRMED");
      await expect(
        caller(db).decision.rejectDraft({ workspaceId: WORKSPACE_ID, decisionId: "dec-1" }),
      ).rejects.toThrow(/cannot be rejected/i);
    });
  });

  describe("links and scope", () => {
    function withConfirmedDecision() {
      const row = {
        id: "dec-1",
        workspaceId: WORKSPACE_ID,
        number: 1,
        statement: "Use tRPC",
        status: "ACCEPTED",
        reviewState: "CONFIRMED",
        transcriptionSession: null,
        projectId: null,
      };
      db.decision.findFirst.mockResolvedValue(row as never);
      return row;
    }

    it("linkTicket refuses a ticket outside the workspace", async () => {
      withWorkspaceRole(db, "member");
      withConfirmedDecision();
      db.ticket.findFirst.mockResolvedValue(null);
      await expect(
        caller(db).decision.linkTicket({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          ticketId: "t-elsewhere",
        }),
      ).rejects.toThrow(/ticket not found/i);
      expect(db.decisionLink.create).not.toHaveBeenCalled();
      // The lookup is workspace-scoped through the product relation.
      expect(db.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t-elsewhere", product: { workspaceId: WORKSPACE_ID } },
        }),
      );
    });

    it("linkTicket creates the link once and returns the existing one after", async () => {
      withWorkspaceRole(db, "member");
      withConfirmedDecision();
      db.ticket.findFirst.mockResolvedValue({ id: "t-1" } as never);
      db.decisionLink.findFirst.mockResolvedValueOnce(null);
      db.decisionLink.create.mockResolvedValue({ id: "link-1", decisionId: "dec-1", ticketId: "t-1" } as never);

      const first = await caller(db).decision.linkTicket({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        ticketId: "t-1",
      });
      expect(first.id).toBe("link-1");
      expect(db.decisionLink.create).toHaveBeenCalledWith({
        data: { decisionId: "dec-1", ticketId: "t-1", featureId: null, createdById: USER_ID },
      });

      db.decisionLink.findFirst.mockResolvedValueOnce({ id: "link-1" } as never);
      const second = await caller(db).decision.linkTicket({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        ticketId: "t-1",
      });
      expect(second.id).toBe("link-1");
      expect(db.decisionLink.create).toHaveBeenCalledTimes(1);
    });

    it("a viewer may not link", async () => {
      withWorkspaceRole(db, "viewer");
      withConfirmedDecision();
      await expect(
        caller(db).decision.linkFeature({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          featureId: "f-1",
        }),
      ).rejects.toThrow();
      expect(db.decisionLink.create).not.toHaveBeenCalled();
    });

    it("unlink refuses a link that belongs to another workspace's decision", async () => {
      withWorkspaceRole(db, "member");
      db.decisionLink.findFirst.mockResolvedValue(null);
      await expect(
        caller(db).decision.unlink({ workspaceId: WORKSPACE_ID, linkId: "link-x" }),
      ).rejects.toThrow(/link not found/i);
      expect(db.decisionLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "link-x", decision: { workspaceId: WORKSPACE_ID } },
        }),
      );
      expect(db.decisionLink.delete).not.toHaveBeenCalled();
    });

    it("update refuses a product from another workspace, and accepts an in-workspace ADR", async () => {
      withWorkspaceRole(db, "member");
      const row = withConfirmedDecision();
      db.product.findFirst.mockResolvedValue(null);
      await expect(
        caller(db).decision.update({
          workspaceId: WORKSPACE_ID,
          decisionId: "dec-1",
          productId: "prod-elsewhere",
        }),
      ).rejects.toThrow(/product not found/i);
      expect(db.decision.update).not.toHaveBeenCalled();

      db.adrDocument.findFirst.mockResolvedValue({ id: "adr-1" } as never);
      db.decision.update.mockResolvedValue({ ...row, adrDocumentId: "adr-1", supersededBy: null, supersedes: [] } as never);
      await caller(db).decision.update({
        workspaceId: WORKSPACE_ID,
        decisionId: "dec-1",
        adrDocumentId: "adr-1",
      });
      expect(db.adrDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "adr-1", repository: { workspaceId: WORKSPACE_ID } },
        }),
      );
      const data = (db.decision.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(data).toEqual({ adrDocumentId: "adr-1" });
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: "updated" }) }),
      );
    });

    it("listForAdr filters through the resolver and by the ADR", async () => {
      withWorkspaceRole(db, "viewer");
      db.decision.findMany.mockResolvedValue([] as never);
      await caller(db).decision.listForAdr({ workspaceId: WORKSPACE_ID, adrDocumentId: "adr-1" });
      const where = db.decision.findMany.mock.calls[0]![0]!.where as { AND: Array<Record<string, unknown>> };
      expect(where.AND[0]).toMatchObject({ workspaceId: WORKSPACE_ID, reviewState: "CONFIRMED" });
      expect(where.AND[1]).toEqual({ adrDocumentId: "adr-1" });
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
