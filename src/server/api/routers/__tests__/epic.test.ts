/**
 * Unit tests for the `epic` router's access gating.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Covers the 2026-08-04 audit fixes:
 * `getById` must require workspace membership (it previously returned any epic
 * to any authenticated user), and the gate must be the centralized
 * `getWorkspaceMembership` resolver so team-based workspace members are
 * admitted, matching the ticket/feature/product routers.
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
const PRODUCT_ID = "prod-1";
const EPIC = {
  id: "epic-1",
  name: "Payments",
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_ID,
};

type MembershipKind = "direct" | "team" | "none";

// getWorkspaceMembership → direct WorkspaceUser lookup, then team fallback
function mockMembership(dbMock: DeepMockProxy<PrismaClient>, kind: MembershipKind) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    kind === "direct"
      ? ({ role: "member", workspaceId: WORKSPACE_ID } as never)
      : null,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(
    kind === "team"
      ? ({ role: "member", team: { workspaceId: WORKSPACE_ID } } as never)
      : null,
  );
}

describe("epic router access gating (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("getById", () => {
    it("denies a non-member even when the epic exists (the audit gap)", async () => {
      mockMembership(dbMock, "none");
      dbMock.epic.findUnique.mockResolvedValue(EPIC as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.epic.getById({ id: EPIC.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("admits a team-based workspace member", async () => {
      mockMembership(dbMock, "team");
      dbMock.epic.findUnique.mockResolvedValue(EPIC as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.epic.getById({ id: EPIC.id })).resolves.toMatchObject({
        id: EPIC.id,
      });
    });

    it("still 404s on a missing epic before any membership check", async () => {
      dbMock.epic.findUnique.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.epic.getById({ id: "nope" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("admits a team-based workspace member (previously direct-only)", async () => {
      mockMembership(dbMock, "team");
      dbMock.epic.findMany.mockResolvedValue([EPIC] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.epic.list({ workspaceId: WORKSPACE_ID }),
      ).resolves.toMatchObject([{ id: EPIC.id }]);
    });

    it("denies a non-member", async () => {
      mockMembership(dbMock, "none");

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.epic.list({ workspaceId: WORKSPACE_ID }),
      ).rejects.toBeInstanceOf(TRPCError);
      expect(dbMock.epic.findMany).not.toHaveBeenCalled();
    });

    it("scopes to one product, and keeps product-less epics visible", async () => {
      mockMembership(dbMock, "direct");
      dbMock.epic.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.epic.list({
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_ID,
      });

      // Pre-backfill epics (productId null) must stay in the list or they are
      // invisible from every product board and can never be assigned one.
      expect(dbMock.epic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            OR: [{ productId: PRODUCT_ID }, { productId: null }],
          }),
        }),
      );
    });

    it("drops product-less epics when includeUnassigned is off", async () => {
      mockMembership(dbMock, "direct");
      dbMock.epic.findMany.mockResolvedValue([] as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.epic.list({
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_ID,
        includeUnassigned: false,
      });

      expect(dbMock.epic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: [{ productId: PRODUCT_ID }] }),
        }),
      );
    });
  });

  describe("create", () => {
    it("rejects a product from another workspace", async () => {
      mockMembership(dbMock, "direct");
      dbMock.product.findUnique.mockResolvedValue({
        workspaceId: "ws-other",
      } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.epic.create({
          workspaceId: WORKSPACE_ID,
          productId: PRODUCT_ID,
          name: "Payments",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.epic.create).not.toHaveBeenCalled();
    });

    it("stores the product when it belongs to the workspace", async () => {
      mockMembership(dbMock, "direct");
      dbMock.product.findUnique.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
      } as never);
      dbMock.epic.create.mockResolvedValue(EPIC as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.epic.create({
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_ID,
        name: "Payments",
      });

      expect(dbMock.epic.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ productId: PRODUCT_ID }),
        }),
      );
    });
  });

  describe("update", () => {
    it("rejects moving an epic to another workspace's product", async () => {
      mockMembership(dbMock, "direct");
      dbMock.epic.findUnique.mockResolvedValue(EPIC as never);
      dbMock.product.findUnique.mockResolvedValue({
        workspaceId: "ws-other",
      } as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.epic.update({ id: EPIC.id, productId: PRODUCT_ID }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.epic.update).not.toHaveBeenCalled();
    });
  });
});
