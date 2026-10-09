/**
 * `assistant.create` makes the Assistant a principal (ADR-0067): one
 * transaction writing shadow User → External agent → workspace membership →
 * Assistant, in that order, so the Assistant is an ordinary assignee the
 * moment it exists and a half-made one never does.
 *
 * Uses `mockDeep<PrismaClient>()` — no real DB, ever.
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

const OWNER_ID = "user-owner";
const WORKSPACE_ID = "ws-1";
const SHADOW_USER_ID = "user-shadow";
const AGENT_ID = "agent-1";

describe("assistant.create — the Assistant is a principal (ADR-0067)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  /** Every mocked write, in call order. */
  let writes: string[];

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    writes = [];

    // Owner is a non-viewer member — the delegation-invariant precondition.
    dbMock.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    dbMock.assistant.updateMany.mockResolvedValue({ count: 0 } as never);

    dbMock.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) =>
      cb(dbMock)) as never);

    dbMock.user.create.mockImplementation((() => {
      writes.push("user");
      return Promise.resolve({ id: SHADOW_USER_ID });
    }) as never);
    dbMock.externalAgent.create.mockImplementation((() => {
      writes.push("externalAgent");
      return Promise.resolve({ id: AGENT_ID });
    }) as never);
    dbMock.workspaceUser.upsert.mockImplementation((() => {
      writes.push("workspaceUser");
      return Promise.resolve({});
    }) as never);
    dbMock.assistant.create.mockImplementation(((args: { data: Record<string, unknown> }) => {
      writes.push("assistant");
      return Promise.resolve({ id: "assistant-1", ...args.data });
    }) as never);
  });

  it("writes shadow user → External agent → membership → Assistant, in one transaction", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    const created = await caller.assistant.create({
      workspaceId: WORKSPACE_ID,
      name: "Aria",
      emoji: "✨",
      personality: "Warm, direct.",
    });

    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["user", "externalAgent", "workspaceUser", "assistant"]);

    expect(dbMock.user.create.mock.calls[0]?.[0]).toMatchObject({
      data: { name: "Aria", isAgent: true },
    });
    expect(dbMock.externalAgent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { name: "Aria", ownerId: OWNER_ID, shadowUserId: SHADOW_USER_ID },
    });
    // Agents only ever hold `member` (ADR-0049), in the Assistant's own workspace.
    expect(dbMock.workspaceUser.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_workspaceId: { userId: SHADOW_USER_ID, workspaceId: WORKSPACE_ID } },
      create: { userId: SHADOW_USER_ID, workspaceId: WORKSPACE_ID, role: "member" },
      update: { role: "member" },
    });
    expect(dbMock.assistant.create.mock.calls[0]?.[0]).toMatchObject({
      data: { externalAgentId: AGENT_ID, createdById: OWNER_ID, workspaceId: WORKSPACE_ID },
    });
    expect(created).toMatchObject({ externalAgentId: AGENT_ID });
  });

  it("refuses when the owner is not a member of the workspace, writing nothing", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: OWNER_ID, db: dbMock });

    await expect(
      caller.assistant.create({ workspaceId: WORKSPACE_ID, name: "Aria", personality: "x" }),
    ).rejects.toThrow();

    expect(writes).toEqual([]);
  });
});
