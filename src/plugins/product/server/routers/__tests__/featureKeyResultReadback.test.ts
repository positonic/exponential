/**
 * feature.list / feature.getById — the Feature side of the Feature↔Key result
 * execution edge (ADR-0050).
 *
 * ADR-0050 made the edge writable and readable from the *key result* side
 * (`okr.linkFeature`, `okr.getById`). The Feature side carried only `goal` —
 * the coarser Objective alignment — so "which numbers does this Feature move?"
 * had no answer without enumerating every key result in the workspace and
 * inverting the mapping. These tests pin the readback.
 *
 * External behavior under test:
 * - getById asks for `keyResultLinks` with the full KR shape (progress values
 *   included) so a single Feature read can render its key results.
 * - list asks for `keyResultLinks` with the *lean* shape, so a per-Feature key
 *   result column costs one query rather than N.
 * - `goal` is untouched on both. It answers a different question and the two
 *   are allowed to disagree (ADR-0050 "Consequences").
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

const MEMBER_ID = "user-member";
const WORKSPACE_ID = "ws-1";
const PRODUCT_ID = "prod-1";
const FEATURE_ID = "feat-1";

/** The nested `keyResultLinks` select, however the router spelled it. */
type LinkInclude = { select?: { keyResult?: { select?: Record<string, unknown> } } };

describe("Feature-side key result readback (ADR-0050)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      workspaceId: WORKSPACE_ID,
    } as never);
    db.product.findFirst.mockResolvedValue({
      id: PRODUCT_ID,
      workspaceId: WORKSPACE_ID,
    } as never);
  });

  describe("getById", () => {
    beforeEach(() => {
      db.feature.findUnique.mockResolvedValue({
        id: FEATURE_ID,
        product: { id: PRODUCT_ID, workspaceId: WORKSPACE_ID },
        keyResultLinks: [],
      } as never);
    });

    it("requests the linked key results with their progress values", async () => {
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      await caller.product.feature.getById({ id: FEATURE_ID });

      expect(db.feature.findUnique).toHaveBeenCalledTimes(1);
      const include = db.feature.findUnique.mock.calls[0]![0]!.include as {
        goal?: unknown;
        keyResultLinks?: LinkInclude;
      };

      const krSelect = include.keyResultLinks?.select?.keyResult?.select;
      expect(krSelect).toBeDefined();
      // Enough to render "which number, where is it now, where should it be".
      for (const field of [
        "id",
        "title",
        "period",
        "status",
        "currentValue",
        "targetValue",
        "goalId",
      ]) {
        expect(krSelect).toHaveProperty(field, true);
      }
    });

    it("leaves the Objective alignment (`goal`) in place beside it", async () => {
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      await caller.product.feature.getById({ id: FEATURE_ID });

      const include = db.feature.findUnique.mock.calls[0]![0]!.include as {
        goal?: unknown;
      };
      expect(include.goal).toBeDefined();
    });
  });

  describe("list", () => {
    beforeEach(() => {
      db.feature.findMany.mockResolvedValue([] as never);
    });

    it("carries a lean key result shape so one call builds the column", async () => {
      const caller = createMockCaller({ userId: MEMBER_ID, db });

      await caller.product.feature.list({ productId: PRODUCT_ID });

      expect(db.feature.findMany).toHaveBeenCalledTimes(1);
      const include = db.feature.findMany.mock.calls[0]![0]!.include as {
        keyResultLinks?: LinkInclude;
      };

      const krSelect = include.keyResultLinks?.select?.keyResult?.select;
      expect(krSelect).toBeDefined();
      // Lean on purpose: the list is a board/table read. Progress values are
      // getById's job — widening this select silently costs every product
      // listing with hundreds of features.
      expect(Object.keys(krSelect!).sort()).toEqual([
        "goalId",
        "id",
        "period",
        "title",
      ]);
    });
  });
});
