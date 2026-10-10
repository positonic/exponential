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
      holders: [{ userId: "aria", name: "Aria", isAgent: true }],
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

describe("position.update", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    arrangePosition(db);
    db.position.update.mockResolvedValue(createdPosition as never);
  });

  it.each<Role>(["owner", "admin"])("%s edits title, remit and not-accountable-for", async (role) => {
    arrangeCaller(db, role);

    await caller(db).position.update({
      workspaceId: WORKSPACE_ID,
      positionId: POSITION_ID,
      title: "Travel lead",
      remit: "New remit",
      notAccountableFor: "",
    });

    expect(db.position.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: POSITION_ID },
      data: { title: "Travel lead", remit: "New remit", notAccountableFor: null },
    });
    // An admin never needs to hold the Position.
    expect(db.positionHolder.findFirst).not.toHaveBeenCalled();
  });

  it("a holder who is a plain member edits the Remit", async () => {
    arrangeCaller(db, "member");
    db.positionHolder.findFirst.mockResolvedValue({ positionId: POSITION_ID } as never);

    await caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, remit: "Sharper" });

    expect(db.positionHolder.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { positionId: POSITION_ID, workspaceUser: { userId: USER_ID, workspaceId: WORKSPACE_ID } },
    });
    expect(db.position.update.mock.calls[0]?.[0]).toMatchObject({ data: { remit: "Sharper" } });
  });

  it("a holder who is a viewer edits the Remit too — the gate is holding it (Agent PRD D12)", async () => {
    arrangeCaller(db, "viewer");
    db.positionHolder.findFirst.mockResolvedValue({ positionId: POSITION_ID } as never);

    await caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, remit: "Sharper" });

    expect(db.position.update).toHaveBeenCalledTimes(1);
  });

  it("a member who does not hold it → FORBIDDEN, nothing written", async () => {
    arrangeCaller(db, "member");
    db.positionHolder.findFirst.mockResolvedValue(null);

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, remit: "Sharper" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("a team-only member (no WorkspaceUser row) is neither admin nor holder → FORBIDDEN", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue({ role: "owner", team: { workspaceId: WORKSPACE_ID } } as never);
    db.positionHolder.findFirst.mockResolvedValue(null);

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, remit: "Sharper" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it.each([
    { field: "title", input: { title: "Renamed" } },
    { field: "notAccountableFor", input: { notAccountableFor: "Booking" } },
  ])("a holder changing $field → FORBIDDEN, nothing written", async ({ input }) => {
    arrangeCaller(db, "member");
    db.positionHolder.findFirst.mockResolvedValue({ positionId: POSITION_ID } as never);

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, ...input }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("a positionId from another workspace → NOT_FOUND, even for an owner", async () => {
    arrangeCaller(db, "owner");
    arrangePosition(db, OTHER_WORKSPACE_ID);

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, title: "X" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expectNothingWritten(db);
  });

  it("a payload that edits nothing → BAD_REQUEST, so a viewer cannot reach the write", async () => {
    arrangeCaller(db, "viewer");

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNothingWritten(db);
  });

  it("renaming onto an existing title → CONFLICT", async () => {
    arrangeCaller(db, "owner");
    db.position.update.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, title: "Taken" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("position.delete", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    arrangePosition(db);
    db.position.delete.mockResolvedValue({ id: POSITION_ID } as never);
  });

  it("owner deletes; holders cascade", async () => {
    arrangeCaller(db, "owner");

    const result = await caller(db).position.delete({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID });

    expect(result).toEqual({ id: POSITION_ID });
    expect(db.position.delete).toHaveBeenCalledWith({ where: { id: POSITION_ID } });
  });

  it("member → FORBIDDEN, nothing written", async () => {
    arrangeCaller(db, "member");

    await expect(
      caller(db).position.delete({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("a positionId from another workspace → NOT_FOUND", async () => {
    arrangeCaller(db, "owner");
    arrangePosition(db, OTHER_WORKSPACE_ID);

    await expect(
      caller(db).position.delete({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expectNothingWritten(db);
  });
});

describe("position.setHolders", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    arrangePosition(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.positionHolder.deleteMany.mockResolvedValue({ count: 1 } as never);
    db.positionHolder.createMany.mockResolvedValue({ count: 2 } as never);
    db.position.findUniqueOrThrow.mockResolvedValue(createdPosition as never);
  });

  it("admin replaces the holder set in one transaction", async () => {
    arrangeCaller(db, "admin");
    db.workspaceUser.findMany.mockResolvedValue([{ id: "wu-aria" }, { id: "wu-andi" }] as never);

    const result = await caller(db).position.setHolders({
      workspaceId: WORKSPACE_ID,
      positionId: POSITION_ID,
      userIds: ["aria", "andi", "aria"],
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.positionHolder.deleteMany).toHaveBeenCalledWith({ where: { positionId: POSITION_ID } });
    expect(db.positionHolder.createMany).toHaveBeenCalledWith({
      data: [
        { positionId: POSITION_ID, workspaceUserId: "wu-aria" },
        { positionId: POSITION_ID, workspaceUserId: "wu-andi" },
      ],
    });
    expect(result).toMatchObject({ id: POSITION_ID, holders: [{ userId: "aria" }] });
  });

  it("an empty set leaves the Position vacant without a createMany", async () => {
    arrangeCaller(db, "owner");

    await caller(db).position.setHolders({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, userIds: [] });

    expect(db.positionHolder.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.positionHolder.createMany).not.toHaveBeenCalled();
    expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
  });

  it("member → FORBIDDEN, nothing written", async () => {
    arrangeCaller(db, "member");

    await expect(
      caller(db).position.setHolders({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, userIds: ["aria"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("a holder who is not a member → NOT_FOUND without the id, nothing written", async () => {
    arrangeCaller(db, "owner");
    db.workspaceUser.findMany.mockResolvedValue([] as never);

    const error = await caller(db)
      .position.setHolders({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, userIds: ["stranger-cuid"] })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "NOT_FOUND" });
    expect((error as Error).message).not.toContain("stranger-cuid");
    expectNothingWritten(db);
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
        holders: [{ userId: "aria", name: "Aria", image: null, isAgent: true }],
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

describe("position.coverage", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  const member = (opts: { isAgent?: boolean; assistant?: boolean; covered?: boolean } = {}) => ({
    user: {
      isAgent: opts.isAgent ?? false,
      externalAgentShadow: opts.isAgent ? { assistant: opts.assistant ? { id: "a" } : null } : null,
    },
    positionHolders: opts.covered ? [{ positionId: POSITION_ID }] : [],
  });

  it("offers the import in a team workspace where fewer than half hold a Position", async () => {
    // A viewer can read it: the pill shows to every member (Agent PRD D12).
    arrangeCaller(db, "viewer");
    db.workspace.findUnique.mockResolvedValue({ type: "team" } as never);
    db.workspaceUser.findMany.mockResolvedValue([
      member(),
      member(),
      member({ isAgent: true, assistant: true, covered: true }),
      // A plain External agent is a member but not in the ratio.
      member({ isAgent: true }),
    ] as never);

    const result = await caller(db).position.coverage({ workspaceId: WORKSPACE_ID });

    expect(result).toEqual({ offerImport: true, memberCount: 4, eligibleCount: 3, coveredCount: 1 });
  });

  it("stops offering once half of the humans and Assistants hold a Position", async () => {
    arrangeCaller(db, "owner");
    db.workspace.findUnique.mockResolvedValue({ type: "team" } as never);
    db.workspaceUser.findMany.mockResolvedValue([
      member({ covered: true }),
      member(),
      member({ isAgent: true, assistant: true, covered: true }),
      member({ isAgent: true, assistant: true }),
    ] as never);

    const result = await caller(db).position.coverage({ workspaceId: WORKSPACE_ID });

    expect(result).toEqual({ offerImport: false, memberCount: 4, eligibleCount: 4, coveredCount: 2 });
  });

  it("never offers it in a personal workspace", async () => {
    arrangeCaller(db, "owner");
    db.workspace.findUnique.mockResolvedValue({ type: "personal" } as never);
    db.workspaceUser.findMany.mockResolvedValue([member(), member({ isAgent: true, assistant: true })] as never);

    const result = await caller(db).position.coverage({ workspaceId: WORKSPACE_ID });

    expect(result.offerImport).toBe(false);
  });

  it("never offers it to a workspace of one", async () => {
    arrangeCaller(db, "owner");
    db.workspace.findUnique.mockResolvedValue({ type: "team" } as never);
    db.workspaceUser.findMany.mockResolvedValue([member()] as never);

    const result = await caller(db).position.coverage({ workspaceId: WORKSPACE_ID });

    expect(result).toEqual({ offerImport: false, memberCount: 1, eligibleCount: 1, coveredCount: 0 });
  });

  it("refuses a non-member without reading the workspace", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue(null);

    await expect(caller(db).position.coverage({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
  });
});

describe("position.importMany", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  /** The workspace already has "Travel researcher", held by Aria. */
  function arrangeExisting() {
    db.position.findMany.mockResolvedValue([
      {
        id: POSITION_ID,
        title: "Travel researcher",
        holders: [{ workspaceUser: { userId: "aria" } }],
      },
    ] as never);
  }

  function arrangeMembers(userIds: string[]) {
    db.workspaceUser.findMany.mockResolvedValue(
      userIds.map((userId) => ({ id: `wu-${userId}`, userId })) as never,
    );
  }

  const rows = [
    // Matches "Travel researcher" case-insensitively; adds Andi.
    { title: "travel RESEARCHER", remit: "Shortlists hotels", holderUserIds: ["andi"] },
    { title: "Delivery lead", remit: "Keeps the plan honest", notAccountableFor: "Budget", holderUserIds: ["andi"] },
  ];

  describe("dry run", () => {
    it.each<Role>(["owner", "admin"])("%s gets the plan and nothing is written", async (role) => {
      arrangeCaller(db, role);
      arrangeMembers(["andi"]);
      arrangeExisting();

      const result = await caller(db).position.importMany({ workspaceId: WORKSPACE_ID, dryRun: true, positions: rows });

      expect(result).toEqual({
        written: false,
        results: [
          { title: "Travel researcher", outcome: "update", holderUserIds: ["aria", "andi"] },
          { title: "Delivery lead", outcome: "create", holderUserIds: ["andi"] },
        ],
      });
      expect(db.position.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { workspaceId: WORKSPACE_ID } });
      expectNothingWritten(db);
    });

    it.each<Role>(["member", "viewer"])("%s → FORBIDDEN, nothing read or written", async (role) => {
      arrangeCaller(db, role);

      await expect(
        caller(db).position.importMany({ workspaceId: WORKSPACE_ID, dryRun: true, positions: rows }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.position.findMany).not.toHaveBeenCalled();
      expectNothingWritten(db);
    });

    it("a holder who is not a member → NOT_FOUND without naming the id, before any plan", async () => {
      arrangeCaller(db, "owner");
      arrangeMembers(["andi"]);

      const error = await caller(db)
        .position.importMany({
          workspaceId: WORKSPACE_ID,
          dryRun: true,
          positions: [{ title: "X", remit: "Y", holderUserIds: ["andi", "stranger-cuid"] }],
        })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ code: "NOT_FOUND" });
      expect((error as Error).message).not.toContain("stranger-cuid");
      expect(db.position.findMany).not.toHaveBeenCalled();
      expectNothingWritten(db);
    });

    it("the same title twice in one import (any case) → BAD_REQUEST", async () => {
      arrangeCaller(db, "owner");

      await expect(
        caller(db).position.importMany({
          workspaceId: WORKSPACE_ID,
          dryRun: true,
          positions: [
            { title: "Delivery lead", remit: "A", holderUserIds: [] },
            { title: " delivery LEAD", remit: "B", holderUserIds: [] },
          ],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expectNothingWritten(db);
    });

    it("an empty import → BAD_REQUEST", async () => {
      arrangeCaller(db, "owner");

      await expect(
        caller(db).position.importMany({ workspaceId: WORKSPACE_ID, dryRun: true, positions: [] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  it("is refused for an agent principal (isAgent: true), even an owner by role", async () => {
    arrangeCaller(db, "owner", { isAgent: true });

    await expect(
      caller(db).position.importMany({ workspaceId: WORKSPACE_ID, dryRun: true, positions: rows }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.position.findMany).not.toHaveBeenCalled();
    expectNothingWritten(db);
  });

  it("is refused for an agent-key token before any principal lookup", async () => {
    arrangeCaller(db, "owner");

    await expect(
      caller(db, { tokenType: "agent-key" }).position.importMany({
        workspaceId: WORKSPACE_ID,
        dryRun: false,
        positions: rows,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expectNothingWritten(db);
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

  it("update from an agent principal → FORBIDDEN, nothing written", async () => {
    await expect(
      caller(db).position.update({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, remit: "Y" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("delete from an agent principal → FORBIDDEN, nothing written", async () => {
    await expect(
      caller(db).position.delete({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  it("setHolders from an agent principal → FORBIDDEN, nothing written", async () => {
    await expect(
      caller(db).position.setHolders({ workspaceId: WORKSPACE_ID, positionId: POSITION_ID, userIds: [USER_ID] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNothingWritten(db);
  });

  const base = { workspaceId: WORKSPACE_ID, positionId: POSITION_ID };
  it.each([
    { write: "create", call: () => caller(db, { tokenType: "agent-key" }).position.create({ workspaceId: WORKSPACE_ID, title: "X", remit: "Y" }) },
    { write: "update", call: () => caller(db, { tokenType: "agent-key" }).position.update({ ...base, remit: "Y" }) },
    { write: "delete", call: () => caller(db, { tokenType: "agent-key" }).position.delete(base) },
    { write: "setHolders", call: () => caller(db, { tokenType: "agent-key" }).position.setHolders({ ...base, userIds: [] }) },
  ])("$write with an agent-key token → FORBIDDEN before any principal lookup", async ({ call }) => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);

    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expectNothingWritten(db);
  });
});
