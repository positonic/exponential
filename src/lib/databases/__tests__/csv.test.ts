/**
 * CSV import (ADR-0078, V4): headers map to properties by name, the rest
 * become new columns, and every cell is typed before any row exists — a
 * cell that does not fit names its column and leaves its row out.
 */
import { describe, expect, it } from "vitest";

import {
  CsvMappingError,
  parseCsv,
  previewCsvRows,
  resolveCsvColumns,
  suggestCsvMapping,
  type CsvMapping,
} from "../csv";
import type { PropertyDef } from "../schema";

const TITLE = "ptitle000001";
const STATUS = "pstatus00001";
const SCORE = "pscore000001";
const PROBLEMS = "pproblems001";
const properties: PropertyDef[] = [
  { id: TITLE, name: "Name", type: "title" },
  { id: STATUS, name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
  { id: SCORE, name: "Score", type: "number" },
  { id: PROBLEMS, name: "Problems", type: "relation", relation: { targetKind: "ROW", targetDatabaseId: "db2", many: true } },
];
const file = ["Name,Score,Owner", "Alert latency,7,Ana", "Coverage,lots,Ben", "Uptime,,"].join("\n");

describe("suggestCsvMapping", () => {
  it("maps headers that name a property, skips relations and read-only ones, and makes the rest new text columns", () => {
    const mapping = suggestCsvMapping(properties, ["name", "Score", "Problems", "Owner", ""]);
    expect(mapping).toEqual({
      name: { kind: "property", propertyId: TITLE },
      Score: { kind: "property", propertyId: SCORE },
      Problems: { kind: "skip" },
      Owner: { kind: "new", name: "Owner", type: "text" },
      "": { kind: "skip" },
    });
  });

  it("gives the title to the first unclaimed header when none names it", () => {
    expect(suggestCsvMapping(properties, ["Metric", "Score"])).toEqual({
      Metric: { kind: "property", propertyId: TITLE },
      Score: { kind: "property", propertyId: SCORE },
    });
  });
});

describe("resolveCsvColumns", () => {
  const headers = ["Name", "Score", "Owner"];
  it("refuses a header the file lacks, an unknown or unimportable property, a clash, and a duplicate target", () => {
    const bad = (mapping: CsvMapping) => () => resolveCsvColumns(properties, headers, mapping);
    expect(bad({ Nope: { kind: "skip" } })).toThrow(CsvMappingError);
    expect(bad({ Name: { kind: "property", propertyId: "gone" } })).toThrow(/does not have/);
    expect(bad({ Name: { kind: "property", propertyId: PROBLEMS } })).toThrow(/cannot be imported/);
    expect(bad({ Name: { kind: "new", name: "status", type: "text" } })).toThrow(/already exists/);
    expect(bad({ Name: { kind: "property", propertyId: SCORE }, Score: { kind: "property", propertyId: SCORE } })).toThrow(/Two columns/);
    expect(bad({ Owner: { kind: "new", name: "Owner", type: "title" } })).toThrow(/cannot create/);
  });

  it("keeps file order and leaves unmapped headers skipped", () => {
    const columns = resolveCsvColumns(properties, headers, { Owner: { kind: "new", name: "Owner", type: "text" } });
    expect(columns.map((c) => [c.header, c.target.kind, c.def?.name])).toEqual([
      ["Name", "skip", undefined],
      ["Score", "skip", undefined],
      ["Owner", "new", "Owner"],
    ]);
  });
});

describe("previewCsvRows", () => {
  it("types every row, names the cell that does not fit, and counts the importable ones", () => {
    const parsed = parseCsv(file);
    const columns = resolveCsvColumns(properties, parsed.headers, suggestCsvMapping(properties, parsed.headers));
    const preview = previewCsvRows(columns, parsed);
    expect(preview.rows).toEqual([
      { index: 0, title: "Alert latency", values: { [SCORE]: 7, "new:Owner": "Ana" }, errors: [] },
      {
        index: 1,
        title: "Coverage",
        values: { "new:Owner": "Ben" },
        errors: [{ header: "Score", propertyName: "Score", reason: 'expects a number, got "lots"' }],
      },
      { index: 2, title: "Uptime", values: { [SCORE]: null, "new:Owner": null }, errors: [] },
    ]);
    expect(preview.importable).toBe(2);
  });
});
