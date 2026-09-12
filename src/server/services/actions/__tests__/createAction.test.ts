/**
 * `createAction` is the one implementation behind every Action create path.
 * These tests drive it directly over a mocked Prisma client — no tRPC
 * context, no database — and pin the gate, the workspace derivation, the
 * kanban seed and the side effects that every caller now inherits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn(async () => true),
}));
vi.mock("~/server/services/projectActivity", () => ({
  logProjectActivity: vi.fn(async () => undefined),
  PROJECT_ACTIVITY_TYPES: { ACTION_CREATED: "ACTION_CREATED" },
}));

import { recordActivity } from "~/server/services/activity/recordActivity";
import { logProjectActivity } from "~/server/services/projectActivity";
import { createAction } from "../createAction";
import type { ActionWriteDeps } from "../types";

const ACTOR = "user-1";
const WORKSPACE = "w1";

function deps(db: PrismaClient): ActionWriteDeps {
  return { db, actor: { userId: ACTOR, isAdmin: false } };
}

/** Caller holds `role` directly in `workspaceId`; no team-based membership. */
function stubWorkspaceRole(
  db: DeepMockProxy<PrismaClient>,
  workspaceId: string,
  role: string | null,
) {
  db.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ userId: ACTOR, workspaceId, role, joinedAt: new Date() } as never) : null,
  );
  db.teamUser.findFirst.mockResolvedValue(null);
}

function stubProject(
  db: DeepMockProxy<PrismaClient>,
  project: {
    createdById: string;
    workspaceId: string | null;
    isPublic?: boolean;
    isRestricted?: boolean;
  },
) {
  db.project.findUnique.mockResolvedValue({
    teamId: null,
    isPublic: false,
    isRestricted: false,
    ...project,
  } as never);
  db.projectMember.findFirst.mockResolvedValue(null);
}

function createdRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "Ship it",
    workspaceId: WORKSPACE,
    projectId: null,
    createdById: ACTOR,
    project: null,
    assignees: [],
    syncs: [],
    createdBy: { id: ACTOR, name: null, email: null, image: null },
    tags: [],
    epic: null,
    ...overrides,
  } as never;
}

describe("createAction", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    vi.mocked(logProjectActivity).mockClear();
  });

  describe("gate", () => {
    it("lands a member's create in their workspace and records one activity event", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      const result = await createAction(deps(db), {
        name: "Ship it",
        workspaceId: WORKSPACE,
      });

      expect(result).toMatchObject({ id: "a1" });
      expect(db.action.create).toHaveBeenCalledTimes(1);
      expect(db.action.create.mock.calls[0]![0]!.data).toMatchObject({
        name: "Ship it",
        workspaceId: WORKSPACE,
        createdById: ACTOR,
        priority: "Quick",
        status: "ACTIVE",
      });
      expect(recordActivity).toHaveBeenCalledTimes(1);
      expect(recordActivity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          workspaceId: WORKSPACE,
          userId: ACTOR,
          entityType: "action",
          entityId: "a1",
          action: "created",
        }),
      );
      // No project, so no project activity row.
      expect(logProjectActivity).not.toHaveBeenCalled();
    });

    it("refuses a viewer-only workspace role with FORBIDDEN and writes nothing", async () => {
      stubWorkspaceRole(db, WORKSPACE, "viewer");

      await expect(
        createAction(deps(db), { name: "Read-only", workspaceId: WORKSPACE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(db.action.create).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("refuses a project the actor can only view with FORBIDDEN and writes nothing", async () => {
      // Public project: `hasProjectAccess` is true, `canEditProject` is not.
      stubProject(db, { createdById: "someone-else", workspaceId: WORKSPACE, isPublic: true });
      stubWorkspaceRole(db, WORKSPACE, null);
      db.action.findFirst.mockResolvedValue(null);

      await expect(
        createAction(deps(db), { name: "Trespass", projectId: "p1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(db.action.create).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("needs no membership probe when neither project nor workspace is given", async () => {
      db.action.create.mockResolvedValue(createdRow({ workspaceId: null }));

      await createAction(deps(db), { name: "Personal" });

      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
      expect(db.action.create).toHaveBeenCalledTimes(1);
      // No workspace to record the event against.
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("rejects malformed input with BAD_REQUEST before touching the database", async () => {
      await expect(
        createAction(deps(db), { name: "" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.create).not.toHaveBeenCalled();
    });
  });

  describe("workspace derivation and kanban seed", () => {
    it("takes the workspace from the project, ignoring a foreign workspaceId, and seeds the TODO column", async () => {
      stubProject(db, { createdById: ACTOR, workspaceId: "w-legit" });
      stubWorkspaceRole(db, "w-legit", null);
      // Board max is 7, TODO max is 4: the new card goes after the last TODO.
      db.action.findFirst
        .mockResolvedValueOnce({ kanbanOrder: 7 } as never)
        .mockResolvedValueOnce({ kanbanOrder: 4 } as never);
      db.action.create.mockResolvedValue(
        createdRow({ workspaceId: "w-legit", projectId: "p1", project: { id: "p1", workspaceId: "w-legit" } }),
      );

      await createAction(deps(db), {
        name: "Scoped",
        projectId: "p1",
        workspaceId: "w-foreign",
      });

      expect(db.action.create.mock.calls[0]![0]!.data).toMatchObject({
        workspaceId: "w-legit",
        kanbanStatus: "TODO",
        kanbanOrder: 5,
      });
      expect(logProjectActivity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ projectId: "p1", actionId: "a1", type: "ACTION_CREATED" }),
      );
    });

    it("starts an empty board at order 1", async () => {
      stubProject(db, { createdById: ACTOR, workspaceId: WORKSPACE });
      stubWorkspaceRole(db, WORKSPACE, null);
      db.action.findFirst.mockResolvedValue(null);
      db.action.create.mockResolvedValue(createdRow({ projectId: "p1" }));

      await createAction(deps(db), { name: "First", projectId: "p1" });

      expect(db.action.create.mock.calls[0]![0]!.data).toMatchObject({
        kanbanStatus: "TODO",
        kanbanOrder: 1,
      });
    });

    it("leaves the kanban column unset without a project", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      await createAction(deps(db), { name: "Inbox", workspaceId: WORKSPACE });

      const data = db.action.create.mock.calls[0]![0]!.data;
      expect(data).not.toHaveProperty("kanbanStatus");
      expect(data).not.toHaveProperty("kanbanOrder");
    });
  });

  describe("side effects", () => {
    it("does not fail the create when recordActivity rejects", async () => {
      vi.mocked(recordActivity).mockRejectedValueOnce(new Error("instrumentation down"));
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      await expect(
        createAction(deps(db), { name: "Ship it", workspaceId: WORKSPACE }),
      ).resolves.toMatchObject({ id: "a1" });
    });
  });
});
