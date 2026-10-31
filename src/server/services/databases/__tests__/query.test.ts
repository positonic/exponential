/**
 * The row query compiler (ADR-0078 §6): the saved view becomes one
 * parameterised statement — containment for equality (GIN-served), typed
 * casts for ordering and ranges, creation order as the tie-break.
 */
import { describe, expect, it } from "vitest";

import {
  compileRowQuery,
  cursorFromOffset,
  offsetFromCursor,
  RowQueryError,
} from "../query";
import { emptyView, type DatabaseView, type PropertyDef } from "~/lib/databases/schema";

const TITLE = "p_title";
const STATUS = "p_status";
const SCORE = "p_score";
const TAGS = "p_tags";
const DUE = "p_due";
const DONE = "p_done";

const properties: PropertyDef[] = [
  { id: TITLE, name: "Name", type: "title" },
  {
    id: STATUS,
    name: "Status",
    type: "select",
    options: [
      { id: "o_nm", name: "Not measured", color: "gray" },
      { id: "o_tr", name: "Tracked", color: "green" },
    ],
  },
  { id: SCORE, name: "Score", type: "number" },
  {
    id: TAGS,
    name: "Tags",
    type: "multiSelect",
    options: [
      { id: "o_a", name: "Alpha", color: "blue" },
      { id: "o_b", name: "Beta", color: "teal" },
    ],
  },
  { id: DUE, name: "Due", type: "date" },
  { id: DONE, name: "Done", type: "checkbox" },
  { id: "p_created", name: "Created", type: "createdTime" },
];

function compile(view: Partial<DatabaseView>, paging = { limit: 50, offset: 0 }) {
  return compileRowQuery({
    databaseId: "db1",
    properties,
    view: { ...emptyView(), ...view },
    ...paging,
  });
}

describe("compileRowQuery", () => {
  it("defaults to creation order and asks for one row past the limit", () => {
    const q = compile({}, { limit: 50, offset: 100 });
    // `.text` is the Postgres form (`$n`); `.sql` is the generic `?` form.
    expect(q.text).toBe(
      'SELECT "id", "title", "properties", "databaseId", "createdById", "createdAt", "updatedAt" FROM "KnowledgePage" WHERE "databaseId" = $1 ORDER BY "createdAt" ASC, "id" ASC LIMIT $2 OFFSET $3',
    );
    expect(q.values).toEqual(["db1", 51, 100]);
  });

  it("sorts a number column numerically, nulls last, keeping the tie-break", () => {
    const q = compile({ sort: { propertyId: SCORE, direction: "desc" } });
    expect(q.text).toContain('ORDER BY ("properties"->>$2)::numeric DESC NULLS LAST, "createdAt" ASC, "id" ASC');
    expect(q.values[1]).toBe(SCORE);
  });

  it("sorts the title and the computed times by their real columns", () => {
    expect(compile({ sort: { propertyId: TITLE, direction: "asc" } }).text).toContain('ORDER BY "title" ASC NULLS LAST');
    expect(compile({ sort: { propertyId: "p_created", direction: "desc" } }).text).toContain('ORDER BY "createdAt" DESC NULLS LAST');
  });

  it("equality on a select resolves the option name and compiles to containment", () => {
    const q = compile({ filters: [{ propertyId: STATUS, op: "eq", value: "Tracked" }] });
    expect(q.text).toContain('"properties" @> $2::jsonb');
    expect(q.values[1]).toBe(JSON.stringify({ [STATUS]: "o_tr" }));
  });

  it("neq negates the containment test, so empty cells count as different", () => {
    const q = compile({ filters: [{ propertyId: DONE, op: "neq", value: true }] });
    expect(q.text).toContain('NOT ("properties" @> $2::jsonb)');
    expect(q.values[1]).toBe(JSON.stringify({ [DONE]: true }));
  });

  it("equality on a list property tests for the element", () => {
    const q = compile({ filters: [{ propertyId: TAGS, op: "eq", value: "beta" }] });
    expect(q.values[1]).toBe(JSON.stringify({ [TAGS]: ["o_b"] }));
  });

  it("contains is a case-insensitive LIKE with wildcards escaped", () => {
    const q = compile({ filters: [{ propertyId: TITLE, op: "contains", value: "50%_x" }] });
    expect(q.text).toContain('"title" ILIKE $2');
    expect(q.values[1]).toBe("%50\\%\\_x%");
  });

  it("isEmpty and isNotEmpty read the text form, treating an empty list as empty", () => {
    const empty = compile({ filters: [{ propertyId: TAGS, op: "isEmpty" }] });
    expect(empty.text).toContain(`COALESCE("properties"->>$2, '') IN ('', '[]')`);
    const notEmpty = compile({ filters: [{ propertyId: STATUS, op: "isNotEmpty" }] });
    expect(notEmpty.text).toContain(`NOT (COALESCE("properties"->>$2, '') IN ('', '[]'))`);
  });

  it("ranges cast numbers and compare dates as ISO text", () => {
    const gt = compile({ filters: [{ propertyId: SCORE, op: "gt", value: "7" }] });
    expect(gt.text).toContain('("properties"->>$2)::numeric > $3');
    expect(gt.values.slice(1, 3)).toEqual([SCORE, 7]);
    const before = compile({ filters: [{ propertyId: DUE, op: "before", value: "2026-11-01" }] });
    expect(before.text).toContain('"properties"->>$2 < $3');
    expect(before.values[2]).toBe("2026-11-01");
    const after = compile({ filters: [{ propertyId: "p_created", op: "after", value: "2026-10-01" }] });
    expect(after.text).toContain('"createdAt" > $2');
    expect(after.values[1]).toBeInstanceOf(Date);
  });

  it("anyOf uses array membership for scalars and ?| for lists", () => {
    const scalar = compile({ filters: [{ propertyId: STATUS, op: "anyOf", value: ["Tracked", "o_nm"] }] });
    expect(scalar.text).toContain('"properties"->>$2 = ANY($3::text[])');
    expect(scalar.values[2]).toEqual(["o_tr", "o_nm"]);
    const list = compile({ filters: [{ propertyId: TAGS, op: "anyOf", value: "Alpha,Beta" }] });
    expect(list.text).toContain('"properties"->$2 ?| $3::text[]');
    expect(list.values[2]).toEqual(["o_a", "o_b"]);
  });

  it("joins several filters with AND, parameters in order", () => {
    const q = compile({
      filters: [
        { propertyId: STATUS, op: "eq", value: "Tracked" },
        { propertyId: SCORE, op: "lt", value: 10 },
      ],
    });
    expect(q.text).toContain('WHERE "databaseId" = $1 AND "properties" @> $2::jsonb AND ("properties"->>$3)::numeric < $4');
    expect(q.values).toEqual(["db1", JSON.stringify({ [STATUS]: "o_tr" }), SCORE, 10, 51, 0]);
  });

  it("rejects an unknown property, a bad option and an op the type cannot take, naming the property", () => {
    expect(() => compile({ filters: [{ propertyId: "nope", op: "eq", value: 1 }] })).toThrow(RowQueryError);
    expect(() => compile({ sort: { propertyId: "nope", direction: "asc" } })).toThrow(/does not have/);
    expect(() => compile({ filters: [{ propertyId: STATUS, op: "eq", value: "Done" }] })).toThrow(/has no option "Done"/);
    expect(() => compile({ filters: [{ propertyId: DONE, op: "contains", value: "x" }] })).toThrow(/not supported on a checkbox/);
    expect(() => compile({ filters: [{ propertyId: STATUS, op: "gt", value: "a" }] })).toThrow(/not supported on a select/);
    try {
      compile({ filters: [{ propertyId: SCORE, op: "eq", value: "many" }] });
    } catch (error) {
      expect((error as RowQueryError).propertyId).toBe(SCORE);
    }
  });
});

describe("cursors", () => {
  it("round-trip an offset and refuse garbage", () => {
    expect(offsetFromCursor(undefined)).toBe(0);
    expect(offsetFromCursor(cursorFromOffset(150))).toBe(150);
    expect(() => offsetFromCursor("-1")).toThrow(RowQueryError);
    expect(() => offsetFromCursor("abc")).toThrow(RowQueryError);
  });
});
