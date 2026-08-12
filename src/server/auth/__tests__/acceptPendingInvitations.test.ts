/**
 * Unit tests for `acceptPendingInvitationsForUser` — specifically the
 * workspace-join activity event added for auto-accepted invites: exactly one
 * `workspace_member/created` event for a genuinely new member, none when the
 * user already belonged to the workspace.
 *
 * Mocked Prisma via `vitest-mock-extended` (see CLAUDE.md "Test database
 * safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { acceptPendingInvitationsForUser } from "../acceptPendingInvitations";

const db = mockDeep<PrismaClient>();
const USER = "user-1";
const EMAIL = "invitee@example.com";

const invitation = {
  id: "inv-1",
  workspaceId: "ws-1",
  email: EMAIL,
  role: "member",
};

beforeEach(() => {
  mockReset(db);
  db.teamInvitation.findMany.mockResolvedValue([] as never);
  db.$transaction.mockResolvedValue([] as never);
});

describe("acceptPendingInvitationsForUser", () => {
  it("emits exactly one workspace_member/created event for a new member", async () => {
    db.workspaceInvitation.findMany.mockResolvedValue([invitation] as never);
    db.workspaceUser.findUnique.mockResolvedValue(null as never); // not a member yet
    db.user.findUnique.mockResolvedValue({ name: "Invitee" } as never);

    const result = await acceptPendingInvitationsForUser(db, USER, EMAIL);

    expect(result).toBe("ws-1");
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws-1",
        userId: USER,
        entityType: "workspace_member",
        entityId: USER,
        action: "created",
        metadata: { name: "Invitee" },
      }),
    });
  });

  it("emits no event when the user was already a member", async () => {
    db.workspaceInvitation.findMany.mockResolvedValue([invitation] as never);
    db.workspaceUser.findUnique.mockResolvedValue({ userId: USER } as never); // existing member

    const result = await acceptPendingInvitationsForUser(db, USER, EMAIL);

    // The invitation is still marked accepted (returned workspaceId), but the
    // feed must not announce a join that didn't happen.
    expect(result).toBe("ws-1");
    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("falls back to the email in event metadata when the user has no name", async () => {
    db.workspaceInvitation.findMany.mockResolvedValue([invitation] as never);
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    db.user.findUnique.mockResolvedValue({ name: null } as never);

    await acceptPendingInvitationsForUser(db, USER, EMAIL);

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { name: EMAIL } }),
    });
  });
});
