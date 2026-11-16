import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCallerFactory } from "~/server/api/trpc";
import { briefingRouter } from "../briefing";

const createCaller = createCallerFactory(briefingRouter);
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function signedIn(userId: string) {
  return createCaller({
    db: db as unknown as PrismaClient,
    session: { user: { id: userId, email: "u@test.com", name: "U", image: null, isAdmin: false }, expires: "2099-01-01" },
    headers: new Headers(),
  } as never);
}

beforeEach(() => {
  mockReset(db);
});

describe("briefing.getBriefingText", () => {
  it("runs its counts without opening an interactive transaction", async () => {
    // Order of calls: due today, overdue.
    db.action.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    db.project.count.mockResolvedValue(3);

    const text = await signedIn("u1").getBriefingText();

    // An idle interactive tx held a pooled connection while these queued for
    // another — the shape behind P2028 "Transaction not found".
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.action.count).toHaveBeenCalledTimes(2);
    expect(db.project.count).toHaveBeenCalledTimes(1);
    expect(text).toContain("1 overdue");
    expect(text).toContain("2 due today");
    expect(text).toContain("3 projects need attention");
  });

  it("says all clear when nothing is due", async () => {
    db.action.count.mockResolvedValue(0);
    db.project.count.mockResolvedValue(0);

    await expect(signedIn("u1").getBriefingText()).resolves.toBe("✅ All clear! No urgent items.");
  });
});
