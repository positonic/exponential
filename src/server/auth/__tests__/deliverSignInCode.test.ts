/**
 * Sign-in code delivery: email when a transport exists, the server log when the
 * operator opted in and none does, otherwise a failed send. Whatever the
 * channel, older codes are retired only after the delivery succeeded
 * (ADR-0056's one-live-code argument).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { findUnique, deleteMany, sendSignInCodeEmail, sendWelcomeWithSignInCodeEmail } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  sendSignInCodeEmail: vi.fn(),
  sendWelcomeWithSignInCodeEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { user: { findUnique }, verificationToken: { deleteMany } },
}));
vi.mock("~/server/services/EmailService", () => ({
  sendSignInCodeEmail,
  sendWelcomeWithSignInCodeEmail,
}));

import { deliverSignInCode } from "../deliverSignInCode";

const EMAIL = "new.person@example.test";
const TOKEN = "ABCD2345";
const EXPIRES = new Date("2026-11-09T12:10:00Z");
const CONTRACT_LINE =
  "[auth] Sign-in code for new.person@example.test: ABCD-2345 (AUTH_LOG_SIGN_IN_CODES is on: anyone who can read this log can sign in)";

const TRANSPORT_VARS = [
  "AUTH_POSTMARK_KEY",
  "POSTMARK_SERVER_TOKEN",
  "SMTP_HOST",
  "EMAIL_FROM",
  "AUTH_POSTMARK_FROM",
  "AUTH_LOG_SIGN_IN_CODES",
];

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const name of TRANSPORT_VARS) vi.stubEnv(name, "");
  findUnique.mockReset().mockResolvedValue(null);
  deleteMany.mockReset().mockResolvedValue({ count: 1 });
  sendSignInCodeEmail.mockReset().mockResolvedValue(undefined);
  sendWelcomeWithSignInCodeEmail.mockReset().mockResolvedValue(undefined);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const deliver = () => deliverSignInCode({ identifier: EMAIL, token: TOKEN, expires: EXPIRES });

describe("log delivery", () => {
  beforeEach(() => vi.stubEnv("AUTH_LOG_SIGN_IN_CODES", "true"));

  it("prints the contract line, then retires older codes", async () => {
    await deliver();

    expect(logSpy).toHaveBeenCalledWith(CONTRACT_LINE);
    expect(deleteMany).toHaveBeenCalledWith({ where: { identifier: EMAIL, expires: { lt: EXPIRES } } });
    expect(logSpy.mock.invocationCallOrder[0]!).toBeLessThan(deleteMany.mock.invocationCallOrder[0]!);
    expect(sendSignInCodeEmail).not.toHaveBeenCalled();
    expect(sendWelcomeWithSignInCodeEmail).not.toHaveBeenCalled();
  });

  it("logs no code when a transport is configured, even with the flag set", async () => {
    vi.stubEnv("AUTH_POSTMARK_KEY", "pm");

    await deliver();

    expect(sendWelcomeWithSignInCodeEmail).toHaveBeenCalledWith(EMAIL, TOKEN);
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain("ABCD-2345");
  });
});

describe("email delivery", () => {
  beforeEach(() => vi.stubEnv("AUTH_POSTMARK_KEY", "pm"));

  it("sends the welcome-with-code email to a new address and the bare code to a known one", async () => {
    await deliver();
    expect(sendWelcomeWithSignInCodeEmail).toHaveBeenCalledWith(EMAIL, TOKEN);

    findUnique.mockResolvedValue({ id: "user_1" });
    await deliver();
    expect(sendSignInCodeEmail).toHaveBeenCalledWith(EMAIL, TOKEN);
  });

  it("retires older codes only after the send", async () => {
    await deliver();
    expect(sendWelcomeWithSignInCodeEmail.mock.invocationCallOrder[0]!).toBeLessThan(
      deleteMany.mock.invocationCallOrder[0]!,
    );
  });

  it("a failed send rethrows and retires nothing", async () => {
    sendWelcomeWithSignInCodeEmail.mockRejectedValue(new Error("postmark down"));
    await expect(deliver()).rejects.toThrow("postmark down");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("a failed retire after a good send does not throw", async () => {
    deleteMany.mockRejectedValue(new Error("db blip"));
    await expect(deliver()).resolves.toBeUndefined();
  });
});

describe("no way to deliver", () => {
  it("throws and retires nothing", async () => {
    await expect(deliver()).rejects.toThrow(/not configured/i);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
