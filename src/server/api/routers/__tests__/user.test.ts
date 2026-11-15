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

const uploadToBlobMock = vi.hoisted(() => vi.fn());
vi.mock("~/lib/blob", () => ({
  uploadToBlob: uploadToBlobMock,
  deleteFromBlob: vi.fn(),
}));

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

describe("user.setHandle", () => {
  let db: DeepMockProxy<PrismaClient>;

  /** The caller as the database knows them. */
  function givenCaller(row: { isAgent?: boolean; handle?: string | null } = {}) {
    db.user.findUnique.mockResolvedValue({
      isAgent: row.isAgent ?? false,
      handle: row.handle ?? null,
    } as unknown as User);
  }

  async function errorOf(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      const { code, message } = error as { code?: string; message?: string };
      return { code, message };
    }
    throw new Error("expected the call to throw");
  }

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockResolvedValue({} as unknown as User);
  });

  it("stores the handle lowercased and trimmed", async () => {
    givenCaller();

    const result = await caller(db).user.setHandle({ handle: "  James-F " });

    expect(result).toEqual({ handle: "james-f" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { handle: "james-f" },
    });
  });

  it("changes a handle, leaving nothing behind to hold the old one", async () => {
    givenCaller({ handle: "james" });

    const result = await caller(db).user.setHandle({ handle: "jim" });

    expect(result).toEqual({ handle: "jim" });
    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { handle: "jim" },
    });
  });

  it("clears the handle on null", async () => {
    givenCaller({ handle: "james" });

    const result = await caller(db).user.setHandle({ handle: null });

    expect(result).toEqual({ handle: null });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { handle: null },
    });
  });

  it("does not write when the handle is unchanged", async () => {
    givenCaller({ handle: "james" });

    const result = await caller(db).user.setHandle({ handle: "James" });

    expect(result).toEqual({ handle: "james" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses an invalid handle with the rule it broke, without writing", async () => {
    givenCaller();

    const tooShort = await errorOf(caller(db).user.setHandle({ handle: "ab" }));
    const badCharacters = await errorOf(caller(db).user.setHandle({ handle: "james_f" }));
    const edgeHyphen = await errorOf(caller(db).user.setHandle({ handle: "-james" }));

    expect(tooShort).toEqual({
      code: "BAD_REQUEST",
      message: "A handle is 3 to 30 characters long.",
    });
    expect(badCharacters.code).toBe("BAD_REQUEST");
    expect(badCharacters.message).toContain("letters, digits and hyphens");
    expect(edgeHyphen).toEqual(badCharacters);
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses a reserved word and anything shaped like a user id", async () => {
    givenCaller();
    const reserved = {
      code: "BAD_REQUEST",
      message: "That handle is reserved. Pick another.",
    };

    expect(await errorOf(caller(db).user.setHandle({ handle: "admin" }))).toEqual(reserved);
    expect(await errorOf(caller(db).user.setHandle({ handle: "Settings" }))).toEqual(reserved);
    expect(
      await errorOf(caller(db).user.setHandle({ handle: "cmwg8yc350011l207pb3hzvea" })),
    ).toEqual(reserved);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses a handle someone else holds, or that spells an existing user id", async () => {
    givenCaller();
    db.user.findFirst.mockResolvedValue({ id: "user-2" } as unknown as User);

    const result = await errorOf(caller(db).user.setHandle({ handle: "james" }));

    expect(result).toEqual({
      code: "CONFLICT",
      message: "That handle is taken. Pick another.",
    });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ handle: "james" }, { id: "james" }] },
      select: { id: true },
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("answers a lost race for the same handle as taken", async () => {
    givenCaller();
    db.user.update.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const result = await errorOf(caller(db).user.setHandle({ handle: "james" }));

    expect(result).toEqual({
      code: "CONFLICT",
      message: "That handle is taken. Pick another.",
    });
  });

  it("refuses an agent, even to clear", async () => {
    givenCaller({ isAgent: true });
    const forbidden = { code: "FORBIDDEN", message: "Agents cannot have a handle." };

    expect(await errorOf(caller(db).user.setHandle({ handle: "helper" }))).toEqual(forbidden);
    expect(await errorOf(caller(db).user.setHandle({ handle: null }))).toEqual(forbidden);
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("user.updateTimezone", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("persists a recognized IANA timezone", async () => {
    db.user.update.mockResolvedValue({ timezone: "Europe/Berlin" } as unknown as User);

    const result = await caller(db).user.updateTimezone({ timezone: "Europe/Berlin" });

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { timezone: "Europe/Berlin" },
      }),
    );
    expect(result).toEqual({ success: true, timezone: "Europe/Berlin" });
  });

  it("rejects a Windows zone name (as Outlook feeds publish) without writing", async () => {
    await expect(
      caller(db).user.updateTimezone({ timezone: "W. Europe Standard Time" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects garbage without writing", async () => {
    await expect(
      caller(db).user.updateTimezone({ timezone: "Not/AZone" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("user.uploadProfileImage", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    uploadToBlobMock.mockReset();
  });

  it("uploads to blob storage and persists the URL to User.image", async () => {
    uploadToBlobMock.mockResolvedValue({
      url: "https://blob.example.com/profile-images/user-1.png",
    });
    db.user.update.mockResolvedValue({} as unknown as User);

    const result = await caller(db).user.uploadProfileImage({
      base64Data: Buffer.from("fake-image").toString("base64"),
    });

    expect(uploadToBlobMock).toHaveBeenCalledWith(
      Buffer.from("fake-image").toString("base64"),
      `profile-images/${USER_ID}.png`,
    );
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { image: "https://blob.example.com/profile-images/user-1.png" },
      }),
    );
    expect(result).toEqual({
      success: true,
      imageUrl: "https://blob.example.com/profile-images/user-1.png",
    });
  });

  it("does not write User.image when the blob upload fails", async () => {
    uploadToBlobMock.mockRejectedValue(new Error("blob unavailable"));

    await expect(
      caller(db).user.uploadProfileImage({ base64Data: "aGVsbG8=" }),
    ).rejects.toThrow("blob unavailable");

    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("user.completeWelcome", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("stamps welcomeCompletedAt and performs no project/action writes", async () => {
    db.user.update.mockResolvedValue({} as unknown as User);

    const result = await caller(db).user.completeWelcome();

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { welcomeCompletedAt: expect.any(Date) as Date },
      }),
    );
    // Regression guard: the onboarding-project close-out block is gone —
    // completing welcome must not touch projects or actions.
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(db.action.update).not.toHaveBeenCalled();
    expect(db.action.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
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
