import { describe, it, expect } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  buildProjectAccessWhere,
  buildProjectInsiderWhere,
} from "../resolvers/projectResolver";
import {
  buildSharedResourceWhere,
  listSharedResourceProjectIds,
  resourceOwnerInWorkspaceWhere,
} from "../resolvers/resourceResolver";

const VIEWER = "viewer-1";

describe("buildProjectInsiderWhere", () => {
  it("is project access without the public path", () => {
    const access = buildProjectAccessWhere(VIEWER).OR as unknown[];
    const insider = buildProjectInsiderWhere(VIEWER).OR as unknown[];

    expect(access).toContainEqual({ isPublic: true });
    expect(insider).not.toContainEqual({ isPublic: true });
    expect(insider).toEqual(access.filter((clause) => JSON.stringify(clause) !== '{"isPublic":true}'));
  });
});

describe("buildSharedResourceWhere (ADR-0082)", () => {
  it("shares nothing with someone who is in no workspace", async () => {
    const db = mockDeep<PrismaClient>();
    db.workspace.findMany.mockResolvedValue([]);

    expect(await buildSharedResourceWhere(db, VIEWER)).toBeNull();
  });

  it("per workspace: filed under a Project there that the viewer is in, by an owner who still belongs", async () => {
    const db = mockDeep<PrismaClient>();
    db.workspace.findMany.mockResolvedValue([{ id: "w1" }, { id: "w2" }] as never);

    const where = await buildSharedResourceWhere(db, VIEWER);

    expect(where).toEqual({
      OR: ["w1", "w2"].map((workspaceId) => ({
        // The Resource sits in the workspace of the Project it is filed under.
        workspaceId,
        project: { AND: [{ workspaceId }, buildProjectInsiderWhere(VIEWER)] },
        user: resourceOwnerInWorkspaceWhere(workspaceId),
      })),
    });
  });

  it("narrows to one Project when asked", async () => {
    const db = mockDeep<PrismaClient>();
    db.workspace.findMany.mockResolvedValue([{ id: "w1" }] as never);

    const where = await buildSharedResourceWhere(db, VIEWER, { projectId: "p1" });

    expect(db.workspace.findMany.mock.calls[0]![0]!.where).toMatchObject({
      AND: expect.arrayContaining([{ projects: { some: { id: "p1" } } }]) as unknown,
    });
    expect(where).toMatchObject({ AND: [{ projectId: "p1" }, { OR: [expect.objectContaining({ workspaceId: "w1" })] }] });
  });

  it("an owner belongs to a workspace directly or through a team linked to it", () => {
    expect(resourceOwnerInWorkspaceWhere("w1")).toEqual({
      OR: [
        { workspaceMemberships: { some: { workspaceId: "w1" } } },
        { teams: { some: { team: { workspaceId: "w1" } } } },
      ],
    });
  });
});

describe("listSharedResourceProjectIds", () => {
  it("lists the workspace's Projects the viewer is in, never the merely public", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);

    expect(await listSharedResourceProjectIds(db, VIEWER, "w1")).toEqual(["p1", "p2"]);
    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ workspaceId: "w1" }, buildProjectInsiderWhere(VIEWER)],
    });
  });
});
