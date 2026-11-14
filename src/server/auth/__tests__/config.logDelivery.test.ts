/**
 * Log delivery narrowed to instance admins (ADR-0081). With no email transport
 * and `AUTH_LOG_SIGN_IN_CODES` on, only an instance admin may request a
 * Sign-in code; anyone else is refused before a code exists, with the
 * "email sign-in isn't set up" copy. With a transport, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});
vi.mock("~/server/services/EmailService", () => ({
  sendFirstLoginWelcomeEmail: vi.fn(),
  sendSignInCodeEmail: vi.fn(),
  sendWelcomeWithSignInCodeEmail: vi.fn(),
}));
vi.mock("~/server/auth/acceptPendingInvitations", () => ({
  acceptPendingInvitationsForUser: vi.fn().mockResolvedValue(null),
}));

import { db } from "~/server/db";
import { authConfig } from "../config";
import { EMAIL_SIGN_IN_UNAVAILABLE_ERROR } from "~/lib/signInErrors";

const mockDb = db as unknown as DeepMockProxy<PrismaClient>;
const REFUSED = `/signin?error=${EMAIL_SIGN_IN_UNAVAILABLE_ERROR}`;
type SignInArgs = Parameters<typeof authConfig.callbacks.signIn>[0];

function requestCode(email: string) {
  return authConfig.callbacks.signIn({
    user: { id: "id", email },
    account: { provider: "postmark", type: "email", providerAccountId: email },
    email: { verificationRequest: true },
  } as SignInArgs);
}

const TRANSPORT_VARS = ["AUTH_POSTMARK_KEY", "POSTMARK_SERVER_TOKEN", "SMTP_HOST", "EMAIL_FROM", "AUTH_POSTMARK_FROM"];

beforeEach(() => {
  mockReset(mockDb);
  for (const name of TRANSPORT_VARS) vi.stubEnv(name, "");
  vi.stubEnv("AUTH_LOG_SIGN_IN_CODES", "true");
  mockDb.instanceSettings.findUnique.mockResolvedValue(null); // open sign-up
});

afterEach(() => vi.unstubAllEnvs());

describe("log delivery is for instance admins only", () => {
  it("an instance admin may request a code", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "admin", isAdmin: true } as never);
    expect(await requestCode("admin@example.test")).toBe(true);
  });

  it("an existing non-admin is refused with the setup copy", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u", isAdmin: false } as never);
    expect(await requestCode("member@example.test")).toBe(REFUSED);
  });

  it("a new address is refused too, even with open sign-up", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    expect(await requestCode("new@example.test")).toBe(REFUSED);
  });

  it("with an email transport, non-admins request codes as before", async () => {
    vi.stubEnv("AUTH_POSTMARK_KEY", "pm");
    mockDb.user.findUnique.mockResolvedValue(null);
    expect(await requestCode("new@example.test")).toBe(true);
  });
});
