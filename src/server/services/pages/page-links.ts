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

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Replace a Page's outgoing `PageLink` rows with the links in `doc` (its newly
 * stored `bodyDoc`; null for a page with no doc). Rows keep document order and
 * the first position of a repeated target; self-links are dropped, and only
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
    SELECT src."id", tgt."id", (link.ord - 1)::int, src."workspaceId"
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
    return true;
  });
}
