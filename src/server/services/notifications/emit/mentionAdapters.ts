import type { PrismaClient } from "@prisma/client";
import { emitNotification } from "./emitNotification";
import { NOTIFICATION_CATEGORIES } from "./constants";
import type { MentionSubject } from "./types";

/**
 * Fire-and-forget adapters that resolve a comment's target to a mention subject
 * and emit through the unified pipeline (ADR-0045). Kept separate from
 * `mention.ts` (the resolver/content, imported by the emit core) so the emit
 * core stays a leaf with no cycle back through `emitNotification`.
 */

/** Resolve an action's workspace (directly or via its project) plus its name. */
async function resolveActionTarget(
  db: PrismaClient,
  actionId: string,
): Promise<{ workspaceId: string; workspaceSlug: string; workspaceName: string; name: string } | null> {
  const action = await db.action.findUnique({
    where: { id: actionId },
    select: {
      name: true,
      workspace: { select: { id: true, slug: true, name: true } },
      project: { select: { workspace: { select: { id: true, slug: true, name: true } } } },
    },
  });
  const ws = action?.workspace ?? action?.project?.workspace;
  if (!action || !ws) return null;
  return { workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name, name: action.name };
}

/**
 * Emit a Mention notification for an ActionComment. Replaces the legacy
 * `sendMentionNotifications`.
 */
export async function emitActionCommentMention(
  db: PrismaClient,
  params: {
    actionId: string;
    commentId: string;
    commentContent: string;
    commentAuthorId: string;
    previousContent?: string;
  },
): Promise<void> {
  try {
    const target = await resolveActionTarget(db, params.actionId);
    if (!target) return;

    const subject: MentionSubject = {
      commentId: params.commentId,
      commentContent: params.commentContent,
      previousContent: params.previousContent,
      workspaceId: target.workspaceId,
      workspaceSlug: target.workspaceSlug,
      workspaceName: target.workspaceName,
      targetName: target.name,
      targetPath: `/w/${target.workspaceSlug}/actions/${params.actionId}`,
    };

    await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
  } catch (error) {
    console.error("[emit/mentionAdapters] action comment mention failed:", error);
  }
}
