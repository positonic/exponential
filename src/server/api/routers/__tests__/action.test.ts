/**
 * Unit tests for the action router's one2b agent integration procedures
 * (`bulkCreateFromTranscript` and `findBySource`).
 *
 * These tests use `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead
 * of a real database, so they run in milliseconds and CANNOT touch any
 * real database, ever. The historical `*.integration.test.ts` companion to
 * this file was deleted after a real DB wipe incident — see CLAUDE.md
 * "Test database safety".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Some routers (e.g. `tool.ts`, `mastra.ts`) construct external SDK clients
// at module-load time and read env vars synchronously. We don't exercise
// those routers here, but `createCaller` imports the entire app router tree,
// so the modules need to be loadable. `vi.hoisted` runs BEFORE module
// imports (regular top-level statements run AFTER), so use it to seed env
// vars before the import graph evaluates.
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

// ── Module mocks ─────────────────────────────────────────────────────
// All mocks must be declared before the modules under test are imported.
// `vi.mock` calls are hoisted by vitest, but the dbMock instance is created
// lazily inside the factory so it's created exactly once and reused by every
// import path that touches `~/server/db`.

// Some routers instantiate external SDK clients at import time (e.g.
// `new OpenAI(...)` in tool.ts). Stub them so the module graph loads.
vi.mock("openai", () => ({
  default: class MockOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

// Singleton dbMock instance shared between the `~/server/db` module-level
// import (used by `findUserByEmailInWorkspace`) and the per-test ctx.db.
// We use a holder object so the factory below can pull the live mock without
// hitting TDZ issues with `vi.mock`'s hoisting.
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };

function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
  return dbHolder.current;
}

vi.mock("~/server/db", () => {
  // Forward every property access on `db` through to the singleton dbMock.
  // We deliberately use `Reflect.get` (no .bind) because mockDeep's nested
  // delegates (e.g. `db.user`) are themselves Proxies — calling .bind on them
  // returns a fresh bound function that doesn't carry the deep mock methods,
  // which broke `db.user.findUnique` lookups.
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

// Side-effect-free stubs for modules that the action router pulls in but
// that we don't exercise from these tests. Without these, importing the
// router can fail in unit-test environment (no real services, no env vars).
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// T7: mock the activity recorder so the safety test can simulate an
// instrumentation failure. Per the helper contract it never throws in
// production, but the call site MUST still tolerate a rejection — that's
// what `instrumentation_failure_does_not_break_mutation` below asserts.
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";
import { recordActivity } from "~/server/services/activity/recordActivity";

describe("action router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  // ────────────────────────────────────────────────────────────────────
  // bulkCreateFromTranscript
  // ────────────────────────────────────────────────────────────────────
  describe("bulkCreateFromTranscript", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";
    const sessionId = "s1";

    /** Stub the workspace-membership and transcript-lookup probes used by
     *  every successful path. Returns the membership object so tests can
     *  override it if needed. */
    function stubAuthChecks(opts?: { transcriptWorkspaceId?: string }) {
      // Caller is a member of `workspaceId`
      dbMock.workspaceUser.findUnique.mockResolvedValue({
        userId: callerId,
        workspaceId,
        role: "member",
        joinedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Transcript belongs to the same workspace by default
      dbMock.transcriptionSession.findUnique.mockResolvedValue({
        id: sessionId,
        workspaceId: opts?.transcriptWorkspaceId ?? workspaceId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }

    it("creates actions for all items, resolves user assignee to ActionAssignee", async () => {
      stubAuthChecks();

      // findUserByEmailInWorkspace performs two lookups under the hood:
      //   db.user.findUnique(...) -> the user
      //   db.workspaceUser.findUnique(...) -> the membership
      // The membership probe is the same call as the caller's auth check, so
      // we use mockImplementation to disambiguate by where-clause.
      const memberId = "member-1";
      dbMock.user.findUnique.mockResolvedValue({
        id: memberId,
        email: "jane@example.com",
        name: "Jane",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // After resolveAssignee runs the membership lookup for the assignee,
      // return a non-null record so the assignee is treated as a workspace
      // user (not a participant).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callerMembership: any = {
        userId: callerId,
        workspaceId,
        role: "member",
        joinedAt: new Date(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assigneeMembership: any = {
        userId: memberId,
        workspaceId,
        role: "member",
        joinedAt: new Date(),
      };
      dbMock.workspaceUser.findUnique
        .mockResolvedValueOnce(callerMembership) // bulkCreate auth check
        .mockResolvedValueOnce(assigneeMembership); // findUserByEmailInWorkspace

      const createdAction = {
        id: "a1",
        name: "Ship the docs",
        priority: "1st Priority",
        workspaceId,
        transcriptionSessionId: sessionId,
        sourceType: "meeting",
        sourceId: sessionId,
        lastUpdatedBy: "AGENT",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.create.mockResolvedValue(createdAction as any);
      dbMock.actionAssignee.create.mockResolvedValue({
        actionId: "a1",
        userId: memberId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Hydrated reload after assignee creation
      dbMock.action.findUniqueOrThrow.mockResolvedValue({
        ...createdAction,
        assignees: [{ user: { id: memberId, name: "Jane", email: "jane@example.com", image: null } }],
        participantAssignees: [],
        project: null,
        transcriptionSession: { id: sessionId, title: "Standup" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.bulkCreateFromTranscript({
        transcriptionSessionId: sessionId,
        workspaceId,
        items: [
          { description: "Ship the docs", assigneeEmail: "jane@example.com", priority: "HIGH" },
        ],
      });

      expect(result.created).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);
      const action = result.created[0]!;
      expect(action.name).toBe("Ship the docs");
      expect(action.priority).toBe("1st Priority");
      expect(action.assignees).toHaveLength(1);
      expect(action.assignees[0]!.user.id).toBe(memberId);
      expect(action.participantAssignees).toHaveLength(0);
      expect(dbMock.actionAssignee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionId: "a1", userId: memberId }),
        }),
      );
    });

    it("falls back to participant assignee when email is not a workspace user", async () => {
      stubAuthChecks();

      // Email matches a User row, but that user is NOT in the workspace.
      dbMock.user.findUnique.mockResolvedValue({
        id: "external-user",
        email: "external@example.com",
        name: "External Person",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Caller's auth check returns the membership; assignee's membership
      // probe returns null (not a workspace member).
      dbMock.workspaceUser.findUnique
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
        .mockResolvedValueOnce(null);

      // Existing participant matching the email
      dbMock.transcriptionSessionParticipant.findUnique.mockResolvedValue({
        id: "p1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const createdAction = { id: "a2", name: "Send follow-up" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.create.mockResolvedValue(createdAction as any);
      dbMock.actionParticipantAssignee.create.mockResolvedValue({
        actionId: "a2",
        participantId: "p1",
        workspaceId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      dbMock.action.findUniqueOrThrow.mockResolvedValue({
        ...createdAction,
        assignees: [],
        participantAssignees: [{ participantId: "p1", participant: { id: "p1", email: "external@example.com" } }],
        project: null,
        transcriptionSession: { id: sessionId, title: "Standup" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.bulkCreateFromTranscript({
        transcriptionSessionId: sessionId,
        workspaceId,
        items: [
          { description: "Send follow-up", assigneeEmail: "external@example.com", priority: "MEDIUM" },
        ],
      });

      expect(result.created).toHaveLength(1);
      const action = result.created[0]!;
      expect(action.assignees).toHaveLength(0);
      expect(action.participantAssignees).toHaveLength(1);
      expect(action.participantAssignees[0]!.participantId).toBe("p1");
      expect(dbMock.actionParticipantAssignee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionId: "a2", participantId: "p1", workspaceId }),
        }),
      );
      // Existing participant was reused; create was NOT called.
      expect(dbMock.transcriptionSessionParticipant.create).not.toHaveBeenCalled();
    });

    it("auto-creates participant when email is unknown", async () => {
      stubAuthChecks();

      // No user with this email
      dbMock.user.findUnique.mockResolvedValue(null);
      // Caller's membership only — second findUnique would be skipped because
      // findUserByEmailInWorkspace returns early on null user.
      dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any,
      );

      // No existing participant
      dbMock.transcriptionSessionParticipant.findUnique.mockResolvedValue(null);
      // Create returns the new participant id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.transcriptionSessionParticipant.create.mockResolvedValue({ id: "p2" } as any);

      const createdAction = { id: "a3", name: "Reach out to lead", priority: "5th Priority" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.create.mockResolvedValue(createdAction as any);
      dbMock.actionParticipantAssignee.create.mockResolvedValue({
        actionId: "a3",
        participantId: "p2",
        workspaceId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      dbMock.action.findUniqueOrThrow.mockResolvedValue({
        ...createdAction,
        assignees: [],
        participantAssignees: [{ participantId: "p2", participant: { id: "p2", email: "newlead@example.com", name: "New Lead" } }],
        project: null,
        transcriptionSession: { id: sessionId, title: "Standup" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.bulkCreateFromTranscript({
        transcriptionSessionId: sessionId,
        workspaceId,
        items: [
          {
            description: "Reach out to lead",
            assigneeEmail: "newlead@example.com",
            assigneeName: "New Lead",
            priority: "LOW",
          },
        ],
      });

      expect(result.created).toHaveLength(1);
      const action = result.created[0]!;
      expect(action.priority).toBe("5th Priority");
      expect(action.participantAssignees).toHaveLength(1);
      expect(action.participantAssignees[0]!.participantId).toBe("p2");
      expect(dbMock.transcriptionSessionParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transcriptionSessionId: sessionId,
            workspaceId,
            email: "newlead@example.com",
            name: "New Lead",
          }),
        }),
      );
    });

    it("skips item that throws but creates the rest", async () => {
      stubAuthChecks();

      const goodAction = { id: "a-good", name: "Good item", priority: "Quick" };
      // First call throws, second succeeds. The procedure's per-item
      // try/catch should swallow the failure into `skipped` and keep going.
      dbMock.action.create
        .mockRejectedValueOnce(new Error("boom"))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce(goodAction as any);

      dbMock.action.findUniqueOrThrow.mockResolvedValue({
        ...goodAction,
        assignees: [],
        participantAssignees: [],
        project: null,
        transcriptionSession: { id: sessionId, title: "Standup" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.bulkCreateFromTranscript({
        transcriptionSessionId: sessionId,
        workspaceId,
        items: [
          { description: "Bad item", priority: "MEDIUM", rawText: "raw-bad" },
          { description: "Good item", priority: "MEDIUM", rawText: "raw-good" },
        ],
      });

      expect(result.created).toHaveLength(1);
      expect(result.created[0]!.name).toBe("Good item");
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]!.rawText).toBe("raw-bad");
      expect(result.skipped[0]!.reason).toContain("boom");
    });

    it("rejects unauthorized workspace", async () => {
      // Caller is NOT a member of the workspace
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.action.bulkCreateFromTranscript({
          transcriptionSessionId: sessionId,
          workspaceId,
          items: [{ description: "Nope", priority: "MEDIUM" }],
        }),
      ).rejects.toThrow(TRPCError);

      // No action.create attempts when auth fails up-front
      expect(dbMock.action.create).not.toHaveBeenCalled();
    });

    it("rejects mismatched transcript workspace", async () => {
      // Caller IS a member, but the transcript belongs to a DIFFERENT workspace
      stubAuthChecks({ transcriptWorkspaceId: "other-workspace" });

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.action.bulkCreateFromTranscript({
          transcriptionSessionId: sessionId,
          workspaceId,
          items: [{ description: "Nope", priority: "MEDIUM" }],
        }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.action.create).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // findBySource
  // ────────────────────────────────────────────────────────────────────
  describe("findBySource", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";

    function stubMembership(authorized: boolean) {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        authorized
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? ({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
          : null,
      );
    }

    it("returns actions matching sourceType + sourceId scoped to workspace", async () => {
      stubMembership(true);

      const matched = [{ id: "a1", name: "Match", workspaceId, sourceType: "meeting", sourceId: "meeting-123" }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue(matched as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.findBySource({
        workspaceId,
        sourceType: "meeting",
        sourceId: "meeting-123",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Match");
      // The where clause should scope to workspaceId + sourceType + sourceId
      expect(dbMock.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            sourceType: "meeting",
            sourceId: "meeting-123",
          }),
        }),
      );
    });

    it("filters by assigneeEmail when user is a workspace member", async () => {
      stubMembership(true);

      // findUserByEmailInWorkspace path: user found AND workspaceUser found
      const memberId = "member-x";
      dbMock.user.findUnique.mockResolvedValue({
        id: memberId,
        email: "member@example.com",
        name: "Member",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Second workspaceUser.findUnique call (for the assignee membership)
      dbMock.workspaceUser.findUnique
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce({ userId: memberId, workspaceId, role: "member", joinedAt: new Date() } as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue([{ id: "a1", name: "Mine" }] as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.findBySource({
        workspaceId,
        sourceType: "meeting",
        assigneeEmail: "member@example.com",
      });

      expect(result).toHaveLength(1);
      // Where clause should use assignees.some.userId path, not participantAssignees
      expect(dbMock.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            sourceType: "meeting",
            assignees: { some: { userId: memberId } },
          }),
        }),
      );
    });

    it("filters by assigneeEmail when only a participant has that email", async () => {
      stubMembership(true);

      // findUserByEmailInWorkspace returns null: either user not found, or
      // user not in workspace. Easiest is no user at all.
      dbMock.user.findUnique.mockResolvedValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue([{ id: "a1", name: "External assignee" }] as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.findBySource({
        workspaceId,
        sourceType: "meeting",
        assigneeEmail: "ext@example.com",
      });

      expect(result).toHaveLength(1);
      // Where clause should fall back to participantAssignees path
      expect(dbMock.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            sourceType: "meeting",
            participantAssignees: { some: { participant: { email: "ext@example.com" } } },
          }),
        }),
      );
    });

    it("respects limit", async () => {
      stubMembership(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }] as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.findBySource({
        workspaceId,
        sourceType: "meeting",
        sourceId: "m-limit",
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(dbMock.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
    });

    it("rejects unauthorized workspace", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.action.findBySource({ workspaceId, sourceType: "meeting" }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.action.findMany).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // T7: activity-feed instrumentation safety guarantee
  // ────────────────────────────────────────────────────────────────────
  describe("recordActivity instrumentation", () => {
    it("does not break action.create when recordActivity rejects", async () => {
      // Force the instrumentation helper to fail this call. The call site
      // wraps recordActivity in `.catch(() => {})` so the mutation must
      // still resolve normally.
      vi.mocked(recordActivity).mockRejectedValueOnce(
        new Error("simulated instrumentation failure"),
      );

      const callerId = "creator-1";
      const wsId = "ws-instr";
      const created = {
        id: "action-123",
        name: "Test action",
        workspaceId: wsId,
        createdById: callerId,
        project: null,
        assignees: [],
        syncs: [],
        createdBy: { id: callerId, name: null, email: null, image: null },
        tags: [],
        epic: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      dbMock.action.create.mockResolvedValue(created);
      // `create` now verifies membership before writing into an explicit
      // workspace, so this fixture has to make the caller a member — the
      // subject under test here is the instrumentation catch, not access.
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: callerId, workspaceId: wsId, role: "member" } as any,
      );

      // `create` authorises a caller-supplied workspaceId before writing, so
      // the caller needs a writing role to reach the instrumentation at all.
      dbMock.workspaceUser.findUnique.mockResolvedValue({
        userId: callerId,
        workspaceId: wsId,
        role: "member",
        joinedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.action.create({ name: "Test action", workspaceId: wsId }),
      ).resolves.toMatchObject({ id: "action-123" });

      // Sanity: recordActivity was invoked at least once with the correct shape.
      expect(recordActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workspaceId: wsId,
          userId: callerId,
          entityType: "action",
          action: "created",
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // searchForDependencies
  //
  // When a workspaceId is passed the caller's ownership scope is dropped so
  // the search spans the whole workspace — but ONLY after verifying the
  // caller is actually a member. Without that check any logged-in user could
  // enumerate another workspace's action titles/statuses/project names.
  // ────────────────────────────────────────────────────────────────────
  describe("searchForDependencies", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";

    /** getWorkspaceMembership probes workspaceUser.findUnique first, then
     *  falls back to teamUser.findFirst. Stub both to control membership. */
    function stubMembership(isMember: boolean) {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        isMember
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? ({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
          : null,
      );
      // No team-based access either when not a member.
      dbMock.teamUser.findFirst.mockResolvedValue(null);
    }

    it("lets a workspace member search across the whole workspace", async () => {
      stubMembership(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue([{ id: "a1", name: "Found" }] as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.searchForDependencies({
        query: "Fo",
        workspaceId,
      });

      expect(result).toHaveLength(1);
      // Ownership scope is dropped: no createdById in the where clause, but
      // the workspace OR filter is applied.
      const where = dbMock.action.findMany.mock.calls[0]![0]!.where!;
      expect(where).not.toHaveProperty("createdById");
      expect(where).toMatchObject({
        OR: [
          { workspaceId },
          { project: { workspaceId } },
        ],
      });
    });

    it("rejects a non-member with FORBIDDEN", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.action.searchForDependencies({ query: "Fo", workspaceId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      // The query must never run for a non-member.
      expect(dbMock.action.findMany).not.toHaveBeenCalled();
    });

    it("scopes to the caller's own actions when no workspaceId is given", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.action.findMany.mockResolvedValue([{ id: "a1", name: "Mine" }] as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.searchForDependencies({ query: "Mi" });

      expect(result).toHaveLength(1);
      // No membership probe needed, and the where clause is scoped to the
      // caller's own actions with no workspace filter.
      expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
      const where = dbMock.action.findMany.mock.calls[0]![0]!.where!;
      expect(where).toMatchObject({ createdById: callerId });
      expect(where).not.toHaveProperty("OR");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // getAssignableUsersForContext
  //
  // Read-side counterpart to the workspaceId write guards: the procedure
  // returns id/name/email/image for every member of `effectiveWorkspaceId`.
  // A caller-supplied `workspaceId` therefore has to be membership-checked,
  // or any logged-in user could hand over a workspace CUID and harvest the
  // full roster. A workspace derived from an authorised project must NOT be
  // re-checked — workspace guests have no WorkspaceUser row.
  // ────────────────────────────────────────────────────────────────────
  describe("getAssignableUsersForContext", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";

    /** getWorkspaceMembership probes workspaceUser.findUnique first, then
     *  falls back to teamUser.findFirst. Stub both to control membership. */
    function stubMembership(isMember: boolean) {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        isMember
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? ({ userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any)
          : null,
      );
      dbMock.teamUser.findFirst.mockResolvedValue(null);
    }

    it("rejects a non-member who supplies a bare workspaceId", async () => {
      stubMembership(false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.action.getAssignableUsersForContext({ workspaceId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      // The roster must never be read for a non-member.
      expect(dbMock.workspaceUser.findMany).not.toHaveBeenCalled();
    });

    it("returns the roster to a workspace member", async () => {
      stubMembership(true);
      dbMock.team.findMany.mockResolvedValue([]);
      dbMock.workspaceUser.findMany.mockResolvedValue([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { user: { id: "u2", name: "Colleague", email: "u2@test.com", image: null } } as any,
      ]);
      dbMock.user.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: callerId, name: "Me", email: "caller-1@test.com", image: null } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.getAssignableUsersForContext({ workspaceId });

      expect(dbMock.workspaceUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId }) }),
      );
      expect(result.assignableUsers.map((u) => u.id).sort()).toEqual([callerId, "u2"]);
    });

    it("skips the membership probe when the workspace comes from an authorised project", async () => {
      // A workspace guest: ProjectMember on p1, but no WorkspaceUser row and
      // no team access. Project access alone must carry them through.
      stubMembership(false);
      dbMock.project.findUnique.mockResolvedValue({
        id: "p1",
        name: "Guest project",
        workspaceId,
        isRestricted: false,
        isPublic: false,
        createdById: "someone-else",
        teamId: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.projectMember.findFirst.mockResolvedValue({ role: "editor" } as any);
      dbMock.team.findMany.mockResolvedValue([]);
      dbMock.workspaceUser.findMany.mockResolvedValue([]);
      dbMock.projectMember.findMany.mockResolvedValue([]);
      dbMock.user.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: callerId, name: "Me", email: "caller-1@test.com", image: null } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.getAssignableUsersForContext({
        projectId: "p1",
        // Deliberately also passed: the project's workspace wins, and the
        // guest is not rejected for failing a membership probe on it.
        workspaceId,
      });

      expect(result.actionContext.hasProject).toBe(true);
      expect(dbMock.workspaceUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId }) }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // getAssignableUsers
  //
  // Same disclosure, reached via actionId: the procedure used to check only
  // that the action existed, then returned the whole workspace + project
  // roster to any authenticated caller.
  // ────────────────────────────────────────────────────────────────────
  describe("getAssignableUsers", () => {
    const callerId = "caller-1";

    it("rejects a caller with no access to the action", async () => {
      // Someone else's project-less action: not creator, not assignee, no
      // project to inherit access from.
      dbMock.action.findUnique.mockResolvedValue({
        id: "a1",
        createdById: "someone-else",
        projectId: null,
        assignees: [],
        project: null,
        team: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });

      await expect(
        caller.action.getAssignableUsers({ actionId: "a1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(dbMock.workspaceUser.findMany).not.toHaveBeenCalled();
      expect(dbMock.projectMember.findMany).not.toHaveBeenCalled();
    });

    it("returns the roster to the action's creator", async () => {
      dbMock.action.findUnique.mockResolvedValue({
        id: "a1",
        createdById: callerId,
        projectId: "p1",
        assignees: [],
        project: {
          id: "p1",
          name: "Proj",
          workspaceId: "w1",
          isRestricted: false,
          createdById: callerId,
        },
        team: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      dbMock.team.findMany.mockResolvedValue([]);
      dbMock.workspaceUser.findMany.mockResolvedValue([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { user: { id: "u2", name: "Colleague", email: "u2@test.com", image: null } } as any,
      ]);
      dbMock.projectMember.findMany.mockResolvedValue([]);
      dbMock.user.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: callerId, name: "Me", email: "caller-1@test.com", image: null } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.action.getAssignableUsers({ actionId: "a1" });

      expect(result.assignableUsers.map((u) => u.id).sort()).toEqual([callerId, "u2"]);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // create — workspace containment
  // ────────────────────────────────────────────────────────────────────
  describe("create workspace containment", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";

    /** Only `memberIds` belong to `workspaceId`. */
    function stubMembers(memberIds: string[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.workspaceUser.findUnique.mockImplementation((args: any) => {
        const userId = args?.where?.userId_workspaceId?.userId as
          | string
          | undefined;
        return Promise.resolve(
          userId && memberIds.includes(userId)
            ? { userId, workspaceId, role: "member", joinedAt: new Date() }
            : null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
      });
      dbMock.teamUser.findFirst.mockResolvedValue(null as never);
    }

    it("refuses to plant an action in a workspace the caller is not in", async () => {
      // No projectId, so nothing else in `create` ever looks at workspaceId —
      // it was spread straight into the row, and the `created` activity event
      // fired into that workspace's feed.
      stubMembers([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.action.create({ name: "Trespass", workspaceId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(dbMock.action.create).not.toHaveBeenCalled();
    });

    it("allows a member to create an action in their own workspace", async () => {
      stubMembers([callerId]);
      dbMock.action.create.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "a1", name: "Mine", workspaceId, project: null } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.action.create({ name: "Mine", workspaceId });

      expect(dbMock.action.create).toHaveBeenCalled();
    });

    it("needs no membership probe when no workspaceId is supplied", async () => {
      dbMock.action.create.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "a1", name: "Personal", workspaceId: null, project: null } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.action.create({ name: "Personal" });

      expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
      expect(dbMock.action.create).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // assign — assignee containment on project-less, team-less actions
  // ────────────────────────────────────────────────────────────────────
  describe("assign assignee containment", () => {
    const callerId = "caller-1";
    const workspaceId = "w1";
    const outsiderId = "user-outsider";
    const actionId = "a1";

    /** An action with neither project nor team — the branch that used to
     *  allow assigning literally any user id. */
    function stubUnscopedAction(opts?: { workspaceId?: string | null }) {
      dbMock.action.findUnique.mockResolvedValue({
        id: actionId,
        name: "Loose end",
        projectId: null,
        project: null,
        teamId: null,
        team: null,
        workspaceId: opts?.workspaceId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Caller passes buildActionAccessWhere (they created it).
      dbMock.action.findFirst.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: actionId } as any,
      );
    }

    it("refuses an arbitrary user id, which used to leak their email back", async () => {
      stubUnscopedAction();
      dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
      dbMock.teamUser.findFirst.mockResolvedValue(null as never);
      dbMock.team.findFirst.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.action.assign({ actionId, userIds: [outsiderId] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(dbMock.actionAssignee.createMany).not.toHaveBeenCalled();
    });

    it("does not name the rejected user in the error", async () => {
      stubUnscopedAction();
      dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
      dbMock.teamUser.findFirst.mockResolvedValue(null as never);
      dbMock.team.findFirst.mockResolvedValue(null as never);
      // If the router still looked the user up to build the message, this
      // identity would end up in the error string.
      dbMock.user.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: "Ada Lovelace", email: "ada@example.com" } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const err = await caller.action
        .assign({ actionId, userIds: [outsiderId] })
        .catch((e: unknown) => e);

      expect(String((err as Error).message)).not.toContain("ada@example.com");
      expect(String((err as Error).message)).not.toContain("Ada Lovelace");
    });

    it("still allows a member of the action's workspace", async () => {
      stubUnscopedAction({ workspaceId });
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: "member", workspaceId } as any,
      );
      dbMock.actionAssignee.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.action.assign({ actionId, userIds: ["user-colleague"] });

      expect(dbMock.actionAssignee.createMany).toHaveBeenCalled();
    });

    it("still allows self-assignment on a context-less action", async () => {
      stubUnscopedAction();
      dbMock.actionAssignee.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.action.assign({ actionId, userIds: [callerId] });

      expect(dbMock.actionAssignee.createMany).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // create / update — workspace write authorisation
  //
  // `workspaceId` is free-form input on both mutations. Before this suite
  // existed, `create` only checked access inside `if (input.projectId)`, so
  // a caller supplying `workspaceId` alone wrote straight through to
  // `db.action.create` with no membership check at all.
  // ────────────────────────────────────────────────────────────────────
  describe("workspace write authorisation", () => {
    const callerId = "caller-1";

    /** Caller reaches the workspace by no path at all. */
    function stubNoMembership() {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);
      dbMock.teamUser.findFirst.mockResolvedValue(null);
    }

    /** Caller holds `role` via a direct WorkspaceUser row. */
    function stubWorkspaceRole(workspaceId: string, role: string) {
      dbMock.workspaceUser.findUnique.mockResolvedValue({
        userId: callerId,
        workspaceId,
        role,
        joinedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      dbMock.teamUser.findFirst.mockResolvedValue(null);
    }

    describe("create", () => {
      it("refuses a workspaceId the caller has no membership in", async () => {
        stubNoMembership();

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.create({ name: "Injected", workspaceId: "w-foreign" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        // The whole point: no row lands in the foreign workspace.
        expect(dbMock.action.create).not.toHaveBeenCalled();
      });

      it("refuses a workspace the caller is only a viewer of", async () => {
        // Membership alone is not authority to write — `viewer` is read-only.
        stubWorkspaceRole("w1", "viewer");

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.create({ name: "Read-only", workspaceId: "w1" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(dbMock.action.create).not.toHaveBeenCalled();
      });

      it("lets a workspace member create, persisting the workspaceId", async () => {
        stubWorkspaceRole("w1", "member");
        dbMock.action.create.mockResolvedValue({
          id: "a1",
          name: "Mine",
          workspaceId: "w1",
          project: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const caller = createMockCaller({ userId: callerId, db: dbMock });
        await caller.action.create({ name: "Mine", workspaceId: "w1" });

        const data = dbMock.action.create.mock.calls[0]![0]!.data;
        expect(data).toMatchObject({ workspaceId: "w1", createdById: callerId });
      });

      it("takes the workspace from the project, ignoring a foreign workspaceId", async () => {
        // Caller genuinely owns the project (isCreator ⇒ canEditProject), but
        // names someone else's workspace. The project must win, or project
        // edit rights become a laundering route into any workspace.
        dbMock.project.findUnique.mockResolvedValue({
          createdById: callerId,
          teamId: null,
          workspaceId: "w-legit",
          isPublic: false,
          isRestricted: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        dbMock.projectMember.findFirst.mockResolvedValue(null);
        dbMock.action.findFirst.mockResolvedValue(null);
        stubNoMembership();
        dbMock.action.create.mockResolvedValue({
          id: "a1",
          name: "Scoped",
          workspaceId: "w-legit",
          project: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const caller = createMockCaller({ userId: callerId, db: dbMock });
        await caller.action.create({
          name: "Scoped",
          projectId: "p1",
          workspaceId: "w-foreign",
        });

        const data = dbMock.action.create.mock.calls[0]![0]!.data;
        expect(data).toMatchObject({ workspaceId: "w-legit" });
      });
    });

    describe("update", () => {
      /** Caller is the action's creator, so `canEditAction` passes. */
      function stubOwnedAction() {
        dbMock.action.findUnique.mockResolvedValue({
          createdById: callerId,
          projectId: null,
          assignees: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      it("refuses moving an action into a workspace the caller isn't in", async () => {
        // Editing the action where it lives ≠ permission to relocate it.
        stubOwnedAction();
        stubNoMembership();

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.update({ id: "a1", workspaceId: "w-foreign" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(dbMock.action.update).not.toHaveBeenCalled();
      });

      it("refuses moving an action into a project the caller can't edit", async () => {
        stubOwnedAction();
        dbMock.project.findUnique.mockResolvedValue({
          createdById: "someone-else",
          teamId: null,
          workspaceId: "w-foreign",
          isPublic: false,
          isRestricted: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        dbMock.projectMember.findFirst.mockResolvedValue(null);
        stubNoMembership();

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.update({ id: "a1", projectId: "p-foreign" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(dbMock.action.update).not.toHaveBeenCalled();
      });

      it("refuses moving an action into a project the caller can't edit (epic guard unreached)", async () => {
        // Regression guard for ordering: the project check must fire before
        // anything downstream consumes the re-targeted workspace.
        stubOwnedAction();
        dbMock.project.findUnique.mockResolvedValue({
          createdById: "someone-else",
          teamId: null,
          workspaceId: "w-foreign",
          isPublic: false,
          isRestricted: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        dbMock.projectMember.findFirst.mockResolvedValue(null);
        stubNoMembership();

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.update({
            id: "a1",
            projectId: "p-foreign",
            epicId: "e-foreign",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(dbMock.action.update).not.toHaveBeenCalled();
      });

      it("allows clearing the workspace without a membership probe", async () => {
        // Detaching an action the caller can already edit grants no access.
        stubOwnedAction();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dbMock.action.update.mockResolvedValue({ id: "a1", workspaceId: null } as any);

        const caller = createMockCaller({ userId: callerId, db: dbMock });
        await caller.action.update({ id: "a1", workspaceId: null });

        expect(dbMock.action.update).toHaveBeenCalled();
        expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
      });
    });

    describe("ensureDailyPlanPromptAction", () => {
      it("refuses a workspaceId the caller has no membership in", async () => {
        // Called on every app load, and writes a row into whatever workspace
        // it is handed — same hole as `create`, same guard.
        stubNoMembership();

        const caller = createMockCaller({ userId: callerId, db: dbMock });

        await expect(
          caller.action.ensureDailyPlanPromptAction({ workspaceId: "w-foreign" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(dbMock.action.create).not.toHaveBeenCalled();
        // Refused before even probing for an existing prompt action.
        expect(dbMock.action.findFirst).not.toHaveBeenCalled();
      });

      it("lets a workspace member through", async () => {
        stubWorkspaceRole("w1", "member");
        dbMock.action.findFirst.mockResolvedValue(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dbMock.action.create.mockResolvedValue({ id: "a1" } as any);

        const caller = createMockCaller({ userId: callerId, db: dbMock });
        const result = await caller.action.ensureDailyPlanPromptAction({
          workspaceId: "w1",
        });

        expect(result).toMatchObject({ created: true, actionId: "a1" });
        const data = dbMock.action.create.mock.calls[0]![0]!.data;
        expect(data).toMatchObject({ workspaceId: "w1" });
      });

      it("needs no membership probe when no workspaceId is given", async () => {
        dbMock.action.findFirst.mockResolvedValue(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dbMock.action.create.mockResolvedValue({ id: "a1" } as any);

        const caller = createMockCaller({ userId: callerId, db: dbMock });
        await caller.action.ensureDailyPlanPromptAction({});

        expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
        expect(dbMock.action.create).toHaveBeenCalled();
      });
    });
  });
});
