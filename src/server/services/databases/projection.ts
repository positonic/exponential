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
import {
  collectDatabaseMarkerIds,
  DATABASE_MARKER_LINE_RE,
  stripProjectedTables,
} from "~/lib/databases/marker";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { rowValues } from "~/lib/databases/display";
import type { RowRelations } from "~/lib/databases/relations";
import { compileRowQuery, type RowQueryRecord } from "./query";
import { loadRowRelations, relationMarkdown } from "./relations";

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
  /** The row page's own columns, behind the read-only property types. */
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: string;
  /** Relation targets by property id, resolved; a relation cell is empty without them. */
  relations?: RowRelations;
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

// `rowValues` lives in the client-safe display module; re-exported for the
// server callers that always read it from here.
export { rowValues };

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
  if (def.type === "relation") return escapeTableCell(relationMarkdown(row.relations?.[def.id]));
  return cellMarkdown(def, computedValue(def, row) ?? row.properties[def.id], ctx);
}

/** The value of a read-only property, taken from the row page itself. */
function computedValue(def: PropertyDef, row: ProjectedRow): PropertyValue | null | undefined {
  switch (def.type) {
    case "createdTime":
      return row.createdAt?.toISOString() ?? null;
    case "lastEditedTime":
      return row.updatedAt?.toISOString() ?? null;
    case "createdBy":
      return row.createdById ? [row.createdById] : null;
    default:
      return undefined;
  }
}

/**
 * A Row page's property header (ADR-0078 §7): one `**Name:** value` line per
 * property in definition order, the title left out (it is the page title).
 * An empty cell reads as an em dash so the schema stays visible.
 */
export function renderRowHeader(
  properties: readonly PropertyDef[],
  row: ProjectedRow,
  ctx: CellContext = {},
): string {
  return properties
    .filter((def) => def.type !== "title")
    .map((def) => {
      const value =
        def.type === "relation"
          ? escapeTableCell(relationMarkdown(row.relations?.[def.id]))
          : cellMarkdown(def, computedValue(def, row) ?? row.properties[def.id], ctx);
      return `**${escapeTableCell(def.name)}:** ${value || "—"}`;
    })
    .join("\n");
}

/** What `page.get` adds to a Row: its database and the header above the prose. */
export interface RowPageProjection {
  database: { id: string; name: string; pageId: string; pageTitle: string };
  /** The `**Name:** value` lines alone — for the editor host, which must not get them as prose. */
  header: string;
  /** The header, a blank line, then the stored prose (or the header alone) — for readers. */
  body: string | null;
}

/**
 * The Markdown a reader outside the editor should see for any page: a Row's
 * header over its prose, or an ordinary page's body with its database
 * markers expanded. `page.get`, the embedding sweep and any exporter read
 * through this, so search and agents see the same text.
 */
export async function projectedPageBody(
  db: Db,
  page: Parameters<typeof projectRowPage>[1],
): Promise<string | null> {
  const row = await projectRowPage(db, page);
  return row ? row.body : expandDatabaseMarkers(db, page.id, page.body);
}

/**
 * Project a Row page: the key/value header from its values, over its own
 * Markdown body. Null when the page is not a row or its database is gone.
 */
export async function projectRowPage(
  db: Db,
  page: {
    id: string;
    databaseId: string | null;
    title: string;
    body: string | null;
    properties: unknown;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
  },
): Promise<RowPageProjection | null> {
  if (!page.databaseId) return null;
  const database = await db.pageDatabase.findUnique({
    where: { id: page.databaseId },
    select: {
      id: true,
      name: true,
      pageId: true,
      properties: true,
      view: true,
      page: { select: { title: true } },
      workspace: { select: { slug: true } },
    },
  });
  if (!database) return null;
  const properties = parseProperties(database.properties);
  const relations = await loadRowRelations(db, [page.id], properties, database.workspace.slug);
  const row: ProjectedRow = {
    id: page.id,
    title: page.title,
    properties: rowValues(page.properties),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    createdById: page.createdById,
    relations: relations.get(page.id),
  };
  const ctx = await personNames(db, [
    { id: database.id, name: database.name, properties, view: parseView(database.view), rows: [row] },
  ]);
  const header = renderRowHeader(properties, row, ctx);
  const prose = page.body?.trim() ? page.body : null;
  return {
    database: {
      id: database.id,
      name: database.name,
      pageId: database.pageId,
      pageTitle: database.page.title,
    },
    header,
    body: header ? (prose ? `${header}\n\n${prose}` : header) : prose,
  };
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
  // A body that somehow still carries a projected table (written before the
  // Markdown path normalised it) expands once, not on top of the old copy.
  body = stripProjectedTables(body);

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
    const relations = await loadRowRelations(
      db,
      shown.map((row) => row.id),
      properties,
      database.workspace.slug,
    );
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
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdById: row.createdById,
        relations: relations.get(row.id),
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
    const showsCreator = database.properties.some((p) => p.type === "createdBy");
    if (personIds.length === 0 && !showsCreator) continue;
    for (const row of database.rows) {
      if (showsCreator && row.createdById) ids.add(row.createdById);
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
