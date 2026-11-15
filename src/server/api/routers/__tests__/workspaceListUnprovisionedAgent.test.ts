/**
 * `workspace.list` for an agent nobody has added to a workspace (raw.ledge).
 *
 * Its key authenticates, and an empty list read as "you have no workspaces"
 * is how such a key went unnoticed in the CLI and MCP tools. A person always
 * has a Personal workspace, so only an agent can get here; it gets an error
 * that says what to do.
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
import { UNPROVISIONED_AGENT_MESSAGE } from "../workspace";

const USER_ID = "user-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

describe("workspace.list", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("tells an agent in no workspace why it sees nothing, instead of returning []", async () => {
    db.workspace.findMany.mockResolvedValue([] as never);
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);

    await expect(caller(db).workspace.list()).rejects.toThrow(UNPROVISIONED_AGENT_MESSAGE);
  });

  it("still returns [] to a person with no visible workspace (no error for humans)", async () => {
    db.workspace.findMany.mockResolvedValue([] as never);
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);

    await expect(caller(db).workspace.list()).resolves.toEqual([]);
  });

  it("never looks the caller up when there are workspaces to return", async () => {
    db.workspace.findMany.mockResolvedValue([
      {
        id: "ws-1",
        name: "Acme",
        members: [{ userId: USER_ID, role: "member" }],
        teams: [],
        projects: [],
        _count: { projects: 0, goals: 0, teams: 0 },
      },
    ] as never);

    const result = await caller(db).workspace.list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "ws-1", currentUserRole: "member" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
