/**
 * Unit tests for the `channelLink` router (ADR-0023).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Asserts the workspace-membership gate
 * (via the centralized `getWorkspaceMembership` resolver) and the
 * `(provider, externalId)` uniqueness constraint the routing model depends on.
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

const WORKSPACE_ID = "ws-1";
const USER_ID = "user-1";
const PROVIDER = "whatsapp";
const EXTERNAL_ID = "12345@g.us";

function mockRole(
  dbMock: DeepMockProxy<PrismaClient>,
  role: "owner" | "admin" | "member" | "viewer" | null,
) {
  // getWorkspaceMembership → direct WorkspaceUser lookup, then team fallback
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ role, workspaceId: WORKSPACE_ID } as never) : null,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

describe("channelLink router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("link — membership gate", () => {
    it("allows a workspace member to link a channel", async () => {
      mockRole(dbMock, "member");
      dbMock.channelLink.findUnique.mockResolvedValue(null as never); // no duplicate
      dbMock.channelLink.create.mockResolvedValue({
        id: "cl-1",
        provider: PROVIDER,
        externalId: EXTERNAL_ID,
        workspaceId: WORKSPACE_ID,
      } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.link({
          provider: PROVIDER,
          externalId: EXTERNAL_ID,
          workspaceId: WORKSPACE_ID,
        }),
      ).resolves.toMatchObject({ id: "cl-1" });

      expect(dbMock.channelLink.create).toHaveBeenCalledWith({
        data: {
          provider: PROVIDER,
          externalId: EXTERNAL_ID,
          displayName: null,
          workspaceId: WORKSPACE_ID,
          projectId: null,
          createdById: USER_ID,
        },
      });
    });

    it("forbids a non-member from linking a channel", async () => {
      mockRole(dbMock, null);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.link({
          provider: PROVIDER,
          externalId: EXTERNAL_ID,
          workspaceId: WORKSPACE_ID,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);

      // Gate fails before any write.
      expect(dbMock.channelLink.create).not.toHaveBeenCalled();
    });
  });

  describe("link — uniqueness", () => {
    it("rejects a duplicate (provider, externalId)", async () => {
      mockRole(dbMock, "member");
      dbMock.channelLink.findUnique.mockResolvedValue({ id: "existing" } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.link({
          provider: PROVIDER,
          externalId: EXTERNAL_ID,
          workspaceId: WORKSPACE_ID,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<TRPCError>);

      expect(dbMock.channelLink.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("returns links for a member", async () => {
      mockRole(dbMock, "viewer");
      dbMock.channelLink.findMany.mockResolvedValue([
        { id: "cl-1", workspaceId: WORKSPACE_ID },
      ] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.list({ workspaceId: WORKSPACE_ID }),
      ).resolves.toHaveLength(1);
    });

    it("forbids a non-member", async () => {
      mockRole(dbMock, null);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.list({ workspaceId: WORKSPACE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(dbMock.channelLink.findMany).not.toHaveBeenCalled();
    });
  });

  describe("unlink", () => {
    it("deletes the link for a member of its workspace", async () => {
      dbMock.channelLink.findUnique.mockResolvedValue({
        id: "cl-1",
        workspaceId: WORKSPACE_ID,
      } as never);
      mockRole(dbMock, "member");
      dbMock.channelLink.delete.mockResolvedValue({ id: "cl-1" } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.unlink({ id: "cl-1" }),
      ).resolves.toMatchObject({ id: "cl-1" });

      expect(dbMock.channelLink.delete).toHaveBeenCalledWith({
        where: { id: "cl-1" },
      });
    });

    it("forbids a non-member from unlinking", async () => {
      dbMock.channelLink.findUnique.mockResolvedValue({
        id: "cl-1",
        workspaceId: WORKSPACE_ID,
      } as never);
      mockRole(dbMock, null);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.channelLink.unlink({ id: "cl-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(dbMock.channelLink.delete).not.toHaveBeenCalled();
    });
  });
});
