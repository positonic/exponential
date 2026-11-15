import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// `actionResolver` pulls in `~/server/db` transitively, which validates env at
// module load. Seed the minimum before imports (same as permissions.test.ts).
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import {
  buildActionAccessWhere,
  buildActionEditWhere,
  buildActionDeleteWhere,
  canEditAction,
  canViewAction,
  checkActionPermission,
} from "../resolvers/actionResolver";
import {
  buildProjectEditWhere,
  canEditProject,
  hasProjectAccess,
  isProjectInsider,
} from "../resolvers/projectResolver";
import type { ProjectAccess, ProjectMemberRole, WorkspaceRole } from "../types";
import { matchesWhere } from "~/test/prismaWhere";

/**
 * The bulk action writes (`bulkDelete`, `bulkReschedule`, `bulkDefer`,
 * `bulkAssignProject`, `assign`, `unassign`) scope their `updateMany` /
 * `deleteMany` with these builders. They must admit exactly the rows the
 * per-row checks (`canEditAction`, `checkActionPermission(…, "delete")`)
 * would — a looser clause lets a write reach rows the single-action path
 * refuses.
 */

const ME = "me";
const OTHER = "other";

type DirectWorkspaceRole = Exclude<WorkspaceRole, "guest">;

interface WorkspaceRow {
  members: { userId: string; role: DirectWorkspaceRole }[];
  teams: { members: { userId: string }[] }[];
}

interface ProjectRow {
  createdById: string;
  isPublic: boolean;
  isRestricted: boolean;
  projectMembers: { userId: string; role: ProjectMemberRole }[];
  team: { members: { userId: string }[] } | null;
  workspaceId: string | null;
  workspace: WorkspaceRow | null;
}

interface ActionRow {
  createdById: string;
  /**
   * The creator's agent row. Null when a person created the action; when an
   * agent did (its shadow user is `createdById`), the person who owns it.
   */
  createdBy: { externalAgentShadow: { ownerId: string } | null };
  assignees: { userId: string }[];
  /** The action's own workspace; rows written before the column have none. */
  workspaceId: string | null;
  workspace: WorkspaceRow | null;
  projectId: string | null;
  project: ProjectRow | null;
}

const byPerson: ActionRow["createdBy"] = { externalAgentShadow: null };
const byAgentOf = (ownerId: string): ActionRow["createdBy"] => ({
  externalAgentShadow: { ownerId },
});

/** Keeps `workspaceId` in step with `workspace`, as a real row's are. */
function project(overrides: Partial<Omit<ProjectRow, "workspaceId">> = {}): ProjectRow {
  const row = {
    createdById: OTHER,
    isPublic: false,
    isRestricted: false,
    projectMembers: [],
    team: null,
    workspace: { members: [], teams: [] },
    ...overrides,
  };
  return { ...row, workspaceId: row.workspace ? "ws-project" : null };
}

/**
 * An action in `project` (default: an unrestricted one). `workspace` is the
 * action's own; left out, the action names none and its project's applies.
 */
function action(
  overrides: Partial<Omit<ActionRow, "workspaceId" | "projectId">> = {},
): ActionRow {
  const row = {
    createdById: OTHER,
    createdBy: byPerson,
    assignees: [],
    workspace: null,
    project: project(),
    ...overrides,
  };
  return {
    ...row,
    workspaceId: row.workspace ? "ws-action" : null,
    projectId: row.project ? "p1" : null,
  };
}

function inWorkspace(role: DirectWorkspaceRole): WorkspaceRow {
  return { members: [{ userId: ME, role }], teams: [] };
}

/** ME's role in a workspace, by `getWorkspaceMembership`'s rule: a direct row wins. */
function roleIn(w: WorkspaceRow | null): WorkspaceRole | undefined {
  const direct = w?.members.find((m) => m.userId === ME);
  const viaTeam = w?.teams.some((t) => t.members.some((m) => m.userId === ME));
  return direct?.role ?? (viaTeam ? "member" : undefined);
}

/**
 * What `getProjectAccess` resolves for ME from this row — including
 * `getWorkspaceMembership`'s rule that a direct WorkspaceUser row wins over
 * team-via-workspace access (which resolves to `member`).
 */
function projectAccessOf(p: ProjectRow): ProjectAccess {
  const member = p.projectMembers.find((m) => m.userId === ME);
  const workspaceRole = roleIn(p.workspace);
  return {
    isCreator: p.createdById === ME,
    isMember: !!member,
    memberRole: member?.role,
    isTeamMember: !!p.team?.members.some((m) => m.userId === ME),
    isWorkspaceMember: !!workspaceRole,
    workspaceRole,
    isPublic: p.isPublic,
    isRestricted: p.isRestricted,
  };
}

function actionAccessOf(a: ActionRow) {
  const pa = a.project ? projectAccessOf(a.project) : null;
  // What `getActionAccess` resolves for the agent-owner path: the action's
  // workspace is its own, else its project's; with neither, owning the agent
  // is enough.
  const ownsCreatorAgent = a.createdBy.externalAgentShadow?.ownerId === ME;
  const actionWorkspace = a.workspaceId !== null ? a.workspace : (a.project?.workspace ?? null);
  const role = roleIn(actionWorkspace);
  return {
    isCreator: a.createdById === ME,
    hasAgentOwnerAccess: ownsCreatorAgent && (actionWorkspace === null || role !== undefined),
    canEditAsAgentOwner:
      ownsCreatorAgent && (actionWorkspace === null || (role !== undefined && role !== "viewer")),
    isAssignee: a.assignees.some((x) => x.userId === ME),
    hasProjectAccess: pa ? hasProjectAccess(pa) : false,
    canEditProject: pa ? canEditProject(pa) : false,
    isProjectInsider: pa ? isProjectInsider(pa) : false,
  };
}

const canEdit = (a: ActionRow) => matchesWhere({ ...a }, buildActionEditWhere(ME));
const canDelete = (a: ActionRow) => matchesWhere({ ...a }, buildActionDeleteWhere(ME));
const canRead = (a: ActionRow) => matchesWhere({ ...a }, buildActionAccessWhere(ME));

// ── Arbitraries ─────────────────────────────────────────────────────

const userArb = fc.constantFrom(ME, OTHER);
const membersArb = fc.boolean().map((has) => (has ? [{ userId: ME }] : []));

const workspaceArb: fc.Arbitrary<WorkspaceRow | null> = fc.option(
  fc.record({
    members: fc
      .option(fc.constantFrom<DirectWorkspaceRole>("viewer", "member", "admin", "owner"), {
        nil: undefined,
      })
      .map((role) => (role ? [{ userId: ME, role }] : [])),
    teams: fc.boolean().map((has) => (has ? [{ members: [{ userId: ME }] }] : [])),
  }),
  { nil: null },
);

const projectArb: fc.Arbitrary<ProjectRow> = fc
  .record({
    createdById: userArb,
    isPublic: fc.boolean(),
    isRestricted: fc.boolean(),
    projectMembers: fc.option(fc.constantFrom<ProjectMemberRole>("viewer", "editor", "admin"), {
      nil: undefined,
    }).map((role) => (role ? [{ userId: ME, role }] : [])),
    team: fc.option(fc.record({ members: membersArb }), { nil: null }),
    workspace: workspaceArb,
  })
  .map((p) => project(p));

// Who wrote the row: ME, another person, or an agent's shadow user, whose
// owner is ME or someone else. A shadow user is never a person's own id.
const AGENT = "agent-shadow";
const creatorArb: fc.Arbitrary<Pick<ActionRow, "createdById" | "createdBy">> = fc.oneof(
  userArb.map((createdById) => ({ createdById, createdBy: byPerson })),
  userArb.map((ownerId) => ({ createdById: AGENT, createdBy: byAgentOf(ownerId) })),
);

// The action's own workspace is drawn independently of its project's, so the
// properties also cover rows that name no workspace and inherit the project's.
const actionArb: fc.Arbitrary<ActionRow> = fc
  .tuple(
    creatorArb,
    fc.record({
      assignees: membersArb,
      workspace: workspaceArb,
      project: fc.option(projectArb, { nil: null }),
    }),
  )
  .map(([creator, rest]) => action({ ...creator, ...rest }));

// ── Mirror properties ───────────────────────────────────────────────

describe("buildActionAccessWhere mirrors canViewAction", () => {
  it("admits a row iff the per-row view check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canRead(a)).toBe(canViewAction(actionAccessOf(a)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildActionEditWhere mirrors canEditAction", () => {
  it("admits a row iff the per-row edit check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canEdit(a)).toBe(canEditAction(actionAccessOf(a)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildActionDeleteWhere mirrors checkActionPermission('delete')", () => {
  it("admits a row iff the per-row delete check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canDelete(a)).toBe(checkActionPermission(actionAccessOf(a), "delete"));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildProjectEditWhere mirrors canEditProject", () => {
  it("admits a project iff the per-row edit check does", () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        expect(matchesWhere({ ...p }, buildProjectEditWhere(ME))).toBe(
          canEditProject(projectAccessOf(p)),
        );
      }),
      { numRuns: 2000 },
    );
  });
});

// ── The cases the read clause got wrong ─────────────────────────────

describe("write scoping vs the read clause", () => {
  it("public-project outsider can read but not edit or delete", () => {
    const a = action({ project: project({ isPublic: true, workspace: null }) });
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("workspace viewer can read but not edit or delete", () => {
    const a = action({ project: project({ workspace: inWorkspace("viewer") }) });
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("workspace viewer stays a viewer even when in a team linked to the workspace", () => {
    const a = action({
      project: project({
        workspace: {
          members: [{ userId: ME, role: "viewer" }],
          teams: [{ members: [{ userId: ME }] }],
        },
      }),
    });
    expect(canEdit(a)).toBe(false);
  });

  it.each<DirectWorkspaceRole>(["member", "admin", "owner"])(
    "workspace %s can edit and delete",
    (role) => {
      const a = action({ project: project({ workspace: inWorkspace(role) }) });
      expect(canEdit(a)).toBe(true);
      expect(canDelete(a)).toBe(true);
    },
  );

  it("team-via-workspace access (no direct row) edits as member", () => {
    const a = action({
      project: project({ workspace: { members: [], teams: [{ members: [{ userId: ME }] }] } }),
    });
    expect(canEdit(a)).toBe(true);
  });

  it("member of the project's own team edits even as a workspace viewer", () => {
    const a = action({
      project: project({ team: { members: [{ userId: ME }] }, workspace: inWorkspace("viewer") }),
    });
    expect(canEdit(a)).toBe(true);
  });

  it("assignee can edit but not hard-delete", () => {
    const a = action({ assignees: [{ userId: ME }], project: project({ isPublic: true }) });
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(false);
  });

  it("creator can edit and delete a project-less action", () => {
    const a = action({ createdById: ME, project: null });
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(true);
  });

  // What an MCP `actions.create` with a workspace, no project and no assignee
  // writes, as seen by ME in `workspace`.
  const agentCreated = (ownerId: string, workspace: WorkspaceRow | null) =>
    action({ createdById: AGENT, createdBy: byAgentOf(ownerId), workspace, project: null });

  it.each<DirectWorkspaceRole>(["member", "admin", "owner"])(
    "the owner of the agent that created a project-less action reads, edits and deletes it as a workspace %s",
    (role) => {
      const a = agentCreated(ME, inWorkspace(role));
      expect(canRead(a)).toBe(true);
      expect(canEdit(a)).toBe(true);
      expect(canDelete(a)).toBe(true);
    },
  );

  it("the agent's owner loses the action with the workspace: removal ends the path", () => {
    const a = agentCreated(ME, { members: [], teams: [] });
    expect(canRead(a)).toBe(false);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("the agent's owner, demoted to workspace viewer, still reads it but does not write", () => {
    const a = agentCreated(ME, inWorkspace("viewer"));
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("an agent-created action in no workspace follows the agent's owner", () => {
    const a = agentCreated(ME, null);
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(true);
  });

  it("an older row with no workspace of its own is judged by its project's workspace", () => {
    const left = action({
      createdById: AGENT,
      createdBy: byAgentOf(ME),
      project: project({ isRestricted: true, workspace: { members: [], teams: [] } }),
    });
    expect(canRead(left)).toBe(false);
    expect(canEdit(left)).toBe(false);
  });

  it("someone else's agent grants nothing, whatever the caller's workspace role", () => {
    const projectLess = agentCreated(OTHER, inWorkspace("owner"));
    expect(canRead(projectLess)).toBe(false);
    expect(canEdit(projectLess)).toBe(false);
    expect(canDelete(projectLess)).toBe(false);

    // In a restricted project the caller cannot reach, owning the workspace's
    // other agents is not a way in either.
    const restricted = action({
      createdById: AGENT,
      createdBy: byAgentOf(OTHER),
      project: project({ isRestricted: true, workspace: inWorkspace("member") }),
    });
    expect(canRead(restricted)).toBe(false);
  });

  it("restricted project: workspace member is refused, owner escape hatch allowed", () => {
    const asMember = action({
      project: project({ isRestricted: true, workspace: inWorkspace("member") }),
    });
    const asOwner = action({
      project: project({ isRestricted: true, workspace: inWorkspace("owner") }),
    });
    expect(canEdit(asMember)).toBe(false);
    expect(canEdit(asOwner)).toBe(true);
  });

  it("never grants a write through isPublic", () => {
    const mentionsPublic = (v: unknown): boolean =>
      typeof v === "object" && v !== null &&
      Object.entries(v).some(([k, x]) => k === "isPublic" || mentionsPublic(x));
    expect(mentionsPublic(buildActionEditWhere(ME))).toBe(false);
    expect(mentionsPublic(buildActionDeleteWhere(ME))).toBe(false);
  });
});
