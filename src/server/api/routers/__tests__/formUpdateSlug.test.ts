/**
 * Unit tests for `form.updateSlug` — public-link rename (deferred in
 * ADR-0029, now built). Pins the contract: input is normalized with the same
 * `slugify` used at create; collisions with another form are rejected
 * (CONFLICT), never silently deduped; a same-slug rename is a no-op; and the
 * mutation writes ONLY `slug`.
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

/**
 * `updateSlug` hits `form.findUnique` twice with different shapes: by `id`
 * (the access-checked load) and by `slug` (the collision probe). Route each
 * to its own stub.
 */
function stubFormLookups(
  dbMock: DeepMockProxy<PrismaClient>,
  opts: { currentSlug?: string; clashId?: string | null } = {},
) {
  const { currentSlug = "test", clashId = null } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbMock.form.findUnique.mockImplementation(((args: any) => {
    if (args?.where?.id) {
      return Promise.resolve({
        id: formId,
        workspaceId,
        slug: currentSlug,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
    return Promise.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clashId ? ({ id: clashId } as any) : null,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}

function stubMembership(dbMock: DeepMockProxy<PrismaClient>, isMember: boolean) {
  dbMock.workspaceUser.findFirst.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isMember ? ({ userId: callerId, workspaceId, role: "member" } as any) : null,
  );
}

describe("form.updateSlug (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("normalizes the requested slug and writes ONLY slug", async () => {
    stubFormLookups(dbMock);
    stubMembership(dbMock, true);
    dbMock.form.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: formId, slug: "clear_feedback" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.form.updateSlug({
      id: formId,
      slug: "Clear Feedback",
    });

    expect(result.slug).toBe("clear_feedback");
    expect(dbMock.form.update).toHaveBeenCalledWith({
      where: { id: formId },
      data: { slug: "clear_feedback" },
      select: { id: true, slug: true },
    });
  });

  it("is a no-op when the normalized slug matches the current one", async () => {
    stubFormLookups(dbMock, { currentSlug: "test" });
    stubMembership(dbMock, true);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.form.updateSlug({ id: formId, slug: "Test" });

    expect(result.slug).toBe("test");
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });

  it("rejects with CONFLICT when another form already holds the slug", async () => {
    stubFormLookups(dbMock, { clashId: "form-other" });
    stubMembership(dbMock, true);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.form.updateSlug({ id: formId, slug: "taken" }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<TRPCError>);
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });

  it("rejects with BAD_REQUEST when the slug normalizes to nothing", async () => {
    stubFormLookups(dbMock);
    stubMembership(dbMock, true);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.form.updateSlug({ id: formId, slug: "!!!" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });

  it("rejects with FORBIDDEN for a non-member of the form's workspace", async () => {
    stubFormLookups(dbMock);
    stubMembership(dbMock, false);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.form.updateSlug({ id: formId, slug: "renamed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(dbMock.form.update).not.toHaveBeenCalled();
  });
});
