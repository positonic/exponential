import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  resolveWorkspaceId,
  WorkspaceAccessError,
} from "~/server/services/voice/workspaceResolver";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("resolveWorkspaceId — three-tier voice workspace resolution", () => {
  beforeEach(() => mockReset(db));

  it("explicit-valid: returns the explicit id when the user IS a member", async () => {
    // Membership lookup for the explicit id succeeds.
    db.workspaceUser.findFirst.mockResolvedValueOnce({ workspaceId: "ws-explicit" } as never);

    const result = await resolveWorkspaceId("user-1", db, "ws-explicit");

    expect(result).toBe("ws-explicit");
    // It must verify membership for the explicit id before trusting it.
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", workspaceId: "ws-explicit" },
      }),
    );
    // Validation short-circuits the default/first-membership tiers.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("explicit-invalid: rejects when the user is NOT a member of the explicit id", async () => {
    db.workspaceUser.findFirst.mockResolvedValueOnce(null);

    await expect(
      resolveWorkspaceId("user-1", db, "ws-not-mine"),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);

    // Never falls through to default/first-membership on an invalid explicit id —
    // that would be a privilege-escalation path.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("default fallback: returns User.defaultWorkspaceId when the user is still a member", async () => {
    db.user.findUnique.mockResolvedValueOnce({ defaultWorkspaceId: "ws-default" } as never);
    // Membership check for the default workspace succeeds.
    db.workspaceUser.findFirst.mockResolvedValueOnce({ workspaceId: "ws-default" } as never);

    const result = await resolveWorkspaceId("user-1", db);

    expect(result).toBe("ws-default");
    // Verified the default against current memberships before trusting it.
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", workspaceId: "ws-default" },
      }),
    );
  });

  it("stale default: ignores defaultWorkspaceId when the user is no longer a member, falls to first membership", async () => {
    db.user.findUnique.mockResolvedValueOnce({ defaultWorkspaceId: "ws-removed" } as never);
    // First findFirst = default-membership check (not a member); second = first-membership fallback.
    db.workspaceUser.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ workspaceId: "ws-first" } as never);

    const result = await resolveWorkspaceId("user-1", db);

    expect(result).toBe("ws-first");
  });

  it("first-membership fallback: returns the oldest membership when no explicit id and no default", async () => {
    db.user.findUnique.mockResolvedValueOnce({ defaultWorkspaceId: null } as never);
    db.workspaceUser.findFirst.mockResolvedValueOnce({ workspaceId: "ws-first" } as never);

    const result = await resolveWorkspaceId("user-1", db);

    expect(result).toBe("ws-first");
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { joinedAt: "asc" },
      }),
    );
  });

  it("no workspace: returns undefined when the user belongs to no workspace", async () => {
    db.user.findUnique.mockResolvedValueOnce({ defaultWorkspaceId: null } as never);
    db.workspaceUser.findFirst.mockResolvedValueOnce(null);

    const result = await resolveWorkspaceId("user-1", db);

    expect(result).toBeUndefined();
  });
});
