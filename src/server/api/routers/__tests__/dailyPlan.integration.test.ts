import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace } from "~/test/factories";

describe("dailyPlan router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("markProcessedOverdue", () => {
    it("creates a daily plan when none exists for today", async () => {
      const user = await createUser(db);
      const caller = createTestCaller(user.id);

      const result = await caller.dailyPlan.markProcessedOverdue({});

      expect(result.userId).toBe(user.id);
      expect(result.processedOverdue).toBe(true);

      const stored = await db.dailyPlan.findFirst({
        where: { userId: user.id, processedOverdue: true },
      });
      expect(stored).not.toBeNull();
    });

    it("updates an existing daily plan rather than creating a duplicate", async () => {
      const user = await createUser(db);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await db.dailyPlan.create({
        data: {
          userId: user.id,
          date: today,
          status: "DRAFT",
          processedOverdue: false,
        },
      });

      const caller = createTestCaller(user.id);
      const result = await caller.dailyPlan.markProcessedOverdue({
        date: today,
      });

      expect(result.id).toBe(existing.id);
      expect(result.processedOverdue).toBe(true);

      const allPlans = await db.dailyPlan.findMany({
        where: { userId: user.id, date: today },
      });
      expect(allPlans).toHaveLength(1);
    });

    it("scopes plans by workspaceId", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const caller = createTestCaller(user.id);
      const result = await caller.dailyPlan.markProcessedOverdue({
        workspaceId: ws.id,
        date: today,
      });

      expect(result.workspaceId).toBe(ws.id);
      expect(result.processedOverdue).toBe(true);
    });
  });
});
