/**
 * `/setup` exists only while a self-host install is unclaimed (no instance
 * admin, live setup token), and `/signin` sends people there in that window.
 * Everywhere else — exponential.im, which has admins and never issues a token —
 * `/setup` is a 404 and `/signin` is untouched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { db } from "~/server/db";
import SetupPage from "../page";
import SignInPage from "../../signin/page";

const mockDb = db as unknown as DeepMockProxy<PrismaClient>;
const NOW = Date.now();
const LIVE_TOKEN_ROW = {
  id: "instance",
  signUpMode: null,
  setupTokenHash: "hash",
  setupTokenExpiresAt: new Date(NOW + 60_000),
  updatedAt: new Date(NOW),
};

beforeEach(() => {
  mockReset(mockDb);
  auth.mockReset().mockResolvedValue(null);
  vi.stubEnv("AUTH_LOG_SIGN_IN_CODES", "true");
});

describe("/setup", () => {
  it("is a 404 when an instance admin exists (exponential.im), even with a stray token", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(LIVE_TOKEN_ROW);
    mockDb.user.count.mockResolvedValue(3);

    await expect(SetupPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 when no setup token was ever issued (no row)", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(null);
    mockDb.user.count.mockResolvedValue(0);

    await expect(SetupPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the claim form while the install is unclaimed", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(LIVE_TOKEN_ROW);
    mockDb.user.count.mockResolvedValue(0);

    await expect(SetupPage()).resolves.toBeTruthy();
  });
});

describe("/signin", () => {
  it("sends you to /setup while the install is unclaimed", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(LIVE_TOKEN_ROW);
    mockDb.user.count.mockResolvedValue(0);

    await expect(SignInPage()).rejects.toThrow("NEXT_REDIRECT /setup");
  });

  it("renders the sign-in page once an admin exists", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(LIVE_TOKEN_ROW);
    mockDb.user.count.mockResolvedValue(1);

    await expect(SignInPage()).resolves.toBeTruthy();
  });

  it("renders the sign-in page with no settings row, without counting admins", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(null);

    await expect(SignInPage()).resolves.toBeTruthy();
    expect(mockDb.user.count).not.toHaveBeenCalled();
  });
});
