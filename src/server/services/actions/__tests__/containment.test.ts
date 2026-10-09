/**
 * The attachment-containment helpers shared by `createAction` and the
 * procedures that attach to an existing Action. Mocked Prisma, no database.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  assertTagsInWorkspace,
  canAssignUserToAction,
  assertAssignableUsers,
  assertListMembership,
} from "../containment";

const CALLER = "user-1";
const WORKSPACE = "w1";

describe("containment", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  describe("assertTagsInWorkspace", () => {
    it("is a no-op for an empty list", async () => {
      await assertTagsInWorkspace(db, CALLER, WORKSPACE, []);
      expect(db.tag.findMany).not.toHaveBeenCalled();
    });

    it("accepts global tags and tags owned by the workspace", async () => {
      db.tag.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never);

      await assertTagsInWorkspace(db, CALLER, WORKSPACE, ["t1", "t2", "t1"]);

      expect(db.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ["t1", "t2"] },
            OR: [{ workspaceId: null }, { workspaceId: WORKSPACE }],
          },
        }),
      );
    });

    it("refuses when any tag is missing from the workspace-scoped lookup", async () => {
      db.tag.findMany.mockResolvedValue([{ id: "t1" }] as never);

      await expect(
        assertTagsInWorkspace(db, CALLER, WORKSPACE, ["t1", "t-foreign"]),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("without a workspace, requires membership of each tag's own workspace", async () => {
      db.tag.findMany.mockResolvedValue([
        { id: "t-global", workspaceId: null },
        { id: "t-mine", workspaceId: "w-mine" },
      ] as never);
      db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: "w-mine" } as never);

      await expect(
        assertTagsInWorkspace(db, CALLER, null, ["t-global", "t-mine"]),
      ).resolves.toBeUndefined();

      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);
      await expect(
        assertTagsInWorkspace(db, CALLER, null, ["t-mine"]),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("canAssignUserToAction", () => {
    it("on a project: anyone with project access", async () => {
      db.project.findUnique.mockResolvedValue({
        createdById: "owner",
        teamId: null,
        workspaceId: WORKSPACE,
        isPublic: false,
        isRestricted: false,
      } as never);
      db.projectMember.findFirst.mockResolvedValue({ role: "editor" } as never);

      await expect(
        canAssignUserToAction(db, CALLER, { projectId: "p1", teamId: null, workspaceId: WORKSPACE }, "u2"),
      ).resolves.toBe(true);
    });

    it("on a restricted project: no shared-team fallback", async () => {
      db.project.findUnique.mockResolvedValue({
        createdById: "owner",
        teamId: null,
        workspaceId: WORKSPACE,
        isPublic: false,
        isRestricted: true,
      } as never);
      db.projectMember.findFirst.mockResolvedValue(null);
      db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE } as never);
      db.team.findFirst.mockResolvedValue({ id: "team-shared" } as never);

      await expect(
        canAssignUserToAction(db, CALLER, { projectId: "p1", teamId: null, workspaceId: WORKSPACE }, "u2"),
      ).resolves.toBe(false);
      expect(db.team.findFirst).not.toHaveBeenCalled();
    });

    it("on an unrestricted project: falls back to a team shared with the caller", async () => {
      db.project.findUnique.mockResolvedValue({
        createdById: "owner",
        teamId: null,
        workspaceId: WORKSPACE,
        isPublic: false,
        isRestricted: false,
      } as never);
      db.projectMember.findFirst.mockResolvedValue(null);
      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);
      db.team.findFirst.mockResolvedValue({ id: "team-shared" } as never);

      await expect(
        canAssignUserToAction(db, CALLER, { projectId: "p1", teamId: null, workspaceId: WORKSPACE }, "u2"),
      ).resolves.toBe(true);
    });

    it("on a team without a project: team members only", async () => {
      db.teamUser.findUnique.mockResolvedValue({ id: "tu1" } as never);
      await expect(
        canAssignUserToAction(db, CALLER, { projectId: null, teamId: "team-1", workspaceId: null }, "u2"),
      ).resolves.toBe(true);

      db.teamUser.findUnique.mockResolvedValue(null);
      await expect(
        canAssignUserToAction(db, CALLER, { projectId: null, teamId: "team-1", workspaceId: null }, "u2"),
      ).resolves.toBe(false);
    });

    it("unscoped: self, workspace members, shared-team users", async () => {
      const scope = { projectId: null, teamId: null, workspaceId: WORKSPACE };
      await expect(canAssignUserToAction(db, CALLER, scope, CALLER)).resolves.toBe(true);

      db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE } as never);
      await expect(canAssignUserToAction(db, CALLER, scope, "u2")).resolves.toBe(true);

      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);
      db.team.findFirst.mockResolvedValue(null);
      await expect(canAssignUserToAction(db, CALLER, scope, "u3")).resolves.toBe(false);
    });
  });

  describe("assertAssignableUsers", () => {
    it("rejects with NOT_FOUND naming the scope, never the user", async () => {
      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);
      db.team.findFirst.mockResolvedValue(null);
      db.user.findUnique.mockResolvedValue({ name: "Ada Lovelace", email: "ada@example.com" } as never);

      const err = await assertAssignableUsers(
        db,
        CALLER,
        { projectId: null, teamId: null, workspaceId: WORKSPACE },
        ["user-outsider"],
      ).catch((e: unknown) => e as { code: string; message: string });

      expect(err).toMatchObject({ code: "NOT_FOUND" });
      expect(err.message).toContain("workspace");
      expect(err.message).not.toContain("Ada Lovelace");
      expect(err.message).not.toContain("user-outsider");
    });
  });

  describe("assertListMembership", () => {
    it("returns the list for a member of its workspace", async () => {
      db.list.findUnique.mockResolvedValue({ id: "l1", workspaceId: WORKSPACE } as never);
      db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE } as never);

      await expect(assertListMembership(db, CALLER, "l1", WORKSPACE)).resolves.toEqual({
        id: "l1",
        workspaceId: WORKSPACE,
      });
    });

    it("accepts a team-based workspace member, like the write gate does", async () => {
      db.list.findUnique.mockResolvedValue({ id: "l1", workspaceId: WORKSPACE } as never);
      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue({ role: "member", team: { workspaceId: WORKSPACE } } as never);

      await expect(assertListMembership(db, CALLER, "l1", null)).resolves.toMatchObject({ id: "l1" });
    });

    it("is NOT_FOUND for a missing list, FORBIDDEN for a non-member, BAD_REQUEST for another workspace", async () => {
      db.list.findUnique.mockResolvedValue(null);
      await expect(assertListMembership(db, CALLER, "l-missing", null)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      db.list.findUnique.mockResolvedValue({ id: "l1", workspaceId: WORKSPACE } as never);
      db.workspaceUser.findUnique.mockResolvedValue(null);
      db.teamUser.findFirst.mockResolvedValue(null);
      await expect(assertListMembership(db, CALLER, "l1", null)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE } as never);
      await expect(assertListMembership(db, CALLER, "l1", "w-other")).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });
});
