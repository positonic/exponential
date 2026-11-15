/**
 * `billing.getStatus`: the usage bar's numbers, for owners and admins only,
 * and nothing at all on an install that does not meter.
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
import { FREE_ALLOWANCE_MICROS } from "~/server/services/billing/config";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/** The caller's direct role in the workspace; null for someone who is not a member. */
function asRole(db: DeepMockProxy<PrismaClient>, role: "owner" | "admin" | "member" | "viewer" | null) {
  db.workspaceUser.findUnique.mockResolvedValue(
    (role ? { role, workspaceId: WORKSPACE_ID } : null) as never,
  );
  db.teamUser.findFirst.mockResolvedValue(null);
}

function usedThisMonth(db: DeepMockProxy<PrismaClient>, costMicros: number | null) {
  db.workspaceUsagePeriod.findUnique.mockResolvedValue(
    (costMicros === null ? null : { costMicros }) as never,
  );
}

describe("billing.getStatus", () => {
  let db: DeepMockProxy<PrismaClient>;
  const originalMode = process.env.BILLING_MODE;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalMode;
    vi.useRealTimers();
  });

  describe("on an install that does not meter", () => {
    beforeEach(() => {
      delete process.env.BILLING_MODE;
    });

    it("answers off without reading the database", async () => {
      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(status).toEqual({ mode: "off" });
      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
      expect(db.workspaceUsagePeriod.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("on an install that meters", () => {
    beforeEach(() => {
      process.env.BILLING_MODE = "meter";
    });

    it.each(["owner", "admin"] as const)("shows an %s the share of the month's allowance used", async (role) => {
      vi.useFakeTimers({ now: new Date("2026-11-15T10:00:00Z") });
      asRole(db, role);
      usedThisMonth(db, Math.round(FREE_ALLOWANCE_MICROS * 0.62));

      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(status).toEqual({
        mode: "meter",
        usedPercent: 62,
        warnLevel: null,
        resetsAt: new Date("2026-12-01T00:00:00.000Z"),
      });
    });

    it("shows 0% for a workspace that has not used the Assistant this month", async () => {
      asRole(db, "owner");
      usedThisMonth(db, null);

      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(status).toMatchObject({ usedPercent: 0 });
    });

    it("goes past 100% once the allowance is used up", async () => {
      asRole(db, "admin");
      usedThisMonth(db, FREE_ALLOWANCE_MICROS * 2.5);

      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(status).toMatchObject({ usedPercent: 250, warnLevel: 100 });
    });

    it("reports the 80% warning level from 80% of the allowance", async () => {
      asRole(db, "owner");
      usedThisMonth(db, FREE_ALLOWANCE_MICROS * 0.85);

      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(status).toMatchObject({ usedPercent: 85, warnLevel: 80 });
    });

    it("gives no cost, token count or allowance, only the share", async () => {
      asRole(db, "owner");
      usedThisMonth(db, 1_234_567);

      const status = await caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID });

      expect(Object.keys(status).sort()).toEqual(["mode", "resetsAt", "usedPercent", "warnLevel"]);
    });

    it.each(["member", "viewer"] as const)("refuses a %s", async (role) => {
      asRole(db, role);

      await expect(caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(db.workspaceUsagePeriod.findUnique).not.toHaveBeenCalled();
    });

    it("refuses someone who is not in the workspace", async () => {
      asRole(db, null);

      await expect(caller(db).billing.getStatus({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});
