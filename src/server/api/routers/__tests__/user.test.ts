/**
 * Unit tests for the `user` router's Settings mutations (work hours, profile).
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

const USER_ID = "user-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

describe("user.updateWorkHours", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("persists enabled work hours to the User.workHours* fields", async () => {
    db.user.update.mockResolvedValue({
      workHoursEnabled: true,
      workDaysJson: JSON.stringify(["monday", "tuesday"]),
      workHoursStart: "10:00",
      workHoursEnd: "16:00",
    } as unknown as User);

    const result = await caller(db).user.updateWorkHours({
      workHoursEnabled: true,
      workDays: ["monday", "tuesday"],
      workHoursStart: "10:00",
      workHoursEnd: "16:00",
    });

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: {
          workHoursEnabled: true,
          workDaysJson: JSON.stringify(["monday", "tuesday"]),
          workHoursStart: "10:00",
          workHoursEnd: "16:00",
        },
      }),
    );
    expect(result).toEqual({
      success: true,
      workHoursEnabled: true,
      workDays: ["monday", "tuesday"],
      workHoursStart: "10:00",
      workHoursEnd: "16:00",
    });
  });

  it("rejects invalid HH:MM times without writing", async () => {
    await expect(
      caller(db).user.updateWorkHours({
        workHoursEnabled: true,
        workDays: ["monday"],
        workHoursStart: "25:00",
        workHoursEnd: "17:00",
      }),
    ).rejects.toThrow(/Invalid HH:MM/);

    await expect(
      caller(db).user.updateWorkHours({
        workHoursEnabled: true,
        workDays: ["monday"],
        workHoursStart: "09:00",
        workHoursEnd: "9pm",
      }),
    ).rejects.toThrow(/Invalid HH:MM/);

    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("user.updateProfile", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("persists the new name to User.name", async () => {
    db.user.update.mockResolvedValue({ name: "New Name" } as unknown as User);

    const result = await caller(db).user.updateProfile({ name: "New Name" });

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { name: "New Name" },
      }),
    );
    expect(result).toEqual({ success: true, name: "New Name" });
  });

  it("rejects an empty name without writing", async () => {
    await expect(
      caller(db).user.updateProfile({ name: "" }),
    ).rejects.toThrow();

    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 100 characters without writing", async () => {
    await expect(
      caller(db).user.updateProfile({ name: "x".repeat(101) }),
    ).rejects.toThrow();

    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("user.getWorkHours", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("returns stored work hours with parsed workDays", async () => {
    db.user.findUnique.mockResolvedValue({
      workHoursEnabled: true,
      workDaysJson: JSON.stringify(["monday", "friday"]),
      workHoursStart: "08:00",
      workHoursEnd: "14:00",
    } as unknown as User);

    const result = await caller(db).user.getWorkHours();

    expect(result).toEqual({
      workHoursEnabled: true,
      workDays: ["monday", "friday"],
      workHoursStart: "08:00",
      workHoursEnd: "14:00",
    });
  });

  it("returns disabled defaults when work hours were never set", async () => {
    db.user.findUnique.mockResolvedValue({
      workHoursEnabled: false,
      workDaysJson: null,
      workHoursStart: null,
      workHoursEnd: null,
    } as unknown as User);

    const result = await caller(db).user.getWorkHours();

    expect(result).toEqual({
      workHoursEnabled: false,
      workDays: [],
      workHoursStart: null,
      workHoursEnd: null,
    });
  });

  it("tolerates malformed workDaysJson", async () => {
    db.user.findUnique.mockResolvedValue({
      workHoursEnabled: true,
      workDaysJson: "not-json",
      workHoursStart: "09:00",
      workHoursEnd: "17:00",
    } as unknown as User);

    const result = await caller(db).user.getWorkHours();

    expect(result.workDays).toEqual([]);
  });
});
