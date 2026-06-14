/**
 * Integration tests for the agent-facing mastra activity-write proxies.
 *
 * Real DB via Testcontainers. Asserts the agent path mirrors the human access
 * path (verifyGoalAccess): a user can post to any Objective they can access
 * (owner / workspace member), is rejected for an Objective they cannot access,
 * and the record is authored by the calling user. See ADR-0016.
 *
 * Prior art: `src/server/api/routers/__tests__/goal-outcome.integration.test.ts`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
} from "~/test/factories";

describe("mastra.addGoalComment", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("posts a comment to an Objective the user owns, authored by the caller", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Owned Objective" });

    const caller = createTestCaller(user.id);
    const comment = await caller.mastra.addGoalComment({
      goalId: goal.id,
      content: "Strategy summary from Zoe",
    });

    expect(comment.content).toBe("Strategy summary from Zoe");
    expect(comment.authorId).toBe(user.id);
    expect(comment.goalId).toBe(goal.id);

    const persisted = await db.goalComment.findUnique({ where: { id: comment.id } });
    expect(persisted?.authorId).toBe(user.id);
  });

  it("posts a comment to a shared workspace Objective the user did not create", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id, slug: "comment-ws" });
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const goal = await createGoal(db, {
      userId: owner.id,
      workspaceId: ws.id,
      title: "Shared Objective",
    });

    const memberCaller = createTestCaller(member.id);
    const comment = await memberCaller.mastra.addGoalComment({
      goalId: goal.id,
      content: "Note from a teammate via Zoe",
    });

    // Authored by the member who acted, not the goal's owner.
    expect(comment.authorId).toBe(member.id);
    expect(comment.goalId).toBe(goal.id);
  });

  it("rejects posting to an Objective the user cannot access", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const goal = await createGoal(db, { userId: owner.id, title: "Private Objective" });

    const strangerCaller = createTestCaller(stranger.id);
    await expect(
      strangerCaller.mastra.addGoalComment({
        goalId: goal.id,
        content: "should not be allowed",
      }),
    ).rejects.toThrow(/access denied/i);

    const count = await db.goalComment.count({ where: { goalId: goal.id } });
    expect(count).toBe(0);
  });

  it("does not modify the Objective's health when a comment is posted", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Health-untouched Objective" });

    const before = await db.goal.findUnique({ where: { id: goal.id } });

    const caller = createTestCaller(user.id);
    await caller.mastra.addGoalComment({ goalId: goal.id, content: "just a note" });

    const after = await db.goal.findUnique({ where: { id: goal.id } });
    expect(after?.health).toBe(before?.health ?? null);
    expect(after?.healthUpdatedAt).toEqual(before?.healthUpdatedAt ?? null);
    expect(after?.healthOverride).toBe(before?.healthOverride ?? null);
  });
});
