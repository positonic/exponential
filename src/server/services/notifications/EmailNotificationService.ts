import type { PrismaClient } from "@prisma/client";
import {
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
} from "~/server/services/EmailService";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { ZulipNotificationService } from "~/server/services/notifications/ZulipNotificationService";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

const BASE_URL = process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();

/**
 * Send a Zulip DM to a user if the workspace has a Zulip integration
 * and the user has a mapping. Fire-and-forget.
 */
async function sendZulipDmToUser(
  db: PrismaClient,
  recipientUserId: string,
  _workspaceId: string,
  payload: { title: string; message: string; priority?: "low" | "normal" | "high" },
): Promise<void> {
  try {
    // Find any Zulip integration where this user has a mapping,
    // regardless of workspace — handles cases where action.workspaceId
    // doesn't match the integration's workspace.
    const mapping = await db.integrationUserMapping.findFirst({
      where: {
        userId: recipientUserId,
        integration: { provider: "zulip", status: "ACTIVE" },
      },
      include: { integration: { select: { id: true } } },
    });

    if (!mapping) {
      console.log(`[Zulip] No Zulip mapping found for user ${recipientUserId} — skipped`);
      return;
    }

    console.log(`[Zulip] Found mapping for user ${recipientUserId} → ${mapping.externalUserId}`);

    const service = new ZulipNotificationService({
      userId: recipientUserId,
      integrationId: mapping.integration.id,
    });

    const result = await service.sendDirectMessage(mapping.externalUserId, payload);

    if (result.success) {
      console.log(`[Zulip] ✅ DM sent to ${mapping.externalUserId} (messageId: ${result.messageId})`);
    } else {
      console.error(`[Zulip] ❌ Failed to send DM to ${mapping.externalUserId}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[Zulip] ❌ Error sending DM to user ${recipientUserId}:`, error);
  }
}

/**
 * Determine whether an email notification should be sent to a user for a given workspace.
 *
 * Resolution order:
 * 1. User has no email -> false
 * 2. User's global NotificationPreference.enabled = false -> false
 * 3. WorkspaceNotificationOverride exists -> use that value
 * 4. Fallback to Workspace.enableEmailNotifications
 */
export async function shouldSendEmailNotification(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return false;

  const globalPref = await db.notificationPreference.findUnique({
    where: { userId },
    select: { enabled: true },
  });
  if (globalPref && !globalPref.enabled) return false;

  const override = await db.workspaceNotificationOverride.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (override) {
    return override.emailNotifications;
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableEmailNotifications: true },
  });
  return workspace?.enableEmailNotifications ?? true;
}

/**
 * Resolve the workspaceId and workspace slug for an action.
 * Actions may have a direct workspaceId or inherit via their project.
 */
async function resolveActionWorkspace(
  db: PrismaClient,
  actionId: string,
): Promise<{ workspaceId: string; workspaceSlug: string; workspaceName: string } | null> {
  const action = await db.action.findUnique({
    where: { id: actionId },
    include: {
      workspace: { select: { id: true, slug: true, name: true } },
      project: {
        include: {
          workspace: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  if (!action) return null;

  const ws = action.workspace ?? action.project?.workspace;
  if (!ws) return null;

  return { workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name };
}

/**
 * Build notification URLs for the email footer.
 */
function buildNotificationUrls(workspaceSlug: string, actionId: string) {
  return {
    actionUrl: `${BASE_URL}/w/${workspaceSlug}/actions/${actionId}`,
    personalSettingsUrl: `${BASE_URL}/settings/notifications`,
    workspaceSettingsUrl: `${BASE_URL}/w/${workspaceSlug}/settings`,
  };
}

/**
 * Fire-and-forget: Send email notifications to newly assigned users.
 * Call this after creating ActionAssignee records.
 */
export async function sendAssignmentNotifications(
  db: PrismaClient,
  params: {
    actionId: string;
    assignedUserIds: string[];
    assignerId: string;
  },
): Promise<void> {
  try {
    const { actionId, assignedUserIds, assignerId } = params;

    const [action, assigner] = await Promise.all([
      db.action.findUnique({
        where: { id: actionId },
        select: { name: true },
      }),
      db.user.findUnique({
        where: { id: assignerId },
        select: { name: true, email: true },
      }),
    ]);
    if (!action || !assigner) return;

    const ws = await resolveActionWorkspace(db, actionId);
    if (!ws) return;

    const urls = buildNotificationUrls(ws.workspaceSlug, actionId);
    const assignerName = assigner.name ?? assigner.email ?? "Someone";

    const recipients = await db.user.findMany({
      where: {
        id: { in: assignedUserIds },
      },
      select: { id: true, name: true, email: true },
    });

    await Promise.allSettled(
      recipients.map(async (recipient) => {
        const isSelfAssign = recipient.id === assignerId;
        const notifTitle = isSelfAssign
          ? "You assigned yourself a task"
          : `${assignerName} assigned you a task`;

        // Send Zulip DM (always, including self-assign)
        void sendZulipDmToUser(db, recipient.id, ws.workspaceId, {
          title: notifTitle,
          message: `**${action.name}**\n\n[View task](${urls.actionUrl})`,
          priority: "normal",
        });

        // Skip push/email for self-assignment
        if (isSelfAssign) return;

        const shouldSend = await shouldSendEmailNotification(
          db,
          recipient.id,
          ws.workspaceId,
        );
        if (!shouldSend) return;

        // Send push notification
        void sendPushToUser(
          recipient.id,
          {
            title: notifTitle,
            body: action.name,
            tag: "assignment",
            url: `/w/${ws.workspaceSlug}/actions/${actionId}`,
          },
          db,
        );

        if (!recipient.email) return;

        await sendAssignmentNotificationEmail({
          to: recipient.email,
          assigneeName: recipient.name ?? "",
          assignerName,
          actionName: action.name,
          actionUrl: urls.actionUrl,
          workspaceName: ws.workspaceName,
          personalSettingsUrl: urls.personalSettingsUrl,
          workspaceSettingsUrl: urls.workspaceSettingsUrl,
          workspaceId: ws.workspaceId,
        });
      }),
    );
  } catch (error) {
    console.error("[EmailNotificationService] Failed to send assignment notifications:", error);
  }
}

/** Regex to parse mentions in format @[Name](userId) or legacy @[Name] */
const MENTION_WITH_ID_REGEX = /@\[([^\]]+)\](?:\(([^)]+)\))?/g;

/**
 * Extract mentioned user IDs from comment content.
 * Supports @[Name](userId) format. Falls back to name-based lookup for legacy @[Name] mentions.
 */
async function extractMentionedUserIds(
  db: PrismaClient,
  content: string,
  workspaceId: string,
): Promise<string[]> {
  const userIds: string[] = [];
  const namesToResolve: string[] = [];

  let match;
  const regex = new RegExp(MENTION_WITH_ID_REGEX.source, "g");
  while ((match = regex.exec(content)) !== null) {
    const userId = match[2];
    if (userId) {
      userIds.push(userId);
    } else {
      const name = match[1];
      if (name) namesToResolve.push(name);
    }
  }

  // Resolve legacy name-based mentions via workspace members
  if (namesToResolve.length > 0) {
    const members = await db.workspaceUser.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    for (const name of namesToResolve) {
      const member = members.find(
        (m) => m.user.name?.toLowerCase() === name.toLowerCase(),
      );
      if (member) {
        userIds.push(member.userId);
      }
    }
  }

  return [...new Set(userIds)];
}

/**
 * Resolve the workspace + product slug + name for a feature (PRD). Features
 * inherit their workspace via their product; there is no direct workspaceId.
 */
async function resolveFeatureWorkspace(
  db: PrismaClient,
  featureId: string,
): Promise<
  | {
      workspaceId: string;
      workspaceSlug: string;
      workspaceName: string;
      productSlug: string;
      featureName: string;
    }
  | null
> {
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
 * Target-agnostic core: notify every mentioned user (minus the author) across
 * push, Zulip DM, and email. Callers resolve the entity (action, feature, …)
 * to a workspace + display name + deep-link path and hand it here so the
 * multi-channel fan-out and per-recipient gating live in exactly one place.
 */
async function fanOutMentionNotifications(
  db: PrismaClient,
  params: {
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    /** Display name of the thing the comment is on (action name, feature name). */
    targetName: string;
    /** Relative deep-link path to the comment thread, e.g. /w/slug/actions/id. */
    targetPath: string;
    /** Link label used in the Zulip DM, e.g. "View task", "View PRD". */
    viewLabel: string;
    commentContent: string;
    commentAuthorId: string;
  },
): Promise<void> {
  const {
    workspaceId,
    workspaceSlug,
    workspaceName,
    targetName,
    targetPath,
    viewLabel,
    commentContent,
    commentAuthorId,
  } = params;

  const mentionedUserIds = await extractMentionedUserIds(
    db,
    commentContent,
    workspaceId,
  );
  if (mentionedUserIds.length === 0) return;

  // Filter out the comment author (don't notify yourself). Non-member ids
  // (e.g. mentioned agents) never match a User row below, so they drop out.
  const recipientIds = mentionedUserIds.filter((id) => id !== commentAuthorId);
  if (recipientIds.length === 0) return;

  // Mention markup is client-supplied: only notify users who actually belong
  // to this workspace, directly or via a team linked to it. Anyone else a
  // crafted @[Name](id) names is silently dropped — never leak comment
  // content outside the workspace.
  const [author, recipients] = await Promise.all([
    db.user.findUnique({
      where: { id: commentAuthorId },
      select: { name: true, email: true },
    }),
    db.user.findMany({
      where: {
        id: { in: recipientIds },
        OR: [
          { workspaceMemberships: { some: { workspaceId } } },
          { teams: { some: { team: { workspaceId } } } },
        ],
      },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!author) return;

  const targetUrl = `${BASE_URL}${targetPath}`;
  const personalSettingsUrl = `${BASE_URL}/settings/notifications`;
  const workspaceSettingsUrl = `${BASE_URL}/w/${workspaceSlug}/settings`;
  const authorName = author.name ?? author.email ?? "Someone";
  // Strip mention markup for preview and limit to 200 chars
  const cleanContent = commentContent.replace(/@\[([^\]]+)\](?:\([^)]+\))?/g, "@$1");
  const commentPreview =
    cleanContent.length > 200
      ? cleanContent.substring(0, 200) + "..."
      : cleanContent;

  await Promise.allSettled(
    recipients.map(async (recipient) => {
      const shouldSend = await shouldSendEmailNotification(
        db,
        recipient.id,
        workspaceId,
      );
      if (!shouldSend) return;

      // Send push notification
      void sendPushToUser(
        recipient.id,
        {
          title: `${authorName} mentioned you in ${targetName}`,
          body: commentPreview,
          tag: "mention",
          url: targetPath,
        },
        db,
      );

      // Send Zulip DM
      void sendZulipDmToUser(db, recipient.id, workspaceId, {
        title: `${authorName} mentioned you in ${targetName}`,
        message: `${commentPreview}\n\n[${viewLabel}](${targetUrl})`,
        priority: "normal",
      });

      if (!recipient.email) return;

      await sendMentionNotificationEmail({
        to: recipient.email,
        mentionedName: recipient.name ?? "",
        authorName,
        actionName: targetName,
        commentPreview,
        actionUrl: targetUrl,
        workspaceName,
        personalSettingsUrl,
        workspaceSettingsUrl,
        workspaceId,
      });
    }),
  );
}

/**
 * Fire-and-forget: Send notifications to users mentioned in an ActionComment.
 * Thin wrapper over {@link fanOutMentionNotifications}.
 */
export async function sendMentionNotifications(
  db: PrismaClient,
  params: {
    actionId: string;
    commentContent: string;
    commentAuthorId: string;
  },
): Promise<void> {
  try {
    const { actionId, commentContent, commentAuthorId } = params;

    const [ws, action] = await Promise.all([
      resolveActionWorkspace(db, actionId),
      db.action.findUnique({
        where: { id: actionId },
        select: { name: true },
      }),
    ]);
    if (!ws || !action) return;

    await fanOutMentionNotifications(db, {
      workspaceId: ws.workspaceId,
      workspaceSlug: ws.workspaceSlug,
      workspaceName: ws.workspaceName,
      targetName: action.name,
      targetPath: `/w/${ws.workspaceSlug}/actions/${actionId}`,
      viewLabel: "View task",
      commentContent,
      commentAuthorId,
    });
  } catch (error) {
    console.error("[EmailNotificationService] Failed to send mention notifications:", error);
  }
}

/**
 * Fire-and-forget: Send notifications to users mentioned in a FeatureComment
 * (PRD or one of its scopes). Thin wrapper over {@link fanOutMentionNotifications}.
 */
export async function sendFeatureMentionNotifications(
  db: PrismaClient,
  params: {
    featureId: string;
    scopeId?: string;
    commentContent: string;
    commentAuthorId: string;
  },
): Promise<void> {
  try {
    const { featureId, scopeId, commentContent, commentAuthorId } = params;

    const info = await resolveFeatureWorkspace(db, featureId);
    if (!info) return;

    const basePath = `/w/${info.workspaceSlug}/products/${info.productSlug}/features/${featureId}`;

    await fanOutMentionNotifications(db, {
      workspaceId: info.workspaceId,
      workspaceSlug: info.workspaceSlug,
      workspaceName: info.workspaceName,
      targetName: info.featureName,
      targetPath: scopeId ? `${basePath}/scopes/${scopeId}` : basePath,
      viewLabel: "View PRD",
      commentContent,
      commentAuthorId,
    });
  } catch (error) {
    console.error("[EmailNotificationService] Failed to send feature mention notifications:", error);
  }
}
