/**
 * okr.updateLinkedFeatures — transactional replace of a key result's Feature
 * execution set (ADR-0050), plus the `features` include on okr.getByObjective.
 *
 * External behavior under test:
 * - The set is replaced atomically: delete-all-then-recreate inside one
 *   transaction, mirroring updateLinkedProjects' shape.
 * - Authz is linkFeature's workspace-member guard, NOT updateLinkedProjects'
 *   owner-only check: a non-owner workspace member may save the set.
 * - Fill-on-null applies to newly created links; aligned features are never
 *   overwritten.
 * - Cross-workspace features reject the whole batch before anything is
 *   written.
 * - getByObjective carries linked features with the lean select shape.
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
const WORKSPACE_ID = "ws-1";
const OTHER_WORKSPACE_ID = "ws-2";
const KR_ID = "kr-1";

const KR_ROW = {
  id: KR_ID,
  userId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  goalId: 42,
};

function featureRow(id: string, goalId: number | null, workspaceId = WORKSPACE_ID) {
  return { id, goalId, product: { workspaceId } };
}

describe("okr.updateLinkedFeatures", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResult.findUnique.mockResolvedValue({
      ...KR_ROW,
      projects: [],
      features: [],
    } as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    // Interactive-transaction passthrough: run the callback against the same
    // mock so per-model assertions observe writes made inside $transaction.
    db.$transaction.mockImplementation((async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: PrismaClient) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[])) as never);
  });

  it("replaces the set atomically: delete-all-then-recreate in one transaction", async () => {
    db.feature.findMany.mockResolvedValue([
      featureRow("feat-1", 7),
      featureRow("feat-2", 7),
    ] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okr.updateLinkedFeatures({
      keyResultId: KR_ID,
      featureIds: ["feat-1", "feat-2"],
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.keyResultFeature.deleteMany).toHaveBeenCalledWith({
      where: { keyResultId: KR_ID },
    });
    expect(db.keyResultFeature.createMany).toHaveBeenCalledWith({
      data: [
        { keyResultId: KR_ID, featureId: "feat-1" },
        { keyResultId: KR_ID, featureId: "feat-2" },
      ],
    });
  });

  it("is allowed for a non-owner workspace member (linkFeature authz, not owner-only)", async () => {
    db.feature.findMany.mockResolvedValue([featureRow("feat-1", 7)] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    const result = await caller.okr.updateLinkedFeatures({
      keyResultId: KR_ID,
      featureIds: ["feat-1"],
    });

    expect(result).toMatchObject({ id: KR_ID });
    expect(db.keyResultFeature.createMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a stranger with NOT_FOUND before writing", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: "user-stranger", db });

    await expect(
      caller.okr.updateLinkedFeatures({
        keyResultId: KR_ID,
        featureIds: ["feat-1"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.keyResultFeature.deleteMany).not.toHaveBeenCalled();
    expect(db.keyResultFeature.createMany).not.toHaveBeenCalled();
  });

  it("applies fill-on-null to newly created links only — aligned features stay untouched", async () => {
    db.feature.findMany.mockResolvedValue([
      featureRow("feat-null", null),
      featureRow("feat-aligned", 999),
    ] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okr.updateLinkedFeatures({
      keyResultId: KR_ID,
      featureIds: ["feat-null", "feat-aligned"],
    });

    expect(db.feature.updateMany).toHaveBeenCalledTimes(1);
    expect(db.feature.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["feat-null"] } },
      data: { goalId: KR_ROW.goalId },
    });
  });

  it("rejects the whole batch when any feature is cross-workspace, writing nothing", async () => {
    db.feature.findMany.mockResolvedValue([
      featureRow("feat-1", null),
      featureRow("feat-other", null, OTHER_WORKSPACE_ID),
    ] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await expect(
      caller.okr.updateLinkedFeatures({
        keyResultId: KR_ID,
        featureIds: ["feat-1", "feat-other"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.keyResultFeature.deleteMany).not.toHaveBeenCalled();
    expect(db.keyResultFeature.createMany).not.toHaveBeenCalled();
    expect(db.feature.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unknown feature ids with NOT_FOUND, writing nothing", async () => {
    db.feature.findMany.mockResolvedValue([featureRow("feat-1", null)] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await expect(
      caller.okr.updateLinkedFeatures({
        keyResultId: KR_ID,
        featureIds: ["feat-1", "feat-missing"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.keyResultFeature.createMany).not.toHaveBeenCalled();
  });

  it("clears the set with an empty list — link rows only, goalId never cleared", async () => {
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okr.updateLinkedFeatures({
      keyResultId: KR_ID,
      featureIds: [],
    });

    expect(db.keyResultFeature.deleteMany).toHaveBeenCalledWith({
      where: { keyResultId: KR_ID },
    });
    expect(db.keyResultFeature.createMany).not.toHaveBeenCalled();
    expect(db.feature.update).not.toHaveBeenCalled();
    expect(db.feature.updateMany).not.toHaveBeenCalled();
  });

  it("returns the key result with both execution edges in the lean shape", async () => {
    db.feature.findMany.mockResolvedValue([featureRow("feat-1", 7)] as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okr.updateLinkedFeatures({
      keyResultId: KR_ID,
      featureIds: ["feat-1"],
    });

    const arg = db.keyResult.findUnique.mock.calls[0]![0]!;
    const include = arg.include as {
      projects?: unknown;
      features?: { include?: { feature?: { select?: Record<string, unknown> } } };
    };
    expect(include.projects).toBeDefined();
    expect(
      Object.keys(include.features?.include?.feature?.select ?? {}).sort(),
    ).toEqual(["id", "name", "product", "status"]);
  });
});

describe("okr.getByObjective — features include", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.goal.findMany.mockResolvedValue([]);
  });

  it("carries linked features beside linked projects with the lean select shape", async () => {
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okr.getByObjective({ workspaceId: WORKSPACE_ID });

    const arg = db.goal.findMany.mock.calls[0]![0]!;
    const krInclude = (
      arg.include as {
        keyResults: {
          include: {
            projects?: unknown;
            features?: {
              include?: { feature?: { select?: Record<string, unknown> } };
            };
          };
        };
      }
    ).keyResults.include;

    expect(krInclude.projects).toBeDefined();
    const featureSelect = krInclude.features?.include?.feature?.select;
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
