/**
 * Unit tests for the calendar router's ConnectedAccount behaviour (ADR-0009).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). These assert the router logic that
 * the multi-account redesign depends on: disconnect hard-deletes the
 * ConnectedAccount, and calendar selection upserts keyed by connectedAccountId.
 * The cascade itself is a schema/FK guarantee (covered by Prisma), and the
 * full OAuth round-trip is left to a future integration test.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
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

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));

import { createMockCaller } from "~/test/trpc-helpers";

describe("calendar router — ConnectedAccount (mocked)", () => {
  const userId = "user-1";
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("disconnect", () => {
    it("hard-deletes the resolved ConnectedAccount by id", async () => {
      // resolveAccount(accountId) → the connected account
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      dbMock.connectedAccount.delete.mockResolvedValue({ id: "ca-1" } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.disconnect({ accountId: "ca-1" });

      expect(res.success).toBe(true);
      expect(dbMock.connectedAccount.delete).toHaveBeenCalledWith({
        where: { id: "ca-1" },
      });
      // Old soft-disconnect path (nulling tokens via update) must NOT run.
      expect(dbMock.connectedAccount.update).not.toHaveBeenCalled();
    });

    it("is a no-op when no connected account resolves", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue(null);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.disconnect({ accountId: "missing" });

      expect(res.success).toBe(true);
      expect(dbMock.connectedAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateSelectedCalendars", () => {
    it("upserts the preference keyed by connectedAccountId", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      dbMock.calendarPreference.upsert.mockResolvedValue({
        selectedCalendarIds: ["primary", "team@group.calendar.google.com"],
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.updateSelectedCalendars({
        accountId: "ca-1",
        calendarIds: ["primary", "team@group.calendar.google.com"],
      });

      expect(res.success).toBe(true);
      const arg = dbMock.calendarPreference.upsert.mock.calls[0]![0];
      expect(arg.where).toEqual({ connectedAccountId: "ca-1" });
      expect(arg.create).toMatchObject({ connectedAccountId: "ca-1", userId });
    });

    it("throws when no connected account resolves", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.updateSelectedCalendars({
          accountId: "missing",
          calendarIds: ["primary"],
        }),
      ).rejects.toThrow();
    });
  });
});
