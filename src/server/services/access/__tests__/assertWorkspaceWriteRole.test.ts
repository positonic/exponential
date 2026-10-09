/**
 * Unit tests for `assertWorkspaceWriteRole` — the shared "may this user write
 * workspace content?" gate. Membership alone is not enough: `viewer` is
 * read-only, and non-members (including project-only guests, who have no
 * `WorkspaceUser` row) are refused.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  assertWorkspaceMembership,
  assertWorkspaceWriteRole,
} from "../resolvers/workspaceResolver";

const userId = "user-1";
const workspaceId = "ws-1";

async function forbiddenCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

describe("assertWorkspaceWriteRole", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.teamUser.findFirst.mockResolvedValue(null as never);
  });

  function stubDirectRole(role: string | null) {
    db.workspaceUser.findUnique.mockResolvedValue(
      role ? ({ role, workspaceId } as never) : (null as never),
    );
  }

  it.each(["owner", "admin", "member"])(
    "admits a direct %s and returns the membership",
    async (role) => {
      stubDirectRole(role);
      await expect(
        assertWorkspaceWriteRole(db, userId, workspaceId),
      ).resolves.toEqual({ role, workspaceId });
    },
  );

  it("refuses a viewer with FORBIDDEN", async () => {
    stubDirectRole("viewer");
    expect(
      await forbiddenCode(assertWorkspaceWriteRole(db, userId, workspaceId)),
    ).toBe("FORBIDDEN");
  });

  it("refuses a non-member with FORBIDDEN", async () => {
    stubDirectRole(null);
    expect(
      await forbiddenCode(assertWorkspaceWriteRole(db, userId, workspaceId)),
    ).toBe("FORBIDDEN");
  });

  it("admits team-based access (resolves to member)", async () => {
    stubDirectRole(null);
    db.teamUser.findFirst.mockResolvedValue({
      role: "member",
      team: { workspaceId },
    } as never);
    await expect(
      assertWorkspaceWriteRole(db, userId, workspaceId),
    ).resolves.toEqual({ role: "member", workspaceId });
  });
});

describe("assertWorkspaceMembership (the read gate)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.teamUser.findFirst.mockResolvedValue(null as never);
  });

  it.each(["owner", "admin", "member", "viewer"])(
    "admits a direct %s",
    async (role) => {
      db.workspaceUser.findUnique.mockResolvedValue(
        { role, workspaceId } as never,
      );
      await expect(
        assertWorkspaceMembership(db, userId, workspaceId),
      ).resolves.toEqual({ role, workspaceId });
    },
  );

  it("refuses a non-member with FORBIDDEN", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    expect(
      await forbiddenCode(assertWorkspaceMembership(db, userId, workspaceId)),
    ).toBe("FORBIDDEN");
  });
});
