/**
 * `admin.getAssistantSpend`: the per-workspace spend report behind
 * Admin → Assistant usage. Admins only, and nothing at all on an install that
 * does not meter.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function caller(db: DeepMockProxy<PrismaClient>, isAdmin: boolean) {
  return createMockCaller({ userId: isAdmin ? "admin-1" : "user-1", db: db as unknown as PrismaClient, isAdmin });
}

describe("admin.getAssistantSpend", () => {
  let db: DeepMockProxy<PrismaClient>;
  const originalMode = process.env.BILLING_MODE;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUsagePeriod.findMany.mockResolvedValue([
      { workspaceId: "ws-1", costMicros: 1_200_000 },
      { workspaceId: "ws-2", costMicros: 300_000 },
    ] as never);
    db.usageEvent.groupBy.mockResolvedValue([] as never);
    db.workspace.findMany.mockResolvedValue([
      { id: "ws-1", name: "Acme", slug: "acme", type: "team" },
      { id: "ws-2", name: "Personal", slug: "personal-1", type: "personal" },
    ] as never);
    process.env.BILLING_MODE = "meter";
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalMode;
    vi.useRealTimers();
  });

  it("gives an admin the month's spend per workspace and its distribution", async () => {
    const result = await caller(db, true).admin.getAssistantSpend({ month: "2026-11" });

    expect(result.mode).toBe("meter");
    expect(result).toMatchObject({
      report: {
        periodStart: new Date("2026-11-01T00:00:00.000Z"),
        totalMicros: 1_500_000,
        workspacesWithSpend: 2,
        percentiles: { p50: 300_000, p80: 1_200_000, p90: 1_200_000 },
        workspaces: [
          { workspaceId: "ws-1", name: "Acme", costMicros: 1_200_000 },
          { workspaceId: "ws-2", name: "Personal", costMicros: 300_000 },
        ],
      },
    });
  });

  it("reports on the current month when none is named", async () => {
    vi.useFakeTimers({ now: new Date("2027-01-03T08:00:00Z") });

    const result = await caller(db, true).admin.getAssistantSpend({});

    expect(result).toMatchObject({ report: { periodStart: new Date("2027-01-01T00:00:00.000Z") } });
  });

  it("refuses a month that is not YYYY-MM", async () => {
    await expect(caller(db, true).admin.getAssistantSpend({ month: "2026-13" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses someone who is not an admin", async () => {
    await expect(caller(db, false).admin.getAssistantSpend({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.workspaceUsagePeriod.findMany).not.toHaveBeenCalled();
  });

  it("answers off without reading the database on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    const result = await caller(db, true).admin.getAssistantSpend({});

    expect(result).toEqual({ mode: "off" });
    expect(db.workspaceUsagePeriod.findMany).not.toHaveBeenCalled();
    expect(db.usageEvent.groupBy).not.toHaveBeenCalled();
  });
});
