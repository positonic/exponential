import type { PrismaClient } from "@prisma/client";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { emitNotification } from "./emitNotification";
import { reportEmitFailure } from "./emitAfterResponse";
import { NOTIFICATION_CATEGORIES } from "./constants";
import type { MentionSubject } from "./types";

/**
 * Adapters that resolve a comment's target to a mention subject
 * and emit through the unified pipeline (ADR-0045). Kept separate from
 * `mention.ts` (the resolver/content, imported by the emit core) so the emit
 * core stays a leaf with no cycle back through `emitNotification`. They never
 * throw and report their own failures; request paths run them through
 * `emitAfterResponse` rather than `void`ing them.
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

    const notified = await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
    if (notified === null) {
      await reportEmitFailure(new Error("action comment mention emit failed"), "notifications.mention.actionComment", { commentId: params.commentId });
    }
  } catch (error) {
    console.error("[emit/mentionAdapters] action comment mention failed:", error);
    await reportEmitFailure(error, "notifications.mention.actionComment", { commentId: params.commentId });
  }
}

/**
 * Resolve a feature's workspace (via its product) plus its name and product
 * slug — features have no direct workspaceId.
 */
async function resolveFeatureTarget(
  db: PrismaClient,
  featureId: string,
): Promise<{
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  productSlug: string;
  featureName: string;
} | null> {
  const feature = await db.feature.findUnique({
    where: { id: featureId },
    select: {
      name: true,
      product: {
        select: {
          slug: true,
          workspace: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  const ws = feature?.product?.workspace;
  if (!feature || !ws) return null;
  return {
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    workspaceName: ws.name,
    productSlug: feature.product.slug,
    featureName: feature.name,
  };
}

/**
 * Resolve a ticket's workspace (via its product) plus its title and the
 * segments its detail URL is built from — tickets address by sequential
 * `number`, not id (see `ticket.resolveId`).
 */
async function resolveTicketTarget(
  db: PrismaClient,
  ticketId: string,
): Promise<{
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  productSlug: string;
  ticketTitle: string;
  /** URL segment for the ticket deep link: sequential number, or CUID for
   *  legacy numberless tickets. */
  ticketSegment: string;
} | null> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      title: true,
      number: true,
      product: {
        select: {
          slug: true,
          workspace: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  const ws = ticket?.product?.workspace;
  if (!ticket || !ws) return null;
  return {
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    workspaceName: ws.name,
    productSlug: ticket.product.slug,
    ticketTitle: ticket.title,
    // Legacy tickets have number 0 and are only addressable by CUID
    // (`resolveId` accepts both), so fall back to the id for the deep link.
    ticketSegment: ticket.number > 0 ? String(ticket.number) : ticketId,
  };
}

/** Emit a Mention notification for a TicketComment. */
export async function emitTicketCommentMention(
  db: PrismaClient,
  params: {
    ticketId: string;
    commentId: string;
    commentContent: string;
    commentAuthorId: string;
    previousContent?: string;
  },
): Promise<void> {
  try {
    const target = await resolveTicketTarget(db, params.ticketId);
    if (!target) return;

    const subject: MentionSubject = {
      commentId: params.commentId,
      commentContent: params.commentContent,
      previousContent: params.previousContent,
      workspaceId: target.workspaceId,
      workspaceSlug: target.workspaceSlug,
      workspaceName: target.workspaceName,
      targetName: target.ticketTitle,
      targetPath: `/w/${target.workspaceSlug}/products/${target.productSlug}/tickets/${target.ticketSegment}`,
    };

    const notified = await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
    if (notified === null) {
      await reportEmitFailure(new Error("ticket comment mention emit failed"), "notifications.mention.ticketComment", { commentId: params.commentId });
    }
  } catch (error) {
    console.error("[emit/mentionAdapters] ticket comment mention failed:", error);
    await reportEmitFailure(error, "notifications.mention.ticketComment", { commentId: params.commentId });
  }
}

/**
 * Resolve an insight's workspace (via its product) plus its title and product
 * slug — insights, like features, have no direct workspaceId.
 */
async function resolveInsightTarget(
  db: PrismaClient,
  insightId: string,
): Promise<{
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  productSlug: string;
  insightTitle: string;
} | null> {
  const insight = await db.insight.findUnique({
    where: { id: insightId },
    select: {
      title: true,
      product: {
        select: {
          slug: true,
          workspace: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  const ws = insight?.product?.workspace;
  if (!insight || !ws) return null;
  return {
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    workspaceName: ws.name,
    productSlug: insight.product.slug,
    insightTitle: insight.title,
  };
}

/** Emit a Mention notification for an InsightComment. */
export async function emitInsightCommentMention(
  db: PrismaClient,
  params: {
    insightId: string;
    commentId: string;
    commentContent: string;
    commentAuthorId: string;
    previousContent?: string;
  },
): Promise<void> {
  try {
    const target = await resolveInsightTarget(db, params.insightId);
    if (!target) return;

    const subject: MentionSubject = {
      commentId: params.commentId,
      commentContent: params.commentContent,
      previousContent: params.previousContent,
      workspaceId: target.workspaceId,
      workspaceSlug: target.workspaceSlug,
      workspaceName: target.workspaceName,
      targetName: target.insightTitle,
      targetPath: `/w/${target.workspaceSlug}/products/${target.productSlug}/insights/${params.insightId}`,
    };

    const notified = await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
    if (notified === null) {
      await reportEmitFailure(new Error("insight comment mention emit failed"), "notifications.mention.insightComment", { commentId: params.commentId });
    }
  } catch (error) {
    console.error("[emit/mentionAdapters] insight comment mention failed:", error);
    await reportEmitFailure(error, "notifications.mention.insightComment", { commentId: params.commentId });
  }
}

/**
 * Emit a Mention notification for a FeatureComment (PRD body or one of its
 * scopes). Replaces the legacy `sendFeatureMentionNotifications`.
 */
export async function emitFeatureCommentMention(
  db: PrismaClient,
  params: {
    featureId: string;
    scopeId?: string;
    commentId: string;
    commentContent: string;
    commentAuthorId: string;
    previousContent?: string;
  },
): Promise<void> {
  try {
    const target = await resolveFeatureTarget(db, params.featureId);
    if (!target) return;

    const basePath = `/w/${target.workspaceSlug}/products/${target.productSlug}/features/${params.featureId}`;

    const subject: MentionSubject = {
      commentId: params.commentId,
      commentContent: params.commentContent,
      previousContent: params.previousContent,
      workspaceId: target.workspaceId,
      workspaceSlug: target.workspaceSlug,
      workspaceName: target.workspaceName,
      targetName: target.featureName,
      targetPath: params.scopeId ? `${basePath}/scopes/${params.scopeId}` : basePath,
    };

    const notified = await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
    if (notified === null) {
      await reportEmitFailure(new Error("feature comment mention emit failed"), "notifications.mention.featureComment", { commentId: params.commentId });
    }
  } catch (error) {
    console.error("[emit/mentionAdapters] feature comment mention failed:", error);
    await reportEmitFailure(error, "notifications.mention.featureComment", { commentId: params.commentId });
  }
}

/**
 * Emit a Mention notification for a KnowledgePageComment (doc-level, anchored
 * thread or reply). Replaces the legacy `sendPageMentionNotifications`, which
 * sent push/Zulip/email directly and wrote no Notification row, so page
 * mentions never reached the inbox. `pageId` on the subject gates recipients
 * by page view access (invite-only pages, ADR-0069) in `filterRecipientsByAccess`.
 */
export async function emitPageCommentMention(
  db: PrismaClient,
  params: {
    pageId: string;
    commentId: string;
    commentContent: string;
    commentAuthorId: string;
    previousContent?: string;
  },
): Promise<void> {
  try {
    const page = await db.knowledgePage.findUnique({
      where: { id: params.pageId },
      select: {
        title: true,
        workspace: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!page) return;

    const subject: MentionSubject = {
      commentId: params.commentId,
      commentContent: params.commentContent,
      previousContent: params.previousContent,
      workspaceId: page.workspace.id,
      workspaceSlug: page.workspace.slug,
      workspaceName: page.workspace.name,
      targetName: page.title,
      targetPath: buildPageEditorPath(page.workspace.slug, params.pageId),
      pageId: params.pageId,
    };

    const notified = await emitNotification({
      category: NOTIFICATION_CATEGORIES.MENTION,
      actorUserId: params.commentAuthorId,
      subject,
      db,
    });
    if (notified === null) {
      await reportEmitFailure(new Error("page comment mention emit failed"), "notifications.mention.pageComment", { commentId: params.commentId });
    }
  } catch (error) {
    console.error("[emit/mentionAdapters] page comment mention failed:", error);
    await reportEmitFailure(error, "notifications.mention.pageComment", { commentId: params.commentId });
  }
}
