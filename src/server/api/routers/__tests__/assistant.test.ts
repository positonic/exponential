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
 *   2. Per-user scoping — `getDefault`/`list` are scoped by creator as well as
 *      workspace, and setting a default only unsets the *caller's* other
 *      defaults. Workspace-wide scoping meant co-members shared a single
 *      "default assistant" and silently overwrote each other's agent name.
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
  workspaceId: WORKSPACE_ID,
  createdById: OWNER_ID,
  name: "Aria",
  emoji: "✨",
  personality: "Warm, direct, allergic to filler.",
  instructions: null,
  userContext: null,
  isDefault: true,
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
    stubOwnershipScopedLookup(dbMock);
    dbMock.assistant.update.mockResolvedValue(ownedAssistant as never);
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

  it("refuses to flip another user's default via setDefault", async () => {
    const caller = createMockCaller({ userId: ATTACKER_ID, db: dbMock });

    await expect(caller.assistant.setDefault({ id: ASSISTANT_ID })).rejects.toThrow(TRPCError);

    expect(dbMock.assistant.update).not.toHaveBeenCalled();
    expect(dbMock.assistant.updateMany).not.toHaveBeenCalled();
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

describe("assistant router — per-user default scoping", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
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

  it("scopes getDefault to the calling user, not just the workspace", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.getDefault({ workspaceId: WORKSPACE_ID });

    expect(dbMock.assistant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          createdById: OWNER_ID,
        }),
      }),
    );
  });

  it("scopes list to the calling user, not just the workspace", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.list({ workspaceId: WORKSPACE_ID });

    expect(dbMock.assistant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          createdById: OWNER_ID,
        }),
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

  it("only unsets the caller's own defaults when creating a new default", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await caller.assistant.create({
      workspaceId: WORKSPACE_ID,
      name: "Aria",
      personality: "Warm, direct.",
      isDefault: true,
    });

    expect(dbMock.assistant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdById: OWNER_ID }),
      }),
    );
  });
});
