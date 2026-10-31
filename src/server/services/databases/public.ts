/**
 * Databases on a published page (ADR-0078 §4): the tables the public render
 * shows, and a row page's header. Rows read through the saved view, capped
 * like the Markdown projection; a row's title links to its own public URL
 * only while that row is published (it is, whenever its holding page is).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { computedValue, displayValue, rowValues } from "~/lib/databases/display";
import { parseProperties, parseView, visibleProperties } from "~/lib/databases/schema";
import { buildPublicPagePath } from "~/lib/pages/public-url";
import type { PublicDatabaseMap, PublicDatabaseTable } from "~/lib/pages/public-doc";
import { compileRowQuery, type RowQueryRecord } from "./query";
import { PROJECTION_ROW_LIMIT } from "./projection";

type Db = PrismaClient | Prisma.TransactionClient;

interface PublicRowRecord extends RowQueryRecord {
  isPublic: boolean;
  publicId: string | null;
  publicSlug: string | null;
}

/** Display names for every person id the tables mention, in one query. */
async function personNames(db: Db, ids: Iterable<string>): Promise<(id: string) => string | undefined> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return () => undefined;
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  return (id) => names.get(id);
}

/**
 * Every database the page holds, projected for the public render. Rows come
 * through the saved view; the public row page link is built from the row's
 * own `publicSlug`/`publicId`, set by `publishPage` alongside the holder.
 */
export async function publicDatabaseTables(db: Db, pageId: string): Promise<PublicDatabaseMap> {
  const databases = await db.pageDatabase.findMany({
    where: { pageId, detachedAt: null },
    select: { id: true, name: true, properties: true, view: true, titlePropertyId: true },
  });
  const tables = new Map<string, PublicDatabaseTable>();
  if (databases.length === 0) return tables;

  const prepared = [];
  for (const database of databases) {
    const properties = parseProperties(database.properties);
    const view = parseView(database.view);
    let ids: RowQueryRecord[];
    try {
      ids = await db.$queryRaw<RowQueryRecord[]>(
        compileRowQuery({ databaseId: database.id, properties, view, limit: PROJECTION_ROW_LIMIT, offset: 0 }),
      );
    } catch {
      // A saved filter that no longer compiles must not take the public
      // page down: show the rows unfiltered, as the Markdown projection does.
      ids = await db.$queryRaw<RowQueryRecord[]>(
        compileRowQuery({
          databaseId: database.id,
          properties,
          view: { ...view, sort: undefined, filters: [] },
          limit: PROJECTION_ROW_LIMIT,
          offset: 0,
        }),
      );
    }
    const shown = ids.slice(0, PROJECTION_ROW_LIMIT);
    // The compiled query does not select publish state; one lookup per table.
    const published = await db.knowledgePage.findMany({
      where: { id: { in: shown.map((r) => r.id) }, isPublic: true, publicId: { not: null } },
      select: { id: true, publicId: true, publicSlug: true },
    });
    const publicById = new Map(published.map((p) => [p.id, p]));
    const rows: PublicRowRecord[] = shown.map((row) => ({
      ...row,
      isPublic: publicById.has(row.id),
      publicId: publicById.get(row.id)?.publicId ?? null,
      publicSlug: publicById.get(row.id)?.publicSlug ?? null,
    }));
    prepared.push({ database, properties, view, rows });
  }

  const personIds = new Set<string>();
  for (const { properties, rows } of prepared) {
    const personProps = properties.filter((p) => p.type === "person").map((p) => p.id);
    const showsCreator = properties.some((p) => p.type === "createdBy");
    for (const row of rows) {
      if (showsCreator) personIds.add(row.createdById);
      const values = rowValues(row.properties);
      for (const id of personProps) {
        const value = values[id];
        for (const person of Array.isArray(value) ? value : value ? [String(value)] : []) personIds.add(person);
      }
    }
  }
  const personName = await personNames(db, personIds);

  for (const { database, properties, view, rows } of prepared) {
    const columns = visibleProperties(properties, view);
    const titleIndex = columns.findIndex((c) => c.id === database.titlePropertyId || c.type === "title");
    tables.set(database.id, {
      name: database.name,
      columns: columns.map((c) => c.name),
      ...(titleIndex >= 0 ? { titleIndex } : {}),
      rows: rows.map((row) => {
        const values = rowValues(row.properties);
        return {
          cells: columns.map((def) =>
            def.id === database.titlePropertyId || def.type === "title"
              ? row.title || "Untitled"
              : displayValue(def, computedValue(def, row) ?? values[def.id], { personName }),
          ),
          ...(row.publicId
            ? { href: buildPublicPagePath(row.publicSlug ?? "", row.publicId) }
            : {}),
        };
      }),
    });
  }
  return tables;
}

/** A published row page's header: label/value pairs for every non-title property. */
export async function publicRowHeader(
  db: Db,
  page: { id: string; databaseId: string | null; properties: unknown; createdAt: Date; updatedAt: Date; createdById: string },
): Promise<{ database: { name: string; pageId: string }; fields: { name: string; value: string }[] } | null> {
  if (!page.databaseId) return null;
  const database = await db.pageDatabase.findUnique({
    where: { id: page.databaseId },
    select: { name: true, pageId: true, properties: true },
  });
  if (!database) return null;
  const properties = parseProperties(database.properties).filter((p) => p.type !== "title");
  const values = rowValues(page.properties);
  const ids = new Set<string>();
  for (const def of properties) {
    if (def.type === "createdBy") ids.add(page.createdById);
    if (def.type === "person") {
      const value = values[def.id];
      for (const id of Array.isArray(value) ? value : value ? [String(value)] : []) ids.add(id);
    }
  }
  const personName = await personNames(db, ids);
  return {
    database: { name: database.name, pageId: database.pageId },
    fields: properties.map((def) => ({
      name: def.name,
      value: displayValue(def, computedValue(def, page) ?? values[def.id], { personName }),
    })),
  };
}
