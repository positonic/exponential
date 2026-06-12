/**
 * Transcription (Meeting) Access Resolver
 *
 * Single source of truth for Meeting visibility (see CONTEXT.md "Meeting
 * visibility"). A user can view a Meeting when any of these hold:
 * - They created it (session owner).
 * - They are a linked Participant on it — attendance trumps project
 *   restriction: someone who was in the room may view the Meeting even when
 *   it sits in a restricted project they can't otherwise access. View only;
 *   attendance never grants edit.
 * - It is assigned to a project they can access (project access is
 *   authoritative — a workspace member without project access is denied).
 * - It has no project and they are a member of its workspace (any role may
 *   view; edit requires a non-viewer role).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { WorkspaceRole } from "../types";
import {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
  buildProjectAccessWhere,
} from "./projectResolver";
import {
  getWorkspaceMembership,
  buildWorkspaceAccessWhere,
} from "./workspaceResolver";

export interface TranscriptionAccessInfo {
  isOwner: boolean;
  isParticipant: boolean;
  /** Whether the session is assigned to a project. */
  hasProject: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  /** Workspace role for project-less sessions; null when not a member. */
  workspaceRole: WorkspaceRole | null;
}

export async function getTranscriptionAccess(
  db: PrismaClient,
  userId: string,
  session: {
    id: string;
    userId: string | null;
    projectId: string | null;
    workspaceId: string | null;
  },
): Promise<TranscriptionAccessInfo> {
  const isOwner = !!session.userId && session.userId === userId;

  const participant = await db.transcriptionSessionParticipant.findFirst({
    where: { transcriptionSessionId: session.id, userId },
    select: { id: true },
  });

  let projectAccess = null;
  if (session.projectId) {
    projectAccess = await getProjectAccess(db, userId, session.projectId);
  }

  let workspaceRole: WorkspaceRole | null = null;
  if (!session.projectId && session.workspaceId) {
    const membership = await getWorkspaceMembership(
      db,
      userId,
      session.workspaceId,
    );
    workspaceRole = membership?.role ?? null;
  }

  return {
    isOwner,
    isParticipant: !!participant,
    hasProject: !!session.projectId,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    workspaceRole,
  };
}

/** Check if user can view this transcription session. */
export function canViewTranscription(access: TranscriptionAccessInfo): boolean {
  if (access.isOwner) return true;
  // Attendance trumps restriction — view only.
  if (access.isParticipant) return true;
  // Project access is authoritative for project-assigned sessions.
  if (access.hasProject) return access.hasProjectAccess;
  // Project-less sessions: any workspace member (any role) may view.
  return access.workspaceRole !== null;
}

/** Check if user can edit this transcription session. */
export function canEditTranscription(access: TranscriptionAccessInfo): boolean {
  if (access.isOwner) return true;
  if (access.hasProject) return access.canEditProject;
  // Project-less sessions: workspace members may edit, except viewers
  // (viewer is a read-only role).
  return access.workspaceRole !== null && access.workspaceRole !== "viewer";
}

/**
 * Prisma WHERE clause for transcription sessions a user can access.
 *
 * Use for every bulk/aggregate read over Meetings (list, weekly stats,
 * related-meeting search) so all surfaces show the same set. Mirrors
 * `getTranscriptionAccess` exactly.
 */
export function buildTranscriptionAccessWhere(
  userId: string,
): Prisma.TranscriptionSessionWhereInput {
  return {
    OR: [
      // Session owner
      { userId },
      // Attendance: linked Participant on the session
      { participants: { some: { userId } } },
      // Project-assigned sessions: project access is authoritative
      { project: buildProjectAccessWhere(userId) },
      // Project-less sessions: workspace membership (direct or via team)
      {
        AND: [
          { projectId: null },
          { workspace: buildWorkspaceAccessWhere(userId) },
        ],
      },
    ],
  };
}
