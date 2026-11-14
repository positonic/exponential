/**
 * The stored page-link graph (ADR-0039). Nesting is the `pageLink` nodes in a
 * Page's `bodyDoc`; `PageLink` rows index them so the tree, breadcrumb and
 * sub-tree walks never have to load and parse every doc in a workspace.
 *
 * The rows are derived, never authored: every write that changes a Page's
 * `bodyDoc` re-derives them from the doc it stored, in the same transaction,
 * so the index can't drift from the body. Use {@link syncPageLinks} after a
 * create/update inside a transaction, or {@link writePageBodyIfVersion} for the
 * compare-and-set body write most writers do.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";

import { collectPageLinkIds } from "~/lib/pages/public-doc";
import { syncPageDatabases } from "~/server/services/databases/sync";
import { buildKnowledgePageAccessWhere } from "~/server/services/access";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Replace a Page's outgoing `PageLink` rows with the links in `doc` (its newly
 * stored `bodyDoc`; null for a page with no doc). Rows keep document order as a
 * dense 0-based `position` (a repeated target counts once, at its first
 * occurrence — same numbering as the migration's backfill); self-links are dropped, and only
 * targets that exist in the source page's workspace are kept — `/page` only
 * creates same-workspace links, and a pasted foreign or dead id must not reach
 * another workspace through the graph.
 *
 * Run it in the same transaction as the body write, after it: the write's row
 * lock then serialises concurrent writers of the same page.
 */
export async function syncPageLinks(
  db: Db,
  pageId: string,
  doc: JSONContent | null | undefined,
): Promise<void> {
  await db.pageLink.deleteMany({ where: { fromPageId: pageId } });
  const targetIds = collectPageLinkIds(doc).filter((id) => id !== pageId);
  if (targetIds.length === 0) return;
  await db.$executeRaw`
    INSERT INTO "PageLink" ("fromPageId", "toPageId", "position", "workspaceId")
    SELECT src."id", tgt."id", (ROW_NUMBER() OVER (ORDER BY link.ord) - 1)::int, src."workspaceId"
    FROM "KnowledgePage" src
    CROSS JOIN unnest(${targetIds}::text[]) WITH ORDINALITY AS link(page_id, ord)
    JOIN "KnowledgePage" tgt
      ON tgt."id" = link.page_id
     AND tgt."workspaceId" = src."workspaceId"
    WHERE src."id" = ${pageId}
  `;
}

/**
 * Compare-and-set a Page's `bodyDoc` on `docVersion` (bumping it) together
 * with any other `data` columns, and re-derive its links — atomically. Returns
 * false, writing nothing, when the page is gone or another write moved
 * `docVersion` past `expectedVersion`.
 */
export async function writePageBodyIfVersion(
  db: PrismaClient,
  args: {
    pageId: string;
    expectedVersion: number;
    doc: JSONContent;
    data?: Omit<Prisma.KnowledgePageUncheckedUpdateManyInput, "bodyDoc" | "docVersion">;
    /** Runs in the same transaction once the write landed (e.g. record the revision). */
    afterWrite?: (tx: Prisma.TransactionClient) => Promise<unknown>;
  },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.knowledgePage.updateMany({
      where: { id: args.pageId, docVersion: args.expectedVersion },
      data: {
        ...args.data,
        bodyDoc: args.doc as Prisma.InputJsonValue,
        docVersion: { increment: 1 },
      },
    });
    if (count !== 1) return false;
    await syncPageLinks(tx, args.pageId, args.doc);
    // Database blocks detach/re-attach with the body too (ADR-0078).
    await syncPageDatabases(tx, args.pageId, { doc: args.doc });
    await args.afterWrite?.(tx);
    return true;
  });
}

/** How many linking pages one reverse-link scan returns. The scan runs on every
 * page open (it is the breadcrumb), so it is bounded; a caller that reports a
 * count says when the bound was hit instead of presenting it as the answer. */
export const LINKER_SCAN_LIMIT = 20;

/**
 * The reverse-link scan: the pages in `page`'s workspace whose body links to it
 * with a `pageLink` node, newest-edited first, limited to the ones `userId` can
 * view. The one definition of "links here": the breadcrumb parent is its first
 * element and the delete-impact count is its length.
 *
 * It reads the `PageLink` index rather than the bodies. The index is derived
 * from {@link collectPageLinkIds} on every body write, so a page that merely
 * mentions the id in prose, or pastes the page's URL as an ordinary link, is
 * never a linker: only `pageLink` nodes become rows. View access is part of
 * the same query ({@link buildKnowledgePageAccessWhere} mirrors the per-page
 * resolver), so a linker the caller cannot see is never returned or counted.
 *
 * `capped` is true when there were more than `limit` linkers.
 */
export async function findLinkingPages(
  db: Db,
  userId: string,
  page: { id: string; workspaceId: string },
  limit: number = LINKER_SCAN_LIMIT,
): Promise<{
  pages: { id: string; title: string; isPublic: boolean }[];
  capped: boolean;
}> {
  // One row past the limit, only to tell "exactly 20" from "more than 20".
  const rows = await db.knowledgePage.findMany({
    where: {
      AND: [
        {
          workspaceId: page.workspaceId,
          id: { not: page.id },
          linksFrom: { some: { toPageId: page.id } },
        },
        buildKnowledgePageAccessWhere(userId),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    select: { id: true, title: true, isPublic: true },
  });
  const capped = rows.length > limit;
  return { pages: capped ? rows.slice(0, limit) : rows, capped };
}
