/**
 * Unit tests for `workspace.getDefault`'s `details` — the default workspace in
 * `getBySlug`'s shape, which WorkspaceProvider seeds into the getBySlug cache
 * on routes without a workspace in the URL.
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


const { getWorkspaceMembership } = vi.hoisted(() => ({ getWorkspaceMembership: vi.fn() }));
vi.mock("~/server/services/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services/access")>()),
  getWorkspaceMembership,
}));

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";
const basic = { id: WORKSPACE_ID, slug: "acme", name: "Acme", type: "team" };

function fullWorkspace(memberIds: string[]) {
  return {
    ...basic,
    ownerId: "owner-1",
    owner: { id: "owner-1", name: "Owner", email: "o@example.com", image: null },
    members: memberIds.map((userId) => ({
      userId,
      workspaceId: WORKSPACE_ID,
      role: "admin",
      user: { id: userId, name: "U", email: "u@example.com", image: null, isAgent: false },
    })),
    _count: { projects: 2, goals: 1, teams: 0 },
  };
}

/** `findUnique` with a `select` is getDefault's lookup; with an `include`, the shared loader's. */
function stubWorkspace(db: DeepMockProxy<PrismaClient>, memberIds: string[]) {
  db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: WORKSPACE_ID } as never);
  db.workspace.findUnique.mockImplementation(((args: { select?: unknown }) =>
    Promise.resolve(args.select ? basic : fullWorkspace(memberIds))) as never);
}

describe("workspace.getDefault details", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    getWorkspaceMembership.mockReset();
  });

  it("returns the default workspace in getBySlug's shape, with the caller's role", async () => {
    stubWorkspace(db, [USER_ID]);
    const caller = createMockCaller({ userId: USER_ID, db });

    const result = await caller.workspace.getDefault();

    expect(result).toMatchObject({ ...basic, details: { id: WORKSPACE_ID, currentUserRole: "admin" } });
    // Identical to what getBySlug returns for the same workspace.
    expect(result?.details).toEqual(await caller.workspace.getBySlug({ slug: basic.slug }));
  });

  it("returns null details when the caller can no longer access the default workspace", async () => {
    stubWorkspace(db, ["someone-else"]);
    getWorkspaceMembership.mockResolvedValue(null);
    db.projectMember.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: USER_ID, db });

    const result = await caller.workspace.getDefault();

    expect(result).toMatchObject({ ...basic, details: null });
    await expect(caller.workspace.getBySlug({ slug: basic.slug })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null when the user has no workspace at all", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue(null);
    const caller = createMockCaller({ userId: USER_ID, db });

    expect(await caller.workspace.getDefault()).toBeNull();
  });
});
