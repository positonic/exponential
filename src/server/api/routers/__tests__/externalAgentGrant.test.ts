/**
 * Unit tests for the grant-time half of the ADR-0049 delegation invariant:
 * `externalAgent.grantWorkspaces`.
 *
 * The revoke-time half (cascades on owner removal/demotion) is covered by
 * `src/server/services/__tests__/externalAgentAccess.test.ts`. This file covers
 * the other direction — an owner can never delegate access they don't hold, and
 * an agent never lands above `member`.
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

const OWNER_ID = "owner-1";
const AGENT_ID = "agent-1";
const SHADOW_ID = "shadow-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: OWNER_ID, db: db as unknown as PrismaClient });
}

/** The owner is a human (humanOnlyProcedure) and owns the agent. */
function arrangeOwner(db: DeepMockProxy<PrismaClient>) {
  db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
  db.externalAgent.findFirst.mockResolvedValue({
    id: AGENT_ID,
    ownerId: OWNER_ID,
    shadowUserId: SHADOW_ID,
  } as never);
  db.$transaction.mockResolvedValue([] as never);
}

/** Owner memberships as `workspaceUser.findMany` would return them. */
function memberships(rows: Array<{ workspaceId: string; role: string }>) {
  return rows.map((r) => ({ userId: OWNER_ID, ...r })) as never;
}

describe("externalAgent.grantWorkspaces", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    arrangeOwner(db);
  });

  it("grants every workspace the owner can delegate, always at role member", async () => {
    db.workspaceUser.findMany.mockResolvedValue(
      memberships([
        { workspaceId: "ws-1", role: "owner" },
        { workspaceId: "ws-2", role: "admin" },
        { workspaceId: "ws-3", role: "member" },
      ]),
    );

    const result = await caller(db).externalAgent.grantWorkspaces({
      agentId: AGENT_ID,
      workspaceIds: ["ws-1", "ws-2", "ws-3"],
    });

    expect(result).toEqual({ granted: 3 });
    expect(db.workspaceUser.upsert).toHaveBeenCalledTimes(3);
    // ADR-0049 §3: agents hold `member` and nothing else — never the owner's
    // own admin/owner role in the workspace they were granted from.
    for (const workspaceId of ["ws-1", "ws-2", "ws-3"]) {
      expect(db.workspaceUser.upsert).toHaveBeenCalledWith({
        where: { userId_workspaceId: { userId: SHADOW_ID, workspaceId } },
        create: { userId: SHADOW_ID, workspaceId, role: "member" },
        update: { role: "member" },
      });
    }
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole batch when the owner is only a viewer in one workspace", async () => {
    db.workspaceUser.findMany.mockResolvedValue(
      memberships([
        { workspaceId: "ws-1", role: "member" },
        { workspaceId: "ws-2", role: "viewer" },
      ]),
    );
    db.workspace.findMany.mockResolvedValue([{ name: "Coaching" }] as never);

    await expect(
      caller(db).externalAgent.grantWorkspaces({
        agentId: AGENT_ID,
        workspaceIds: ["ws-1", "ws-2"],
      }),
    ).rejects.toThrow(/Coaching/);

    // All-or-nothing: the delegable workspace in the batch is not written either.
    expect(db.workspaceUser.upsert).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects workspaces the owner reaches without a membership row (team / guest access)", async () => {
    // `workspace.list` surfaces team-based and project-guest workspaces, so the
    // picker can offer one the owner holds no `WorkspaceUser` row in at all.
    db.workspaceUser.findMany.mockResolvedValue(
      memberships([{ workspaceId: "ws-1", role: "member" }]),
    );
    db.workspace.findMany.mockResolvedValue([{ name: "Threshold" }] as never);

    await expect(
      caller(db).externalAgent.grantWorkspaces({
        agentId: AGENT_ID,
        workspaceIds: ["ws-1", "ws-team-only"],
      }),
    ).rejects.toThrow(/Threshold/);

    expect(db.workspaceUser.upsert).not.toHaveBeenCalled();
  });

  it("deduplicates repeated ids instead of tripping the all-or-nothing check", async () => {
    db.workspaceUser.findMany.mockResolvedValue(
      memberships([{ workspaceId: "ws-1", role: "member" }]),
    );

    const result = await caller(db).externalAgent.grantWorkspaces({
      agentId: AGENT_ID,
      workspaceIds: ["ws-1", "ws-1", "ws-1"],
    });

    expect(result).toEqual({ granted: 1 });
    expect(db.workspaceUser.upsert).toHaveBeenCalledTimes(1);
  });

  it("re-granting a workspace the agent already holds is an idempotent upsert", async () => {
    db.workspaceUser.findMany.mockResolvedValue(
      memberships([{ workspaceId: "ws-1", role: "admin" }]),
    );

    await expect(
      caller(db).externalAgent.grantWorkspaces({
        agentId: AGENT_ID,
        workspaceIds: ["ws-1"],
      }),
    ).resolves.toEqual({ granted: 1 });

    expect(db.workspaceUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { role: "member" } }),
    );
  });

  it("refuses an agent the caller does not own, before touching memberships", async () => {
    db.externalAgent.findFirst.mockResolvedValue(null);

    await expect(
      caller(db).externalAgent.grantWorkspaces({
        agentId: "someone-elses-agent",
        workspaceIds: ["ws-1"],
      }),
    ).rejects.toThrow(/Agent not found/);

    expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
    expect(db.workspaceUser.upsert).not.toHaveBeenCalled();
  });

  it("bounds the batch size", async () => {
    await expect(
      caller(db).externalAgent.grantWorkspaces({
        agentId: AGENT_ID,
        workspaceIds: Array.from({ length: 101 }, (_, i) => `ws-${i}`),
      }),
    ).rejects.toThrow();

    expect(db.workspaceUser.upsert).not.toHaveBeenCalled();
  });
});
