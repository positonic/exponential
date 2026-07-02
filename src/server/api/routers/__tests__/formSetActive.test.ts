/**
 * Unit tests for `form.setActive` — the dedicated activation mutation.
 *
 * Activation persists on its own, decoupled from the editor's draft Save flow:
 * the public /f/[slug] page 404s on an inactive form, so a toggle that looks
 * live but never persisted is a broken public link. These tests pin that the
 * mutation writes ONLY `isActive`, and that access control matches the rest of
 * the form router (workspace membership on the form's own workspace).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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

function stubForm(dbMock: DeepMockProxy<PrismaClient>, exists = true) {
  dbMock.form.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exists ? ({ id: formId, workspaceId, slug: "test" } as any) : null,
  );
}

function stubMembership(dbMock: DeepMockProxy<PrismaClient>, isMember: boolean) {
  dbMock.workspaceUser.findFirst.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isMember ? ({ userId: callerId, workspaceId, role: "member" } as any) : null,
  );
}

describe("form.setActive (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("persists activation, writing ONLY isActive", async () => {
    stubForm(dbMock);
    stubMembership(dbMock, true);
    dbMock.form.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: formId, workspaceId, slug: "test", isActive: true } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.form.setActive({ id: formId, isActive: true });

    expect(result.isActive).toBe(true);
    expect(dbMock.form.update).toHaveBeenCalledWith({
      where: { id: formId },
      data: { isActive: true },
      select: { id: true, isActive: true, slug: true },
    });
  });

  it("persists deactivation the same way", async () => {
    stubForm(dbMock);
    stubMembership(dbMock, true);
    dbMock.form.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: formId, workspaceId, slug: "test", isActive: false } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.form.setActive({ id: formId, isActive: false });

    expect(result.isActive).toBe(false);
    expect(dbMock.form.update).toHaveBeenCalledWith({
      where: { id: formId },
      data: { isActive: false },
      select: { id: true, isActive: true, slug: true },
    });
  });

  it("rejects with NOT_FOUND when the form does not exist", async () => {
    stubForm(dbMock, false);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.form.setActive({ id: formId, isActive: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });

  it("rejects with FORBIDDEN for a non-member of the form's workspace", async () => {
    stubForm(dbMock);
    stubMembership(dbMock, false);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.form.setActive({ id: formId, isActive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });
});
