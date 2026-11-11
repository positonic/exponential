/**
 * Loading a Page for an access decision and enforcing it — the two steps every
 * page-scoped procedure starts with (`page.*`, `pageComment.*`, `database.*`,
 * whose rows and databases resolve access through their holding page,
 * ADR-0078 §4). Pure glue over the resolver in `services/access`.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import {
  canEditKnowledgePage,
  canManageKnowledgePageAccess,
  canViewKnowledgePage,
  getKnowledgePageAccess,
  projectAccessDeniedError,
  type KnowledgePageAccessInfo,
} from "~/server/services/access";

/** A Page reduced to exactly what the access resolver needs. */
export const PAGE_ACCESS_SELECT = {
  id: true,
  createdById: true,
  projectId: true,
  workspaceId: true,
  isInviteOnly: true,
  docVersion: true,
  databaseId: true,
} satisfies Prisma.KnowledgePageSelect;

/** What the page access resolver needs to know about a Page. */
export interface PageForAccess {
  id: string;
  createdById: string;
  projectId: string | null;
  workspaceId: string;
  isInviteOnly: boolean;
  /** Set on a Row (ADR-0078): access, placement and publishing follow its database's page. */
  databaseId?: string | null;
}

/**
 * Refuse a `page.*` mutation that would give a Row its own placement, sharing
 * or publish state (ADR-0078 §4). Rows are made and removed through
 * `database.*`; everything else about them follows the holding page.
 */
export function assertNotRow(page: { databaseId?: string | null }, action: string): void {
  if (page.databaseId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Row pages follow their database: ${action} applies to the page that holds it`,
    });
  }
}

export type PageAccessPermission = "view" | "edit" | "manage";

/** Load the access-relevant slice of a Page, or NOT_FOUND. */
export async function loadPageForAccess(db: PrismaClient, id: string) {
  const page = await db.knowledgePage.findUnique({
    where: { id },
    select: PAGE_ACCESS_SELECT,
  });
  if (!page) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
  }
  return page;
}

/**
 * The FORBIDDEN for a page refusing `userId` `permission`. When the refusal
 * comes from the page's project (a restricted project the caller isn't in),
 * the message names the account, the project and the missing access — the
 * case an agent's owner hit in ticket alpha.shark (ticket 819), where "You don't
 * have access to this page" gave them nothing to act on.
 */
export async function pageAccessDeniedError(
  db: PrismaClient,
  userId: string,
  page: Pick<PageForAccess, "projectId" | "isInviteOnly">,
  access: KnowledgePageAccessInfo,
  permission: PageAccessPermission,
): Promise<TRPCError> {
  const projectId = page.projectId;
  const deniedByProject =
    projectId !== null &&
    permission !== "manage" &&
    !access.isInviteOnly &&
    !access.isOwner &&
    (permission === "view" ? !access.hasProjectAccess : !access.canEditProject);
  if (projectId !== null && deniedByProject) {
    return projectAccessDeniedError(
      db,
      userId,
      projectId,
      permission === "view" ? "read this page" : "edit this page",
    );
  }
  return new TRPCError({
    code: "FORBIDDEN",
    message:
      permission === "view"
        ? "You don't have access to this page"
        : permission === "edit"
          ? "You don't have permission to edit this page"
          : "Only the page's owner can change who it's shared with",
  });
}

/** Throw unless the user has view/edit/manage access to the page. */
export async function ensurePageAccess(
  db: PrismaClient,
  userId: string,
  page: PageForAccess,
  permission: PageAccessPermission,
): Promise<void> {
  const access = await getKnowledgePageAccess(db, userId, page);
  const allowed =
    permission === "view"
      ? canViewKnowledgePage(access)
      : permission === "edit"
        ? canEditKnowledgePage(access)
        : canManageKnowledgePageAccess(access);
  if (!allowed) {
    throw await pageAccessDeniedError(db, userId, page, access, permission);
  }
}
