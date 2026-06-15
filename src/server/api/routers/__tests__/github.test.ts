/**
 * Unit tests for `github.setWorkspaceRepositories` (ADR-0020, slice #3).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Asserts the owner/admin gate and the
 * reconcile create/delete behaviour the associate flow depends on.
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

/** Make the installation lookup return an installation with two accessible repos. */
function mockInstallationWithRepos(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.integration.findFirst.mockResolvedValue({
    id: "int-1",
    providerConfig: {
      installationId: 42,
      accessibleRepos: {
        repositories: [
          { name: "alpha", full_name: "acme/alpha", owner: { login: "acme" }, private: false },
          { name: "beta", full_name: "acme/beta", owner: { login: "acme" }, private: true },
        ],
      },
    },
  } as never);
}

function mockRole(
  dbMock: DeepMockProxy<PrismaClient>,
  role: "owner" | "admin" | "member" | "viewer" | null,
) {
  // getWorkspaceMembership → direct WorkspaceUser lookup
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ role, workspaceId: WORKSPACE_ID } as never) : null,
  );
  // No team-based fallback membership
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

describe("github.setWorkspaceRepositories (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("authorization", () => {
    it.each(["owner", "admin"] as const)("allows %s", async (role) => {
      mockRole(dbMock, role);
      mockInstallationWithRepos(dbMock);
      dbMock.workspaceRepository.findMany.mockResolvedValue([] as never);
      dbMock.workspaceRepository.createMany.mockResolvedValue({ count: 1 } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.github.setWorkspaceRepositories({
          workspaceId: WORKSPACE_ID,
          fullNames: ["acme/alpha"],
        }),
      ).resolves.toBeDefined();
    });

    it.each(["member", "viewer"] as const)("forbids %s", async (role) => {
      mockRole(dbMock, role);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.github.setWorkspaceRepositories({
          workspaceId: WORKSPACE_ID,
          fullNames: ["acme/alpha"],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);

      // Gate fails before any write.
      expect(dbMock.workspaceRepository.createMany).not.toHaveBeenCalled();
      expect(dbMock.workspaceRepository.deleteMany).not.toHaveBeenCalled();
    });

    it("forbids a non-member", async () => {
      mockRole(dbMock, null);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.github.setWorkspaceRepositories({
          workspaceId: WORKSPACE_ID,
          fullNames: [],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("reconcile", () => {
    beforeEach(() => {
      mockRole(dbMock, "admin");
      mockInstallationWithRepos(dbMock);
      dbMock.workspaceRepository.deleteMany.mockResolvedValue({ count: 0 } as never);
      dbMock.workspaceRepository.createMany.mockResolvedValue({ count: 0 } as never);
    });

    it("creates only the added repos with correct row data", async () => {
      // currently tracking alpha; desired = alpha + beta → create beta only
      dbMock.workspaceRepository.findMany.mockResolvedValue([
        { fullName: "acme/alpha" },
      ] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.github.setWorkspaceRepositories({
        workspaceId: WORKSPACE_ID,
        fullNames: ["acme/alpha", "acme/beta"],
      });

      expect(dbMock.workspaceRepository.deleteMany).not.toHaveBeenCalled();
      expect(dbMock.workspaceRepository.createMany).toHaveBeenCalledWith({
        data: [
          {
            workspaceId: WORKSPACE_ID,
            integrationId: "int-1",
            owner: "acme",
            name: "beta",
            fullName: "acme/beta",
            installationId: "42",
            addedById: USER_ID,
          },
        ],
        skipDuplicates: true,
      });
    });

    it("deletes only the removed repos", async () => {
      // currently tracking alpha + beta; desired = alpha → delete beta only
      dbMock.workspaceRepository.findMany.mockResolvedValue([
        { fullName: "acme/alpha" },
        { fullName: "acme/beta" },
      ] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.github.setWorkspaceRepositories({
        workspaceId: WORKSPACE_ID,
        fullNames: ["acme/alpha"],
      });

      expect(dbMock.workspaceRepository.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, fullName: { in: ["acme/beta"] } },
      });
      expect(dbMock.workspaceRepository.createMany).not.toHaveBeenCalled();
    });

    it("is a no-op when the selection is unchanged", async () => {
      dbMock.workspaceRepository.findMany.mockResolvedValue([
        { fullName: "acme/alpha" },
      ] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.github.setWorkspaceRepositories({
        workspaceId: WORKSPACE_ID,
        fullNames: ["acme/alpha"],
      });

      expect(dbMock.workspaceRepository.createMany).not.toHaveBeenCalled();
      expect(dbMock.workspaceRepository.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects repos not accessible to the installation", async () => {
      dbMock.workspaceRepository.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.github.setWorkspaceRepositories({
          workspaceId: WORKSPACE_ID,
          fullNames: ["acme/alpha", "evil/repo"],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.workspaceRepository.createMany).not.toHaveBeenCalled();
    });
  });
});
