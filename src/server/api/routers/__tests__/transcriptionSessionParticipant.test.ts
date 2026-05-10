/**
 * Unit tests for the transcriptionSessionParticipant router's `getHistory`
 * procedure used by the meetingContextAgent for pre-meeting briefs.
 *
 * Mirrors the pattern in `knowledgeChunk.test.ts`: `vitest-mock-extended`'s
 * `mockDeep<PrismaClient>` for the database, and `createMockCaller` to drive
 * the full tRPC middleware chain. No real DB or external service is touched.
 *
 * Important: `findUserByEmailInWorkspace` (the Phase 3a workspace resolver
 * helper) reads `~/server/db` directly rather than receiving a Prisma client
 * argument. Our `vi.mock("~/server/db", ...)` proxy below routes those reads
 * through the SAME dbMock as the tRPC ctx, so stubbing
 * `dbMock.user.findUnique` / `dbMock.workspaceUser.findUnique` is sufficient
 * to drive both the membership check and the email-to-user lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Env vars must be seeded BEFORE the module graph evaluates.
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

// Singleton dbMock shared between the global `~/server/db` import (used by
// the workspace resolver) and the per-test ctx.db (used by the tRPC caller).
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };

function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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

// Side-effect-free stubs (action router pulls these in transitively when
// root.ts is loaded by createCaller).
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// KnowledgeService is pulled in by knowledgeChunkRouter via root.ts.
vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({
    embedTranscription: vi.fn(),
    search: vi.fn(),
  })),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

describe("transcriptionSessionParticipant router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const workspaceId = "w1";
  const otherWorkspaceId = "w2";
  const targetEmail = "alice@example.com";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  function stubMembership(authorized: boolean) {
    // The membership check uses ctx.db.workspaceUser.findUnique.
    // findUserByEmailInWorkspace ALSO calls db.workspaceUser.findUnique
    // (with a different userId) to verify the looked-up user is a member.
    // Default behaviour: authorize the caller; per-test overrides will
    // chain additional findUnique mocks for the email-resolution call.
    if (authorized) {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: callerId, workspaceId, role: "member", joinedAt: new Date() } as any,
      );
    } else {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Authorization
  // ────────────────────────────────────────────────────────────────────
  it("rejects unauthorized workspace (FORBIDDEN)", async () => {
    stubMembership(false);

    const caller = createMockCaller({ userId: "stranger", db: dbMock });
    await expect(
      caller.transcriptionSessionParticipant.getHistory({
        email: targetEmail,
        workspaceId,
      }),
    ).rejects.toThrow(TRPCError);

    expect(dbMock.transcriptionSessionParticipant.findMany).not.toHaveBeenCalled();
    expect(dbMock.transcriptionSessionParticipant.count).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // isWorkspaceMember=true path
  // ────────────────────────────────────────────────────────────────────
  it("returns isWorkspaceMember=true + userId when email matches a workspace User", async () => {
    // Caller is a member; matched user is also a member.
    dbMock.workspaceUser.findUnique
      // 1st call: caller membership check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ userId: callerId, workspaceId, role: "member" } as any)
      // 2nd call: findUserByEmailInWorkspace's membership check for matched user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ userId: "user-alice", workspaceId, role: "member" } as any);

    dbMock.user.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "user-alice", email: targetEmail, name: "Alice User" } as any,
    );

    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(0 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    expect(result.participant.isWorkspaceMember).toBe(true);
    expect(result.participant.userId).toBe("user-alice");
    expect(result.participant.name).toBe("Alice User");
    expect(result.participant.email).toBe(targetEmail);
  });

  // ────────────────────────────────────────────────────────────────────
  // isWorkspaceMember=false path
  // ────────────────────────────────────────────────────────────────────
  it("returns isWorkspaceMember=false + userId=null when email is only a Participant", async () => {
    // Caller is a member; email lookup finds NO user at all.
    dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    dbMock.user.findUnique.mockResolvedValue(null);

    // External participant with a name on a prior meeting.
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "p1",
        email: targetEmail,
        name: "Alice External",
        isHost: false,
        speakerLabel: "Speaker 2",
        transcriptionSession: {
          id: "ts-99",
          title: "Vendor sync",
          meetingDate: new Date("2026-03-01T10:00:00Z"),
          summary: "Discussed Q2 pricing",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(1 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    expect(result.participant.isWorkspaceMember).toBe(false);
    expect(result.participant.userId).toBeNull();
    expect(result.participant.name).toBe("Alice External");
    expect(result.participant.meetingCount).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // Empty history
  // ────────────────────────────────────────────────────────────────────
  it("returns empty recentMeetings and meetingCount=0 when no participations exist", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    dbMock.user.findUnique.mockResolvedValue(null);

    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(0 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    expect(result.recentMeetings).toEqual([]);
    expect(result.participant.meetingCount).toBe(0);
    expect(result.participant.name).toBeNull();
    expect(result.participant.isWorkspaceMember).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // Name hydration: User wins, else most-recent participant.name
  // ────────────────────────────────────────────────────────────────────
  it("prefers User.name over participant.name when the email matches a workspace User", async () => {
    dbMock.workspaceUser.findUnique
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ userId: callerId, workspaceId, role: "member" } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ userId: "user-alice", workspaceId, role: "member" } as any);

    dbMock.user.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "user-alice", email: targetEmail, name: "Alice From Users Table" } as any,
    );

    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "p1",
        email: targetEmail,
        name: "Stale Name From Participant",
        isHost: true,
        speakerLabel: "Speaker 1",
        transcriptionSession: {
          id: "ts-1",
          title: "Standup",
          meetingDate: new Date("2026-04-01T10:00:00Z"),
          summary: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(1 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    expect(result.participant.name).toBe("Alice From Users Table");
  });

  it("falls back to the most recent participant.name when no User match exists", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    dbMock.user.findUnique.mockResolvedValue(null);

    // findMany is ordered by meetingDate desc, so index 0 is the freshest.
    // First entry has a null name; we expect the resolver to skip it and
    // pick the next non-empty name.
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "p1",
        email: targetEmail,
        name: null,
        isHost: false,
        speakerLabel: null,
        transcriptionSession: {
          id: "ts-1",
          title: "Recent",
          meetingDate: new Date("2026-04-20T10:00:00Z"),
          summary: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "p2",
        email: targetEmail,
        name: "Alice Older Record",
        isHost: false,
        speakerLabel: "Speaker 3",
        transcriptionSession: {
          id: "ts-2",
          title: "Older",
          meetingDate: new Date("2026-03-01T10:00:00Z"),
          summary: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(2 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    expect(result.participant.name).toBe("Alice Older Record");
  });

  // ────────────────────────────────────────────────────────────────────
  // Limit
  // ────────────────────────────────────────────────────────────────────
  it("respects the input limit by passing it as `take` to findMany", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(0 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
      limit: 5,
    });

    expect(dbMock.transcriptionSessionParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // Workspace scoping
  // ────────────────────────────────────────────────────────────────────
  it("scopes findMany / count to the calling workspace", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.transcriptionSessionParticipant.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.transcriptionSessionParticipant.count.mockResolvedValue(0 as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.transcriptionSessionParticipant.getHistory({
      email: targetEmail,
      workspaceId,
    });

    // Must filter on BOTH email and workspaceId — never returns rows from
    // another workspace even if the same email exists there.
    expect(dbMock.transcriptionSessionParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: targetEmail, workspaceId },
      }),
    );
    expect(dbMock.transcriptionSessionParticipant.count).toHaveBeenCalledWith({
      where: { email: targetEmail, workspaceId },
    });

    // Sanity: the where clause should NOT mention the other workspace.
    const findManyCallArg =
      dbMock.transcriptionSessionParticipant.findMany.mock.calls[0]?.[0];
    expect(JSON.stringify(findManyCallArg)).not.toContain(otherWorkspaceId);
  });
});
