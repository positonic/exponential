import { AccessControlService } from "~/server/services/access/AccessControlService";
import type { ResourceType } from "~/server/services/access/types";
import { NOTIFICATION_CATEGORIES } from "./constants";
import type { EmitNotificationInput } from "./types";

/**
 * The resource a category's notification is *about* — used to gate recipients by
 * current access. Returns null when a category has no gateable resource (the
 * recipients are then passed through unchanged).
 */
function resolveResource(
  input: EmitNotificationInput,
): { type: ResourceType; id: string } | null {
  switch (input.category) {
    case NOTIFICATION_CATEGORIES.ASSIGNMENT:
      return { type: "action", id: input.subject.actionId };
    default:
      return null;
  }
}

/**
 * Drop any recipient who can no longer *view* the item the notification is
 * about — crafted or stale recipient lists must never leak content to someone
 * without access (PRD: "only notify recipients who still have access").
 */
export async function filterRecipientsByAccess(
  input: EmitNotificationInput,
  recipientIds: string[],
): Promise<string[]> {
  if (recipientIds.length === 0) return recipientIds;

  const resource = resolveResource(input);
  if (!resource) return recipientIds;

  const access = new AccessControlService(input.db);
  const results = await Promise.all(
    recipientIds.map(async (userId) => {
      const result = await access.canAccess({
        userId,
        resourceType: resource.type,
        resourceId: resource.id,
        permission: "view",
      });
      return result.allowed ? userId : null;
    }),
  );

  return results.filter((id): id is string => id !== null);
}
