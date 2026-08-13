/**
 * Unit tests for the invited-user landing flow:
 *
 * - `workspace.getInvitationByToken`'s `viewerShouldSeeWelcome` — the invite
 *   accept page routes a signed-in invitee by this flag: only a genuinely NEW
 *   account (welcome unfinished AND account under the 24h new-user window —
 *   the same rule /home applies via resolveNewUserRedirect) goes through
 *   /welcome; an existing user lands straight in the workspace they were
 *   added to.
 * - `workspace.getRecentJoinContext` — feeds the "You've joined this
 *   workspace" banner on the workspace home; non-null only for a recent
 *   non-owner joiner.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
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
const TOKEN = "invite-token-1";
const HOUR_MS = 60 * 60 * 1000;

function mockInvitation(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspaceInvitation.findUnique.mockResolvedValue({
    id: "inv-1",
    token: TOKEN,
    email: `${USER_ID}@test.com`,
    role: "member",
    status: "accepted",
    workspaceId: WORKSPACE_ID,
    expiresAt: new Date(Date.now() + 24 * HOUR_MS),
    acceptedAt: new Date(),
    createdAt: new Date(),
    workspace: {
      id: WORKSPACE_ID,
      name: "CLEAR",
      slug: "clear",
      type: "team",
      _count: { members: 2 },
      members: [],
    },
    createdBy: { name: "James Farrell", email: "james@test.com", image: null },
  } as never);
}

function mockViewer(
  dbMock: DeepMockProxy<PrismaClient>,
  opts: {
    accountAgeMs: number | null;
    welcomeCompletedAt: Date | null;
  },
) {
  // Membership lookup (isMember) — the viewer belongs to the workspace.
  dbMock.workspaceUser.findUnique.mockResolvedValue({ userId: USER_ID } as never);
  dbMock.user.findUnique.mockResolvedValue({
    welcomeCompletedAt: opts.welcomeCompletedAt,
    ownedWorkspaces:
      opts.accountAgeMs === null
        ? []
        : [{ createdAt: new Date(Date.now() - opts.accountAgeMs) }],
  } as never);
}

describe("workspace.getInvitationByToken — viewerShouldSeeWelcome", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    mockInvitation(dbMock);
  });

  it("routes a brand-new invitee (fresh account, welcome unfinished) through /welcome", async () => {
    mockViewer(dbMock, { accountAgeMs: 1 * HOUR_MS, welcomeCompletedAt: null });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getInvitationByToken({ token: TOKEN });

    expect(result.viewerShouldSeeWelcome).toBe(true);
    expect(result.isMember).toBe(true);
  });

  it("sends an existing user (old account, welcome never finished) straight to the workspace", async () => {
    mockViewer(dbMock, {
      accountAgeMs: 30 * 24 * HOUR_MS,
      welcomeCompletedAt: null,
    });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getInvitationByToken({ token: TOKEN });

    expect(result.viewerShouldSeeWelcome).toBe(false);
  });

  it("never routes a user who already completed welcome through /welcome, even on a fresh account", async () => {
    mockViewer(dbMock, {
      accountAgeMs: 1 * HOUR_MS,
      welcomeCompletedAt: new Date(),
    });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getInvitationByToken({ token: TOKEN });

    expect(result.viewerShouldSeeWelcome).toBe(false);
  });

  it("classifies a viewer owning no workspace as existing (no /welcome detour)", async () => {
    mockViewer(dbMock, { accountAgeMs: null, welcomeCompletedAt: null });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getInvitationByToken({ token: TOKEN });

    expect(result.viewerShouldSeeWelcome).toBe(false);
  });
});

describe("workspace.getRecentJoinContext", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  function mockMembership(opts: { joinedAgoMs: number; ownerId?: string }) {
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - opts.joinedAgoMs),
      workspace: {
        ownerId: opts.ownerId ?? "someone-else",
        name: "CLEAR",
        slug: "clear",
      },
    } as never);
  }

  it("returns join context (with inviter) for a member who joined recently via an invitation", async () => {
    mockMembership({ joinedAgoMs: 2 * HOUR_MS });
    dbMock.workspaceInvitation.findFirst.mockResolvedValue({
      createdBy: { name: "James Farrell", email: "james@test.com" },
    } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getRecentJoinContext({
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({
      workspaceName: "CLEAR",
      workspaceSlug: "clear",
      inviterName: "James Farrell",
    });
  });

  it("still returns context (without inviter) for a member added directly, no invitation row", async () => {
    mockMembership({ joinedAgoMs: 2 * HOUR_MS });
    dbMock.workspaceInvitation.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.workspace.getRecentJoinContext({
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({ workspaceName: "CLEAR", inviterName: null });
  });

  it("returns null once the join is older than the 7-day window", async () => {
    mockMembership({ joinedAgoMs: 8 * 24 * HOUR_MS });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.workspace.getRecentJoinContext({ workspaceId: WORKSPACE_ID }),
    ).resolves.toBeNull();
  });

  it("returns null for the workspace owner", async () => {
    mockMembership({ joinedAgoMs: 2 * HOUR_MS, ownerId: USER_ID });

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.workspace.getRecentJoinContext({ workspaceId: WORKSPACE_ID }),
    ).resolves.toBeNull();
  });

  it("returns null for a non-member", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.workspace.getRecentJoinContext({ workspaceId: WORKSPACE_ID }),
    ).resolves.toBeNull();
  });
});
