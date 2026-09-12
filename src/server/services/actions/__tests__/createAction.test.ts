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
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn(async () => undefined),
}));

import { recordActivity } from "~/server/services/activity/recordActivity";
import { logProjectActivity } from "~/server/services/projectActivity";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
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
    vi.mocked(emitNotification).mockClear();
    // Interactive transaction runs against the same mock, so the per-model
    // stubs see the writes; a callback that throws rejects the transaction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === "function" ? arg(db) : Promise.all(arg),
    );
  });

  describe("gate", () => {
    it("lands a member's create in their workspace and records one activity event", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      const result = await createAction(deps(db), {
        source: "ui",
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
        createAction(deps(db), { source: "ui", name: "Read-only", workspaceId: WORKSPACE }),
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
        createAction(deps(db), { source: "ui", name: "Trespass", projectId: "p1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(db.action.create).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("needs no membership probe when neither project nor workspace is given", async () => {
      db.action.create.mockResolvedValue(createdRow({ workspaceId: null }));

      await createAction(deps(db), { source: "ui", name: "Personal" });

      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
      expect(db.action.create).toHaveBeenCalledTimes(1);
      // No workspace to record the event against.
      expect(recordActivity).not.toHaveBeenCalled();
    });

    it("rejects malformed input with BAD_REQUEST before touching the database", async () => {
      await expect(
        createAction(deps(db), { source: "ui", name: "" }),
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
        source: "ui",
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

      await createAction(deps(db), { source: "ui", name: "First", projectId: "p1" });

      expect(db.action.create.mock.calls[0]![0]!.data).toMatchObject({
        kanbanStatus: "TODO",
        kanbanOrder: 1,
      });
    });

    it("leaves the kanban column unset without a project", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      await createAction(deps(db), { source: "ui", name: "Inbox", workspaceId: WORKSPACE });

      const data = db.action.create.mock.calls[0]![0]!.data;
      expect(data).not.toHaveProperty("kanbanStatus");
      expect(data).not.toHaveProperty("kanbanOrder");
    });
  });

  describe("attachments", () => {
    const TAG = "tag-1";
    const COLLEAGUE = "user-2";
    const SPRINT = "list-1";

    /** Member of the workspace; tag, colleague and sprint all live in it. */
    function stubAttachableWorkspace() {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.tag.findMany.mockResolvedValue([{ id: TAG }] as never);
      db.list.findUnique.mockResolvedValue({ id: SPRINT, workspaceId: WORKSPACE } as never);
      db.action.create.mockResolvedValue(createdRow());
      db.action.findUniqueOrThrow.mockResolvedValue(
        createdRow({
          tags: [{ tag: { id: TAG } }],
          assignees: [{ user: { id: COLLEAGUE } }],
        }),
      );
    }

    it("writes the row, tags, assignees and sprint membership in one transaction", async () => {
      stubAttachableWorkspace();

      const result = await createAction(deps(db), {
        source: "ui",
        name: "Ship it",
        workspaceId: WORKSPACE,
        tagIds: [TAG, TAG],
        assigneeIds: [COLLEAGUE],
        sprintListId: SPRINT,
      });

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.action.create).toHaveBeenCalledTimes(1);
      expect(db.actionTag.createMany).toHaveBeenCalledWith({
        data: [{ actionId: "a1", tagId: TAG }],
      });
      expect(db.actionAssignee.createMany).toHaveBeenCalledWith({
        data: [{ actionId: "a1", userId: COLLEAGUE }],
      });
      expect(db.actionList.create).toHaveBeenCalledWith({
        data: { actionId: "a1", listId: SPRINT },
      });
      // The returned row carries the attachments, same include shape as a
      // bare create.
      expect(result.tags).toHaveLength(1);
      expect(result.assignees).toHaveLength(1);
    });

    it("refuses a tag from another workspace and writes no row at all", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      // The tag lookup is scoped to global-or-this-workspace, so a foreign
      // tag simply does not come back.
      db.tag.findMany.mockResolvedValue([] as never);

      await expect(
        createAction(deps(db), { source: "ui", name: "Ship it", workspaceId: WORKSPACE, tagIds: [TAG] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.action.create).not.toHaveBeenCalled();
      expect(db.actionTag.createMany).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(emitNotification).not.toHaveBeenCalled();
    });

    it("refuses an assignee who cannot read the action, with NOT_FOUND and no row", async () => {
      // Caller is a member; the candidate is not, and shares no team.
      db.workspaceUser.findUnique.mockImplementation(((args: { where: { userId_workspaceId: { userId: string } } }) =>
        Promise.resolve(
          args.where.userId_workspaceId.userId === ACTOR
            ? { userId: ACTOR, workspaceId: WORKSPACE, role: "member", joinedAt: new Date() }
            : null,
        )) as never);
      db.teamUser.findFirst.mockResolvedValue(null);
      db.team.findFirst.mockResolvedValue(null);

      await expect(
        createAction(deps(db), {
        source: "ui",
          name: "Ship it",
          workspaceId: WORKSPACE,
          assigneeIds: ["user-stranger"],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(db.action.create).not.toHaveBeenCalled();
    });

    it("refuses a sprint from another workspace and writes no row", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.list.findUnique.mockResolvedValue({ id: SPRINT, workspaceId: "w-other" } as never);

      await expect(
        createAction(deps(db), { source: "ui", name: "Ship it", workspaceId: WORKSPACE, sprintListId: SPRINT }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.create).not.toHaveBeenCalled();
    });

    it("rolls the whole create back when an attachment write fails inside the transaction", async () => {
      stubAttachableWorkspace();
      db.actionTag.createMany.mockRejectedValue(new Error("unique violation"));

      await expect(
        createAction(deps(db), { source: "ui", name: "Ship it", workspaceId: WORKSPACE, tagIds: [TAG] }),
      ).rejects.toThrow("unique violation");

      // The row write happened inside the same callback that then threw, so
      // Prisma discards it with the transaction; nothing after the commit runs.
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.action.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(emitNotification).not.toHaveBeenCalled();
    });

    it("emits one Assignment notification for the assignees who are not the actor", async () => {
      stubAttachableWorkspace();

      await createAction(deps(db), {
        source: "ui",
        name: "Ship it",
        workspaceId: WORKSPACE,
        assigneeIds: [ACTOR, COLLEAGUE],
      });

      expect(emitNotification).toHaveBeenCalledTimes(1);
      expect(emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "assignment",
          actorUserId: ACTOR,
          subject: { actionId: "a1", assignedUserIds: [COLLEAGUE] },
        }),
      );
    });

    it("emits nothing when the actor is the only assignee", async () => {
      stubAttachableWorkspace();

      await createAction(deps(db), {
        source: "ui",
        name: "Ship it",
        workspaceId: WORKSPACE,
        assigneeIds: [ACTOR],
      });

      expect(db.actionAssignee.createMany).toHaveBeenCalledTimes(1);
      expect(emitNotification).not.toHaveBeenCalled();
    });
  });

  describe("source", () => {
    it("stamps the named source on the row", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      await createAction(deps(db), { source: "voice", name: "Say it", workspaceId: WORKSPACE });

      expect(db.action.create.mock.calls[0]![0]!.data).toMatchObject({ source: "voice" });
    });

    it("rejects a source outside the closed set with BAD_REQUEST before touching the database", async () => {
      await expect(
        createAction(deps(db), {
          source: "ios-shortcut" as never,
          name: "Legacy",
          workspaceId: WORKSPACE,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
      expect(db.action.create).not.toHaveBeenCalled();
    });

    it("rejects a missing source: nothing defaults silently", async () => {
      await expect(
        createAction(deps(db), { name: "Unnamed surface", workspaceId: WORKSPACE } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.create).not.toHaveBeenCalled();
    });
  });

  describe("dates", () => {
    it("refuses a time block that ends before it starts, with BAD_REQUEST and no row", async () => {
      stubWorkspaceRole(db, WORKSPACE, "member");

      await expect(
        createAction(deps(db), {
          source: "ui",
          name: "Backwards",
          workspaceId: WORKSPACE,
          scheduledStart: new Date("2026-09-12T10:00:00.000Z"),
          scheduledEnd: new Date("2026-09-12T09:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(db.action.create).not.toHaveBeenCalled();
    });
  });

  describe("side effects", () => {
    it("does not fail the create when recordActivity rejects", async () => {
      vi.mocked(recordActivity).mockRejectedValueOnce(new Error("instrumentation down"));
      stubWorkspaceRole(db, WORKSPACE, "member");
      db.action.create.mockResolvedValue(createdRow());

      await expect(
        createAction(deps(db), { source: "ui", name: "Ship it", workspaceId: WORKSPACE }),
      ).resolves.toMatchObject({ id: "a1" });
    });
  });
});
