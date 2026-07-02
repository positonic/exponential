/**
 * Unit tests for the applicant-account offer settings on `form.update` —
 * `offerApplicantAccount` (success-page CTA toggle) and
 * `applicantAccountPrompt` (per-form copy override; empty ⇒ null ⇒ built-in
 * default). See CONTEXT.md ### Forms — "Applicant account".
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const formId = "form-1";

function stubForm(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.form.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: formId, workspaceId, slug: "test" } as any,
  );
}

function stubMembership(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspaceUser.findFirst.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { userId: callerId, workspaceId, role: "member" } as any,
  );
}

describe("form.update — applicant account offer (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubForm(dbMock);
    stubMembership(dbMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.form.update.mockResolvedValue({ id: formId } as any);
  });

  it("persists disabling the offer and a custom prompt", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.form.update({
      id: formId,
      offerApplicantAccount: false,
      applicantAccountPrompt: "Track your application status any time.",
    });

    expect(dbMock.form.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: formId },
        data: expect.objectContaining({
          offerApplicantAccount: false,
          applicantAccountPrompt: "Track your application status any time.",
        }),
      }),
    );
  });

  it("stores an empty/whitespace prompt as null (built-in default copy)", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.form.update({
      id: formId,
      applicantAccountPrompt: "   ",
    });

    expect(dbMock.form.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicantAccountPrompt: null }),
      }),
    );
  });

  it("leaves both untouched when omitted from the payload", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.form.update({ id: formId, name: "Renamed" });

    expect(dbMock.form.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          offerApplicantAccount: undefined,
          applicantAccountPrompt: undefined,
        }),
      }),
    );
  });
});
