/**
 * okr.linkFeature / okr.unlinkFeature — the Feature execution edge of a key
 * result (ADR-0050).
 *
 * External behavior under test:
 * - linkFeature creates the (keyResult, feature) pair exactly once (upsert
 *   semantics — idempotent on relink).
 * - Cross-workspace features are rejected; the link row is never written.
 * - KR-side authz mirrors linkProject: KR owner OR workspace member via the
 *   centralized resolver; strangers get NOT_FOUND. The feature-side guard
 *   mirrors feature.update: membership in the feature's workspace is required
 *   even for the KR owner.
 * - unlinkFeature deletes only the link row — never either entity.
 * - okr.getById carries linked features with the lean select shape.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
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

const OWNER_ID = "user-owner";
const MEMBER_ID = "user-member";
const STRANGER_ID = "user-stranger";
const WORKSPACE_ID = "ws-1";
const OTHER_WORKSPACE_ID = "ws-2";
const KR_ID = "kr-1";
const FEATURE_ID = "feat-1";

const KR_ROW = {
  id: KR_ID,
  userId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  goalId: 42,
};

const FEATURE_ROW = {
  id: FEATURE_ID,
  goalId: null,
  product: { workspaceId: WORKSPACE_ID },
};

describe("okr.linkFeature / okr.unlinkFeature", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.feature.findUnique.mockResolvedValue(FEATURE_ROW as never);
    // No team-derived access in these tests; direct membership is set per test.
    db.teamUser.findFirst.mockResolvedValue(null as never);
  });

  function grantMembership() {
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
  }

  function denyMembership() {
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
  }

  describe("linkFeature", () => {
    it("creates the (keyResult, feature) pair exactly once via upsert", async () => {
      grantMembership();
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      const result = await caller.okr.linkFeature({
        keyResultId: KR_ID,
        featureId: FEATURE_ID,
      });

      expect(result).toEqual({ success: true });
      expect(db.keyResultFeature.upsert).toHaveBeenCalledTimes(1);
      const arg = db.keyResultFeature.upsert.mock.calls[0]![0];
      expect(arg.where).toEqual({
        keyResultId_featureId: { keyResultId: KR_ID, featureId: FEATURE_ID },
      });
      expect(arg.create).toEqual({ keyResultId: KR_ID, featureId: FEATURE_ID });
      // Relink is a no-op, not a second row or an error.
      expect(arg.update).toEqual({});
      expect(db.keyResultFeature.create).not.toHaveBeenCalled();
      expect(db.keyResultFeature.createMany).not.toHaveBeenCalled();
    });

    it("allows the KR owner when they are a workspace member", async () => {
      grantMembership();
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).resolves.toEqual({ success: true });
    });

    it("rejects a stranger (not owner, no membership) with NOT_FOUND", async () => {
      denyMembership();
      const caller = createMockCaller({ userId: STRANGER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.keyResultFeature.upsert).not.toHaveBeenCalled();
    });

    it("rejects the KR owner when they are not a member of the feature's workspace (feature.update parity)", async () => {
      denyMembership();
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.keyResultFeature.upsert).not.toHaveBeenCalled();
    });

    it("rejects a feature whose product belongs to a different workspace", async () => {
      grantMembership();
      db.feature.findUnique.mockResolvedValue({
        ...FEATURE_ROW,
        product: { workspaceId: OTHER_WORKSPACE_ID },
      } as never);
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.keyResultFeature.upsert).not.toHaveBeenCalled();
    });

    it("rejects linking to a key result with no workspace", async () => {
      grantMembership();
      db.keyResult.findFirst.mockResolvedValue({
        ...KR_ROW,
        workspaceId: null,
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.keyResultFeature.upsert).not.toHaveBeenCalled();
    });

    it("rejects a missing feature with NOT_FOUND", async () => {
      grantMembership();
      db.feature.findUnique.mockResolvedValue(null as never);
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      await expect(
        caller.okr.linkFeature({ keyResultId: KR_ID, featureId: "feat-missing" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.keyResultFeature.upsert).not.toHaveBeenCalled();
    });
  });

  describe("unlinkFeature", () => {
    it("deletes only the link row — never the feature or the key result", async () => {
      grantMembership();
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      const result = await caller.okr.unlinkFeature({
        keyResultId: KR_ID,
        featureId: FEATURE_ID,
      });

      expect(result).toEqual({ success: true });
      expect(db.keyResultFeature.deleteMany).toHaveBeenCalledTimes(1);
      expect(db.keyResultFeature.deleteMany).toHaveBeenCalledWith({
        where: { keyResultId: KR_ID, featureId: FEATURE_ID },
      });
      expect(db.feature.delete).not.toHaveBeenCalled();
      expect(db.feature.deleteMany).not.toHaveBeenCalled();
      expect(db.keyResult.delete).not.toHaveBeenCalled();
      expect(db.keyResult.deleteMany).not.toHaveBeenCalled();
      // Unlink never touches the feature's Objective alignment.
      expect(db.feature.update).not.toHaveBeenCalled();
      expect(db.feature.updateMany).not.toHaveBeenCalled();
    });

    it("rejects a stranger with NOT_FOUND without deleting anything", async () => {
      denyMembership();
      const caller = createMockCaller({ userId: STRANGER_ID, db });

      await expect(
        caller.okr.unlinkFeature({ keyResultId: KR_ID, featureId: FEATURE_ID }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.keyResultFeature.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("includes linked features with the lean select shape beside projects", async () => {
      db.keyResult.findFirst.mockResolvedValue({
        ...KR_ROW,
        projects: [],
        features: [],
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.okr.getById({ id: KR_ID });

      expect(db.keyResult.findFirst).toHaveBeenCalledTimes(1);
      const arg = db.keyResult.findFirst.mock.calls[0]![0]!;
      const include = arg.include as {
        projects?: unknown;
        features?: {
          include?: { feature?: { select?: Record<string, unknown> } };
        };
      };

      // Projects stay untouched; features ride alongside.
      expect(include.projects).toBeDefined();
      const featureSelect = include.features?.include?.feature?.select;
      expect(featureSelect).toBeDefined();
      expect(Object.keys(featureSelect!).sort()).toEqual([
        "id",
        "name",
        "product",
        "status",
      ]);
      const productSelect = (
        featureSelect!.product as { select: Record<string, unknown> }
      ).select;
      expect(Object.keys(productSelect).sort()).toEqual([
        "color",
        "icon",
        "id",
        "name",
        "slug",
      ]);
    });
  });
});
