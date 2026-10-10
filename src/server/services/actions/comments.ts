import type { PrismaClient } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { emitActionCommentMention } from "~/server/services/notifications/emit/mentionAdapters";

/**
 * Create a comment on an action as `authorId`, with the two side effects every
 * comment has: the workspace activity event and the mention notifications
 * (ADR-0045). One path for the human router (`actionComment.addComment`) and
 * the Agent-run tool (`mastra.commentOnAction`), so an Assistant's comment is
 * a real comment — same feed, same mentions — attributed to the Assistant.
 *
 * Access is the caller's concern: the router checks view access, the run tool
 * checks the run belongs to the action.
 */
export async function createActionComment(
  db: PrismaClient,
  input: { actionId: string; authorId: string; content: string },
) {
  const comment = await db.actionComment.create({
    data: { actionId: input.actionId, authorId: input.authorId, content: input.content },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  // Workspace activity feed: workspaceId lives on Action, optionally via Project.
  const parentAction = await db.action.findUnique({
    where: { id: input.actionId },
    select: { workspaceId: true, project: { select: { workspaceId: true } } },
  });
  const activityWorkspaceId = parentAction?.workspaceId ?? parentAction?.project?.workspaceId ?? null;
  if (activityWorkspaceId) {
    await recordActivity(db, {
      workspaceId: activityWorkspaceId,
      userId: input.authorId,
      entityType: "action_comment",
      entityId: comment.id,
      action: "created",
      metadata: { actionId: input.actionId, snippet: input.content.slice(0, 120) },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  // Fire-and-forget mention notifications via the unified pipeline (ADR-0045).
  void emitActionCommentMention(db, {
    actionId: input.actionId,
    commentId: comment.id,
    commentContent: input.content,
    commentAuthorId: input.authorId,
  });

  return comment;
}
