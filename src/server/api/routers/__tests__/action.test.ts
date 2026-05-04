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
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

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
});
