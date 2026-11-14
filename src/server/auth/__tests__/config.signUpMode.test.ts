/**
 * **Sign-up mode**, enforced in the Auth.js `signIn` callback. Open (or no
 * setting at all — exponential.im) lets anyone create an account. Invite-only
 * refuses an address with no account and no pending invitation, before a code
 * is ever sent; existing users and invitees are unaffected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { SIGN_UP_CLOSED_ERROR } from "~/lib/signInErrors";

const mockDb = db as unknown as DeepMockProxy<PrismaClient>;
const REFUSED = `/signin?error=${SIGN_UP_CLOSED_ERROR}`;
const STRANGER = "stranger@example.test";

type SignInArgs = Parameters<typeof authConfig.callbacks.signIn>[0];

function signIn(args: {
  email?: string | null;
  provider?: string;
  type?: string;
  verificationRequest?: boolean;
}) {
  const provider = args.provider ?? "postmark";
  return authConfig.callbacks.signIn({
    user: { id: "new-id", email: args.email === undefined ? STRANGER : args.email },
    account: {
      provider,
      type: args.type ?? (provider === "postmark" ? "email" : "oauth"),
      providerAccountId: "pa-1",
    },
    ...(args.verificationRequest ? { email: { verificationRequest: true } } : {}),
  } as SignInArgs);
}

function settingsRow(signUpMode: string | null) {
  return { id: "instance", signUpMode, setupTokenHash: null, setupTokenExpiresAt: null, updatedAt: new Date() };
}

beforeEach(() => {
  mockReset(mockDb);
  mockDb.user.findUnique.mockResolvedValue(null);
  mockDb.workspaceInvitation.findFirst.mockResolvedValue(null);
  mockDb.teamInvitation.findFirst.mockResolvedValue(null);
});

describe("sign-up mode in the signIn callback", () => {
  it("with no setting (exponential.im), a new address may sign up", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(null);
    expect(await signIn({ verificationRequest: true })).toBe(true);
    expect(await signIn({ provider: "google" })).toBe(true);
  });

  it("open mode lets a new address sign up", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("open"));
    expect(await signIn({ verificationRequest: true })).toBe(true);
  });

  it("invite-only refuses a stranger before a code is sent, and at the callback", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    expect(await signIn({ verificationRequest: true })).toBe(REFUSED);
    expect(await signIn({})).toBe(REFUSED);
  });

  it("invite-only refuses a stranger arriving by OAuth", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    expect(await signIn({ provider: "google" })).toBe(REFUSED);
  });

  it("invite-only admits an address with a pending workspace invitation", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    mockDb.workspaceInvitation.findFirst.mockResolvedValue({ id: "inv" } as never);

    expect(await signIn({ verificationRequest: true })).toBe(true);
    const where = mockDb.workspaceInvitation.findFirst.mock.calls[0]![0]!.where;
    expect(where).toMatchObject({
      email: { equals: STRANGER, mode: "insensitive" },
      status: "pending",
    });
    expect(where?.expiresAt).toMatchObject({ gt: expect.any(Date) as Date });
  });

  it("invite-only admits an address with a pending team invitation", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    mockDb.teamInvitation.findFirst.mockResolvedValue({ id: "tinv" } as never);
    expect(await signIn({ provider: "google" })).toBe(true);
  });

  it("invite-only leaves existing users alone", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", isAdmin: false } as never);
    mockDb.account.findFirst.mockResolvedValue(null);

    expect(await signIn({ verificationRequest: true })).toBe(true);
    expect(await signIn({ provider: "google" })).toBe(true);
  });

  it("invite-only, no email: admits an existing OAuth account, refuses a new one", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    mockDb.account.findUnique.mockResolvedValueOnce({ id: "acc" } as never).mockResolvedValueOnce(null);

    expect(await signIn({ email: null, provider: "discord" })).toBe(true);
    expect(await signIn({ email: null, provider: "discord" })).toBe(REFUSED);
  });

  it("credentials sign-ins (desktop bridge, setup) are already a known user", async () => {
    mockDb.instanceSettings.findUnique.mockResolvedValue(settingsRow("invite-only"));
    expect(await signIn({ email: null, provider: "desktop", type: "credentials" })).toBe(true);
  });
});
