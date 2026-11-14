/**
 * The Welcome email goes out only when the environment has an email
 * transport: it carries no workspace, so a workspace Postmark integration can't
 * send it. Without one (a self-hosted install with sign-in codes in the log)
 * the send is skipped quietly instead of failing with a stack trace.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { sendFirstLoginWelcomeEmail, acceptPendingInvitationsForUser } = vi.hoisted(() => ({
  sendFirstLoginWelcomeEmail: vi.fn(),
  acceptPendingInvitationsForUser: vi.fn(),
}));

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});
vi.mock("~/server/services/EmailService", () => ({ sendFirstLoginWelcomeEmail }));
vi.mock("~/server/auth/acceptPendingInvitations", () => ({ acceptPendingInvitationsForUser }));
vi.mock("~/server/auth/welcomeEmailContext", () => ({ resolveWelcomeEmailContext: vi.fn() }));

import { db } from "~/server/db";
import { onUserCreated } from "../onUserCreated";

const mockDb = db as unknown as DeepMockProxy<PrismaClient>;
const TRANSPORT_VARS = ["AUTH_POSTMARK_KEY", "POSTMARK_SERVER_TOKEN", "SMTP_HOST", "EMAIL_FROM", "AUTH_POSTMARK_FROM"];
const USER = { id: "u1", email: "admin@example.test", name: null };

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const name of TRANSPORT_VARS) vi.stubEnv(name, "");
  mockReset(mockDb);
  mockDb.workspace.create.mockResolvedValue({ id: "w1" } as never);
  acceptPendingInvitationsForUser.mockReset().mockResolvedValue(null);
  sendFirstLoginWelcomeEmail.mockReset().mockResolvedValue(undefined);
});

describe("onUserCreated: the Welcome email", () => {
  it("skips it, without an error, when no email transport is configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await onUserCreated(USER);
    expect(sendFirstLoginWelcomeEmail).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    // The rest of the new-user setup still ran.
    expect(mockDb.workspace.create).toHaveBeenCalled();
    error.mockRestore();
  });

  it("sends it when Postmark is configured", async () => {
    vi.stubEnv("AUTH_POSTMARK_KEY", "pm-key");
    await onUserCreated(USER);
    expect(sendFirstLoginWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: USER.email }));
  });

  it("sends it when SMTP has a host and a sender", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("EMAIL_FROM", "Exponential <noreply@example.test>");
    await onUserCreated(USER);
    expect(sendFirstLoginWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: USER.email }));
  });
});
