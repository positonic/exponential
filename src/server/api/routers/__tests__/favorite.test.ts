/**
 * Unit tests for the `favorite` router.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Covers the new "page" favourite kind:
 * the workspace-membership gate (via the centralized `getWorkspaceMembership`
 * resolver), idempotent toggle on/off, and `list` returning the snapshot label
 * for page rows vs the live-resolved title for entity rows (stale rows skipped).
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
const PAGE_PATH = "products/acme/features";

function mockMember(
  dbMock: DeepMockProxy<PrismaClient>,
  isMember: boolean,
) {
  // getWorkspaceMembership → direct WorkspaceUser lookup, then team fallback
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    isMember ? ({ role: "member", workspaceId: WORKSPACE_ID } as never) : null,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

describe("favorite router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("toggle — page favourites", () => {
    it("creates a page favourite for a workspace member, snapshotting label/icon", async () => {
      mockMember(dbMock, true);
      dbMock.favorite.findUnique.mockResolvedValue(null as never); // not yet favourited
      dbMock.favorite.create.mockResolvedValue({ id: "fav-1" } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.toggle({
          entityType: "page",
          entityId: PAGE_PATH,
          label: "Acme · Features",
          icon: "features",
          workspaceId: WORKSPACE_ID,
        }),
      ).resolves.toEqual({ favorited: true });

      expect(dbMock.favorite.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          entityType: "page",
          entityId: PAGE_PATH,
          workspaceId: WORKSPACE_ID,
          label: "Acme · Features",
          icon: "features",
        },
      });
    });

    it("removes an existing page favourite (idempotent toggle off)", async () => {
      mockMember(dbMock, true);
      dbMock.favorite.findUnique.mockResolvedValue({ id: "fav-1" } as never);
      dbMock.favorite.delete.mockResolvedValue({ id: "fav-1" } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.toggle({
          entityType: "page",
          entityId: PAGE_PATH,
          workspaceId: WORKSPACE_ID,
        }),
      ).resolves.toEqual({ favorited: false });

      expect(dbMock.favorite.delete).toHaveBeenCalledWith({ where: { id: "fav-1" } });
      expect(dbMock.favorite.create).not.toHaveBeenCalled();
    });

    it("forbids a non-member from favouriting a page", async () => {
      mockMember(dbMock, false);
      dbMock.favorite.findUnique.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.toggle({
          entityType: "page",
          entityId: PAGE_PATH,
          label: "Acme · Features",
          workspaceId: WORKSPACE_ID,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);

      expect(dbMock.favorite.create).not.toHaveBeenCalled();
    });

    it("rejects a page favourite missing a workspaceId", async () => {
      dbMock.favorite.findUnique.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.toggle({
          entityType: "page",
          entityId: PAGE_PATH,
          label: "Acme · Features",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);

      expect(dbMock.favorite.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("uses the snapshot label/icon for page rows and the live title for entity rows, skipping stale entity rows", async () => {
      dbMock.favorite.findMany.mockResolvedValue([
        {
          id: "fav-page",
          entityType: "page",
          entityId: PAGE_PATH,
          label: "Acme · Features",
          icon: "features",
          workspaceId: WORKSPACE_ID,
        },
        {
          id: "fav-obj",
          entityType: "objective",
          entityId: "42",
          label: null,
          icon: null,
          workspaceId: WORKSPACE_ID,
        },
        {
          id: "fav-stale",
          entityType: "objective",
          entityId: "999",
          label: null,
          icon: null,
          workspaceId: WORKSPACE_ID,
        },
      ] as never);
      // Only goal 42 still exists; 999 is stale and must be skipped.
      dbMock.goal.findMany.mockResolvedValue([
        { id: 42, title: "Grow revenue" },
      ] as never);
      dbMock.keyResult.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      const items = await caller.favorite.list({ workspaceId: WORKSPACE_ID });

      expect(items).toEqual([
        {
          id: "fav-page",
          entityType: "page",
          entityId: PAGE_PATH,
          title: "Acme · Features",
          icon: "features",
          workspaceId: WORKSPACE_ID,
        },
        {
          id: "fav-obj",
          entityType: "objective",
          entityId: "42",
          title: "Grow revenue",
          icon: null,
          workspaceId: WORKSPACE_ID,
        },
      ]);
    });
  });

  describe("isFavorite", () => {
    it("reports whether a page path is favourited", async () => {
      dbMock.favorite.findUnique.mockResolvedValue({ id: "fav-1" } as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.isFavorite({ entityType: "page", entityId: PAGE_PATH }),
      ).resolves.toEqual({ favorited: true });
    });

    it("reports not-favourited when absent", async () => {
      dbMock.favorite.findUnique.mockResolvedValue(null as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.favorite.isFavorite({ entityType: "page", entityId: PAGE_PATH }),
      ).resolves.toEqual({ favorited: false });
    });
  });
});
