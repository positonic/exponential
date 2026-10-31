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
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        permission === "view"
          ? "You don't have access to this page"
          : permission === "edit"
            ? "You don't have permission to edit this page"
            : "Only the page's owner can change who it's shared with",
    });
  }
}
