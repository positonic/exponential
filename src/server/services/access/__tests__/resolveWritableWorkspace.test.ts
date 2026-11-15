/**
 * Unit tests for `resolveWritableWorkspace`: the workspace an agent tool
 * writes to when the chat may not have forwarded one.
 *
 * It answers three ways, and callers rely on each: a workspace id (write
 * there), null (not a member, or in no workspace at all, so the caller gives
 * its own answer), FORBIDDEN (a member who may only read). The fallback must
 * never land on a workspace the user only views, and must find a workspace
 * reached only through a team.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { resolveWritableWorkspace } from "../resolvers/workspaceResolver";

const userId = "user-1";

async function outcome(p: Promise<string | null>): Promise<string | null> {
  try {
    return await p;
  } catch (e) {
    return e instanceof TRPCError ? `threw ${e.code}` : "threw NOT_TRPC";
  }
}

describe("resolveWritableWorkspace", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    db.workspaceUser.findMany.mockResolvedValue([] as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
  });

  describe("with a requested workspace", () => {
    it.each(["owner", "admin", "member"])("returns it for a direct %s", async (role) => {
      db.workspaceUser.findUnique.mockResolvedValue({ role, workspaceId: "ws-1" } as never);

      expect(await outcome(resolveWritableWorkspace(db, userId, "ws-1"))).toBe("ws-1");
    });

    it("returns it for someone who reaches it only through a team", async () => {
      db.teamUser.findFirst.mockResolvedValue({
        role: "member",
        team: { workspaceId: "ws-1" },
      } as never);

      expect(await outcome(resolveWritableWorkspace(db, userId, "ws-1"))).toBe("ws-1");
    });

    it("refuses a viewer with FORBIDDEN", async () => {
      db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: "ws-1" } as never);

      expect(await outcome(resolveWritableWorkspace(db, userId, "ws-1"))).toBe("threw FORBIDDEN");
    });

    it("returns null for a non-member, never falling back to another workspace", async () => {
      db.workspaceUser.findMany.mockResolvedValue([{ workspaceId: "ws-other", role: "owner" }] as never);

      expect(await outcome(resolveWritableWorkspace(db, userId, "ws-1"))).toBeNull();
      expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
    });
  });

  describe("with no requested workspace", () => {
    it("picks the first direct membership that carries a write role", async () => {
      db.workspaceUser.findMany.mockResolvedValue([
        { workspaceId: "ws-viewed", role: "viewer" },
        { workspaceId: "ws-member", role: "member" },
        { workspaceId: "ws-owned", role: "owner" },
      ] as never);

      expect(await outcome(resolveWritableWorkspace(db, userId))).toBe("ws-member");
    });

    it("finds a workspace reached only through a team", async () => {
      db.teamUser.findFirst.mockResolvedValue({ team: { workspaceId: "ws-team" } } as never);

      expect(await outcome(resolveWritableWorkspace(db, userId))).toBe("ws-team");
    });

    it("prefers a team workspace over one the user only views", async () => {
      db.workspaceUser.findMany.mockResolvedValue([{ workspaceId: "ws-viewed", role: "viewer" }] as never);
      db.teamUser.findFirst.mockResolvedValue({ team: { workspaceId: "ws-team" } } as never);

      expect(await outcome(resolveWritableWorkspace(db, userId))).toBe("ws-team");
    });

    it("never lets a team upgrade a direct viewer row in the same workspace", async () => {
      db.workspaceUser.findMany.mockResolvedValue([{ workspaceId: "ws-viewed", role: "viewer" }] as never);

      await outcome(resolveWritableWorkspace(db, userId));

      // The team lookup excludes every workspace the user has a direct row in.
      expect(db.teamUser.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        userId,
        team: { workspaceId: { not: null, notIn: ["ws-viewed"] } },
      });
    });

    it("refuses with FORBIDDEN someone who only views their workspaces", async () => {
      db.workspaceUser.findMany.mockResolvedValue([{ workspaceId: "ws-viewed", role: "viewer" }] as never);

      expect(await outcome(resolveWritableWorkspace(db, userId))).toBe("threw FORBIDDEN");
    });

    it("returns null for someone in no workspace at all", async () => {
      expect(await outcome(resolveWritableWorkspace(db, userId))).toBeNull();
    });
  });
});
