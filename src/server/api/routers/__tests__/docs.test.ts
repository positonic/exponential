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

const rateLimit = vi.hoisted(() => ({ success: true }));
vi.mock("~/server/utils/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: rateLimit.success, retryAfterSeconds: rateLimit.success ? 0 : 60 })),
  clientIpFrom: () => "203.0.113.7",
}));

import { createCallerFactory } from "~/server/api/trpc";
import { docsRouter } from "../docs";

const createCaller = createCallerFactory(docsRouter);
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function anonymous() {
  return createCaller({ db: db as unknown as PrismaClient, session: null, headers: new Headers() } as never);
}
function signedIn(userId: string) {
  return createCaller({
    db: db as unknown as PrismaClient,
    session: { user: { id: userId, email: "u@test.com", name: "U", image: null, isAdmin: false }, expires: "2099-01-01" },
    headers: new Headers(),
  } as never);
}

beforeEach(() => {
  mockReset(db);
  rateLimit.success = true;
  db.docsFeedback.create.mockResolvedValue({ id: "fb-1" } as never);
});

describe("docs.submitFeedback", () => {
  it("records a signed-out answer without a user", async () => {
    await expect(anonymous().submitFeedback({ path: "/docs/meet/meetings", helpful: true })).resolves.toEqual({ id: "fb-1" });
    expect(db.docsFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { path: "/docs/meet/meetings", helpful: true, comment: null, userId: null } }),
    );
  });

  it("records the signed-in user", async () => {
    await signedIn("user-9").submitFeedback({ path: "/docs", helpful: false, comment: "  missing X  " });
    expect(db.docsFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { path: "/docs", helpful: false, comment: "missing X", userId: "user-9" } }),
    );
  });

  it("rejects paths that are not docs pages", async () => {
    for (const path of ["/settings", "/docs/../api", "/docs/x?y=1", "https://evil.example/docs"]) {
      await expect(anonymous().submitFeedback({ path, helpful: true })).rejects.toThrow();
    }
    expect(db.docsFeedback.create).not.toHaveBeenCalled();
  });

  it("refuses when the rate limit is exhausted", async () => {
    rateLimit.success = false;
    await expect(anonymous().submitFeedback({ path: "/docs", helpful: true })).rejects.toThrow(/Too much feedback/);
    expect(db.docsFeedback.create).not.toHaveBeenCalled();
  });
});

describe("docs.addFeedbackComment", () => {
  it("only amends an uncommented, recent row belonging to the same caller", async () => {
    db.docsFeedback.updateMany.mockResolvedValue({ count: 1 });
    await expect(anonymous().addFeedbackComment({ id: "fb-1", comment: "clearer please" })).resolves.toEqual({ ok: true });
    const where = db.docsFeedback.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: "fb-1", comment: null, userId: null });
    expect(where?.createdAt).toBeDefined();
  });

  it("fails when nothing matched", async () => {
    db.docsFeedback.updateMany.mockResolvedValue({ count: 0 });
    await expect(signedIn("u").addFeedbackComment({ id: "someone-elses", comment: "x" })).rejects.toThrow(/no longer be changed/);
  });
});
