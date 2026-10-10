import { AccessControlService } from "~/server/services/access/AccessControlService";
import {
  canViewKnowledgePage,
  getKnowledgePageAccess,
} from "~/server/services/access/resolvers/knowledgePageResolver";
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
    case NOTIFICATION_CATEGORIES.DUE_DATE:
      // Don't remind an owner who has lost access to the action.
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

  // Pages aren't an AccessControlService resource type — gate them through
  // the page resolver directly (invite-only pages admit invitees only).
  if (input.category === NOTIFICATION_CATEGORIES.PAGE_SHARED) {
    const page = await input.db.knowledgePage.findUnique({
      where: { id: input.subject.pageId },
      select: {
        id: true,
        createdById: true,
        projectId: true,
        workspaceId: true,
        isInviteOnly: true,
      },
    });
    if (!page) return [];
    const allowed = await Promise.all(
      recipientIds.map(async (userId) =>
        canViewKnowledgePage(await getKnowledgePageAccess(input.db, userId, page))
          ? userId
          : null,
      ),
    );
    return allowed.filter((id): id is string => id !== null);
  }

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
