/**
 * `applyActionUpdate` over a mocked Prisma client — no tRPC context, no
 * database. The lockstep itself is pinned in deriveActionPatch.test.ts;
 * this file pins the gate, the write assembly and the side effects every
 * update caller now inherits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn(async () => true),
}));
vi.mock("~/server/services/projectActivity", () => ({
  logProjectActivity: vi.fn(async () => undefined),
  PROJECT_ACTIVITY_TYPES: { STATUS_CHANGED: "STATUS_CHANGED", ACTION_CREATED: "ACTION_CREATED" },
}));

import { recordActivity } from "~/server/services/activity/recordActivity";
import { logProjectActivity } from "~/server/services/projectActivity";
import { applyActionUpdate } from "../applyActionUpdate";
import type { ActionWriteDeps } from "../types";

const ACTOR = "user-1";
const WORKSPACE = "w1";
const STAMPED = new Date("2026-09-01T09:00:00.000Z");

function deps(db: PrismaClient): ActionWriteDeps {
  return { db, actor: { userId: ACTOR, isAdmin: false } };
}

/**
 * One row serves both the access resolver's select and the module's
 * snapshot select. Creator by default, so `canEditAction` passes.
 */
function stubRow(
  db: DeepMockProxy<PrismaClient>,
  overrides: Record<string, unknown> = {},
) {
  const row = {
    id: "a1",
    createdById: ACTOR,
    assignees: [],
    status: "ACTIVE",
    kanbanStatus: "TODO",
    kanbanOrder: 3,
    completedAt: null,
    scheduledStart: null,
    scheduledEnd: null,
    projectId: null,
    dueDate: null,
    workspaceId: WORKSPACE,
    name: "Ship it",
    description: null,
    priority: "Quick",
    epicId: null,
    effortEstimate: null,
    project: null,
    ...overrides,
  };
  db.action.findUnique.mockResolvedValue(row as never);
  db.action.update.mockResolvedValue({ id: "a1", workspaceId: row.workspaceId, projectId: row.projectId } as never);
  db.actionStatusChange.create.mockResolvedValue({} as never);
  return row;
}

function written(db: DeepMockProxy<PrismaClient>) {
  return db.action.update.mock.calls[0]![0]!.data as Record<string, unknown>;
}

describe("applyActionUpdate", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    vi.mocked(logProjectActivity).mockClear();
  });

  describe("gate", () => {
    it("refuses with FORBIDDEN when the central resolver denies edit, and writes nothing", async () => {
      // Someone else's action: not creator, not assignee, no project.
      stubRow(db, { createdById: "someone-else" });

      await expect(
        applyActionUpdate(deps(db), "a1", { kanbanStatus: "DONE" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(db.action.update).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("is NOT_FOUND for a missing action", async () => {
      db.action.findUnique.mockResolvedValue(null);

      await expect(
        applyActionUpdate(deps(db), "a-missing", { name: "x" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lets an assignee edit", async () => {
      stubRow(db, { createdById: "someone-else", assignees: [{ userId: ACTOR }] });

      await applyActionUpdate(deps(db), "a1", { name: "Renamed" });

      expect(written(db)).toMatchObject({ name: "Renamed" });
    });

    it("rejects a malformed patch with BAD_REQUEST before writing", async () => {
      stubRow(db);

      await expect(
        applyActionUpdate(deps(db), "a1", { name: "" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.update).not.toHaveBeenCalled();
    });
  });

  describe("kanban moves", () => {
    it("a with-order move to DONE completes the coarse status and stamps completedAt", async () => {
      stubRow(db, { projectId: "p1", project: { workspaceId: WORKSPACE } });

      const result = await applyActionUpdate(deps(db), "a1", {
        kanbanStatus: "DONE",
        kanbanOrder: 7,
      });

      expect(written(db)).toMatchObject({
        kanbanStatus: "DONE",
        kanbanOrder: 7,
        status: "COMPLETED",
      });
      expect(written(db).completedAt).toBeInstanceOf(Date);
      expect(result.transitions).toMatchObject({ kanbanChanged: true, completing: true });
      expect(result.previous.status).toBe("ACTIVE");
      // The coarse status moved: one status_changed event, no `updated`.
      expect(recordActivity).toHaveBeenCalledTimes(1);
      expect(recordActivity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          action: "status_changed",
          entityId: "a1",
          metadata: { from: "ACTIVE", to: "COMPLETED" },
        }),
      );
      // A real column change is tracked for PM analytics and the project feed.
      expect(db.actionStatusChange.create).toHaveBeenCalledWith({
        data: { actionId: "a1", fromStatus: "TODO", toStatus: "DONE", changedById: ACTOR },
      });
      expect(logProjectActivity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ projectId: "p1", type: "STATUS_CHANGED", fromValue: "TODO", toValue: "DONE" }),
      );
    });

    it("re-sending the current column with a new order changes nothing but the order", async () => {
      stubRow(db, { status: "COMPLETED", kanbanStatus: "TODO", completedAt: STAMPED });

      await applyActionUpdate(deps(db), "a1", { kanbanStatus: "TODO", kanbanOrder: 2 });

      const data = written(db);
      expect(data).toMatchObject({ kanbanStatus: "TODO", kanbanOrder: 2 });
      expect(data).not.toHaveProperty("status");
      expect(data).not.toHaveProperty("completedAt");
      // Nothing user-meaningful changed, so no feed event and no analytics row.
      expect(recordActivity).not.toHaveBeenCalled();
      expect(db.actionStatusChange.create).not.toHaveBeenCalled();
    });

    it("kanbanOrder passes through untouched when given, and a priority change clears it otherwise", async () => {
      stubRow(db);
      await applyActionUpdate(deps(db), "a1", { priority: "1st Priority" });
      expect(written(db)).toMatchObject({ priority: "1st Priority", kanbanOrder: null });

      db.action.update.mockClear();
      await applyActionUpdate(deps(db), "a1", { priority: "1st Priority", kanbanOrder: 9 });
      expect(written(db)).toMatchObject({ priority: "1st Priority", kanbanOrder: 9 });
    });
  });

  describe("dates", () => {
    it("refuses an end before the start with BAD_REQUEST", async () => {
      stubRow(db);

      await expect(
        applyActionUpdate(deps(db), "a1", {
          scheduledStart: new Date("2026-09-12T10:00:00.000Z"),
          scheduledEnd: new Date("2026-09-12T09:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.update).not.toHaveBeenCalled();
    });

    it("clears the stored end when only the start moves past it", async () => {
      stubRow(db, {
        scheduledStart: new Date("2026-09-12T08:00:00.000Z"),
        scheduledEnd: new Date("2026-09-12T09:00:00.000Z"),
      });

      await applyActionUpdate(deps(db), "a1", {
        scheduledStart: new Date("2026-09-12T10:00:00.000Z"),
      });

      expect(written(db)).toMatchObject({ scheduledEnd: null });
    });
  });

  describe("activity", () => {
    it("records `updated` with the fields that actually changed", async () => {
      stubRow(db, { name: "Ship it", priority: "Quick" });

      await applyActionUpdate(deps(db), "a1", { name: "Ship it now", priority: "Quick" });

      expect(recordActivity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          action: "updated",
          workspaceId: WORKSPACE,
          metadata: { fieldsChanged: ["name"] },
        }),
      );
    });

    it("records nothing when no field changed", async () => {
      stubRow(db, { name: "Ship it" });

      await applyActionUpdate(deps(db), "a1", { name: "Ship it" });

      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("does not fail the update when recordActivity rejects", async () => {
      vi.mocked(recordActivity).mockRejectedValueOnce(new Error("instrumentation down"));
      stubRow(db);

      await expect(applyActionUpdate(deps(db), "a1", { name: "Renamed" })).resolves.toMatchObject({
        action: { id: "a1" },
      });
    });
  });
});
