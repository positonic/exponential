/**
 * Deleting a Database and purging detached ones (ADR-0078). The two ways
 * rows are destroyed on purpose — `database.delete` now, or the daily sweep
 * once a detached database has sat unclaimed for the retention window — share
 * one path, so the Knowledge index is cleaned the same way in both.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import { parseProperties, parseView, type PropertyDef } from "~/lib/databases/schema";
import { withoutProperty } from "./schema-edits";

/** How long a detached database keeps its rows before the purge takes them. */
export const DETACHED_DATABASE_RETENTION_DAYS = 30;

export interface DeletedDatabase {
  id: string;
  rowCount: number;
}

/**
 * Hard-delete a database. Its rows and its edges cascade in Postgres; the
 * relation columns other databases of the workspace point at it with
 * (ADR-0078 §5) are removed with their edges, so no table keeps a column
 * to nothing; the rows' chunks in the Knowledge index are cleared after
 * the delete, in one statement. Returns how many rows went with it.
 */
export async function deleteDatabase(db: PrismaClient, databaseId: string): Promise<DeletedDatabase> {
  const database = await db.pageDatabase.findUnique({
    where: { id: databaseId },
    select: { workspaceId: true },
  });
  const rows = await db.knowledgePage.findMany({
    where: { databaseId },
    select: { id: true },
  });
  await db.$transaction(async (tx) => {
    if (database) await removeColumnsPointingAt(tx, database.workspaceId, databaseId);
    await tx.pageDatabase.delete({ where: { id: databaseId } });
  });
  await getEmbeddingTriggerService(db).clearPageChunksMany(rows.map((r) => r.id));
  return { id: databaseId, rowCount: rows.length };
}

/** Drop, from every other database of the workspace, the relation columns that target `databaseId`, and their edges. */
async function removeColumnsPointingAt(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  databaseId: string,
): Promise<void> {
  const others = await tx.pageDatabase.findMany({
    where: { workspaceId, id: { not: databaseId } },
    select: { id: true, properties: true, view: true },
  });
  for (const other of others) {
    const properties = parseProperties(other.properties);
    const pointing = properties.filter((p) => p.relation?.targetDatabaseId === databaseId);
    if (pointing.length === 0) continue;
    let next: { properties: PropertyDef[]; view: ReturnType<typeof parseView> } = {
      properties,
      view: parseView(other.view),
    };
    for (const def of pointing) next = withoutProperty(next.properties, next.view, def.id);
    await tx.databaseRelation.deleteMany({
      where: { databaseId: other.id, propertyId: { in: pointing.map((p) => p.id) } },
    });
    await tx.pageDatabase.update({
      where: { id: other.id },
      data: {
        properties: next.properties as unknown as Prisma.InputJsonValue,
        view: next.view as unknown as Prisma.InputJsonValue,
      },
    });
  }
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
