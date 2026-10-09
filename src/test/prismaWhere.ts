/**
 * Evaluate a Prisma `where` clause against an in-memory row.
 *
 * A mocked PrismaClient never evaluates the `where` it is handed, so a unit
 * test can only say *which* clause a query used, not *which rows* it admits.
 * This covers the subset of Prisma filter syntax the access resolvers emit,
 * so a test can ask "would this caller's write reach this row?" without a
 * database:
 *
 * - `AND` / `OR` / `NOT` combinators
 * - scalar equality and `{ equals, in, notIn, not, lt, lte, gt, gte }`
 * - to-many relation filters `{ some, none, every }` over arrays
 * - to-one relation filters (a nested object; a null relation never matches)
 *
 * Rows are plain objects with relations inlined: `{ project: { workspace:
 * { members: [{ userId, role }] } } }`. Anything outside that subset throws,
 * so a resolver growing a new operator fails the test loudly instead of
 * silently matching.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const SCALAR_OPS = new Set(["equals", "in", "notIn", "not", "lt", "lte", "gt", "gte"]);
const LIST_OPS = new Set(["some", "none", "every"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (typeof x === "number" && typeof y === "number") return x - y;
  if (typeof x === "string" && typeof y === "string") return x < y ? -1 : x > y ? 1 : 0;
  throw new Error(`prismaWhere: cannot order ${String(a)} against ${String(b)}`);
}

function scalarEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function matchScalar(value: unknown, filter: unknown): boolean {
  if (!isPlainObject(filter)) return scalarEquals(value, filter);
  return Object.entries(filter).every(([op, arg]) => {
    switch (op) {
      case "equals":
        return scalarEquals(value, arg);
      case "in":
        return (arg as unknown[]).some((x) => scalarEquals(value, x));
      // SQL three-valued logic: `NULL NOT IN (…)` and `NULL <> x` are never
      // true, so a NULL column fails both — only `not: null` (IS NOT NULL)
      // is decided by the null itself.
      case "notIn":
        return value != null && !(arg as unknown[]).some((x) => scalarEquals(value, x));
      case "not":
        if (arg === null) return value != null;
        return value != null && !matchScalar(value, arg);
      case "lt":
        return value != null && compare(value, arg) < 0;
      case "lte":
        return value != null && compare(value, arg) <= 0;
      case "gt":
        return value != null && compare(value, arg) > 0;
      case "gte":
        return value != null && compare(value, arg) >= 0;
      default:
        throw new Error(`prismaWhere: unsupported scalar operator "${op}"`);
    }
  });
}

function matchList(items: unknown[], filter: Where): boolean {
  return Object.entries(filter).every(([op, sub]) => {
    const each = (item: unknown) => matchesWhere(item as Row, sub as Where);
    switch (op) {
      case "some":
        return items.some(each);
      case "none":
        return !items.some(each);
      case "every":
        return items.every(each);
      default:
        throw new Error(`prismaWhere: unsupported list operator "${op}"`);
    }
  });
}

function isScalarFilter(filter: unknown): boolean {
  return !isPlainObject(filter) || Object.keys(filter).every((k) => SCALAR_OPS.has(k));
}

export function matchesWhere(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (filter === undefined) return true;
    if (key === "AND") {
      const parts = Array.isArray(filter) ? filter : [filter];
      return parts.every((w) => matchesWhere(row, w as Where));
    }
    if (key === "OR") return (filter as Where[]).some((w) => matchesWhere(row, w));
    if (key === "NOT") {
      const parts = Array.isArray(filter) ? filter : [filter];
      return !parts.some((w) => matchesWhere(row, w as Where));
    }

    if (!(key in row)) {
      throw new Error(`prismaWhere: row has no field "${key}" — add it to the fixture`);
    }
    const value = row[key];

    if (Array.isArray(value)) {
      if (!isPlainObject(filter) || !Object.keys(filter).every((k) => LIST_OPS.has(k))) {
        throw new Error(`prismaWhere: to-many field "${key}" needs some/none/every`);
      }
      return matchList(value, filter);
    }
    if (isPlainObject(value)) return matchesWhere(value, filter as Where);
    // A null to-one relation never satisfies a relation filter.
    if (value === null && !isScalarFilter(filter)) return false;
    return matchScalar(value, filter);
  });
}
