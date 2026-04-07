import type { PrismaClient } from "@prisma/client";
import {
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
} from "~/server/services/EmailService";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { ZulipNotificationService } from "~/server/services/notifications/ZulipNotificationService";

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://exponential.im";

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
 * Fire-and-forget: Send email notifications to mentioned users in a comment.
 * Call this after creating an ActionComment.
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

    const ws = await resolveActionWorkspace(db, actionId);
    if (!ws) return;

    const mentionedUserIds = await extractMentionedUserIds(
      db,
      commentContent,
      ws.workspaceId,
    );
    if (mentionedUserIds.length === 0) return;

    // Filter out the comment author (don't notify yourself)
    const recipientIds = mentionedUserIds.filter((id) => id !== commentAuthorId);
    if (recipientIds.length === 0) return;

    const [action, author, recipients] = await Promise.all([
      db.action.findUnique({
        where: { id: actionId },
        select: { name: true },
      }),
      db.user.findUnique({
        where: { id: commentAuthorId },
        select: { name: true, email: true },
      }),
      db.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, name: true, email: true },
      }),
    ]);
    if (!action || !author) return;

    const urls = buildNotificationUrls(ws.workspaceSlug, actionId);
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
          ws.workspaceId,
        );
        if (!shouldSend) return;

        // Send push notification
        void sendPushToUser(
          recipient.id,
          {
            title: `${authorName} mentioned you in ${action.name}`,
            body: commentPreview,
            tag: "mention",
            url: `/w/${ws.workspaceSlug}/actions/${actionId}`,
          },
          db,
        );

        // Send Zulip DM
        void sendZulipDmToUser(db, recipient.id, ws.workspaceId, {
          title: `${authorName} mentioned you in ${action.name}`,
          message: `${commentPreview}\n\n[View task](${urls.actionUrl})`,
          priority: "normal",
        });

        if (!recipient.email) return;

        await sendMentionNotificationEmail({
          to: recipient.email,
          mentionedName: recipient.name ?? "",
          authorName,
          actionName: action.name,
          commentPreview,
          actionUrl: urls.actionUrl,
          workspaceName: ws.workspaceName,
          personalSettingsUrl: urls.personalSettingsUrl,
          workspaceSettingsUrl: urls.workspaceSettingsUrl,
        });
      }),
    );
  } catch (error) {
    console.error("[EmailNotificationService] Failed to send mention notifications:", error);
  }
}
