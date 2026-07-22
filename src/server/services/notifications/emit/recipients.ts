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
    default:
      return Promise.resolve([]);
  }
}
