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
  canEditKnowledgePage,
  listKnowledgePageViewers,
  buildKnowledgePageAccessWhere,
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
  pageMembers: { userId: string; pageId: string; role: string }[];
  /** Databases (ADR-0078) and the page that holds each. */
  databases?: { id: string; page: TestPage }[];
}

interface Where {
  id?: string;
  pageId?: string;
  userId?: string | { in: string[] };
  projectId?: string;
  teamId?: string;
  workspaceId?: string;
  team?: { workspaceId?: string };
  userId_teamId?: { userId: string; teamId: string };
  userId_workspaceId?: { userId: string; workspaceId: string };
  pageId_userId?: { pageId: string; userId: string };
}

function fakeDb(f: Fixture): PrismaClient {
  const teamWorkspace = (teamId: string) =>
    f.teams.find((t) => t.id === teamId)?.workspaceId ?? null;
  const userMatches = (userId: string, where: Where) =>
    where.userId === undefined ||
    (typeof where.userId === "string"
      ? userId === where.userId
      : where.userId.in.includes(userId));
  const teamUserMatches = (row: Fixture["teamUsers"][number], where: Where) =>
    userMatches(row.userId, where) &&
    (where.teamId === undefined || row.teamId === where.teamId) &&
    (where.team?.workspaceId === undefined ||
      teamWorkspace(row.teamId) === where.team.workspaceId);

  const db = {
    pageDatabase: {
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(f.databases?.find((d) => d.id === where.id) ?? null),
    },
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
          f.workspaceUsers.filter(
            (w) => w.workspaceId === where.workspaceId && userMatches(w.userId, where),
          ),
        ),
    },
    knowledgePageMember: {
      findUnique: ({ where }: { where: Where }) =>
        Promise.resolve(
          f.pageMembers.find(
            (m) =>
              m.pageId === where.pageId_userId?.pageId &&
              m.userId === where.pageId_userId?.userId,
          ) ?? null,
        ),
      findMany: ({ where }: { where: Where }) =>
        Promise.resolve(f.pageMembers.filter((m) => m.pageId === where.pageId)),
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
    pageMembers: [
      { userId: "member", pageId: "pg", role: "viewer" },
      { userId: "teamGuy", pageId: "pg", role: "editor" },
      // Invited, but not (or no longer) in the workspace: no access.
      { userId: "projMember", pageId: "pg", role: "viewer" },
    ],
  };
}

interface TestPage {
  id: string;
  createdById: string;
  projectId: string | null;
  workspaceId: string;
  isInviteOnly: boolean;
  databaseId?: string | null;
}

/** The fixture with no grants, for tests about placement alone. */
function noGrants(f: Fixture): Fixture {
  return { ...f, pageMembers: [] };
}

async function editors(f: Fixture, page: TestPage): Promise<string[]> {
  const db = fakeDb(f);
  const result: string[] = [];
  for (const userId of USERS) {
    if (canEditKnowledgePage(await getKnowledgePageAccess(db, userId, page))) {
      result.push(userId);
    }
  }
  return result.sort();
}

function testPage(overrides: Partial<TestPage>): TestPage {
  return {
    id: "pg",
    createdById: "author",
    projectId: null,
    workspaceId: WS,
    isInviteOnly: false,
    ...overrides,
  };
}

async function expectParity(f: Fixture, page: TestPage) {
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
    const viewers = await expectParity(noGrants(fixture({})), testPage({}));
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["admin", "author", "member", "owner", "teamGuy", "viewer"].sort(),
    );
    expect(viewers.some((v) => v.viaAdminEscapeHatch)).toBe(false);
  });

  it("unrestricted project: workspace, project team and project members", async () => {
    await expectParity(noGrants(fixture({})), testPage({ projectId: "p1" }));
  });

  it("restricted project: only creator, members, author and admins (flagged)", async () => {
    const viewers = await expectParity(noGrants(fixture({ isRestricted: true })), testPage({ projectId: "p1" }));
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["admin", "author", "member", "owner", "projMember"].sort(),
    );
    expect(
      viewers.filter((v) => v.viaAdminEscapeHatch).map((v) => v.userId).sort(),
    ).toEqual(["admin", "owner"]);
  });

  it("restricted project created by an admin: the admin is not flagged as escape hatch", async () => {
    const viewers = await expectParity(
      noGrants(fixture({ isRestricted: true, createdById: "admin" })),
      testPage({ projectId: "p1" }),
    );
    expect(viewers.find((v) => v.userId === "admin")?.viaAdminEscapeHatch).toBe(
      false,
    );
  });

  it("public project: reports public, lists nobody", async () => {
    const result = await listKnowledgePageViewers(
      fakeDb(fixture({ isPublic: true })),
      testPage({ projectId: "p1" }),
    );
    expect(result).toEqual({ isPublicProject: true, viewers: [] });
  });

  it("invite-only page: the owner plus invitees still in the workspace — no admins", async () => {
    const viewers = await expectParity(fixture({ isRestricted: true }), testPage({ isInviteOnly: true, projectId: "p1" }));
    // Not owner/admin (no escape hatch), not projMember (invited but outside
    // the workspace), not the project's own members.
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["author", "member", "teamGuy"].sort(),
    );
  });

  it("invite-only page with no invitees: only the owner", async () => {
    const f = fixture({});
    f.pageMembers = [];
    const viewers = await expectParity(f, testPage({ isInviteOnly: true }));
    expect(viewers.map((v) => v.userId)).toEqual(["author"]);
  });
});

/**
 * Grants on pages that are not restricted (ADR-0080): a grant adds to what
 * placement allows, lapses when the grantee leaves the workspace, and the
 * higher of the two levels wins.
 */
describe("page grants on unrestricted pages", () => {
  it("restricted project: a workspace member outside the project gets in by grant", async () => {
    const f = fixture({ isRestricted: true });
    f.pageMembers = [
      { userId: "teamGuy", pageId: "pg", role: "viewer" },
      { userId: "viewer", pageId: "pg", role: "editor" },
    ];
    const page = testPage({ projectId: "p1" });
    const viewers = await expectParity(f, page);
    expect(viewers.map((v) => v.userId).sort()).toEqual(
      ["admin", "author", "member", "owner", "projMember", "teamGuy", "viewer"].sort(),
    );
    // Grantees are named, not escape-hatch admins.
    expect(viewers.find((v) => v.userId === "teamGuy")?.viaAdminEscapeHatch).toBe(false);
    // The viewer grantee may not edit; the editor grantee may — even though
    // their workspace role is the read-only Viewer.
    const canEdit = await editors(f, page);
    expect(canEdit).toContain("viewer");
    expect(canEdit).not.toContain("teamGuy");
  });

  it("an admin who also holds a grant is not flagged as the escape hatch", async () => {
    const f = fixture({ isRestricted: true });
    f.pageMembers = [{ userId: "admin", pageId: "pg", role: "viewer" }];
    const viewers = await expectParity(f, testPage({ projectId: "p1" }));
    expect(viewers.find((v) => v.userId === "admin")?.viaAdminEscapeHatch).toBe(false);
    expect(viewers.find((v) => v.userId === "owner")?.viaAdminEscapeHatch).toBe(true);
  });

  it("workspace page: a viewer grant never lowers a member's inherited edit right", async () => {
    const f = fixture({});
    f.pageMembers = [
      { userId: "member", pageId: "pg", role: "viewer" },
      { userId: "viewer", pageId: "pg", role: "editor" },
    ];
    const page = testPage({});
    await expectParity(f, page);
    const canEdit = await editors(f, page);
    // member edits by workspace role despite a viewer grant; the workspace
    // Viewer edits by the editor grant (the higher of the two).
    expect(canEdit).toEqual(["admin", "author", "member", "owner", "teamGuy", "viewer"].sort());
  });

  it("a grantee who left the workspace gets nothing from the grant", async () => {
    const f = fixture({ isRestricted: true });
    f.pageMembers = [
      { userId: "stranger", pageId: "pg", role: "editor" },
      { userId: "projTeam", pageId: "pg", role: "viewer" },
    ];
    const viewers = await expectParity(f, testPage({ projectId: "p1" }));
    const ids = viewers.map((v) => v.userId);
    expect(ids).not.toContain("stranger");
    expect(ids).not.toContain("projTeam");
  });

  it("a grant with an unknown role admits nobody", async () => {
    const f = fixture({ isRestricted: true });
    f.pageMembers = [{ userId: "teamGuy", pageId: "pg", role: "superuser" }];
    const viewers = await expectParity(f, testPage({ projectId: "p1" }));
    expect(viewers.map((v) => v.userId)).not.toContain("teamGuy");
  });

  it("a Row of a Database follows the grants on the page that holds it", async () => {
    const holder = testPage({ projectId: "p1" });
    const f = fixture({ isRestricted: true });
    f.pageMembers = [{ userId: "teamGuy", pageId: "pg", role: "editor" }];
    f.databases = [{ id: "db1", page: holder }];
    const row = testPage({ id: "row1", databaseId: "db1", createdById: "stranger" });
    const viewers = await expectParity(f, row);
    expect(viewers.map((v) => v.userId)).toContain("teamGuy");
    expect(viewers.map((v) => v.userId)).not.toContain("stranger");
    expect(await editors(f, row)).toContain("teamGuy");
  });
});

describe("buildKnowledgePageAccessWhere", () => {
  // The SQL twin is checked against a real DB in page.integration.test.ts;
  // here we pin the grant branch's shape: outside the mode switch, and
  // bounded by workspace membership.
  it("admits grantees in every mode, while they belong to the workspace", () => {
    const where = JSON.stringify(buildKnowledgePageAccessWhere("u1"));
    expect(where).toContain('{"AND":[{"members":{"some":{"userId":"u1"}}},{"workspace"');
    expect(where).not.toContain('{"isInviteOnly":true}');
  });
});
