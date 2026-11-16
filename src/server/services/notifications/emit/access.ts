import { AccessControlService } from "~/server/services/access/AccessControlService";
import {
  canViewKnowledgePage,
  getKnowledgePageAccess,
} from "~/server/services/access/resolvers/knowledgePageResolver";
import { filterWorkspaceMembers } from "~/server/services/access/resolvers/workspaceResolver";
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
      // A ticket assignment is gated by workspace membership instead, in
      // `filterRecipientsByAccess` (tickets are not an access-service resource).
      return input.subject.actionId !== undefined
        ? { type: "action", id: input.subject.actionId }
        : null;
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
  // the page resolver directly (grants admit in every mode; a restricted page
  // admits grantees only). A mention on a page comment is gated the same way.
  if (input.category === NOTIFICATION_CATEGORIES.PAGE_SHARED) {
    return filterByPageView(input.db, input.subject.pageId, recipientIds);
  }
  if (input.category === NOTIFICATION_CATEGORIES.MENTION && input.subject.pageId) {
    return filterByPageView(input.db, input.subject.pageId, recipientIds);
  }

  if (
    input.category === NOTIFICATION_CATEGORIES.ASSIGNMENT &&
    input.subject.ticketId !== undefined
  ) {
    return filterByTicketView(input.db, input.subject.ticketId, recipientIds);
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

/**
 * Keep only the recipients who can currently view the ticket. A ticket is
 * readable by the members of its product's workspace (`loadTicketWithAccess`),
 * so that is the gate: a crafted or stale assignee outside the workspace is
 * never sent the ticket's title.
 */
async function filterByTicketView(
  db: EmitNotificationInput["db"],
  ticketId: string,
  recipientIds: string[],
): Promise<string[]> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { product: { select: { workspaceId: true } } },
  });
  if (!ticket) return [];
  const members = await filterWorkspaceMembers(
    db,
    ticket.product.workspaceId,
    recipientIds,
  );
  return recipientIds.filter((id) => members.has(id));
}

/** Keep only the recipients who can currently view the KnowledgePage. */
async function filterByPageView(
  db: EmitNotificationInput["db"],
  pageId: string,
  recipientIds: string[],
): Promise<string[]> {
  const page = await db.knowledgePage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      createdById: true,
      projectId: true,
      workspaceId: true,
      isInviteOnly: true,
      databaseId: true,
    },
  });
  if (!page) return [];
  const allowed = await Promise.all(
    recipientIds.map(async (userId) =>
      canViewKnowledgePage(await getKnowledgePageAccess(db, userId, page))
        ? userId
        : null,
    ),
  );
  return allowed.filter((id): id is string => id !== null);
}
