/**
 * The row query compiler (ADR-0078 §6): a database's saved view — sort,
 * filters, cursor — compiled to one parameterised SQL statement over
 * `KnowledgePage`. Raw SQL because Prisma cannot `orderBy` a JSON path; kept
 * pure and in one place so this is the only file that writes SQL for
 * databases. Every value is a bound parameter; property ids are checked
 * against the definition before they reach the statement.
 *
 * Equality and `anyOf` on scalars compile to `properties @> …`, which the
 * GIN index serves; ordering and range filters use `properties ->> id` with
 * a cast per type (numbers numeric, checkboxes boolean, dates as ISO text,
 * which sorts correctly). Casts are guarded by `jsonb_typeof`: a property
 * retyped without rewriting rows (`updateProperty`) may still hold values
 * of the old type, which read as empty rather than failing the statement.
 * Relation values are edges, not JSON (ADR-0078 §5), so their filters are
 * `EXISTS` over `DatabaseRelation` on the row and property.
 */
import { Prisma } from "@prisma/client";

import { validateValue } from "~/lib/databases/properties";
import {
  findProperty,
  type DatabaseView,
  type Filter,
  type PropertyDef,
} from "~/lib/databases/schema";

/** A view that names a property the database does not have, or an op its type cannot take. */
export class RowQueryError extends Error {
  constructor(
    message: string,
    public readonly propertyId: string,
  ) {
    super(message);
    this.name = "RowQueryError";
  }
}

export interface RowQueryInput {
  databaseId: string;
  properties: readonly PropertyDef[];
  view: DatabaseView;
  /** Rows to fetch; the statement asks for one more so the caller can tell if there are more. */
  limit: number;
  offset: number;
}

/** The columns a compiled query selects, in the shape `$queryRaw` returns. */
export interface RowQueryRecord {
  id: string;
  title: string;
  properties: Prisma.JsonValue;
  databaseId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = Prisma.sql`SELECT "id", "title", "properties", "databaseId", "createdById", "createdAt", "updatedAt" FROM "KnowledgePage"`;

/** Types whose values are lists in `properties`. */
function isListType(def: PropertyDef): boolean {
  return def.type === "multiSelect" || def.type === "person";
}

/** The expression a property reads as, for ordering and range comparison. */
function columnExpr(def: PropertyDef): Prisma.Sql {
  switch (def.type) {
    case "title":
      return Prisma.sql`"title"`;
    case "createdTime":
      return Prisma.sql`"createdAt"`;
    case "lastEditedTime":
      return Prisma.sql`"updatedAt"`;
    case "createdBy":
      return Prisma.sql`"createdById"`;
    // A property retyped from text may still hold text in older rows: cast
    // only values of the right JSON type and read the rest as NULL (empty),
    // so a stale "many" never turns a sort or range filter into a 500.
    case "number":
      return Prisma.sql`(CASE WHEN jsonb_typeof("properties"->${def.id}) = 'number' THEN ("properties"->>${def.id})::numeric END)`;
    case "checkbox":
      return Prisma.sql`(CASE WHEN jsonb_typeof("properties"->${def.id}) = 'boolean' THEN ("properties"->>${def.id})::boolean END)`;
    default:
      return Prisma.sql`"properties"->>${def.id}`;
  }
}

function fail(def: PropertyDef, op: string, why: string): never {
  throw new RowQueryError(`Filter "${op}" on "${def.name}" ${why}`, def.id);
}

/** A filter's value checked by the property's own rules (a select name becomes its id). */
function scalarValue(def: PropertyDef, filter: Filter): string | number | boolean {
  const result = validateValue(def, filter.value);
  if (!result.ok) fail(def, filter.op, result.reason);
  const value = Array.isArray(result.value) ? result.value[0] : result.value;
  if (value === null || value === undefined) fail(def, filter.op, "needs a value");
  return value;
}

/** `properties @> '{"<id>": <json>}'` — the GIN-served containment test. */
function contains(def: PropertyDef, json: unknown): Prisma.Sql {
  return Prisma.sql`"properties" @> ${JSON.stringify({ [def.id]: json })}::jsonb`;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isEmpty(def: PropertyDef): Prisma.Sql {
  switch (def.type) {
    case "title":
      return Prisma.sql`"title" = ''`;
    case "createdTime":
    case "lastEditedTime":
    case "createdBy":
      return Prisma.sql`FALSE`;
    default:
      // `->>` of a JSON null is SQL NULL; of an empty list it is the text '[]'.
      return Prisma.sql`COALESCE("properties"->>${def.id}, '') IN ('', '[]')`;
  }
}

/** The list a `anyOf` filter carries, each item checked as a value of the property. */
function listValues(def: PropertyDef, filter: Filter): string[] {
  const raw = Array.isArray(filter.value)
    ? filter.value
    : typeof filter.value === "string"
      ? filter.value.split(",")
      : null;
  if (!raw || raw.length === 0) fail(def, filter.op, "needs a list of values");
  return raw.map((item) => {
    const result = validateValue(def, item);
    if (!result.ok) fail(def, filter.op, result.reason);
    const value = Array.isArray(result.value) ? result.value[0] : result.value;
    if (value === null || value === undefined) fail(def, filter.op, "needs a value");
    return String(value);
  });
}

/** `EXISTS` over the row's edges under `def`, optionally to any of `targetIds`. */
function hasEdge(def: PropertyDef, targetIds?: string[]): Prisma.Sql {
  const to = targetIds
    ? Prisma.sql` AND r."targetId" = ANY(${targetIds}::text[])`
    : Prisma.empty;
  return Prisma.sql`EXISTS (SELECT 1 FROM "DatabaseRelation" r WHERE r."rowPageId" = "KnowledgePage"."id" AND r."propertyId" = ${def.id}${to})`;
}

/** A relation takes `anyOf` (and `eq`/`neq` as its one-target forms), `isEmpty` and `isNotEmpty`. */
function compileRelationFilter(def: PropertyDef, filter: Filter): Prisma.Sql {
  switch (filter.op) {
    case "isEmpty":
      return Prisma.sql`NOT ${hasEdge(def)}`;
    case "isNotEmpty":
      return hasEdge(def);
    case "anyOf":
      return hasEdge(def, listValues(def, filter));
    case "eq":
      return hasEdge(def, [String(scalarValue(def, filter))]);
    case "neq":
      return Prisma.sql`NOT ${hasEdge(def, [String(scalarValue(def, filter))])}`;
    default:
      fail(def, filter.op, "is not supported on a relation property");
  }
}

function compileFilter(def: PropertyDef, filter: Filter): Prisma.Sql {
  if (def.type === "relation") return compileRelationFilter(def, filter);
  const computed =
    def.type === "createdTime" || def.type === "lastEditedTime" || def.type === "createdBy";
  switch (filter.op) {
    case "isEmpty":
      return isEmpty(def);
    case "isNotEmpty":
      return Prisma.sql`NOT (${isEmpty(def)})`;
    case "eq":
    case "neq": {
      let test: Prisma.Sql;
      if (def.type === "title") {
        test = Prisma.sql`"title" = ${scalarValue(def, filter)}`;
      } else if (def.type === "createdBy") {
        test = Prisma.sql`"createdById" = ${String(filter.value)}`;
      } else if (computed) {
        fail(def, filter.op, "is not supported on a time property; use before or after");
      } else if (isListType(def)) {
        test = contains(def, [scalarValue(def, filter)]);
      } else {
        test = contains(def, scalarValue(def, filter));
      }
      return filter.op === "eq" ? test : Prisma.sql`NOT (${test})`;
    }
    case "contains": {
      if (isListType(def)) return contains(def, [scalarValue(def, filter)]);
      if (def.type === "number" || def.type === "checkbox" || computed) {
        fail(def, filter.op, `is not supported on a ${def.type} property`);
      }
      if (typeof filter.value !== "string" || filter.value === "") {
        fail(def, filter.op, "needs text");
      }
      const pattern = `%${escapeLike(filter.value)}%`;
      return def.type === "title"
        ? Prisma.sql`"title" ILIKE ${pattern}`
        : Prisma.sql`"properties"->>${def.id} ILIKE ${pattern}`;
    }
    case "gt":
    case "lt":
    case "before":
    case "after": {
      const greater = filter.op === "gt" || filter.op === "after";
      if (def.type === "createdTime" || def.type === "lastEditedTime") {
        const at = new Date(String(filter.value));
        if (Number.isNaN(at.getTime())) fail(def, filter.op, "needs an ISO date");
        return greater
          ? Prisma.sql`${columnExpr(def)} > ${at}`
          : Prisma.sql`${columnExpr(def)} < ${at}`;
      }
      if (def.type !== "number" && def.type !== "date") {
        fail(def, filter.op, `is not supported on a ${def.type} property`);
      }
      const value = scalarValue(def, filter);
      return greater
        ? Prisma.sql`${columnExpr(def)} > ${value}`
        : Prisma.sql`${columnExpr(def)} < ${value}`;
    }
    case "anyOf": {
      const values = listValues(def, filter);
      if (def.type === "title") return Prisma.sql`"title" = ANY(${values}::text[])`;
      if (def.type === "createdBy") return Prisma.sql`"createdById" = ANY(${values}::text[])`;
      if (computed) fail(def, filter.op, "is not supported on a time property");
      // A list cell matches when it holds any of the ids; a scalar when it is one of them.
      return isListType(def)
        ? Prisma.sql`"properties"->${def.id} ?| ${values}::text[]`
        : Prisma.sql`"properties"->>${def.id} = ANY(${values}::text[])`;
    }
  }
}

/**
 * The statement for one page of rows. Throws {@link RowQueryError} when the
 * view names an unknown property or an op the property's type cannot take —
 * the router turns that into BAD_REQUEST naming the property.
 */
export function compileRowQuery(input: RowQueryInput): Prisma.Sql {
  const where: Prisma.Sql[] = [Prisma.sql`"databaseId" = ${input.databaseId}`];
  for (const filter of input.view.filters) {
    const def = findProperty(input.properties, filter.propertyId);
    if (!def) {
      throw new RowQueryError(
        `Filter names a property this database does not have: "${filter.propertyId}"`,
        filter.propertyId,
      );
    }
    where.push(compileFilter(def, filter));
  }

  const order: Prisma.Sql[] = [];
  if (input.view.sort) {
    const def = findProperty(input.properties, input.view.sort.propertyId);
    if (!def) {
      throw new RowQueryError(
        `Sort names a property this database does not have: "${input.view.sort.propertyId}"`,
        input.view.sort.propertyId,
      );
    }
    order.push(
      input.view.sort.direction === "desc"
        ? Prisma.sql`${columnExpr(def)} DESC NULLS LAST`
        : Prisma.sql`${columnExpr(def)} ASC NULLS LAST`,
    );
  }
  // Creation order is the default and the tie-break, so paging is stable.
  order.push(Prisma.sql`"createdAt" ASC`, Prisma.sql`"id" ASC`);

  return Prisma.sql`${SELECT} WHERE ${Prisma.join(where, " AND ")} ORDER BY ${Prisma.join(order, ", ")} LIMIT ${input.limit + 1} OFFSET ${input.offset}`;
}

/**
 * Paging cursors are the offset into the sorted, filtered set — opaque to
 * callers, good enough for "load more" on a table; a keyset over an arbitrary
 * JSON sort key with nulls is not worth its weight here.
 */
export function offsetFromCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RowQueryError(`Invalid cursor "${cursor}"`, "");
  }
  return offset;
}

export function cursorFromOffset(offset: number): string {
  return String(offset);
}
