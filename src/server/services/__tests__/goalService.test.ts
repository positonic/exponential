/**
 * Unit tests for goalService activity-write functions.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real database
 * is ever touched. The service functions are called directly with a minimal
 * mocked `ctx`, so the whole tRPC router tree is never imported.
 *
 * Prior art: `src/server/services/access/__tests__/permissions.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `goalService` transitively imports `~/server/db` (via the access resolvers),
// which runs T3 env validation at module load. Seed the minimum env BEFORE the
// import graph evaluates. Same pattern as permissions.test.ts.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import { createGoalComment, createGoalUpdate } from "../goalService";
import type { Context } from "~/server/auth/types";

const USER_ID = "user-1";
const GOAL_ID = 42;

const db = mockDeep<PrismaClient>();

function makeCtx(): Context {
  return {
    db,
    session: {
      user: {
        id: USER_ID,
        email: `${USER_ID}@test.com`,
        name: "Test User",
        image: null,
        isAdmin: false,
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
    headers: new Headers(),
  } as unknown as Context;
}

describe("goalService.createGoalComment", () => {
  beforeEach(() => {
    mockReset(db);
  });

  it("creates a GoalComment authored by the calling user", async () => {
    // Owner access → verifyGoalAccess returns early without touching workspaces.
    db.goal.findUnique.mockResolvedValue({
      id: GOAL_ID,
      userId: USER_ID,
      driUserId: null,
      workspaceId: null,
    } as never);
    const created = { id: "c1", goalId: GOAL_ID, authorId: USER_ID, content: "hello" };
    db.goalComment.create.mockResolvedValue(created as never);

    const result = await createGoalComment({
      ctx: makeCtx(),
      goalId: GOAL_ID,
      content: "hello",
    });

    expect(result).toBe(created);
    expect(db.goalComment.create).toHaveBeenCalledTimes(1);
    const arg = db.goalComment.create.mock.calls[0]![0]!;
    expect(arg.data).toMatchObject({
      goalId: GOAL_ID,
      authorId: USER_ID,
      content: "hello",
      parentUpdateId: null,
    });
  });

  it("touches no health: never writes Goal.health / healthUpdatedAt / healthOverride", async () => {
    db.goal.findUnique.mockResolvedValue({
      id: GOAL_ID,
      userId: USER_ID,
      driUserId: null,
      workspaceId: null,
    } as never);
    db.goalComment.create.mockResolvedValue({ id: "c1" } as never);

    await createGoalComment({ ctx: makeCtx(), goalId: GOAL_ID, content: "narrative note" });

    // A comment must never sync the goal's health columns.
    expect(db.goal.update).not.toHaveBeenCalled();
  });

  it("throws when the caller lacks access, and does not create a comment", async () => {
    // Goal owned by someone else, no workspace → verifyGoalAccess denies.
    db.goal.findUnique.mockResolvedValue({
      id: GOAL_ID,
      userId: "someone-else",
      driUserId: null,
      workspaceId: null,
    } as never);

    await expect(
      createGoalComment({ ctx: makeCtx(), goalId: GOAL_ID, content: "nope" }),
    ).rejects.toThrow(/access denied/i);

    expect(db.goalComment.create).not.toHaveBeenCalled();
  });
});

describe("goalService.createGoalUpdate", () => {
  beforeEach(() => {
    mockReset(db);
    // $transaction runs the array of (mocked) Prisma promises and returns their
    // results in order — mirroring Prisma's batch transaction semantics.
    db.$transaction.mockImplementation((ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    );
  });

  function grantOwnerAccess() {
    db.goal.findUnique.mockResolvedValue({
      id: GOAL_ID,
      userId: USER_ID,
      driUserId: null,
      workspaceId: null,
    } as never);
  }

  it("creates a GoalUpdate with content + health, authored by the caller", async () => {
    grantOwnerAccess();
    const created = { id: "u1", goalId: GOAL_ID, authorId: USER_ID, health: "at-risk" };
    db.goalUpdate.create.mockResolvedValue(created as never);
    db.goal.update.mockResolvedValue({ id: GOAL_ID } as never);

    const result = await createGoalUpdate({
      ctx: makeCtx(),
      goalId: GOAL_ID,
      content: "Behind on KR2",
      health: "at-risk",
    });

    expect(result).toBe(created);
    const createArg = db.goalUpdate.create.mock.calls[0]![0]!;
    expect(createArg.data).toMatchObject({
      goalId: GOAL_ID,
      authorId: USER_ID,
      content: "Behind on KR2",
      health: "at-risk",
    });
  });

  it("syncs the auto Goal.health + healthUpdatedAt, and never writes healthOverride", async () => {
    grantOwnerAccess();
    db.goalUpdate.create.mockResolvedValue({ id: "u1" } as never);
    db.goal.update.mockResolvedValue({ id: GOAL_ID } as never);

    await createGoalUpdate({
      ctx: makeCtx(),
      goalId: GOAL_ID,
      content: "Back on track",
      health: "on-track",
    });

    expect(db.goal.update).toHaveBeenCalledTimes(1);
    const updateArg = db.goal.update.mock.calls[0]![0]!;
    expect(updateArg.where).toEqual({ id: GOAL_ID });
    expect(updateArg.data.health).toBe("on-track");
    expect(updateArg.data.healthUpdatedAt).toBeInstanceOf(Date);
    // The manual override must be left untouched (ADR-0004).
    expect(updateArg.data).not.toHaveProperty("healthOverride");
    expect(updateArg.data).not.toHaveProperty("healthOverrideAt");
    expect(updateArg.data).not.toHaveProperty("healthOverrideById");
  });

  it("throws when the caller lacks access, and writes nothing", async () => {
    db.goal.findUnique.mockResolvedValue({
      id: GOAL_ID,
      userId: "someone-else",
      driUserId: null,
      workspaceId: null,
    } as never);

    await expect(
      createGoalUpdate({
        ctx: makeCtx(),
        goalId: GOAL_ID,
        content: "nope",
        health: "off-track",
      }),
    ).rejects.toThrow(/access denied/i);

    expect(db.goalUpdate.create).not.toHaveBeenCalled();
    expect(db.goal.update).not.toHaveBeenCalled();
  });
});
