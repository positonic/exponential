/**
 * Unit test for notification.getMatrixOptIn (V2, ADR-0043).
 *
 * The opt-in gate: Matrix is offered as a notification channel ONLY when the
 * user has paired (a mapping under the shared system "matrix" Integration).
 * Pairing for chat is what creates the mapping; choosing Matrix here is still
 * a separate explicit step (setting preference.integrationId to the returned id).
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
    constructor(_opts?: unknown) {
      /* noop */
    }
  },
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
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

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
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

import { createMockCaller } from "~/test/trpc-helpers";
import {
  fakeIntegrationFindFirst,
  SYSTEM_MATRIX_INTEGRATION,
} from "~/test/matrixIntegrationFixtures";

const USER_ID = "user-1";
const MATRIX_INT = { id: "int-matrix", provider: "matrix", status: "ACTIVE" };

describe("notification.getMatrixOptIn", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("is unavailable when no Matrix integration exists at all", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(caller.notification.getMatrixOptIn()).resolves.toEqual({
      available: false,
      integrationId: null,
    });
  });

  it("is unavailable when the user has NOT paired (no mapping) — pairing is required", async () => {
    dbMock.integration.findFirst.mockResolvedValue(MATRIX_INT as never);
    dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(caller.notification.getMatrixOptIn()).resolves.toEqual({
      available: false,
      integrationId: null,
    });
  });

  it("resolves the system row, not a workspace-registered Matrix server", async () => {
    // Both a workspace homeserver and the shared gateway row exist, and the
    // workspace ones are userId: null too. Only the workspaceId: null constraint
    // keeps them apart.
    dbMock.integration.findFirst.mockImplementation(
      fakeIntegrationFindFirst() as never,
    );
    dbMock.integrationUserMapping.findFirst.mockResolvedValue({
      userId: USER_ID,
      integrationId: SYSTEM_MATRIX_INTEGRATION.id,
      externalUserId: "@james:syntro.fi",
    } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(caller.notification.getMatrixOptIn()).resolves.toEqual({
      available: true,
      integrationId: SYSTEM_MATRIX_INTEGRATION.id,
    });
  });

  it("is available (and returns the integration id) once the user has a mapping", async () => {
    dbMock.integration.findFirst.mockResolvedValue(MATRIX_INT as never);
    dbMock.integrationUserMapping.findFirst.mockResolvedValue({
      userId: USER_ID,
      integrationId: "int-matrix",
      externalUserId: "@james:syntro.fi",
    } as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(caller.notification.getMatrixOptIn()).resolves.toEqual({
      available: true,
      integrationId: "int-matrix",
    });
  });
});

describe("notification.sendMatrixTest", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("refuses (PRECONDITION_FAILED) when the user has not paired Matrix", async () => {
    dbMock.integration.findFirst.mockResolvedValue(MATRIX_INT as never);
    dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(caller.notification.sendMatrixTest()).rejects.toThrow(/Connect Matrix first/);
  });
});
