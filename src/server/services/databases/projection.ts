/**
 * The Markdown projection of a Database (ADR-0078 §7). The stored page `body`
 * carries a marker per block (see `~/lib/databases/marker`); this module
 * expands each marker into a GFM table of the database's visible columns in
 * view order, so `page.get`, search and agents read the rows without the
 * rows ever being written into the body.
 *
 * Any new reader of `body` (an exporter, an embedding source) must call
 * {@link expandDatabaseMarkers} or document that it does not.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { cellMarkdown, escapeTableCell, type PropertyValue } from "~/lib/databases/properties";
import {
  parseProperties,
  parseView,
  visibleProperties,
  type DatabaseView,
  type PropertyDef,
} from "~/lib/databases/schema";
import { collectDatabaseMarkerIds, DATABASE_MARKER_LINE_RE } from "~/lib/databases/marker";
import { buildPageEditorPath } from "~/lib/pages/page-path";

type Db = PrismaClient | Prisma.TransactionClient;

/** One row as the projection needs it. */
export interface ProjectedRow {
  id: string;
  title: string;
  properties: Record<string, PropertyValue | null>;
  /** Where the row page opens; the title cell links there when given. */
  href?: string;
}

/** One database as the projection needs it. */
export interface ProjectedDatabase {
  id: string;
  name: string;
  properties: PropertyDef[];
  view: DatabaseView;
  rows: ProjectedRow[];
}

/** A stored `properties` column read as values keyed by property id. */
export function rowValues(json: unknown): Record<string, PropertyValue | null> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, PropertyValue | null>)
    : {};
}

function cell(def: PropertyDef, row: ProjectedRow, titlePropertyId: string): string {
  if (def.id === titlePropertyId || def.type === "title") {
    const title = escapeTableCell(row.title || "Untitled");
    return row.href ? `[${title.replace(/([[\]])/g, "\\$1")}](${row.href})` : title;
  }
  return cellMarkdown(def, row.properties[def.id]);
}

/**
 * A database as a GFM pipe table: one header cell per visible property in
 * view order, one line per row. An empty database is a header with no lines.
 */
export function renderDatabaseTable(
  database: ProjectedDatabase,
  titlePropertyId: string,
): string {
  const columns = visibleProperties(database.properties, database.view);
  if (columns.length === 0) return "";
  const header = `| ${columns.map((c) => escapeTableCell(c.name)).join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const lines = database.rows.map(
    (row) => `| ${columns.map((c) => cell(c, row, titlePropertyId)).join(" | ")} |`,
  );
  return [header, rule, ...lines].join("\n");
}

/**
 * Replace each marker line with the marker **followed by** its table, so the
 * block's identity survives in the expanded text. A marker `lookup` returns
 * no table for (an id the page does not own) is left as it is.
 */
export function expandMarkers(
  body: string,
  lookup: (databaseId: string) => string | null,
): string {
  return body.replace(DATABASE_MARKER_LINE_RE, (line, id: string) => {
    const table = lookup(id);
    return table ? `${line.trim()}\n\n${table}` : line;
  });
}

/**
 * Expand the database markers in `pageId`'s body. Only databases the page
 * owns expand — a marker pasted from another page stays inert, so a body can
 * never read rows its holder has no access to. Rows come back in creation
 * order; the saved view's sort and filters apply from the next slice.
 */
export async function expandDatabaseMarkers(
  db: Db,
  pageId: string,
  body: string | null | undefined,
): Promise<string | null> {
  if (!body) return body ?? null;
  const ids = collectDatabaseMarkerIds(body);
  if (ids.length === 0) return body;

  const databases = await db.pageDatabase.findMany({
    where: { id: { in: ids }, pageId },
    select: {
      id: true,
      name: true,
      properties: true,
      view: true,
      titlePropertyId: true,
      workspace: { select: { slug: true } },
    },
  });
  if (databases.length === 0) return body;

  const rows = await db.knowledgePage.findMany({
    where: { databaseId: { in: databases.map((d) => d.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, properties: true, databaseId: true },
  });
  const rowsByDatabase = new Map<string, ProjectedRow[]>();
  for (const database of databases) rowsByDatabase.set(database.id, []);
  for (const row of rows) {
    const database = databases.find((d) => d.id === row.databaseId);
    if (!database) continue;
    rowsByDatabase.get(database.id)!.push({
      id: row.id,
      title: row.title,
      properties: rowValues(row.properties),
      href: buildPageEditorPath(database.workspace.slug, row.id),
    });
  }

  const tables = new Map<string, string>();
  for (const database of databases) {
    tables.set(
      database.id,
      renderDatabaseTable(
        {
          id: database.id,
          name: database.name,
          properties: parseProperties(database.properties),
          view: parseView(database.view),
          rows: rowsByDatabase.get(database.id) ?? [],
        },
        database.titlePropertyId,
      ),
    );
  }
  return expandMarkers(body, (id) => tables.get(id) ?? null);
}
