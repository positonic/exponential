/**
 * OKR write sites → workspace activity feed (feature cmsp1mxfv0001ky049lv567q0).
 *
 * External behavior under test:
 * - okr.checkIn appends exactly one `key_result`/`checked_in` event whose
 *   entityId is the new check-in row and whose metadata carries only the KR
 *   title and id (bare rows — no values, notes, or health).
 * - okr.create / okr.delete append one `key_result`/`created` / `deleted`
 *   event with bare `{ title }` metadata; the delete reuses the row fetched
 *   for the access check so the title survives the delete.
 * - Personal (non-workspace) key results are silent by design.
 * - Instrumentation is fire-and-forget: an activity-write failure never fails
 *   the user's mutation.
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
const WORKSPACE_ID = "ws-1";
const KR_ID = "kr-1";
const CHECKIN_ID = "checkin-1";

const KR_ROW = {
  id: KR_ID,
  userId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  goalId: 42,
  title: "Ship 10 releases",
  startValue: 0,
  targetValue: 10,
  currentValue: 4,
  status: "at-risk",
};

describe("okr.checkIn → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResultCheckIn.create.mockResolvedValue({ id: CHECKIN_ID } as never);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
    // Array-transaction passthrough: resolve the already-issued mock promises
    // so per-model assertions observe the writes made inside $transaction.
    db.$transaction.mockImplementation((async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: PrismaClient) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[])) as never);
  });

  it("records exactly one key_result/checked_in event with bare metadata", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.checkIn({ keyResultId: KR_ID, newValue: 6, notes: "n" });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "key_result",
        entityId: CHECKIN_ID,
        action: "checked_in",
        // Bare rows: title + drawer-target id only — no values, notes, health.
        metadata: { title: KR_ROW.title, keyResultId: KR_ID },
      },
    });
  });

  it("logs nothing for a personal (non-workspace) key result", async () => {
    db.keyResult.findFirst.mockResolvedValue({
      ...KR_ROW,
      workspaceId: null,
    } as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.checkIn({ keyResultId: KR_ID, newValue: 6 });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("never fails the mutation when the activity write throws", async () => {
    db.workspaceActivityEvent.create.mockRejectedValue(
      new Error("db down") as never,
    );
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await expect(
      caller.okr.checkIn({ keyResultId: KR_ID, newValue: 6 }),
    ).resolves.toMatchObject({ id: CHECKIN_ID });
  });
});

describe("okr.create / okr.delete → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
  });

  it("records one key_result/created event for a workspace KR", async () => {
    // Caller owns the parent objective → owner path, no membership lookup.
    db.goal.findUnique.mockResolvedValue({
      id: 42,
      userId: OWNER_ID,
      driUserId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    } as never);
    db.keyResult.create.mockResolvedValue(KR_ROW as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.create({
      goalId: 42,
      title: KR_ROW.title,
      targetValue: 10,
      period: "Q3-2026",
    });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "key_result",
        entityId: KR_ID,
        action: "created",
        metadata: { title: KR_ROW.title },
      },
    });
  });

  it("logs nothing when creating a KR on a personal objective", async () => {
    db.goal.findUnique.mockResolvedValue({
      id: 42,
      userId: OWNER_ID,
      driUserId: OWNER_ID,
      workspaceId: null,
    } as never);
    db.keyResult.create.mockResolvedValue({
      ...KR_ROW,
      workspaceId: null,
    } as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.create({
      goalId: 42,
      title: KR_ROW.title,
      targetValue: 10,
      period: "Q3-2026",
    });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("records one key_result/deleted event with the pre-delete title", async () => {
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResult.delete.mockResolvedValue(KR_ROW as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.delete({ id: KR_ID });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "key_result",
        entityId: KR_ID,
        action: "deleted",
        metadata: { title: KR_ROW.title },
      },
    });
  });

  it("logs nothing when deleting a personal KR", async () => {
    db.keyResult.findFirst.mockResolvedValue({
      ...KR_ROW,
      workspaceId: null,
    } as never);
    db.keyResult.delete.mockResolvedValue(KR_ROW as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.delete({ id: KR_ID });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });
});

describe("okr comment paths → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  const GOAL_ROW = {
    id: 42,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    title: "Grow revenue",
  };

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.goal.findUnique.mockResolvedValue(GOAL_ROW as never);
    db.goalComment.create.mockResolvedValue({ id: "cmt-1" } as never);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResultComment.create.mockResolvedValue({ id: "krc-1" } as never);
  });

  it("okr.addGoalComment records goal_comment/created with the same shape as the service seam", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.addGoalComment({ goalId: 42, content: "Looks good" });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "goal_comment",
        entityId: "cmt-1",
        action: "created",
        metadata: { title: GOAL_ROW.title, goalId: 42 },
      },
    });
  });

  it("okr.addKeyResultComment records key_result_comment/created with the KR drawer target", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.addKeyResultComment({
      keyResultId: KR_ID,
      content: "On it",
    });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "key_result_comment",
        entityId: "krc-1",
        action: "created",
        metadata: { title: KR_ROW.title, keyResultId: KR_ID },
      },
    });
  });

  it("logs nothing for comments on personal rows", async () => {
    db.goal.findUnique.mockResolvedValue({
      ...GOAL_ROW,
      workspaceId: null,
    } as never);
    db.keyResult.findFirst.mockResolvedValue({
      ...KR_ROW,
      workspaceId: null,
    } as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.addGoalComment({ goalId: 42, content: "Hi" });
    await caller.okr.addKeyResultComment({ keyResultId: KR_ID, content: "Hi" });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });
});

describe("manual status overrides → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  const GOAL_ROW = {
    id: 42,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    title: "Grow revenue",
  };

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
    db.goal.findFirst.mockResolvedValue(GOAL_ROW as never);
    db.goal.update.mockResolvedValue(GOAL_ROW as never);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResult.update.mockResolvedValue(KR_ROW as never);
  });

  it("records goal/status_changed when setting an objective override", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.setObjectiveStatusOverride({
      goalId: 42,
      status: "at-risk",
    });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "goal",
        entityId: "42",
        action: "status_changed",
        metadata: { title: GOAL_ROW.title },
      },
    });
  });

  it("logs nothing when clearing an objective override back to Auto", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.setObjectiveStatusOverride({ goalId: 42, status: null });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("records key_result/status_changed when setting a KR override", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.setKeyResultStatusOverride({
      keyResultId: KR_ID,
      status: "off-track",
    });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "key_result",
        entityId: KR_ID,
        action: "status_changed",
        metadata: { title: KR_ROW.title },
      },
    });
  });

  it("logs nothing when clearing a KR override back to Auto", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.setKeyResultStatusOverride({
      keyResultId: KR_ID,
      status: null,
    });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("logs nothing when overriding on personal rows", async () => {
    db.goal.findFirst.mockResolvedValue({
      ...GOAL_ROW,
      workspaceId: null,
    } as never);
    db.keyResult.findFirst.mockResolvedValue({
      ...KR_ROW,
      workspaceId: null,
    } as never);
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await caller.okr.setObjectiveStatusOverride({
      goalId: 42,
      status: "on-track",
    });
    await caller.okr.setKeyResultStatusOverride({
      keyResultId: KR_ID,
      status: "on-track",
    });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });
});
