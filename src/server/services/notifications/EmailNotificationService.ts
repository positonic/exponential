import type { PrismaClient } from "@prisma/client";

/**
 * Every event-triggered notification — assignments and @mentions on actions,
 * tickets, features, insights and Knowledge Page comments — flows through the
 * unified pipeline (`emitNotification`, ADR-0045). The direct push/Zulip/email
 * fan-out that used to live here is gone; only the email preference gate the
 * pipeline's channel resolution still reads remains.
 */

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
