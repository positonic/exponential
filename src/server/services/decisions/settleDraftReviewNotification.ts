import type { PrismaClient } from "@prisma/client";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { draftDecisionsDedupePrefix } from "~/server/services/notifications/emit/content";

/**
 * Once a meeting has no draft decisions left, mark its "N draft decisions to
 * review" notification read. The inbox shows the same meeting under Waiting
 * on me until the drafts are resolved; without this, resolving them would
 * leave the notification unread and keep the sidebar badge up for a job
 * already done. Idempotent: a meeting with drafts left, or an already-read
 * notification, is a no-op.
 */
export async function settleDraftReviewNotification(
  db: PrismaClient,
  transcriptionSessionId: string,
): Promise<void> {
  const draftsLeft = await db.decision.count({
    where: { transcriptionSessionId, reviewState: "DRAFT" },
  });
  if (draftsLeft > 0) return;
  await db.notification.updateMany({
    where: {
      category: NOTIFICATION_CATEGORIES.MEETING_READY,
      dedupeKey: { startsWith: draftDecisionsDedupePrefix(transcriptionSessionId) },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}
