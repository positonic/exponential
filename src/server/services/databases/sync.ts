/**
 * Keeping `PageDatabase.detachedAt` in step with the page body (ADR-0078).
 *
 * Removing a database block from a page is a **detach, not a delete**: a
 * backspace in the editor or a Markdown write from an older client must not
 * be able to destroy hundreds of row pages. So every body write re-derives,
 * in the same transaction, which of the page's databases its body still
 * holds: absent ones get `detachedAt`, present ones have it cleared. Rows go
 * only on `database.delete`, with the holding page, or when the purge sweeps
 * databases detached for longer than the retention window.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";

import { collectDatabaseNodeIds } from "~/lib/databases/doc";
import { collectDatabaseMarkerIds } from "~/lib/databases/marker";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PageBodySource {
  /** The stored ProseMirror doc, when the write had one. */
  doc?: JSONContent | null;
  /** The Markdown body; read for blocks only when there is no doc. */
  body?: string | null;
}

/** The database ids a body holds — from its doc when there is one, else its markers. */
export function databaseIdsInBody(source: PageBodySource): string[] {
  return source.doc ? collectDatabaseNodeIds(source.doc) : collectDatabaseMarkerIds(source.body);
}

/**
 * Mark the page's databases detached or attached to match `source`. Run it
 * in the transaction that wrote the body, after the write. Databases of
 * other pages are never touched: a marker pasted in from elsewhere does not
 * re-attach (or claim) anything.
 */
export async function syncPageDatabases(
  db: Db,
  pageId: string,
  source: PageBodySource,
  now: Date = new Date(),
): Promise<void> {
  const present = databaseIdsInBody(source);
  await db.pageDatabase.updateMany({
    where: {
      pageId,
      detachedAt: null,
      ...(present.length ? { id: { notIn: present } } : {}),
    },
    data: { detachedAt: now },
  });
  if (present.length) {
    await db.pageDatabase.updateMany({
      where: { pageId, id: { in: present }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  }
}
