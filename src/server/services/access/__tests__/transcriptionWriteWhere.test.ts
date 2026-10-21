import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// `transcriptionResolver` pulls in `~/server/db` transitively, which validates
// env at module load. Seed the minimum before imports (as actionWriteWhere does).
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import {
  buildTranscriptionAccessWhere,
  buildTranscriptionEditWhere,
  canEditTranscription,
  canViewTranscription,
  type TranscriptionAccessInfo,
} from "../resolvers/transcriptionResolver";
import { canEditProject, hasProjectAccess } from "../resolvers/projectResolver";
import type { ProjectAccess, ProjectMemberRole, WorkspaceRole } from "../types";
import { matchesWhere } from "~/test/prismaWhere";

/**
 * `bulkArchiveTranscriptions` and `bulkDeleteTranscriptions` scope their
 * `updateMany` / `deleteMany` with `buildTranscriptionEditWhere`. It must
 * admit exactly the rows the per-row `ensureTranscriptionAccess(…, "edit")`
 * path (`canEditTranscription` over `getTranscriptionAccess`) would — a
 * looser clause lets a bulk write reach meetings the single-meeting path
 * refuses, a tighter one silently skips meetings the page lets you archive.
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
  workspace: WorkspaceRow | null;
}

interface SessionRow {
  userId: string | null;
  projectId: string | null;
  project: ProjectRow | null;
  workspaceId: string | null;
  workspace: WorkspaceRow | null;
  participants: { userId: string }[];
}

/** `getWorkspaceMembership`: a direct WorkspaceUser row wins over team access. */
function workspaceRoleOf(w: WorkspaceRow | null): WorkspaceRole | null {
  if (!w) return null;
  const direct = w.members.find((m) => m.userId === ME);
  if (direct) return direct.role;
  return w.teams.some((t) => t.members.some((m) => m.userId === ME)) ? "member" : null;
}

function projectAccessOf(p: ProjectRow): ProjectAccess {
  const member = p.projectMembers.find((m) => m.userId === ME);
  const workspaceRole = workspaceRoleOf(p.workspace) ?? undefined;
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

/** What `getTranscriptionAccess` resolves for ME from this row. */
function accessOf(s: SessionRow): TranscriptionAccessInfo {
  const pa = s.project ? projectAccessOf(s.project) : null;
  return {
    isOwner: !!s.userId && s.userId === ME,
    isParticipant: s.participants.some((p) => p.userId === ME),
    hasProject: !!s.projectId,
    hasProjectAccess: pa ? hasProjectAccess(pa) : false,
    canEditProject: pa ? canEditProject(pa) : false,
    // Only resolved for project-less sessions, like the resolver.
    workspaceRole: !s.projectId && s.workspaceId ? workspaceRoleOf(s.workspace) : null,
  };
}

const bulkCanEdit = (s: SessionRow) => matchesWhere({ ...s }, buildTranscriptionEditWhere(ME));
const bulkCanView = (s: SessionRow) => matchesWhere({ ...s }, buildTranscriptionAccessWhere(ME));

// ── Arbitraries ─────────────────────────────────────────────────────

const userArb = fc.constantFrom(ME, OTHER);
const membersArb = fc.boolean().map((has) => (has ? [{ userId: ME }] : []));

const workspaceArb: fc.Arbitrary<WorkspaceRow> = fc.record({
  members: fc
    .option(fc.constantFrom<DirectWorkspaceRole>("viewer", "member", "admin", "owner"), {
      nil: undefined,
    })
    .map((role) => (role ? [{ userId: ME, role }] : [])),
  teams: fc.boolean().map((has) => (has ? [{ members: [{ userId: ME }] }] : [])),
});

const projectArb: fc.Arbitrary<ProjectRow> = fc.record({
  createdById: userArb,
  isPublic: fc.boolean(),
  isRestricted: fc.boolean(),
  projectMembers: fc
    .option(fc.constantFrom<ProjectMemberRole>("viewer", "editor", "admin"), { nil: undefined })
    .map((role) => (role ? [{ userId: ME, role }] : [])),
  team: fc.option(fc.record({ members: membersArb }), { nil: null }),
  workspace: fc.option(workspaceArb, { nil: null }),
});

// `projectId` and `project` move together, as do `workspaceId` and `workspace`.
const sessionArb: fc.Arbitrary<SessionRow> = fc
  .record({
    userId: fc.option(userArb, { nil: null }),
    project: fc.option(projectArb, { nil: null }),
    workspace: fc.option(workspaceArb, { nil: null }),
    participants: membersArb,
  })
  .map(({ userId, project, workspace, participants }) => ({
    userId,
    projectId: project ? "p1" : null,
    project,
    workspaceId: workspace ? "w1" : null,
    workspace,
    participants,
  }));

// ── Mirror properties ───────────────────────────────────────────────

describe("buildTranscriptionEditWhere mirrors canEditTranscription", () => {
  it("admits a row iff the per-row edit check does", () => {
    fc.assert(
      fc.property(sessionArb, (s) => {
        expect(bulkCanEdit(s)).toBe(canEditTranscription(accessOf(s)));
      }),
      { numRuns: 3000 },
    );
  });

  it("never admits a row the read clause refuses", () => {
    fc.assert(
      fc.property(sessionArb, (s) => {
        if (bulkCanEdit(s)) expect(bulkCanView(s)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });
});

describe("buildTranscriptionAccessWhere mirrors canViewTranscription", () => {
  it("admits a row iff the per-row view check does", () => {
    fc.assert(
      fc.property(sessionArb, (s) => {
        expect(bulkCanView(s)).toBe(canViewTranscription(accessOf(s)));
      }),
      { numRuns: 3000 },
    );
  });
});

// ── The cases the owner-only scoping got wrong ───────────────────────

describe("bulk edit scoping vs ownership", () => {
  const projectless = (workspace: WorkspaceRow | null, userId = OTHER): SessionRow => ({
    userId,
    projectId: null,
    project: null,
    workspaceId: workspace ? "w1" : null,
    workspace,
    participants: [],
  });

  it("a workspace member can bulk-archive a project-less meeting they do not own", () => {
    expect(bulkCanEdit(projectless({ members: [{ userId: ME, role: "member" }], teams: [] }))).toBe(
      true,
    );
  });

  it("a workspace viewer cannot, even as an attendee", () => {
    const s = projectless({ members: [{ userId: ME, role: "viewer" }], teams: [] });
    expect(bulkCanEdit({ ...s, participants: [{ userId: ME }] })).toBe(false);
    expect(bulkCanView({ ...s, participants: [{ userId: ME }] })).toBe(true);
  });

  it("a plain member cannot reach a meeting in a restricted project; an admin can", () => {
    const restricted = (role: DirectWorkspaceRole): SessionRow => ({
      userId: OTHER,
      projectId: "p1",
      project: {
        createdById: OTHER,
        isPublic: false,
        isRestricted: true,
        projectMembers: [],
        team: null,
        workspace: { members: [{ userId: ME, role }], teams: [] },
      },
      workspaceId: "w1",
      workspace: { members: [{ userId: ME, role }], teams: [] },
      participants: [],
    });
    expect(bulkCanEdit(restricted("member"))).toBe(false);
    expect(bulkCanEdit(restricted("admin"))).toBe(true);
  });
});
