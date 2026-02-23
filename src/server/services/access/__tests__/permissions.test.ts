import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  hasMinimumWorkspaceRole,
  hasMinimumTeamRole,
  WORKSPACE_ROLE_HIERARCHY,
  TEAM_ROLE_HIERARCHY,
  type WorkspaceRole,
  type TeamRole,
  type ProjectAccess,
} from "../types";

import {
  canViewAction,
  canEditAction,
  checkActionPermission,
  buildActionAccessWhere,
} from "../resolvers/actionResolver";

import {
  hasProjectAccess,
  canEditProject,
} from "../resolvers/projectResolver";

// ── Helpers ──────────────────────────────────────────────────────────

function makeActionAccess(overrides: Partial<{
  isCreator: boolean;
  isAssignee: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  isUnassigned: boolean;
}> = {}) {
  return {
    isCreator: false,
    isAssignee: false,
    hasProjectAccess: false,
    canEditProject: false,
    isUnassigned: false,
    ...overrides,
  };
}

function makeProjectAccess(overrides: Partial<ProjectAccess> = {}): ProjectAccess {
  return {
    isCreator: false,
    isMember: false,
    isTeamMember: false,
    isWorkspaceMember: false,
    isPublic: false,
    ...overrides,
  };
}

// ── hasMinimumWorkspaceRole ──────────────────────────────────────────

describe("hasMinimumWorkspaceRole", () => {
  const roles: WorkspaceRole[] = ["viewer", "member", "admin", "owner"];

  it("viewer meets viewer requirement", () => {
    expect(hasMinimumWorkspaceRole("viewer", "viewer")).toBe(true);
  });

  it("viewer does NOT meet member requirement", () => {
    expect(hasMinimumWorkspaceRole("viewer", "member")).toBe(false);
  });

  it("member meets member requirement", () => {
    expect(hasMinimumWorkspaceRole("member", "member")).toBe(true);
  });

  it("member does NOT meet admin requirement", () => {
    expect(hasMinimumWorkspaceRole("member", "admin")).toBe(false);
  });

  it("admin meets admin requirement", () => {
    expect(hasMinimumWorkspaceRole("admin", "admin")).toBe(true);
  });

  it("owner meets all requirements", () => {
    for (const min of roles) {
      expect(hasMinimumWorkspaceRole("owner", min)).toBe(true);
    }
  });

  // Property-based: actual >= minimum iff hierarchy[actual] >= hierarchy[minimum]
  it("matches hierarchy ordering for all role pairs (fast-check)", () => {
    const roleArb = fc.constantFrom<WorkspaceRole>("viewer", "member", "admin", "owner");
    fc.assert(
      fc.property(roleArb, roleArb, (actual, minimum) => {
        const expected = WORKSPACE_ROLE_HIERARCHY[actual] >= WORKSPACE_ROLE_HIERARCHY[minimum];
        expect(hasMinimumWorkspaceRole(actual, minimum)).toBe(expected);
      })
    );
  });
});

// ── hasMinimumTeamRole ───────────────────────────────────────────────

describe("hasMinimumTeamRole", () => {
  it("member meets member requirement", () => {
    expect(hasMinimumTeamRole("member", "member")).toBe(true);
  });

  it("member does NOT meet admin requirement", () => {
    expect(hasMinimumTeamRole("member", "admin")).toBe(false);
  });

  it("owner meets all requirements", () => {
    const roles: TeamRole[] = ["member", "admin", "owner"];
    for (const min of roles) {
      expect(hasMinimumTeamRole("owner", min)).toBe(true);
    }
  });

  // Property-based
  it("matches hierarchy ordering for all role pairs (fast-check)", () => {
    const roleArb = fc.constantFrom<TeamRole>("member", "admin", "owner");
    fc.assert(
      fc.property(roleArb, roleArb, (actual, minimum) => {
        const expected = TEAM_ROLE_HIERARCHY[actual] >= TEAM_ROLE_HIERARCHY[minimum];
        expect(hasMinimumTeamRole(actual, minimum)).toBe(expected);
      })
    );
  });
});

// ── canViewAction ────────────────────────────────────────────────────

describe("canViewAction", () => {
  it("creator of unassigned action can view", () => {
    expect(canViewAction(makeActionAccess({ isCreator: true, isUnassigned: true }))).toBe(true);
  });

  it("creator of assigned action (not assignee) cannot view", () => {
    expect(canViewAction(makeActionAccess({ isCreator: true, isUnassigned: false }))).toBe(false);
  });

  it("assignee can always view", () => {
    expect(canViewAction(makeActionAccess({ isAssignee: true }))).toBe(true);
  });

  it("user with project access can view", () => {
    expect(canViewAction(makeActionAccess({ hasProjectAccess: true }))).toBe(true);
  });

  it("user with no access paths cannot view", () => {
    expect(canViewAction(makeActionAccess())).toBe(false);
  });
});

// ── canEditAction ────────────────────────────────────────────────────

describe("canEditAction", () => {
  it("creator can always edit", () => {
    expect(canEditAction(makeActionAccess({ isCreator: true }))).toBe(true);
  });

  it("assignee can edit", () => {
    expect(canEditAction(makeActionAccess({ isAssignee: true }))).toBe(true);
  });

  it("project editor can edit", () => {
    expect(canEditAction(makeActionAccess({ canEditProject: true }))).toBe(true);
  });

  it("user with no access paths cannot edit", () => {
    expect(canEditAction(makeActionAccess())).toBe(false);
  });

  it("user with only view-level project access cannot edit", () => {
    expect(canEditAction(makeActionAccess({ hasProjectAccess: true }))).toBe(false);
  });
});

// ── checkActionPermission ────────────────────────────────────────────

describe("checkActionPermission", () => {
  it("view permission delegates to canViewAction", () => {
    expect(checkActionPermission(makeActionAccess({ isAssignee: true }), "view")).toBe(true);
    expect(checkActionPermission(makeActionAccess(), "view")).toBe(false);
  });

  it("edit permission delegates to canEditAction", () => {
    expect(checkActionPermission(makeActionAccess({ isCreator: true }), "edit")).toBe(true);
    expect(checkActionPermission(makeActionAccess(), "edit")).toBe(false);
  });

  it("assign permission delegates to canEditAction", () => {
    expect(checkActionPermission(makeActionAccess({ isCreator: true }), "assign")).toBe(true);
    expect(checkActionPermission(makeActionAccess(), "assign")).toBe(false);
  });

  it("delete requires creator or project editor", () => {
    expect(checkActionPermission(makeActionAccess({ isCreator: true }), "delete")).toBe(true);
    expect(checkActionPermission(makeActionAccess({ canEditProject: true }), "delete")).toBe(true);
    expect(checkActionPermission(makeActionAccess({ isAssignee: true }), "delete")).toBe(false);
  });

  it("admin requires creator or project editor", () => {
    expect(checkActionPermission(makeActionAccess({ isCreator: true }), "admin")).toBe(true);
    expect(checkActionPermission(makeActionAccess({ canEditProject: true }), "admin")).toBe(true);
    expect(checkActionPermission(makeActionAccess({ isAssignee: true }), "admin")).toBe(false);
  });

  it("manage_members returns false (not applicable to actions)", () => {
    expect(checkActionPermission(makeActionAccess({ isCreator: true }), "manage_members")).toBe(false);
  });
});

// ── buildActionAccessWhere ───────────────────────────────────────────

describe("buildActionAccessWhere", () => {
  it("returns OR clause with 8 access paths", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where).toHaveProperty("OR");
    expect(where.OR).toHaveLength(8);
  });

  it("includes creator+unassigned path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[0]).toEqual({ createdById: "user-123", assignees: { none: {} } });
  });

  it("includes assigned-to-user path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[1]).toEqual({ assignees: { some: { userId: "user-123" } } });
  });

  it("includes project creator path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[2]).toEqual({ project: { createdById: "user-123" } });
  });

  it("includes public project path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[5]).toEqual({ project: { isPublic: true } });
  });

  it("includes workspace member path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[6]).toEqual({
      project: { workspace: { members: { some: { userId: "user-123" } } } },
    });
  });

  it("includes team-based workspace member path", () => {
    const where = buildActionAccessWhere("user-123");
    expect(where.OR[7]).toEqual({
      project: { workspace: { teams: { some: { members: { some: { userId: "user-123" } } } } } },
    });
  });
});

// ── hasProjectAccess ─────────────────────────────────────────────────

describe("hasProjectAccess", () => {
  it("returns false when no access paths are true", () => {
    expect(hasProjectAccess(makeProjectAccess())).toBe(false);
  });

  it("returns true for creator", () => {
    expect(hasProjectAccess(makeProjectAccess({ isCreator: true }))).toBe(true);
  });

  it("returns true for direct member", () => {
    expect(hasProjectAccess(makeProjectAccess({ isMember: true }))).toBe(true);
  });

  it("returns true for team member", () => {
    expect(hasProjectAccess(makeProjectAccess({ isTeamMember: true }))).toBe(true);
  });

  it("returns true for workspace member", () => {
    expect(hasProjectAccess(makeProjectAccess({ isWorkspaceMember: true }))).toBe(true);
  });

  it("returns true for public project", () => {
    expect(hasProjectAccess(makeProjectAccess({ isPublic: true }))).toBe(true);
  });
});

// ── canEditProject ───────────────────────────────────────────────────

describe("canEditProject", () => {
  it("creator can edit", () => {
    expect(canEditProject(makeProjectAccess({ isCreator: true }))).toBe(true);
  });

  it("workspace owner can edit", () => {
    expect(canEditProject(makeProjectAccess({ isWorkspaceMember: true, workspaceRole: "owner" }))).toBe(true);
  });

  it("workspace admin can edit", () => {
    expect(canEditProject(makeProjectAccess({ isWorkspaceMember: true, workspaceRole: "admin" }))).toBe(true);
  });

  it("workspace member (not admin) cannot edit", () => {
    expect(canEditProject(makeProjectAccess({ isWorkspaceMember: true, workspaceRole: "member" }))).toBe(false);
  });

  it("team owner can edit", () => {
    expect(canEditProject(makeProjectAccess({ isTeamMember: true, teamRole: "owner" }))).toBe(true);
  });

  it("team admin can edit", () => {
    expect(canEditProject(makeProjectAccess({ isTeamMember: true, teamRole: "admin" }))).toBe(true);
  });

  it("team member (not admin) cannot edit", () => {
    expect(canEditProject(makeProjectAccess({ isTeamMember: true, teamRole: "member" }))).toBe(false);
  });

  it("direct project member (no special role) cannot edit", () => {
    expect(canEditProject(makeProjectAccess({ isMember: true }))).toBe(false);
  });

  it("public project visitor cannot edit", () => {
    expect(canEditProject(makeProjectAccess({ isPublic: true }))).toBe(false);
  });
});
