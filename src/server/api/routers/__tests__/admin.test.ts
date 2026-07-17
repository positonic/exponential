/**
 * Unit tests for admin.getAllUsers lifecycle-status derivation.
 *
 * Status comes from welcome-flow state (never the deprecated onboarding
 * columns): active when welcomeCompletedAt is set, onboarding when
 * welcomeSetupState records partial progress, registered otherwise
 * (including malformed state — zod safe-parse fallback).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient, User } from "@prisma/client";

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

const ADMIN_ID = "admin-1";

function makeUserRow(overrides: {
  id: string;
  welcomeCompletedAt?: Date | null;
  welcomeSetupState?: unknown;
}) {
  return {
    id: overrides.id,
    name: "Some User",
    email: `${overrides.id}@test.com`,
    image: null,
    lastLogin: null,
    isAdmin: false,
    welcomeCompletedAt: overrides.welcomeCompletedAt ?? null,
    welcomeSetupState: overrides.welcomeSetupState ?? null,
    _count: { actions: 0, projects: 0 },
  } as unknown as User;
}

describe("admin.getAllUsers status derivation", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  async function statusesFor(rows: User[]): Promise<Record<string, string>> {
    db.user.findMany.mockResolvedValue(rows);
    const caller = createMockCaller({
      userId: ADMIN_ID,
      db: db as unknown as PrismaClient,
      isAdmin: true,
    });
    const result = await caller.admin.getAllUsers({ limit: 20 });
    return Object.fromEntries(result.users.map((u) => [u.id, u.status]));
  }

  it("classifies a user with welcomeCompletedAt set as active", async () => {
    const statuses = await statusesFor([
      makeUserRow({ id: "u-done", welcomeCompletedAt: new Date() }),
    ]);
    expect(statuses["u-done"]).toBe("active");
  });

  it("classifies partial welcomeSetupState progress as onboarding", async () => {
    const statuses = await statusesFor([
      makeUserRow({ id: "u-goal", welcomeSetupState: { goalId: 42 } }),
      makeUserRow({ id: "u-action", welcomeSetupState: { actionId: "a-1" } }),
      makeUserRow({ id: "u-plan", welcomeSetupState: { planCreated: true } }),
      makeUserRow({ id: "u-cal", welcomeSetupState: { calendar: "google" } }),
    ]);
    expect(statuses).toEqual({
      "u-goal": "onboarding",
      "u-action": "onboarding",
      "u-plan": "onboarding",
      "u-cal": "onboarding",
    });
  });

  it("classifies no progress as registered", async () => {
    const statuses = await statusesFor([
      makeUserRow({ id: "u-null", welcomeSetupState: null }),
      makeUserRow({ id: "u-empty", welcomeSetupState: {} }),
    ]);
    expect(statuses).toEqual({
      "u-null": "registered",
      "u-empty": "registered",
    });
  });

  it("classifies malformed welcomeSetupState as registered (safe-parse fallback)", async () => {
    const statuses = await statusesFor([
      makeUserRow({ id: "u-bad", welcomeSetupState: { goalId: "not-a-number" } }),
      makeUserRow({ id: "u-junk", welcomeSetupState: "garbage" }),
    ]);
    expect(statuses).toEqual({
      "u-bad": "registered",
      "u-junk": "registered",
    });
  });

  it("prefers active over onboarding when both signals exist", async () => {
    const statuses = await statusesFor([
      makeUserRow({
        id: "u-both",
        welcomeCompletedAt: new Date(),
        welcomeSetupState: { goalId: 1 },
      }),
    ]);
    expect(statuses["u-both"]).toBe("active");
  });
});
