import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
  createOutcome,
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

    it("throws FORBIDDEN for non-member workspace query", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id, slug: "forbidden-goal-ws" });

      const strangerCaller = createTestCaller(stranger.id);
      await expect(
        strangerCaller.goal.getAllMyGoals({ workspaceId: ws.id }),
      ).rejects.toThrow(TRPCError);
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

describe("outcome router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("getMyOutcomes", () => {
    it("returns user's outcomes", async () => {
      const user = await createUser(db);
      await createOutcome(db, { userId: user.id, description: "My Outcome" });

      const caller = createTestCaller(user.id);
      const outcomes = await caller.outcome.getMyOutcomes();

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.description).toBe("My Outcome");
    });

    it("filters by workspaceId", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, slug: "outcome-ws" });
      await createOutcome(db, { userId: user.id, workspaceId: ws.id, description: "WS Outcome" });
      await createOutcome(db, { userId: user.id, description: "No WS Outcome" });

      const caller = createTestCaller(user.id);
      const outcomes = await caller.outcome.getMyOutcomes({ workspaceId: ws.id });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.description).toBe("WS Outcome");
    });
  });

  describe("getByDateRange", () => {
    it("returns outcomes within date range", async () => {
      const user = await createUser(db);
      await createOutcome(db, {
        userId: user.id,
        description: "In Range",
        dueDate: new Date("2026-02-15"),
      });
      await createOutcome(db, {
        userId: user.id,
        description: "Out of Range",
        dueDate: new Date("2026-03-15"),
      });

      const caller = createTestCaller(user.id);
      const outcomes = await caller.outcome.getByDateRange({
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-01"),
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.description).toBe("In Range");
    });

    it("only returns user's own outcomes", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);
      await createOutcome(db, { userId: user1.id, description: "User1", dueDate: new Date("2026-02-15") });
      await createOutcome(db, { userId: user2.id, description: "User2", dueDate: new Date("2026-02-15") });

      const caller1 = createTestCaller(user1.id);
      const outcomes = await caller1.outcome.getByDateRange({
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-01"),
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.description).toBe("User1");
    });
  });
});
