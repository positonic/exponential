import { NOTIFICATION_CATEGORIES } from "./constants";
import { resolveMentionRecipients } from "./mention";
import type { EmitNotificationInput } from "./types";

/**
 * Resolve the recipient user ids for an emit, per the category's fixed recipient
 * rule (CONTEXT: Notification category). The actor is excluded and access is
 * filtered by the caller (`emitNotification`), not here.
 */
export async function resolveRecipients(
  input: EmitNotificationInput,
): Promise<string[]> {
  switch (input.category) {
    case NOTIFICATION_CATEGORIES.ASSIGNMENT:
      // Assignment → the users just assigned. De-duplicate defensively.
      return Promise.resolve(Array.from(new Set(input.subject.assignedUserIds)));
    case NOTIFICATION_CATEGORIES.MENTION:
      // Mention → parsed, membership-filtered mentioned users.
      return resolveMentionRecipients(input);
    case NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED:
      // Meeting participant added → the members just linked. De-dup defensively.
      return Promise.resolve(
        Array.from(new Set(input.subject.participantUserIds)),
      );
    case NOTIFICATION_CATEGORIES.MEETING_READY: {
      // Meeting notes ready → the meeting's team-member (userId) participants.
      // CRM-contact / free-text participants have no User account and are skipped.
      const rows = await input.db.transcriptionSessionParticipant.findMany({
        where: {
          transcriptionSessionId: input.subject.sessionId,
          userId: { not: null },
        },
        select: { userId: true },
      });
      return Array.from(
        new Set(
          rows
            .map((r) => r.userId)
            .filter((id): id is string => id !== null),
        ),
      );
    }
    default:
      return Promise.resolve([]);
  }
}
