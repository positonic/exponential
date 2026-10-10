/**
 * `position.*` — Positions are routing data managed by humans (ADR-0068).
 *
 * Owners and admins create, rename, delete and set holders; a holder may edit
 * the Remit of a Position they hold; every write refuses an agent principal;
 * a Position from another workspace is NOT_FOUND, never FORBIDDEN.
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
const OTHER_WORKSPACE_ID = "ws-2";
const POSITION_ID = "pos-1";

type Role = "owner" | "admin" | "member" | "viewer";

function caller(db: DeepMockProxy<PrismaClient>, opts: { userId?: string; tokenType?: string } = {}) {
  return createMockCaller({
    userId: opts.userId ?? USER_ID,
    db: db as unknown as PrismaClient,
    tokenType: opts.tokenType,
  });
}

/**
 * The caller is a human holding `role` in WORKSPACE_ID. `humanOnlyProcedure`
 * reads `user.findUnique`; `requireWorkspaceMembership` and the router's own
 * role check read the direct `workspaceUser.findUnique` row.
 */
function arrangeCaller(db: DeepMockProxy<PrismaClient>, role: Role, opts: { isAgent?: boolean } = {}) {
  db.user.findUnique.mockResolvedValue({ isAgent: opts.isAgent ?? false } as never);
  db.workspaceUser.findUnique.mockResolvedValue({
    id: `wu-${USER_ID}`,
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role,
  } as never);
  db.teamUser.findFirst.mockResolvedValue(null);
}

function arrangePosition(db: DeepMockProxy<PrismaClient>, workspaceId = WORKSPACE_ID) {
  db.position.findUnique.mockResolvedValue({ id: POSITION_ID, workspaceId } as never);
}

const createdPosition = {
  id: POSITION_ID,
  title: "Travel researcher",
  remit: "Research travel options",
  notAccountableFor: null,
  holders: [
    { workspaceUser: { user: { id: "aria", name: "Aria", image: null, isAgent: true } } },
  ],
};

/** Every Prisma write the router can make, so "nothing written" is one assertion. */
function expectNothingWritten(db: DeepMockProxy<PrismaClient>) {
  expect(db.position.create).not.toHaveBeenCalled();
  expect(db.position.update).not.toHaveBeenCalled();
  expect(db.position.delete).not.toHaveBeenCalled();
  expect(db.positionHolder.createMany).not.toHaveBeenCalled();
  expect(db.positionHolder.deleteMany).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
}

describe("position.create", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it.each<Role>(["owner", "admin"])("%s creates the Position with its holders in one write", async (role) => {
    arrangeCaller(db, role);
    db.workspaceUser.findMany.mockResolvedValue([{ id: "wu-aria" }] as never);
    db.position.create.mockResolvedValue(createdPosition as never);

    const result = await caller(db).position.create({
      workspaceId: WORKSPACE_ID,
      title: "  Travel researcher ",
      remit: "Research travel options",
      holderUserIds: ["aria"],
    });

    expect(db.position.create).toHaveBeenCalledTimes(1);
    expect(db.position.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        workspaceId: WORKSPACE_ID,
        title: "Travel researcher",
        remit: "Research travel options",
        notAccountableFor: null,
        holders: { create: [{ workspaceUserId: "wu-aria" }] },
      },
    });
    expect(result).toMatchObject({
      id: POSITION_ID,
      title: "Travel researcher",
      holders: [{ id: "aria", name: "Aria", isAgent: true }],
    });
  });

  it.each<Role>(["member", "viewer"])("%s → FORBIDDEN, nothing written", async (role) => {
    arrangeCaller(db, role);

    await expect(
      caller(db).position.create({ workspaceId: WORKSPACE_ID, title: "X", remit: "Y" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expectNothingWritten(db);
  });

  it("a holder who is not a member of the workspace → NOT_FOUND, without naming the id", async () => {
    arrangeCaller(db, "owner");
    // Two ids asked for, one membership found.
    db.workspaceUser.findMany.mockResolvedValue([{ id: "wu-aria" }] as never);

    const error = await caller(db)
      .position.create({ workspaceId: WORKSPACE_ID, title: "X", remit: "Y", holderUserIds: ["aria", "stranger-cuid"] })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "NOT_FOUND" });
    expect((error as Error).message).not.toContain("stranger-cuid");
    expectNothingWritten(db);
  });

  it("a duplicate title → CONFLICT", async () => {
    arrangeCaller(db, "owner");
    db.position.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    await expect(
      caller(db).position.create({ workspaceId: WORKSPACE_ID, title: "Travel researcher", remit: "Y" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("position.list", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("refuses a non-member", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue(null);

    await expect(caller(db).position.list({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.position.findMany).not.toHaveBeenCalled();
  });

  it("returns Positions with holders, and a remitGap per member", async () => {
    arrangeCaller(db, "viewer");
    db.position.findMany.mockResolvedValue([createdPosition] as never);
    db.workspaceUser.findMany.mockResolvedValue([
      // Human with no Position: gap.
      { userId: "human", user: { isAgent: false, externalAgentShadow: null }, positionHolders: [] },
      // Agent holding the Position: no gap.
      { userId: "aria", user: { isAgent: true, externalAgentShadow: { description: null } }, positionHolders: [{ positionId: POSITION_ID }] },
      // Agent with no Position and a blank description: gap.
      { userId: "bot-blank", user: { isAgent: true, externalAgentShadow: { description: "  " } }, positionHolders: [] },
      // Agent with no Position but a description: its fallback Remit, no gap.
      { userId: "bot-described", user: { isAgent: true, externalAgentShadow: { description: "Triages bugs" } }, positionHolders: [] },
    ] as never);

    const result = await caller(db).position.list({ workspaceId: WORKSPACE_ID });

    expect(db.position.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { title: "asc" },
    });
    expect(result.positions).toEqual([
      {
        id: POSITION_ID,
        title: "Travel researcher",
        remit: "Research travel options",
        notAccountableFor: null,
        holders: [{ id: "aria", name: "Aria", image: null, isAgent: true }],
      },
    ]);
    expect(result.members).toEqual([
      { userId: "human", positionIds: [], remitGap: true },
      { userId: "aria", positionIds: [POSITION_ID], remitGap: false },
      { userId: "bot-blank", positionIds: [], remitGap: true },
      { userId: "bot-described", positionIds: [], remitGap: false },
    ]);
  });
});

describe("position writes are human-only (ADR-0049 denylist)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    // Even as a workspace owner by role, an agent principal is refused.
    arrangeCaller(db, "owner", { isAgent: true });
    arrangePosition(db);
  });

  it("create from an agent principal (isAgent: true) → FORBIDDEN, nothing written", async () => {
    await expect(
      caller(db).position.create({ workspaceId: WORKSPACE_ID, title: "X", remit: "Y" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("create with an agent-key token → FORBIDDEN before any principal lookup", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);

    await expect(
      caller(db, { tokenType: "agent-key" }).position.create({ workspaceId: WORKSPACE_ID, title: "X", remit: "Y" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expectNothingWritten(db);
  });
});
