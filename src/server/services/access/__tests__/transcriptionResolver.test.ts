/**
 * Unit tests for the transcription (Meeting) access resolver — the single
 * source of truth for Meeting visibility (CONTEXT.md "Meeting visibility").
 *
 * Pure-function tests over the predicate helpers plus shape assertions on
 * the bulk WHERE builder. No DB.
 */

import { describe, it, expect } from "vitest";

import {
  canViewTranscription,
  canEditTranscription,
  buildTranscriptionAccessWhere,
  type TranscriptionAccessInfo,
} from "../resolvers/transcriptionResolver";

function access(
  overrides: Partial<TranscriptionAccessInfo>,
): TranscriptionAccessInfo {
  return {
    isOwner: false,
    isParticipant: false,
    hasProject: false,
    hasProjectAccess: false,
    canEditProject: false,
    workspaceRole: null,
    ...overrides,
  };
}

describe("canViewTranscription", () => {
  it("owner can always view", () => {
    expect(canViewTranscription(access({ isOwner: true }))).toBe(true);
  });

  it("attendance trumps project restriction — participant views even without project access", () => {
    expect(
      canViewTranscription(
        access({ isParticipant: true, hasProject: true, hasProjectAccess: false }),
      ),
    ).toBe(true);
  });

  it("project access is authoritative for project-assigned sessions", () => {
    expect(
      canViewTranscription(access({ hasProject: true, hasProjectAccess: true })),
    ).toBe(true);
    // Workspace membership does NOT rescue a denied project path.
    expect(
      canViewTranscription(
        access({ hasProject: true, hasProjectAccess: false, workspaceRole: "member" }),
      ),
    ).toBe(false);
  });

  it("project-less sessions: any workspace role can view, including viewer", () => {
    expect(canViewTranscription(access({ workspaceRole: "viewer" }))).toBe(true);
    expect(canViewTranscription(access({ workspaceRole: "member" }))).toBe(true);
    expect(canViewTranscription(access({ workspaceRole: null }))).toBe(false);
  });
});

describe("canEditTranscription", () => {
  it("owner can always edit", () => {
    expect(canEditTranscription(access({ isOwner: true }))).toBe(true);
  });

  it("attendance never grants edit", () => {
    expect(canEditTranscription(access({ isParticipant: true }))).toBe(false);
    expect(
      canEditTranscription(
        access({ isParticipant: true, hasProject: true, hasProjectAccess: true }),
      ),
    ).toBe(false);
  });

  it("project-assigned sessions require project edit access", () => {
    expect(
      canEditTranscription(access({ hasProject: true, canEditProject: true })),
    ).toBe(true);
    expect(
      canEditTranscription(
        access({ hasProject: true, canEditProject: false, workspaceRole: "owner" }),
      ),
    ).toBe(false);
  });

  it("project-less sessions: workspace members can edit, viewers cannot", () => {
    expect(canEditTranscription(access({ workspaceRole: "member" }))).toBe(true);
    expect(canEditTranscription(access({ workspaceRole: "admin" }))).toBe(true);
    expect(canEditTranscription(access({ workspaceRole: "viewer" }))).toBe(false);
    expect(canEditTranscription(access({ workspaceRole: null }))).toBe(false);
  });
});

describe("buildTranscriptionAccessWhere", () => {
  const where = buildTranscriptionAccessWhere("u1");
  const or = where.OR!;

  it("grants the owner path", () => {
    expect(or).toContainEqual({ userId: "u1" });
  });

  it("grants the participant (attendance) path unconditionally", () => {
    expect(or).toContainEqual({ participants: { some: { userId: "u1" } } });
  });

  it("scopes project-less sessions to workspace membership", () => {
    const projectless = or.find(
      (c) => Array.isArray((c as { AND?: unknown[] }).AND),
    ) as { AND: Array<Record<string, unknown>> };
    expect(projectless.AND).toContainEqual({ projectId: null });
  });

  it("delegates project-assigned sessions to the project access rule (restriction-aware)", () => {
    const projectClause = or.find(
      (c) => (c as { project?: unknown }).project,
    ) as { project: { OR: Array<Record<string, unknown>> } };
    // Restricted projects must only match via the owner/admin escape hatch.
    const restricted = projectClause.project.OR.find((c) =>
      JSON.stringify(c).includes('"isRestricted":true'),
    );
    expect(JSON.stringify(restricted)).toContain('"owner"');
    expect(JSON.stringify(restricted)).toContain('"admin"');
    expect(JSON.stringify(restricted)).not.toContain('"viewer"');
  });
});
