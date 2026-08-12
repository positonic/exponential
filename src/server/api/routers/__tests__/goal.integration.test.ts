import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
} from "~/test/factories";

describe("goal router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getAllMyGoals", () => {
    it("returns user's goals", async () => {
      const user = await createUser(db);
      await createGoal(db, { userId: user.id, title: "My Goal" });

      const caller = createTestCaller(user.id);
      const goals = await caller.goal.getAllMyGoals();

      expect(goals).toHaveLength(1);
      expect(goals[0]!.title).toBe("My Goal");
    });

    it("returns workspace-scoped goals for member", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "goal-ws" });
      await addWorkspaceMember(db, ws.id, member.id, "member");
      await createGoal(db, { userId: owner.id, workspaceId: ws.id, title: "WS Goal" });

      const memberCaller = createTestCaller(member.id);
      const goals = await memberCaller.goal.getAllMyGoals({ workspaceId: ws.id });

      expect(goals).toHaveLength(1);
      expect(goals[0]!.title).toBe("WS Goal");
    });

    it("returns empty array for non-member workspace query", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "forbidden-goal-ws" });

      const strangerCaller = createTestCaller(stranger.id);
      const goals = await strangerCaller.goal.getAllMyGoals({ workspaceId: ws.id });
      expect(goals).toEqual([]);
    });
  });

  describe("createGoal", () => {
    it("creates goal with workspace association", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "create-goal-ws" });

      const caller = createTestCaller(user.id);
      const goal = await caller.goal.createGoal({
        title: "New Goal",
        workspaceId: ws.id,
      });

      expect(goal.title).toBe("New Goal");
      expect(goal.workspaceId).toBe(ws.id);
    });
  });
});
