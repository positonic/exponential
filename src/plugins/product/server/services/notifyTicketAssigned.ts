import type { PrismaClient } from "@prisma/client";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";

/**
 * Tell a ticket's new assignee it is theirs, through the Assignment
 * notification category (the same one an action assignment uses, so one
 * preference row covers both).
 *
 * Call it after every write that may have set `assigneeId`. It is a no-op
 * when the write left the assignee alone (`undefined`), cleared it (`null`) or
 * re-sent the same person. The emit itself skips the actor, so assigning a
 * ticket to yourself stays silent, and it never throws.
 *
 * Awaited on purpose: a serverless response ending can drop an un-awaited
 * send, and a lost notification is worse here than a slower mutation.
 */
export async function notifyTicketAssigned(
  db: PrismaClient,
  params: {
    ticketId: string;
    /** The assignee the write carried; `undefined` when it did not touch it. */
    assigneeId: string | null | undefined;
    /** The assignee before the write; `null` for a new ticket. */
    previousAssigneeId: string | null;
    /** Who made the change. A bot's id for an auto-filed ticket. */
    actorUserId: string | null;
  },
): Promise<void> {
  const { ticketId, assigneeId, previousAssigneeId, actorUserId } = params;
  if (!assigneeId || assigneeId === previousAssigneeId) return;

  await emitNotification({
    db,
    category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
    actorUserId,
    subject: { ticketId, assignedUserIds: [assigneeId] },
  });
}
