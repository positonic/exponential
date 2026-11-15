/**
 * Unit tests for the `assistant` router.
 *
 * The Assistant row carries the user's chosen agent name plus their free-text
 * persona (`personality`, `instructions`, `userContext`) — the persona is
 * injected verbatim into the system prompt by /api/chat/stream, so read access
 * to a row is read access to private content.
 *
 * These tests pin two properties:
 *   1. Ownership — only the creator can read/rename/delete their assistant.
 *      Every id-addressed procedure took an arbitrary CUID with no ownership
 *      check, so any authenticated principal could rename or delete any
 *      assistant in any workspace (cross-tenant IDOR).
 *   2. Per-user scoping — `getMine`/`list` resolve only the caller's own
 *      Assistant. Since ADR-0072 an Assistant is one per person and belongs
 *      to no workspace, so co-members can never share or overwrite one.
 *
 * Uses `mockDeep<PrismaClient>()` — no real DB, ever.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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

const OWNER_ID = "user-owner";
const ATTACKER_ID = "user-attacker";
const WORKSPACE_ID = "ws-1";
const ASSISTANT_ID = "assistant-1";

/** A row belonging to OWNER_ID, as the DB would return it. */
const ownedAssistant = {
  id: ASSISTANT_ID,
  createdById: OWNER_ID,
  externalAgentId: "agent-1",
  name: "Aria",
  emoji: "✨",
  personality: "Warm, direct, allergic to filler.",
  instructions: null,
  userContext: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

/**
 * Make the ownership-scoped lookup behave like Postgres: return the row only
 * when the query actually asks for this row's owner. A resolver that omits
 * `createdById` from its `where` gets the row back — which is the bug.
 */
function stubOwnershipScopedLookup(dbMock: DeepMockProxy<PrismaClient>) {
  const matches = (where: Record<string, unknown> | undefined) =>
    where?.id === ASSISTANT_ID && where?.createdById === OWNER_ID;

  dbMock.assistant.findFirst.mockImplementation((args) =>
    Promise.resolve(
      matches(args?.where as Record<string, unknown> | undefined) ? ownedAssistant : null,
    ) as never,
  );
  dbMock.assistant.findUnique.mockImplementation((args) =>
    Promise.resolve(
      (args?.where as Record<string, unknown> | undefined)?.id === ASSISTANT_ID
        ? ownedAssistant
        : null,
    ) as never,
  );
}

describe("assistant router — ownership (cross-tenant IDOR)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // Mutations are humanOnly: the caller is a human (not an agent principal).
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    stubOwnershipScopedLookup(dbMock);
    dbMock.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) =>
      cb(dbMock)) as never);
    dbMock.assistant.update.mockResolvedValue(ownedAssistant as never);
    // A rename propagates to the principal (ADR-0067); the shadow user is resolved from it.
    dbMock.externalAgent.update.mockResolvedValue({ shadowUserId: "shadow-1" } as never);
    dbMock.user.update.mockResolvedValue({} as never);
    dbMock.assistant.delete.mockResolvedValue(ownedAssistant as never);
    dbMock.assistant.updateMany.mockResolvedValue({ count: 0 } as never);
  });

  it("refuses to rename an assistant the caller does not own", async () => {
    const caller = createMockCaller({ userId: ATTACKER_ID, db: dbMock });

    await expect(
      caller.assistant.update({ id: ASSISTANT_ID, name: "pwned" }),
    ).rejects.toThrow(TRPCError);

    expect(dbMock.assistant.update).not.toHaveBeenCalled();
  });

  it("refuses to delete an assistant the caller does not own", async () => {
    const caller = createMockCaller({ userId: ATTACKER_ID, db: dbMock });

    await expect(caller.assistant.delete({ id: ASSISTANT_ID })).rejects.toThrow(TRPCError);

    expect(dbMock.assistant.delete).not.toHaveBeenCalled();
  });

  it("refuses to read another user's persona via getById", async () => {
    const caller = createMockCaller({ userId: ATTACKER_ID, db: dbMock });

    await expect(caller.assistant.getById({ id: ASSISTANT_ID })).rejects.toThrow(TRPCError);
  });

  it("still lets the owner rename their own assistant", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(
      caller.assistant.update({ id: ASSISTANT_ID, name: "Max" }),
    ).resolves.toMatchObject({ id: ASSISTANT_ID });

    expect(dbMock.assistant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Max" }) }),
    );
  });
});

describe("assistant router — per-user scoping", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // Mutations are humanOnly: the caller is a human (not an agent principal).
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    // Direct workspace membership, as `getWorkspaceMembership` reads it.
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "owner",
      workspaceId: WORKSPACE_ID,
    } as never);
    dbMock.assistant.findFirst.mockResolvedValue(ownedAssistant as never);
    dbMock.assistant.findMany.mockResolvedValue([ownedAssistant] as never);
    dbMock.assistant.updateMany.mockResolvedValue({ count: 0 } as never);
    dbMock.assistant.create.mockResolvedValue(ownedAssistant as never);
    dbMock.assistant.update.mockResolvedValue(ownedAssistant as never);
  });

  it("lists only the calling user's non-retired Assistant, and only where it works (ADR-0072)", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.list({ workspaceId: WORKSPACE_ID });

    expect(dbMock.assistant.findMany).toHaveBeenCalledWith({
      where: {
        createdById: OWNER_ID,
        retiredAt: null,
        // It belongs to no workspace: "works here" is its principal's membership.
        externalAgent: {
          shadowUser: { workspaceMemberships: { some: { workspaceId: WORKSPACE_ID } } },
        },
      },
    });
  });

  it("never loads a retired assistant for an id-addressed mutation (ADR-0072)", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.update({ id: ASSISTANT_ID, emoji: "🦊" });

    expect(dbMock.assistant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSISTANT_ID, createdById: OWNER_ID, retiredAt: null },
      }),
    );
  });

  it("refuses to list assistants in a workspace the caller does not belong to", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: ATTACKER_ID, db: dbMock });

    await expect(caller.assistant.list({ workspaceId: WORKSPACE_ID })).rejects.toThrow(
      TRPCError,
    );
    expect(dbMock.assistant.findMany).not.toHaveBeenCalled();
  });

  it("refuses to create a second Assistant for a person who has one, writing nothing (ADR-0072)", async () => {
    // findFirst resolves the caller's existing Assistant (beforeEach).
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(
      caller.assistant.create({
        name: "Aria",
        personality: "Warm, direct.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(dbMock.assistant.updateMany).not.toHaveBeenCalled();
    expect(dbMock.assistant.create).not.toHaveBeenCalled();
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });
});

describe("assistant.getMine — one Assistant per person (ADR-0072)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = mockDeep<PrismaClient>();
  });

  it("resolves the caller's non-retired Assistant with no workspace in the query", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(ownedAssistant as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.getMine()).resolves.toMatchObject({ id: ASSISTANT_ID });

    const args = dbMock.assistant.findFirst.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ createdById: OWNER_ID, retiredAt: null });
    expect(args?.orderBy).toEqual({ updatedAt: "desc" });
    expect(args?.include).toHaveProperty("externalAgent");
  });

  it("is null for a person with no Assistant yet", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.getMine()).resolves.toBeNull();
  });
});

describe("assistant.addToWorkspace — the External-agent grant path (Agent PRD D6)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const TEAM_WS = "ws-team";
  const PERSONAL_WS = "ws-personal";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    dbMock.assistant.findFirst.mockResolvedValue(ownedAssistant as never);
    dbMock.externalAgent.findUniqueOrThrow.mockResolvedValue({ shadowUserId: "shadow-1" } as never);
    dbMock.workspaceUser.upsert.mockResolvedValue({} as never);
  });

  it("grants `member`, and only `member`, where the person is at least a member", async () => {
    dbMock.workspaceUser.findMany.mockResolvedValue([
      { userId: OWNER_ID, workspaceId: TEAM_WS, role: "member" },
    ] as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.addToWorkspace({ workspaceId: TEAM_WS })).resolves.toEqual({
      assistantId: ASSISTANT_ID,
      workspaceId: TEAM_WS,
    });

    expect(dbMock.externalAgent.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: ownedAssistant.externalAgentId },
      select: { shadowUserId: true },
    });
    expect(dbMock.workspaceUser.upsert).toHaveBeenCalledWith({
      where: { userId_workspaceId: { userId: "shadow-1", workspaceId: TEAM_WS } },
      create: { userId: "shadow-1", workspaceId: TEAM_WS, role: "member" },
      update: { role: "member" },
    });
  });

  it("refuses a person who is only a viewer there, and writes nothing", async () => {
    dbMock.workspaceUser.findMany.mockResolvedValue([
      { userId: OWNER_ID, workspaceId: TEAM_WS, role: "viewer" },
    ] as never);
    dbMock.workspace.findMany.mockResolvedValue([{ name: "Acme" }] as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.addToWorkspace({ workspaceId: TEAM_WS })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Acme"),
    });

    expect(dbMock.workspaceUser.upsert).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a workspace the person is not in at all, before creating an Assistant", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    dbMock.workspaceUser.findMany.mockResolvedValue([] as never);
    dbMock.workspace.findMany.mockResolvedValue([] as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.addToWorkspace({ workspaceId: TEAM_WS })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.workspaceUser.upsert).not.toHaveBeenCalled();
  });

  it("creates the person's Assistant on first need, then adds it (ADR-0072)", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    dbMock.workspaceUser.findMany.mockResolvedValue([
      { userId: OWNER_ID, workspaceId: TEAM_WS, role: "admin" },
    ] as never);
    dbMock.workspace.findFirst.mockResolvedValue({ id: PERSONAL_WS } as never);
    dbMock.workspaceUser.findUnique.mockResolvedValue({ role: "owner" } as never);
    dbMock.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) =>
      cb(dbMock)) as never);
    dbMock.user.create.mockResolvedValue({ id: "shadow-1" } as never);
    dbMock.externalAgent.create.mockResolvedValue({ id: "agent-1" } as never);
    dbMock.assistant.create.mockResolvedValue(ownedAssistant as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.addToWorkspace({ workspaceId: TEAM_WS });

    expect(dbMock.assistant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Zoe", createdById: OWNER_ID }) }),
    );
    const grantedWorkspaces = dbMock.workspaceUser.upsert.mock.calls.map(
      ([args]) => args.create.workspaceId,
    );
    expect(grantedWorkspaces).toEqual([PERSONAL_WS, TEAM_WS]);
  });
});

describe("assistant.removeFromWorkspace", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    dbMock.workspaceUser.deleteMany.mockResolvedValue({ count: 1 } as never);
    dbMock.projectMember.deleteMany.mockResolvedValue({ count: 0 } as never);
  });

  it("removes the caller's own Assistant from one workspace, with its project grants there", async () => {
    dbMock.assistant.findFirst.mockResolvedValue({
      id: ASSISTANT_ID,
      externalAgent: { shadowUserId: "shadow-1" },
    } as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.removeFromWorkspace({ workspaceId: WORKSPACE_ID })).resolves.toEqual({
      removed: true,
    });

    // Only ever the caller's own non-retired Assistant.
    expect(dbMock.assistant.findFirst.mock.calls[0]?.[0]?.where).toEqual({
      createdById: OWNER_ID,
      retiredAt: null,
    });
    expect(dbMock.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: "shadow-1", workspaceId: WORKSPACE_ID },
    });
    expect(dbMock.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ["shadow-1"] }, project: { workspaceId: WORKSPACE_ID } },
    });
  });

  it("is NOT_FOUND for a person with no Assistant, and deletes nothing", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(
      caller.assistant.removeFromWorkspace({ workspaceId: WORKSPACE_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMock.workspaceUser.deleteMany).not.toHaveBeenCalled();
  });
});

describe("assistant.myWorkspaces — Settings → Assistant's list", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  const memberships = [
    { role: "owner", workspace: { id: "ws-personal", name: "Personal", slug: "p", type: "personal" } },
    { role: "member", workspace: { id: "ws-team", name: "Team", slug: "t", type: "team" } },
    { role: "viewer", workspace: { id: "ws-view", name: "Viewing", slug: "v", type: "team" } },
  ];

  it("marks where the Assistant works and where its person may add it", async () => {
    dbMock.assistant.findFirst.mockResolvedValue({ externalAgent: { shadowUserId: "shadow-1" } } as never);
    dbMock.workspaceUser.findMany.mockImplementation(((args: { where: { userId: string } }) =>
      Promise.resolve(
        args.where.userId === "shadow-1" ? [{ workspaceId: "ws-personal" }] : memberships,
      )) as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(caller.assistant.myWorkspaces()).resolves.toEqual([
      { id: "ws-personal", name: "Personal", slug: "p", type: "personal", canAdd: true, assistantIsMember: true },
      { id: "ws-team", name: "Team", slug: "t", type: "team", canAdd: true, assistantIsMember: false },
      // A viewer cannot delegate member-level access (ADR-0049).
      { id: "ws-view", name: "Viewing", slug: "v", type: "team", canAdd: false, assistantIsMember: false },
    ]);
  });

  it("with no Assistant yet, it works nowhere", async () => {
    dbMock.assistant.findFirst.mockResolvedValue(null);
    dbMock.workspaceUser.findMany.mockResolvedValue(memberships as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    const result = await caller.assistant.myWorkspaces();

    expect(result.every((w) => !w.assistantIsMember)).toBe(true);
    expect(dbMock.workspaceUser.findMany).toHaveBeenCalledTimes(1);
  });
});
