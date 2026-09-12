/**
 * Unit tests for the Summary schedule procedures behind Settings → Notifications.
 * getSummarySchedule must never create the preference row (getPreferences does,
 * with dailySummary switched off), and the effective timezone is the profile one.
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
      /* noop */
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

describe("notification.getSummarySchedule", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("returns the defaults without creating a preference row when none exists", async () => {
    dbMock.notificationPreference.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue({ timezone: null } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.notification.getSummarySchedule();

    expect(result).toEqual({
      dailySummary: true,
      dailySummaryTime: "09:00",
      weeklySummary: false,
      weeklyDayOfWeek: 1,
      timezone: "UTC",
      profileTimezone: null,
    });
    expect(dbMock.notificationPreference.create).not.toHaveBeenCalled();
    expect(dbMock.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("reports the profile timezone as the effective zone, over the pref row's UTC default", async () => {
    dbMock.notificationPreference.findUnique.mockResolvedValue({
      dailySummary: true,
      dailySummaryTime: "08:00",
      weeklySummary: true,
      weeklyDayOfWeek: 5,
      timezone: "UTC",
    } as never);
    dbMock.user.findUnique.mockResolvedValue({ timezone: "Europe/Berlin" } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.notification.getSummarySchedule();

    expect(result).toMatchObject({
      dailySummaryTime: "08:00",
      weeklyDayOfWeek: 5,
      timezone: "Europe/Berlin",
      profileTimezone: "Europe/Berlin",
    });
  });
});

describe("notification.updateSummarySchedule", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("upserts the schedule for the caller, creating the row with the daily summary left on", async () => {
    dbMock.notificationPreference.upsert.mockResolvedValue({} as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await caller.notification.updateSummarySchedule({
      dailySummary: true,
      dailySummaryTime: "08:00",
      weeklySummary: false,
      weeklyDayOfWeek: 1,
    });

    expect(dbMock.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {
        dailySummary: true,
        dailySummaryTime: "08:00",
        weeklySummary: false,
        weeklyDayOfWeek: 1,
      },
      create: {
        userId: USER_ID,
        dailySummary: true,
        dailySummaryTime: "08:00",
        weeklySummary: false,
        weeklyDayOfWeek: 1,
      },
    });
  });

  it("rejects a time that is not HH:MM 24-hour", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.notification.updateSummarySchedule({
        dailySummary: true,
        dailySummaryTime: "8am",
        weeklySummary: false,
        weeklyDayOfWeek: 1,
      }),
    ).rejects.toThrow(/24-hour time/);
    await expect(
      caller.notification.updateSummarySchedule({
        dailySummary: true,
        dailySummaryTime: "25:00",
        weeklySummary: false,
        weeklyDayOfWeek: 1,
      }),
    ).rejects.toThrow();
    expect(dbMock.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("rejects a weekday outside 1..7", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.notification.updateSummarySchedule({
        dailySummary: true,
        dailySummaryTime: "08:00",
        weeklySummary: true,
        weeklyDayOfWeek: 0,
      }),
    ).rejects.toThrow();
  });
});
