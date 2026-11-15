/**
 * Unit tests for the ADR-0049 delegation-invariant cascades.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  cascadeOwnerRemovedFromWorkspace,
  cascadeOwnerRoleChanged,
  revokeAgentWorkspace,
} from "../externalAgentAccess";

const db = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(db);
  // Losing a workspace also drops the agents' direct project grants there.
  db.projectMember.deleteMany.mockResolvedValue({ count: 0 });
});

describe("cascadeOwnerRemovedFromWorkspace", () => {
  it("removes the owner's agents' memberships in that workspace", async () => {
    db.externalAgent.findMany.mockResolvedValue([
      { shadowUserId: "shadow-1" },
      { shadowUserId: "shadow-2" },
      // findMany select narrows the row; the mock's full-row type is irrelevant here
    ] as never);
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 2 });

    const removed = await cascadeOwnerRemovedFromWorkspace(db, "owner-1", "ws-1");

    expect(removed).toBe(2);
    expect(db.externalAgent.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      select: { shadowUserId: true },
    });
    expect(db.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        userId: { in: ["shadow-1", "shadow-2"] },
      },
    });
  });

  it("also removes the agents' direct project memberships in that workspace", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ shadowUserId: "shadow-1" }] as never);
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 1 });

    await cascadeOwnerRemovedFromWorkspace(db, "owner-1", "ws-1");

    expect(db.projectMember.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["shadow-1"] },
        project: { workspaceId: "ws-1" },
      },
    });
  });

  it("is a no-op for owners with no agents", async () => {
    db.externalAgent.findMany.mockResolvedValue([]);

    const removed = await cascadeOwnerRemovedFromWorkspace(db, "owner-1", "ws-1");

    expect(removed).toBe(0);
    expect(db.workspaceUser.deleteMany).not.toHaveBeenCalled();
  });

  it("scopes the delete to the one workspace, not the owner's other grants", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ shadowUserId: "shadow-1" }] as never);
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 1 });

    await cascadeOwnerRemovedFromWorkspace(db, "owner-1", "ws-A");

    const arg = db.workspaceUser.deleteMany.mock.calls[0]?.[0];
    expect(arg?.where?.workspaceId).toBe("ws-A");
  });
});

describe("cascadeOwnerRoleChanged", () => {
  it("demotion to viewer removes the owner's agents (no viewer tier for agents)", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ shadowUserId: "shadow-1" }] as never);
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 1 });

    const removed = await cascadeOwnerRoleChanged(db, "owner-1", "ws-1", "viewer");

    expect(removed).toBe(1);
    expect(db.workspaceUser.deleteMany).toHaveBeenCalled();
  });

  it.each(["member", "admin", "owner"])(
    "role change to %s keeps the delegation valid and is a no-op",
    async (role) => {
      const removed = await cascadeOwnerRoleChanged(db, "owner-1", "ws-1", role);

      expect(removed).toBe(0);
      expect(db.externalAgent.findMany).not.toHaveBeenCalled();
      expect(db.workspaceUser.deleteMany).not.toHaveBeenCalled();
    },
  );
});

describe("revokeAgentWorkspace", () => {
  it("deletes the one membership and the agent's project grants in that workspace", async () => {
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 1 });

    await expect(revokeAgentWorkspace(db, "shadow-1", "ws-1")).resolves.toBe(true);

    expect(db.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: "shadow-1", workspaceId: "ws-1" },
    });
    expect(db.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ["shadow-1"] }, project: { workspaceId: "ws-1" } },
    });
  });

  it("reports false when the agent was not a member there", async () => {
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 0 });

    await expect(revokeAgentWorkspace(db, "shadow-1", "ws-1")).resolves.toBe(false);
  });
});

describe("the cascades cover an Assistant-backed agent (Agent PRD V2, D7 regression)", () => {
  // The owner has a plain External agent and an Assistant, whose principal is
  // an External agent too (ADR-0067). The fake honours an `assistant` filter
  // the way Postgres would, so a cascade that started skipping Assistants
  // would drop its shadow user from the delete and fail here.
  const agents = [
    { ownerId: "owner-1", shadowUserId: "shadow-plain", assistant: null },
    { ownerId: "owner-1", shadowUserId: "shadow-assistant", assistant: { id: "asst-1" } },
  ];

  beforeEach(() => {
    db.externalAgent.findMany.mockImplementation(((args: {
      where: { ownerId: string; assistant?: unknown };
    }) =>
      Promise.resolve(
        agents
          .filter((a) => a.ownerId === args.where.ownerId)
          .filter((a) => !("assistant" in args.where) || a.assistant === null)
          .map(({ shadowUserId }) => ({ shadowUserId })),
      )) as never);
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("removing the person takes their Assistant out of that workspace", async () => {
    await cascadeOwnerRemovedFromWorkspace(db, "owner-1", "ws-1");

    expect(db.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", userId: { in: ["shadow-plain", "shadow-assistant"] } },
    });
  });

  it("demoting the person to viewer takes their Assistant out too", async () => {
    await cascadeOwnerRoleChanged(db, "owner-1", "ws-1", "viewer");

    expect(db.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", userId: { in: ["shadow-plain", "shadow-assistant"] } },
    });
  });
});
