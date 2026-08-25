/**
 * Unit tests for the `matrixGateway` router (ADR-0043).
 *
 * Mirrors the telegramGateway surface but with no session table: live status
 * comes from the gateway HTTP API (mocked fetch here), the DB fallback is the
 * IntegrationUserMapping row under the system "matrix" Integration.
 * Uses `mockDeep<PrismaClient>()` — no real DB, ever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    constructor(_opts?: unknown) {
      // intentionally empty
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
import { SHARED_MATRIX_INTEGRATION_WHERE } from "~/server/utils/matrixGatewayIntegration";

const USER_ID = "user-1";
const MXID = "@james:syntro.fi";

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe("matrixGateway router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getStatus", () => {
    it("returns live gateway status when the gateway is reachable", async () => {
      fetchMock.mockResolvedValue(okJson({ paired: true, mxid: MXID, agentId: "zoe" }));

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.matrixGateway.getStatus()).resolves.toMatchObject({
        paired: true,
        mxid: MXID,
      });
      expect(dbMock.integrationUserMapping.findFirst).not.toHaveBeenCalled();
    });

    it("falls back to the IntegrationUserMapping row when the gateway is unreachable", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      dbMock.integrationUserMapping.findFirst.mockResolvedValue({
        externalUserId: MXID,
        userId: USER_ID,
      } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.matrixGateway.getStatus()).resolves.toEqual({
        paired: true,
        mxid: MXID,
      });
    });

    it("scopes the fallback lookup to the system row, not a workspace's Matrix server", async () => {
      // A workspace-registered homeserver is also an Integration with userId: null,
      // so the predicate must pin workspaceId: null or the mapping can be read
      // against the wrong integration entirely.
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.matrixGateway.getStatus();

      expect(dbMock.integrationUserMapping.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          integration: SHARED_MATRIX_INTEGRATION_WHERE,
        },
      });
      expect(SHARED_MATRIX_INTEGRATION_WHERE).toMatchObject({
        provider: "matrix",
        userId: null,
        workspaceId: null,
      });
    });

    it("reports unpaired when the gateway is down and no mapping exists", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      dbMock.integrationUserMapping.findFirst.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.matrixGateway.getStatus()).resolves.toMatchObject({
        paired: false,
      });
    });
  });

  describe("initiatePairing", () => {
    it("rejects an invalid Matrix ID before touching the gateway", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.matrixGateway.initiatePairing({ mxid: "not-an-mxid" }),
      ).rejects.toThrow(/Matrix ID/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("passes mxid + default-assistant context to the gateway and returns the code", async () => {
      dbMock.assistant.findFirst.mockResolvedValue({
        id: "asst-1",
        name: "Zoe",
        workspaceId: "ws-1",
      } as never);
      fetchMock.mockResolvedValue(
        okJson({
          pairingCode: "A3F1B2",
          roomId: "!dm:syntro.fi",
          botUserId: "@zoe:syntro.fi",
          expiresInSeconds: 600,
        }),
      );

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      const result = await caller.matrixGateway.initiatePairing({ mxid: MXID });

      expect(result).toMatchObject({ pairingCode: "A3F1B2", botUserId: "@zoe:syntro.fi" });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain("/pair");
      expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
        mxid: MXID,
        agentId: "assistant",
        assistantId: "asst-1",
        assistantName: "Zoe",
        workspaceId: "ws-1",
      });
    });

    it("surfaces a friendly error when the gateway is unreachable", async () => {
      dbMock.assistant.findFirst.mockResolvedValue(null as never);
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.matrixGateway.initiatePairing({ mxid: MXID }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.matrixGateway.initiatePairing({ mxid: MXID }),
      ).rejects.toThrow(/Unable to reach the Matrix gateway/);
    });
  });

  describe("disconnect", () => {
    it("calls the gateway and always clears the mapping row", async () => {
      fetchMock.mockResolvedValue(okJson({ success: true }));
      dbMock.integrationUserMapping.deleteMany.mockResolvedValue({ count: 1 } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.matrixGateway.disconnect()).resolves.toEqual({ success: true });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain("/pair");
      expect((init as RequestInit).method).toBe("DELETE");
      expect(dbMock.integrationUserMapping.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          integration: SHARED_MATRIX_INTEGRATION_WHERE,
        },
      });
    });

    it("still succeeds (and clears the mapping) when the gateway is down", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      dbMock.integrationUserMapping.deleteMany.mockResolvedValue({ count: 1 } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.matrixGateway.disconnect()).resolves.toEqual({ success: true });
      expect(dbMock.integrationUserMapping.deleteMany).toHaveBeenCalled();
    });
  });
});
