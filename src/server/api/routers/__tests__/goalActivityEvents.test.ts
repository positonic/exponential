/**
 * Objective lifecycle write sites → workspace activity feed (feature
 * cmsp1mxfv0001ky049lv567q0).
 *
 * External behavior under test:
 * - goal.createGoal (router inline path) and goal.deleteGoal (goalService
 *   seam) append exactly one `goal`/`created` / `goal`/`deleted` event with
 *   bare `{ title }` metadata; the delete captures the title before the row
 *   is gone.
 * - goal.updateGoalStatus records `completed` on the transition into
 *   completed and `status_changed` for every other transition; a same-status
 *   write records nothing.
 * - goal.updateGoal (goalService seam) records a status event only when the
 *   status actually changes — plain field edits are silent.
 * - goalUpdate.addUpdate / goalComment.addComment (goalService seams, shared
 *   with Zoe's mastra proxies per ADR-0016) record one `goal_update`/`created`
 *   / `goal_comment`/`created` event whose entityId is the new row and whose
 *   metadata carries the objective title + goalId (the drawer target) — never
 *   the content.
 * - Personal (non-workspace) objectives never log.
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
const GOAL_ID = 42;

const GOAL_ROW = {
  id: GOAL_ID,
  userId: OWNER_ID,
  driUserId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  parentGoalId: null,
  title: "Grow revenue",
  status: "active",
};

describe("objective lifecycle → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
  });

  function expectSingleEvent(action: string, title = GOAL_ROW.title) {
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        entityType: "goal",
        entityId: String(GOAL_ID),
        action,
        metadata: { title },
      },
    });
  }

  describe("createGoal", () => {
    it("records one goal/created event for a workspace objective", async () => {
      db.goal.create.mockResolvedValue(GOAL_ROW as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.createGoal({
        title: GOAL_ROW.title,
        workspaceId: WORKSPACE_ID,
      });

      expectSingleEvent("created");
    });

    it("logs nothing for a personal objective", async () => {
      db.goal.create.mockResolvedValue({
        ...GOAL_ROW,
        workspaceId: null,
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.createGoal({ title: GOAL_ROW.title });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("updateGoalStatus", () => {
    beforeEach(() => {
      db.goal.findFirst.mockResolvedValue(GOAL_ROW as never);
      db.goal.update.mockResolvedValue({
        ...GOAL_ROW,
        status: "completed",
      } as never);
    });

    it("records goal/completed on the transition into completed", async () => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoalStatus({ id: GOAL_ID, status: "completed" });

      expectSingleEvent("completed");
    });

    it("records goal/status_changed for other transitions", async () => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoalStatus({ id: GOAL_ID, status: "on-hold" });

      expectSingleEvent("status_changed");
    });

    it("logs nothing when the status does not change", async () => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoalStatus({ id: GOAL_ID, status: "active" });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });

    it("logs nothing for a personal objective", async () => {
      db.goal.findFirst.mockResolvedValue({
        ...GOAL_ROW,
        workspaceId: null,
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoalStatus({ id: GOAL_ID, status: "completed" });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("updateGoal (goalService seam)", () => {
    beforeEach(() => {
      db.goal.findUnique.mockResolvedValue(GOAL_ROW as never);
      db.goal.findUniqueOrThrow.mockResolvedValue(GOAL_ROW as never);
    });

    it("records goal/status_changed when the status changes", async () => {
      db.goal.update.mockResolvedValue({
        ...GOAL_ROW,
        status: "archived",
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoal({ id: GOAL_ID, status: "archived" });

      expectSingleEvent("status_changed");
    });

    it("logs nothing for a plain field edit", async () => {
      db.goal.update.mockResolvedValue({
        ...GOAL_ROW,
        title: "Renamed",
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.updateGoal({ id: GOAL_ID, title: "Renamed" });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("addUpdate / addComment (goalService seams)", () => {
    beforeEach(() => {
      db.goal.findUnique.mockResolvedValue(GOAL_ROW as never);
      db.goalUpdate.create.mockResolvedValue({ id: "upd-1" } as never);
      db.goalComment.create.mockResolvedValue({ id: "cmt-1" } as never);
      // Array-transaction passthrough (createGoalUpdate writes in one).
      db.$transaction.mockImplementation((async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (tx: PrismaClient) => unknown)(db)
          : Promise.all(arg as Promise<unknown>[])) as never);
    });

    it("records one goal_update/created event with the objective title + goalId", async () => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goalUpdate.addUpdate({
        goalId: GOAL_ID,
        content: "Shipped the first milestone",
        health: "on-track",
      });

      expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: WORKSPACE_ID,
          userId: OWNER_ID,
          entityType: "goal_update",
          entityId: "upd-1",
          action: "created",
          // Bare rows: no content snippet, no health value.
          metadata: { title: GOAL_ROW.title, goalId: GOAL_ID },
        },
      });
    });

    it("records one goal_comment/created event distinct from updates", async () => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goalComment.addComment({
        goalId: GOAL_ID,
        content: "Nice progress!",
      });

      expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: WORKSPACE_ID,
          userId: OWNER_ID,
          entityType: "goal_comment",
          entityId: "cmt-1",
          action: "created",
          metadata: { title: GOAL_ROW.title, goalId: GOAL_ID },
        },
      });
    });

    it("logs nothing on a personal objective", async () => {
      db.goal.findUnique.mockResolvedValue({
        ...GOAL_ROW,
        workspaceId: null,
      } as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goalUpdate.addUpdate({
        goalId: GOAL_ID,
        content: "Update",
        health: "on-track",
      });
      await caller.goalComment.addComment({ goalId: GOAL_ID, content: "Hi" });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteGoal (goalService seam)", () => {
    it("captures the title before deleting and records goal/deleted", async () => {
      db.goal.findUnique.mockResolvedValue(GOAL_ROW as never);
      db.goal.delete.mockResolvedValue(GOAL_ROW as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.deleteGoal({ id: GOAL_ID });

      expectSingleEvent("deleted");
    });

    it("logs nothing for a personal objective", async () => {
      db.goal.findUnique.mockResolvedValue({
        ...GOAL_ROW,
        workspaceId: null,
      } as never);
      db.goal.delete.mockResolvedValue(GOAL_ROW as never);
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await caller.goal.deleteGoal({ id: GOAL_ID });

      expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    });
  });
});
