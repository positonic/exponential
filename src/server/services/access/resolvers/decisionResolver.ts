/**
 * Decision Access Resolver
 *
 * Single source of truth for Decision visibility (ADR-0060 "Visibility
 * follows the evidence"; CONTEXT.md "Decision Log"):
 *
 * - A meeting-linked Decision quotes the meeting's transcript, so it is
 *   readable exactly when the meeting is — through the transcription
 *   resolver (ADR-0014), project restriction and attendance included.
 * - A meeting-less Decision is readable by workspace members; when it is
 *   project-linked, project access is authoritative (a restricted project
 *   narrows it to the project's allowlist).
 * - Editing follows the same paths at edit strength: meeting edit access,
 *   project edit access, or a non-viewer workspace role.
 * - Drafts (`reviewState = DRAFT`) are invisible everywhere except the source
 *   meeting's own views, and only to people who may edit that meeting. The
 *   bulk WHERE therefore matches CONFIRMED rows only; `listForMeeting` adds
 *   drafts per row after a `canEditTranscription` check.
 *
 * Every list/aggregate read over Decisions goes through
 * `buildDecisionAccessWhere`; routers must not carry inline permission logic.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { WorkspaceRole } from "../types";
import {
  buildProjectAccessWhere,
  canEditProject,
  getProjectAccess,
  hasProjectAccess,
} from "./projectResolver";
import {
  buildTranscriptionAccessWhere,
  canEditTranscription,
  canViewTranscription,
  getTranscriptionAccess,
} from "./transcriptionResolver";
import {
  buildWorkspaceAccessWhere,
  canEditWorkspaceContent,
  getWorkspaceMembership,
} from "./workspaceResolver";

export interface DecisionAccessInfo {
  /** Whether the decision is linked to a recorded meeting. */
  hasMeeting: boolean;
  canViewMeeting: boolean;
  canEditMeeting: boolean;
  /** Whether the (meeting-less) decision is linked to a project. */
  hasProject: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  /** Workspace role; null when not a member. */
  workspaceRole: WorkspaceRole | null;
  isDraft: boolean;
}

/** The columns the resolver needs; pass the row you already loaded. */
export interface DecisionAccessSubject {
  workspaceId: string;
  projectId: string | null;
  reviewState: "DRAFT" | "CONFIRMED" | "REJECTED";
  transcriptionSession: {
    id: string;
    userId: string | null;
    projectId: string | null;
    workspaceId: string | null;
  } | null;
}

export async function getDecisionAccess(
  db: PrismaClient,
  userId: string,
  decision: DecisionAccessSubject,
): Promise<DecisionAccessInfo> {
  let canViewMeeting = false;
  let canEditMeeting = false;
  if (decision.transcriptionSession) {
    const meetingAccess = await getTranscriptionAccess(
      db,
      userId,
      decision.transcriptionSession,
    );
    canViewMeeting = canViewTranscription(meetingAccess);
    canEditMeeting = canEditTranscription(meetingAccess);
  }

  let projectAccessInfo = null;
  if (!decision.transcriptionSession && decision.projectId) {
    projectAccessInfo = await getProjectAccess(db, userId, decision.projectId);
  }

  const membership = await getWorkspaceMembership(db, userId, decision.workspaceId);

  return {
    hasMeeting: !!decision.transcriptionSession,
    canViewMeeting,
    canEditMeeting,
    hasProject: !decision.transcriptionSession && !!decision.projectId,
    hasProjectAccess: projectAccessInfo ? hasProjectAccess(projectAccessInfo) : false,
    canEditProject: projectAccessInfo ? canEditProject(projectAccessInfo) : false,
    workspaceRole: membership?.role ?? null,
    isDraft: decision.reviewState === "DRAFT",
  };
}

/** Check if the user can view this decision. */
export function canViewDecision(access: DecisionAccessInfo): boolean {
  // A draft is only visible to people who may edit its source meeting.
  if (access.isDraft) return access.hasMeeting && access.canEditMeeting;
  if (access.hasMeeting) return access.canViewMeeting;
  if (access.hasProject) return access.hasProjectAccess;
  return access.workspaceRole !== null;
}

/** Check if the user can edit (update, change status, link, confirm) this decision. */
export function canEditDecision(access: DecisionAccessInfo): boolean {
  if (access.hasMeeting) return access.canEditMeeting;
  if (access.hasProject) return access.canEditProject;
  return canEditWorkspaceContent(access.workspaceRole);
}

/**
 * Prisma WHERE clause for the CONFIRMED decisions a user can read in a
 * workspace. Use for every bulk read (Decision Log, meeting lists, counts)
 * so all surfaces show the same set. Mirrors `getDecisionAccess` +
 * `canViewDecision` for confirmed rows exactly; drafts are never matched
 * here (see the module comment).
 */
export function buildDecisionAccessWhere(
  userId: string,
  workspaceId: string,
): Prisma.DecisionWhereInput {
  return {
    workspaceId,
    reviewState: "CONFIRMED",
    OR: [
      // Meeting-linked: visibility follows the evidence (ADR-0014 resolver).
      {
        transcriptionSessionId: { not: null },
        transcriptionSession: buildTranscriptionAccessWhere(userId),
      },
      // Meeting-less, project-linked: project access is authoritative.
      {
        transcriptionSessionId: null,
        projectId: { not: null },
        project: buildProjectAccessWhere(userId),
      },
      // Meeting-less, project-less: workspace membership (direct or via team).
      {
        transcriptionSessionId: null,
        projectId: null,
        workspace: buildWorkspaceAccessWhere(userId),
      },
    ],
  };
}
