import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  getProjectAccess,
  canEditProject,
  getTranscriptionAccess,
  canEditTranscription,
} from "~/server/services/access";

/**
 * The single way a Meeting gets placed.
 *
 * Placing a Meeting onto a Project is **project-authoritative**: the Meeting's
 * Workspace is derived from the chosen Project, never set independently. A null
 * `projectId` clears both Project and Workspace (the "Personal / no project"
 * case). In every case the Meeting's extracted Actions are re-homed with it:
 * an Action from a Meeting never sits in a different Workspace than its Meeting
 * (see CONTEXT.md). This module is the canonical home of that invariant —
 * `assignProject`, `bulkAssignProject`, and the detail page's placement write
 * all delegate here so there is exactly one placement path.
 *
 * Deep module: pure server logic, no tRPC procedure types and no React in the
 * interface. Errors surface as `TRPCError` to preserve the existing FORBIDDEN /
 * NOT_FOUND contract the routers already expose.
 */
export type MeetingPlacementScope = "owner" | "editable";

export interface AssignMeetingPlacementInput {
  /** Meetings (`TranscriptionSession` ids) to place. */
  meetingIds: string[];
  /** Target project, or null to clear placement to Personal / no project. */
  projectId: string | null;
  /**
   * Access semantics for the set:
   * - `"owner"` — only Meetings owned by `userId` are ever touched (the narrow
   *   bulk semantics; silently skips Meetings the caller doesn't own).
   * - `"editable"` — every requested Meeting must pass the canonical edit-access
   *   resolver (ADR-0014) or the whole call fails FORBIDDEN (single-meeting
   *   semantics, where a non-owner with project/workspace edit rights may place).
   */
  scope: MeetingPlacementScope;
}

export interface AssignMeetingPlacementResult {
  /** Number of Meetings actually re-homed. */
  count: number;
  /** The placement applied — workspace resolved from the project. */
  projectId: string | null;
  workspaceId: string | null;
}

export async function assignMeetingPlacement(
  db: PrismaClient,
  userId: string,
  input: AssignMeetingPlacementInput,
): Promise<AssignMeetingPlacementResult> {
  const { meetingIds, projectId, scope } = input;

  if (meetingIds.length === 0) {
    return { count: 0, projectId, workspaceId: null };
  }

  // 1. Resolve the target Workspace from the Project (project-authoritative).
  //    Placing onto a Project requires edit access to that Project.
  let workspaceId: string | null = null;
  if (projectId) {
    const projectAccess = await getProjectAccess(db, userId, projectId);
    if (!canEditProject(projectAccess)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have edit access to the target project",
      });
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Target project not found",
      });
    }
    workspaceId = project.workspaceId ?? null;
  }

  // 2. Determine which of the requested Meetings the caller may place.
  let placeableIds: string[];
  if (scope === "owner") {
    const owned = await db.transcriptionSession.findMany({
      where: { id: { in: meetingIds }, userId },
      select: { id: true },
    });
    placeableIds = owned.map((m) => m.id);
  } else {
    const sessions = await db.transcriptionSession.findMany({
      where: { id: { in: meetingIds } },
      select: { id: true, userId: true, projectId: true, workspaceId: true },
    });
    const byId = new Map(sessions.map((s) => [s.id, s]));
    for (const id of meetingIds) {
      const session = byId.get(id);
      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }
      const access = await getTranscriptionAccess(db, userId, session);
      if (!canEditTranscription(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have edit access to this meeting",
        });
      }
    }
    placeableIds = meetingIds;
  }

  if (placeableIds.length === 0) {
    return { count: 0, projectId, workspaceId };
  }

  // 3. Re-home the Meetings AND their extracted Actions atomically — projectId
  //    and workspaceId always move together. The owner guard is repeated in the
  //    where clauses as defense-in-depth for the bulk path.
  const ownerGuard = scope === "owner" ? { userId } : {};
  const [sessionResult] = await db.$transaction([
    db.transcriptionSession.updateMany({
      where: { id: { in: placeableIds }, ...ownerGuard },
      data: { projectId, workspaceId, updatedAt: new Date() },
    }),
    db.action.updateMany({
      where: {
        transcriptionSessionId: { in: placeableIds },
        ...(scope === "owner" ? { transcriptionSession: { userId } } : {}),
      },
      data: { projectId, workspaceId },
    }),
  ]);

  return { count: sessionResult.count, projectId, workspaceId };
}
