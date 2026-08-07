import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "~/env";

/**
 * Significant workspace events that feed the home-page heatmap, activity feed,
 * and weekly-review sparkline. Each value is stored as the `action` column on
 * `WorkspaceActivityEvent` - keep this list in sync with the column comment.
 */
export type ActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "completed"
  | "commented"
  | "summarized"
  | "synced"
  | "reverted";

/**
 * Entity types we currently log activity for. New writers append new values
 * here as they instrument additional surfaces.
 */
export type ActivityEntityType =
  | "action"
  | "action_comment"
  | "ticket"
  | "ticket_comment"
  | "feature"
  | "feature_scope"
  | "insight"
  | "insight_comment"
  | "project"
  | "goal"
  | "weekly_review"
  | "workspace_member"
  | "deal"
  | "meeting"
  | "time_entry"
  | "channel_summary"
  | "ticket_sync_run"
  // GitHub events (see githubFeedEvent.ts). These mirror rows already written to
  // the `GitHubActivity` table; the prefix is load-bearing, since
  // `deriveActivitySource` maps any `github*` entity type to the `github` source
  // chip. Emitted at feed altitude — one row per push, not per commit.
  | "github_push"
  | "github_pull_request"
  | "github_pull_request_review";

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
  /**
   * When the event actually happened, if that differs from now. Defaults to
   * insert time, which is right for in-app writes (the mutation *is* the event).
   *
   * External sources need the override: a GitHub webhook can be delivered late
   * or replayed, and a backfill inserts months of history in one pass. Without
   * this, a replayed PR merge would jump to the top of the feed and a backfill
   * would stack every historical event on the day it ran.
   */
  occurredAt?: Date;
}

/**
 * Append one row to `WorkspaceActivityEvent`. This is a fire-and-forget
 * primitive for write sites - it MUST NOT throw, because instrumentation
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
 * return value - it exists for tests and observability.
 */
export async function recordActivity(
  db: PrismaClient,
  input: RecordActivityInput,
): Promise<boolean> {
  if (!input.workspaceId) {
    if (env.NODE_ENV === "development") {
      throw new Error(
        "[recordActivity] workspaceId is required - instrumentation call site is missing it",
      );
    }
    console.warn(
      "[recordActivity] missing workspaceId - skipping",
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
        ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
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
