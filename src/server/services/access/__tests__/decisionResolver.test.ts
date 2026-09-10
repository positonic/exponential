/**
 * Unit tests for the Decision access resolver (ADR-0060 "visibility follows
 * the evidence"). Pure-function tests over the predicate helpers plus shape
 * assertions on the bulk WHERE builder. No DB.
 */

import { describe, it, expect } from "vitest";

import {
  buildDecisionAccessWhere,
  canEditDecision,
  canViewDecision,
  type DecisionAccessInfo,
} from "../resolvers/decisionResolver";

function access(overrides: Partial<DecisionAccessInfo>): DecisionAccessInfo {
  return {
    hasMeeting: false,
    canViewMeeting: false,
    canEditMeeting: false,
    hasProject: false,
    hasProjectAccess: false,
    canEditProject: false,
    workspaceRole: null,
    isDraft: false,
    ...overrides,
  };
}

describe("canViewDecision", () => {
  it("meeting-linked decisions follow the meeting's visibility, restriction included", () => {
    expect(canViewDecision(access({ hasMeeting: true, canViewMeeting: true }))).toBe(true);
    // Workspace membership does NOT rescue a meeting the caller can't see.
    expect(
      canViewDecision(access({ hasMeeting: true, canViewMeeting: false, workspaceRole: "owner" })),
    ).toBe(false);
  });

  it("meeting-less, project-linked decisions narrow to project access", () => {
    expect(canViewDecision(access({ hasProject: true, hasProjectAccess: true }))).toBe(true);
    expect(
      canViewDecision(access({ hasProject: true, hasProjectAccess: false, workspaceRole: "member" })),
    ).toBe(false);
  });

  it("meeting-less, project-less decisions are visible to any workspace role", () => {
    expect(canViewDecision(access({ workspaceRole: "viewer" }))).toBe(true);
    expect(canViewDecision(access({ workspaceRole: "member" }))).toBe(true);
    expect(canViewDecision(access({ workspaceRole: null }))).toBe(false);
  });

  it("drafts are visible only to people who may edit the source meeting", () => {
    expect(
      canViewDecision(access({ isDraft: true, hasMeeting: true, canViewMeeting: true, canEditMeeting: true })),
    ).toBe(true);
    expect(
      canViewDecision(access({ isDraft: true, hasMeeting: true, canViewMeeting: true, canEditMeeting: false })),
    ).toBe(false);
    // A draft without a meeting has no draft view to live in.
    expect(canViewDecision(access({ isDraft: true, workspaceRole: "owner" }))).toBe(false);
  });
});

describe("canEditDecision", () => {
  it("meeting-linked decisions require meeting edit access", () => {
    expect(canEditDecision(access({ hasMeeting: true, canEditMeeting: true }))).toBe(true);
    expect(
      canEditDecision(access({ hasMeeting: true, canViewMeeting: true, canEditMeeting: false, workspaceRole: "admin" })),
    ).toBe(false);
  });

  it("project-linked decisions require project edit access", () => {
    expect(canEditDecision(access({ hasProject: true, canEditProject: true }))).toBe(true);
    expect(
      canEditDecision(access({ hasProject: true, hasProjectAccess: true, canEditProject: false, workspaceRole: "owner" })),
    ).toBe(false);
  });

  it("workspace-level decisions: members edit, viewers do not", () => {
    expect(canEditDecision(access({ workspaceRole: "member" }))).toBe(true);
    expect(canEditDecision(access({ workspaceRole: "admin" }))).toBe(true);
    expect(canEditDecision(access({ workspaceRole: "viewer" }))).toBe(false);
    expect(canEditDecision(access({ workspaceRole: null }))).toBe(false);
  });
});

describe("buildDecisionAccessWhere", () => {
  const where = buildDecisionAccessWhere("u1", "ws-1");
  const or = where.OR!;

  it("scopes to the workspace and to CONFIRMED rows only — drafts never match a bulk read", () => {
    expect(where.workspaceId).toBe("ws-1");
    expect(where.reviewState).toBe("CONFIRMED");
  });

  it("meeting-linked rows delegate to the transcription resolver", () => {
    const meetingClause = or.find((c) => (c as { transcriptionSession?: unknown }).transcriptionSession) as {
      transcriptionSessionId: unknown;
      transcriptionSession: { OR: unknown[] };
    };
    expect(meetingClause.transcriptionSessionId).toEqual({ not: null });
    // The owner path and the attendance path of ADR-0014 are both present.
    expect(meetingClause.transcriptionSession.OR).toContainEqual({ userId: "u1" });
    expect(meetingClause.transcriptionSession.OR).toContainEqual({
      participants: { some: { userId: "u1" } },
    });
  });

  it("meeting-less project-linked rows delegate to the project access rule (restriction-aware)", () => {
    const projectClause = or.find((c) => (c as { project?: unknown }).project) as {
      transcriptionSessionId: unknown;
      projectId: unknown;
      project: { OR: unknown[] };
    };
    expect(projectClause.transcriptionSessionId).toBeNull();
    expect(projectClause.projectId).toEqual({ not: null });
    const restricted = projectClause.project.OR.find((c) =>
      JSON.stringify(c).includes('"isRestricted":true'),
    );
    expect(JSON.stringify(restricted)).toContain('"owner"');
    expect(JSON.stringify(restricted)).not.toContain('"viewer"');
  });

  it("meeting-less project-less rows require workspace membership (direct or via team)", () => {
    const wsClause = or.find((c) => (c as { workspace?: unknown }).workspace) as {
      transcriptionSessionId: unknown;
      projectId: unknown;
      workspace: { OR: unknown[] };
    };
    expect(wsClause.transcriptionSessionId).toBeNull();
    expect(wsClause.projectId).toBeNull();
    expect(wsClause.workspace.OR).toContainEqual({ members: { some: { userId: "u1" } } });
  });
});
