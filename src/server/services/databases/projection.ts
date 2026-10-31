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

import {
  cellMarkdown,
  escapeTableCell,
  type CellContext,
  type PropertyValue,
} from "~/lib/databases/properties";
import {
  parseProperties,
  parseView,
  visibleProperties,
  type DatabaseView,
  type PropertyDef,
} from "~/lib/databases/schema";
import { collectDatabaseMarkerIds, DATABASE_MARKER_LINE_RE } from "~/lib/databases/marker";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { compileRowQuery, type RowQueryRecord } from "./query";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Rows a projected table shows at most. A page's Markdown is read whole by
 * agents and embedded as one document; past this a database is for the
 * typed API, and the table says how many rows it left out.
 */
export const PROJECTION_ROW_LIMIT = 200;

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
  /** Rows the view matches beyond `rows`, when the projection was capped. */
  moreRows?: number;
}

/** A stored `properties` column read as values keyed by property id. */
export function rowValues(json: unknown): Record<string, PropertyValue | null> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, PropertyValue | null>)
    : {};
}

function cell(
  def: PropertyDef,
  row: ProjectedRow,
  titlePropertyId: string,
  ctx: CellContext,
): string {
  if (def.id === titlePropertyId || def.type === "title") {
    const title = escapeTableCell(row.title || "Untitled");
    return row.href ? `[${title.replace(/([[\]])/g, "\\$1")}](${row.href})` : title;
  }
  return cellMarkdown(def, row.properties[def.id], ctx);
}

/**
 * A database as a GFM pipe table: one header cell per visible property in
 * view order, one line per row. An empty database is a header with no lines.
 */
export function renderDatabaseTable(
  database: ProjectedDatabase,
  titlePropertyId: string,
  ctx: CellContext = {},
): string {
  const columns = visibleProperties(database.properties, database.view);
  if (columns.length === 0) return "";
  const header = `| ${columns.map((c) => escapeTableCell(c.name)).join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const lines = database.rows.map(
    (row) => `| ${columns.map((c) => cell(c, row, titlePropertyId, ctx)).join(" | ")} |`,
  );
  const table = [header, rule, ...lines].join("\n");
  return database.moreRows
    ? `${table}\n\n_${database.moreRows} more row${database.moreRows === 1 ? "" : "s"} not shown._`
    : table;
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
 * never read rows its holder has no access to. Each table is the saved view
 * (its sort and filters), capped at {@link PROJECTION_ROW_LIMIT} rows.
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

  const parsed: (ProjectedDatabase & { titlePropertyId: string })[] = [];
  for (const database of databases) {
    const properties = parseProperties(database.properties);
    const view = parseView(database.view);
    let records: RowQueryRecord[];
    try {
      records = await db.$queryRaw<RowQueryRecord[]>(
        compileRowQuery({
          databaseId: database.id,
          properties,
          view,
          limit: PROJECTION_ROW_LIMIT,
          offset: 0,
        }),
      );
    } catch {
      // A saved view that no longer compiles (a filter on a removed property)
      // must not take the page down with it: project the rows unfiltered.
      records = await db.$queryRaw<RowQueryRecord[]>(
        compileRowQuery({
          databaseId: database.id,
          properties,
          view: { ...view, sort: undefined, filters: [] },
          limit: PROJECTION_ROW_LIMIT,
          offset: 0,
        }),
      );
    }
    const capped = records.length > PROJECTION_ROW_LIMIT;
    const shown = capped ? records.slice(0, PROJECTION_ROW_LIMIT) : records;
    const moreRows = capped
      ? Math.max(
          0,
          (await db.knowledgePage.count({ where: { databaseId: database.id } })) -
            PROJECTION_ROW_LIMIT,
        )
      : 0;
    parsed.push({
      id: database.id,
      name: database.name,
      properties,
      view,
      rows: shown.map((row) => ({
        id: row.id,
        title: row.title,
        properties: rowValues(row.properties),
        href: buildPageEditorPath(database.workspace.slug, row.id),
      })),
      ...(moreRows ? { moreRows } : {}),
      titlePropertyId: database.titlePropertyId,
    });
  }
  const ctx = await personNames(db, parsed);

  const tables = new Map<string, string>();
  for (const database of parsed) {
    tables.set(database.id, renderDatabaseTable(database, database.titlePropertyId, ctx));
  }
  return expandMarkers(body, (id) => tables.get(id) ?? null);
}

/** Resolve every person value across the tables to a display name, in one query. */
async function personNames(db: Db, databases: ProjectedDatabase[]): Promise<CellContext> {
  const ids = new Set<string>();
  for (const database of databases) {
    const personIds = database.properties.filter((p) => p.type === "person").map((p) => p.id);
    if (personIds.length === 0) continue;
    for (const row of database.rows) {
      for (const propertyId of personIds) {
        const value = row.properties[propertyId];
        for (const id of Array.isArray(value) ? value : value ? [String(value)] : []) ids.add(id);
      }
    }
  }
  if (ids.size === 0) return {};
  const users = await db.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, email: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  return { personName: (id) => names.get(id) };
}
