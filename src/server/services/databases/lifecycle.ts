/**
 * Deleting a Database and purging detached ones (ADR-0078). The two ways
 * rows are destroyed on purpose — `database.delete` now, or the daily sweep
 * once a detached database has sat unclaimed for the retention window — share
 * one path, so the Knowledge index is cleaned the same way in both.
 */
import type { PrismaClient } from "@prisma/client";

import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";

/** How long a detached database keeps its rows before the purge takes them. */
export const DETACHED_DATABASE_RETENTION_DAYS = 30;

export interface DeletedDatabase {
  id: string;
  rowCount: number;
}

/**
 * Hard-delete a database. Its rows cascade in Postgres; their chunks in the
 * Knowledge index do not, so they are cleared here, after the delete, in one
 * statement. Returns how many rows went with it.
 */
export async function deleteDatabase(db: PrismaClient, databaseId: string): Promise<DeletedDatabase> {
  const rows = await db.knowledgePage.findMany({
    where: { databaseId },
    select: { id: true },
  });
  await db.pageDatabase.delete({ where: { id: databaseId } });
  await getEmbeddingTriggerService(db).clearPageChunksMany(rows.map((r) => r.id));
  return { id: databaseId, rowCount: rows.length };
}

export interface PurgeResult {
  cutoff: Date;
  purged: DeletedDatabase[];
  errors: { id: string; message: string }[];
}

/**
 * Delete every database detached for longer than the retention window. One
 * database at a time, so a failure on one (a foreign-key surprise, a dropped
 * connection) leaves the rest to the next run. Idempotent: a purged database
 * is gone and does not match again.
 */
export async function purgeDetachedDatabases(
  db: PrismaClient,
  now: Date = new Date(),
  retentionDays: number = DETACHED_DATABASE_RETENTION_DAYS,
): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const stale = await db.pageDatabase.findMany({
    where: { detachedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { detachedAt: "asc" },
  });
  const result: PurgeResult = { cutoff, purged: [], errors: [] };
  for (const { id } of stale) {
    try {
      result.purged.push(await deleteDatabase(db, id));
    } catch (error) {
      result.errors.push({ id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
