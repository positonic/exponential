/**
 * Unit tests for the `feature.move` mutation's both-ends access gate (ADR-0027).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` (no real DB), mirroring
 * the harness in `problem.test.ts`. The move must be rejected unless the caller
 * is a non-viewer (owner/admin/member) of *both* the source and destination
 * workspaces. The transactional cascade itself is exercised by the integration
 * test (`featureMove.integration.test.ts`).
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
const sourceWs = "ws-source";
const destWs = "ws-dest";
const featureId = "feat-1";
const sourceProduct = "prod-source";
const destProduct = "prod-dest";

/** Role the caller holds in a given workspace, or null for non-member. */
function stubRoles(
  dbMock: DeepMockProxy<PrismaClient>,
  roles: Record<string, string | null>,
) {
  dbMock.workspaceUser.findUnique.mockImplementation((args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsId = (args as any)?.where?.userId_workspaceId?.workspaceId as string;
    const role = roles[wsId] ?? null;
    return Promise.resolve(
      role ? ({ role, workspaceId: wsId } as never) : (null as never),
    );
  });
  // No team-based fallback in these tests.
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

function stubFeature(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.feature.findUnique.mockResolvedValue({
    id: featureId,
    productId: sourceProduct,
    goalId: null,
    product: { workspaceId: sourceWs },
    tags: [],
    insights: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function stubDestProduct(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue({
    id: destProduct,
    slug: "dest",
    workspaceId: destWs,
    ticketCounter: 0,
    funTicketIds: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("feature.move — both-ends access gate (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("rejects when the caller is only a viewer of the source workspace", async () => {
    stubFeature(dbMock);
    stubRoles(dbMock, { [sourceWs]: "viewer", [destWs]: "owner" });

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.feature.move({ featureId, destinationProductId: destProduct }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects when the caller is not a member of the destination workspace", async () => {
    stubFeature(dbMock);
    stubDestProduct(dbMock);
    stubRoles(dbMock, { [sourceWs]: "owner", [destWs]: null });

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.feature.move({ featureId, destinationProductId: destProduct }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects when the caller is only a viewer of the destination workspace", async () => {
    stubFeature(dbMock);
    stubDestProduct(dbMock);
    stubRoles(dbMock, { [sourceWs]: "owner", [destWs]: "viewer" });

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.feature.move({ featureId, destinationProductId: destProduct }),
    ).rejects.toThrow(TRPCError);
  });
});
