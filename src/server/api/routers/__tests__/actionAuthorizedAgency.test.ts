/**
 * Authorized agency on the action router's bypass routes (Agent principles
 * PRD, Phase 3; ADR-0049, ADR-0071; dev-docs/AGENT_PRINCIPLES_AUDIT.md):
 * a caller — person or agent — writes only rows its own permissions reach.
 *
 * - `initializeKanbanOrders` writes `kanbanStatus` / `kanbanOrder` across a
 *   whole project, so it requires edit access to that project.
 * - `upsertBySource` refreshes an existing row, so being a workspace writer
 *   is not enough: the caller must be able to edit that row.
 *
 * Mocked Prisma (`vitest-mock-extended`) — no real DB, ever (CLAUDE.md "Test
 * database safety"). Harness mirrors timeEntry.test.ts.
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

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
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

import { createCaller } from "~/server/api/root";
import { createMockCaller } from "~/test/trpc-helpers";

const PERSON_ID = "person-1";
const STRANGER_ID = "stranger-1";
const SHADOW_ID = "shadow-1";
const PROJECT_ID = "project-1";
const WS_ID = "ws-1";

function personCaller(db: DeepMockProxy<PrismaClient>, userId = PERSON_ID) {
  return createMockCaller({ userId, db: db as unknown as PrismaClient });
}

/** The context an `exp_agent_…` key produces: the shadow user's session, tokenType "agent-key". */
function agentCaller(db: DeepMockProxy<PrismaClient>) {
  return createCaller({
    db: db as unknown as PrismaClient,
    session: {
      user: { id: SHADOW_ID, email: "shadow@agents.test", name: "claude", image: null, isAdmin: false },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    headers: new Headers(),
    tokenType: "agent-key",
  });
}

/**
 * A private, unrestricted project in WS_ID created by PERSON_ID. Nobody else
 * is a project, team or workspace member unless a test says so.
 */
function arrangeProject(db: DeepMockProxy<PrismaClient>) {
  db.project.findUnique.mockResolvedValue({
    createdById: PERSON_ID,
    teamId: null,
    workspaceId: WS_ID,
    isPublic: false,
    isRestricted: false,
  } as never);
  db.projectMember.findFirst.mockResolvedValue(null);
  db.workspaceUser.findUnique.mockResolvedValue(null);
  db.teamUser.findFirst.mockResolvedValue(null);
}

describe("action.initializeKanbanOrders requires edit access to the project", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    arrangeProject(db);
    db.action.findMany.mockResolvedValue([
      { id: "a1", kanbanStatus: null },
      { id: "a2", kanbanStatus: "IN_PROGRESS" },
    ] as never);
    db.action.findFirst.mockResolvedValue({ kanbanOrder: 4 } as never);
    db.action.update.mockResolvedValue({} as never);
  });

  it("a non-member gets FORBIDDEN and no row changes", async () => {
    await expect(
      personCaller(db, STRANGER_ID).action.initializeKanbanOrders({ projectId: PROJECT_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.action.update).not.toHaveBeenCalled();
    expect(db.action.updateMany).not.toHaveBeenCalled();
  });

  it("a workspace viewer gets FORBIDDEN: viewing a project is not editing it", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: WS_ID } as never);
    await expect(
      personCaller(db, STRANGER_ID).action.initializeKanbanOrders({ projectId: PROJECT_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.action.update).not.toHaveBeenCalled();
  });

  it("an agent key outside the project gets FORBIDDEN (bypass route)", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    db.externalAgent.findUnique.mockResolvedValue({ id: "agent-1", ownerId: PERSON_ID } as never);
    await expect(agentCaller(db).action.initializeKanbanOrders({ projectId: PROJECT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.action.update).not.toHaveBeenCalled();
  });

  it("an unknown project gets FORBIDDEN and no row changes", async () => {
    db.project.findUnique.mockResolvedValue(null);
    await expect(
      personCaller(db).action.initializeKanbanOrders({ projectId: "missing" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.action.update).not.toHaveBeenCalled();
  });

  it("a project editor initializes the orders", async () => {
    const result = await personCaller(db).action.initializeKanbanOrders({ projectId: PROJECT_ID });
    expect(result.updated).toBe(2);
    expect(db.action.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { kanbanStatus: "TODO", kanbanOrder: 5 },
    });
    expect(db.action.update).toHaveBeenCalledWith({
      where: { id: "a2" },
      data: { kanbanStatus: "IN_PROGRESS", kanbanOrder: 6 },
    });
  });
});
