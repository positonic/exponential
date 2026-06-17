import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "~/env";

/**
 * Significant workspace events that feed the home-page heatmap, activity feed,
 * and weekly-review sparkline. Each value is stored as the `action` column on
 * `WorkspaceActivityEvent` — keep this list in sync with the column comment.
 */
export type ActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "completed"
  | "commented"
  | "summarized";

/**
 * Entity types we currently log activity for. New writers append new values
 * here as they instrument additional surfaces.
 */
export type ActivityEntityType =
  | "action"
  | "action_comment"
  | "ticket"
  | "ticket_comment"
  | "project"
  | "goal"
  | "weekly_review"
  | "workspace_member"
  | "deal"
  | "meeting"
  | "time_entry"
  | "channel_summary";

export interface RecordActivityInput {
  workspaceId: string;
  /**
   * Acting user. Normally a real user id; `null` is permitted for system-actor
   * events whose `ChannelLink.createdById` was cleared (the column is nullable,
   * SET NULL on user delete). See ADR-0023 channel summaries.
   */
  userId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append one row to `WorkspaceActivityEvent`. This is a fire-and-forget
 * primitive for write sites — it MUST NOT throw, because instrumentation
 * failures should never break the user's mutation.
 *
 * Behavior:
 * - Missing `workspaceId` is a programmer error. In development we throw to
 *   make it loud during testing; in any other environment we log and swallow
 *   so production users aren't blocked.
 * - DB write failures are caught and logged; the caller's promise resolves
 *   normally.
 *
 * Returns true on a successful write, false otherwise. Callers can ignore the
 * return value — it exists for tests and observability.
 */
export async function recordActivity(
  db: PrismaClient,
  input: RecordActivityInput,
): Promise<boolean> {
  if (!input.workspaceId) {
    if (env.NODE_ENV === "development") {
      throw new Error(
        "[recordActivity] workspaceId is required — instrumentation call site is missing it",
      );
    }
    console.warn(
      "[recordActivity] missing workspaceId — skipping",
      { entityType: input.entityType, entityId: input.entityId, action: input.action },
    );
    return false;
  }

  try {
    await db.workspaceActivityEvent.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        metadata: input.metadata,
      },
    });
    return true;
  } catch (error) {
    console.error("[recordActivity] failed to write event", {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
