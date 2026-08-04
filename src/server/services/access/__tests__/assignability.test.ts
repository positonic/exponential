/**
 * Unit tests for the assignability guards.
 *
 * Sibling to workspaceRefs.test.ts. `assigneeId` opens the same kind of
 * sideways read path as the epic/feature/cycle/scope links, except the row it
 * points at is a `User` — and the includes on `ticket.getById` and
 * `action.assign` return that user's `name` and `email`. The rule under test:
 * you may only assign someone who could already read the thing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  assertAssignableUser,
  canAssignToUnscopedAction,
} from "../assignability";

const CALLER_ID = "user-caller";
const MEMBER_ID = "user-member";
const OUTSIDER_ID = "user-outsider";
const WORKSPACE_ID = "ws-1";

/** Only `memberIds` hold a direct WorkspaceUser row for WORKSPACE_ID. */
function stubDirectMembers(
  db: DeepMockProxy<PrismaClient>,
  memberIds: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.workspaceUser.findUnique.mockImplementation((args: any) => {
    const userId = args?.where?.userId_workspaceId?.userId as string | undefined;
    return Promise.resolve(
      userId && memberIds.includes(userId)
        ? { role: "member", workspaceId: WORKSPACE_ID }
        : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  });
}

describe("assertAssignableUser", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("skips null/undefined so unassigning stays allowed", async () => {
    await expect(
      assertAssignableUser(db, WORKSPACE_ID, null),
    ).resolves.toBeUndefined();
    await expect(
      assertAssignableUser(db, WORKSPACE_ID, undefined),
    ).resolves.toBeUndefined();
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a direct workspace member", async () => {
    stubDirectMembers(db, [MEMBER_ID]);

    await expect(
      assertAssignableUser(db, WORKSPACE_ID, MEMBER_ID),
    ).resolves.toBeUndefined();
  });

  it("accepts a team-based member — the same path that lets them read", async () => {
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue({
      role: "member",
      team: { workspaceId: WORKSPACE_ID },
    } as never);

    await expect(
      assertAssignableUser(db, WORKSPACE_ID, MEMBER_ID),
    ).resolves.toBeUndefined();
  });

  it("rejects a user with no membership at all", async () => {
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue(null as never);

    await expect(
      assertAssignableUser(db, WORKSPACE_ID, OUTSIDER_ID),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejects as NOT_FOUND, so the error is not an existence oracle", async () => {
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue(null as never);

    await expect(
      assertAssignableUser(db, WORKSPACE_ID, OUTSIDER_ID),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Assignee not found in this workspace",
    });
  });

  it("rejects a workspace guest: project-only access cannot read tickets", async () => {
    // A guest has a ProjectMember row but no WorkspaceUser and no team, so
    // getWorkspaceMembership returns null — deliberately, since the same
    // resolver gates every ticket read.
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.projectMember.findFirst.mockResolvedValue({ id: "pm-1" } as never);

    await expect(
      assertAssignableUser(db, WORKSPACE_ID, OUTSIDER_ID),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("canAssignToUnscopedAction", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("always allows self-assignment, even with no workspace", async () => {
    await expect(
      canAssignToUnscopedAction(db, CALLER_ID, null, CALLER_ID),
    ).resolves.toBe(true);
    expect(db.team.findFirst).not.toHaveBeenCalled();
  });

  it("allows a member of the action's workspace", async () => {
    stubDirectMembers(db, [MEMBER_ID]);

    await expect(
      canAssignToUnscopedAction(db, CALLER_ID, WORKSPACE_ID, MEMBER_ID),
    ).resolves.toBe(true);
  });

  it("allows a user who shares a team with the caller", async () => {
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.team.findFirst.mockResolvedValue({ id: "team-1" } as never);

    await expect(
      canAssignToUnscopedAction(db, CALLER_ID, null, MEMBER_ID),
    ).resolves.toBe(true);
  });

  it("refuses a stranger — no workspace, no shared team", async () => {
    stubDirectMembers(db, []);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.team.findFirst.mockResolvedValue(null as never);

    await expect(
      canAssignToUnscopedAction(db, CALLER_ID, null, OUTSIDER_ID),
    ).resolves.toBe(false);
  });

  it("refuses a stranger even when the action has a workspace", async () => {
    stubDirectMembers(db, [CALLER_ID]);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    db.team.findFirst.mockResolvedValue(null as never);

    await expect(
      canAssignToUnscopedAction(db, CALLER_ID, WORKSPACE_ID, OUTSIDER_ID),
    ).resolves.toBe(false);
  });
});
