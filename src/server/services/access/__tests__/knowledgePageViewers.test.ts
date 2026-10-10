/**
 * Parity tests for `listKnowledgePageViewers` — the inverse of the per-user
 * Page resolver. For every fixture page, the batch viewer list must contain
 * exactly the users `getKnowledgePageAccess` + `canViewKnowledgePage` admit.
 *
 * Both functions run against the same tiny in-memory fake of the Prisma
 * calls they make, so the test pins data-loading parity, not just the rules.
 */

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  getKnowledgePageAccess,
  canViewKnowledgePage,
  listKnowledgePageViewers,
} from "../resolvers/knowledgePageResolver";

interface FakeProject {
  id: string;
  createdById: string;
  teamId: string | null;
  workspaceId: string | null;
  isPublic: boolean;
  isRestricted: boolean;
}

interface Fixture {
  projects: FakeProject[];
  workspaceUsers: { userId: string; workspaceId: string; role: string }[];
  teams: { id: string; workspaceId: string | null }[];
  teamUsers: { userId: string; teamId: string; role: string }[];
  projectMembers: { userId: string; projectId: string; role: string }[];
}

interface Where {
  id?: string;
  userId?: string;
  projectId?: string;
  teamId?: string;
  workspaceId?: string;
  team?: { workspaceId?: string };
  userId_teamId?: { userId: string; teamId: string };
  userId_workspaceId?: { userId: string; workspaceId: string };
}

function fakeDb(f: Fixture): PrismaClient {
  const teamWorkspace = (teamId: string) =>
    f.teams.find((t) => t.id === teamId)?.workspaceId ?? null;
  const teamUserMatches = (row: Fixture["teamUsers"][number], where: Where) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.teamId === undefined || row.teamId === where.teamId) &&
    (where.team?.workspaceId === undefined ||
      teamWorkspace(row.teamId) === where.team.workspaceId);

  const db = {
    project: {
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(f.projects.find((p) => p.id === where.id) ?? null),
    },
    projectMember: {
      findFirst: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.projectMembers.find(
            (m) => m.projectId === where.projectId && m.userId === where.userId,
          ) ?? null,
        ),
      findMany: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.projectMembers.filter((m) => m.projectId === where.projectId),
        ),
    },
    workspaceUser: {
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.workspaceUsers.find(
            (w) =>
              w.userId === where.userId_workspaceId?.userId &&
              w.workspaceId === where.userId_workspaceId?.workspaceId,
          ) ?? null,
        ),
      findMany: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.workspaceUsers.filter((w) => w.workspaceId === where.workspaceId),
        ),
    },
    teamUser: {
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.teamUsers.find(
            (t) =>
              t.userId === where.userId_teamId?.userId &&
              t.teamId === where.userId_teamId?.teamId,
          ) ?? null,
        ),
      findFirst: ({ where }: { where: Where }) => {
        const row = f.teamUsers.find((t) => teamUserMatches(t, where));
        return Promise.resolve(
          row
            ? { role: row.role, team: { workspaceId: teamWorkspace(row.teamId) } }
            : null,
        );
      },
      findMany: ({ where }: { where: Where }) =>
        Promise.resolve(f.teamUsers.filter((t) => teamUserMatches(t, where))),
    },
  };
  return db as unknown as PrismaClient;
}

const WS = "ws1";

/**
 * Users:
 * - owner / admin / member / viewer: direct workspace roles
 * - teamGuy: workspace access only through a team linked to the workspace
 * - projMember: project member, not in the workspace
 * - projTeam: in the project's own team (not workspace-linked)
 * - author: page author, not in the workspace
 * - stranger: no relation at all
 */
const USERS = [
  "owner",
  "admin",
  "member",
  "viewer",
  "teamGuy",
  "projMember",
  "projTeam",
  "author",
  "stranger",
];

function fixture(project: Partial<FakeProject>): Fixture {
  return {
    projects: [
      {
        id: "p1",
        createdById: "member",
        teamId: "projectTeam",
        workspaceId: WS,
        isPublic: false,
        isRestricted: false,
        ...project,
      },
    ],
    workspaceUsers: [
      { userId: "owner", workspaceId: WS, role: "owner" },
      { userId: "admin", workspaceId: WS, role: "admin" },
      { userId: "member", workspaceId: WS, role: "member" },
      { userId: "viewer", workspaceId: WS, role: "viewer" },
    ],
    teams: [
      { id: "wsTeam", workspaceId: WS },
      { id: "projectTeam", workspaceId: null },
    ],
    teamUsers: [
      { userId: "teamGuy", teamId: "wsTeam", role: "member" },
      { userId: "projTeam", teamId: "projectTeam", role: "member" },
    ],
    projectMembers: [{ userId: "projMember", projectId: "p1", role: "viewer" }],
  };
}

async function expectParity(
  f: Fixture,
  page: { createdById: string; projectId: string | null; workspaceId: string },
) {
  const db = fakeDb(f);
  const { viewers } = await listKnowledgePageViewers(db, page);
  const listed = viewers.map((v) => v.userId).sort();
  const expected: string[] = [];
  for (const userId of USERS) {
    if (canViewKnowledgePage(await getKnowledgePageAccess(db, userId, page))) {
      expected.push(userId);
    }
  }
  expect(listed).toEqual(expected.sort());
  return viewers;
}

describe("listKnowledgePageViewers", () => {
  it("project-less page: the author plus every workspace member, team route included", async () => {
    const viewers = await expectParity(fixture({}), {
      createdById: "author",
      projectId: null,
      workspaceId: WS,
    });
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["admin", "author", "member", "owner", "teamGuy", "viewer"].sort(),
    );
    expect(viewers.some((v) => v.viaAdminEscapeHatch)).toBe(false);
  });

  it("unrestricted project: workspace, project team and project members", async () => {
    await expectParity(fixture({}), {
      createdById: "author",
      projectId: "p1",
      workspaceId: WS,
    });
  });

  it("restricted project: only creator, members, author and admins (flagged)", async () => {
    const viewers = await expectParity(fixture({ isRestricted: true }), {
      createdById: "author",
      projectId: "p1",
      workspaceId: WS,
    });
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["admin", "author", "member", "owner", "projMember"].sort(),
    );
    expect(
      viewers.filter((v) => v.viaAdminEscapeHatch).map((v) => v.userId).sort(),
    ).toEqual(["admin", "owner"]);
  });

  it("restricted project created by an admin: the admin is not flagged as escape hatch", async () => {
    const viewers = await expectParity(
      fixture({ isRestricted: true, createdById: "admin" }),
      { createdById: "author", projectId: "p1", workspaceId: WS },
    );
    expect(viewers.find((v) => v.userId === "admin")?.viaAdminEscapeHatch).toBe(
      false,
    );
  });

  it("public project: reports public, lists nobody", async () => {
    const result = await listKnowledgePageViewers(
      fakeDb(fixture({ isPublic: true })),
      { createdById: "author", projectId: "p1", workspaceId: WS },
    );
    expect(result).toEqual({ isPublicProject: true, viewers: [] });
  });
});
