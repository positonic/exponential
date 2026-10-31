/**
 * CSV import (ADR-0078, V4): headers map to properties by name, the rest
 * become new columns, and every cell is typed before any row exists — a
 * cell that does not fit names its column and leaves its row out.
 */
import { describe, expect, it } from "vitest";

import {
  CsvMappingError,
  parseCsv,
  parseCsvCell,
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
    expect(bad({ Owner: { kind: "new", name: "o".repeat(201), type: "text" } })).toThrow(/at most 200/);
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

describe("parseCsvCell — spreadsheet forms per type", () => {
  const def = (type: PropertyDef["type"], extra: Partial<PropertyDef> = {}): PropertyDef => ({ id: `p_${type}`, name: type, type, ...extra });
  it("numbers: separators, a currency sign, a percent, parentheses", () => {
    expect(parseCsvCell(def("number"), "1,234.5").result).toEqual({ ok: true, value: 1234.5 });
    expect(parseCsvCell(def("number"), "$42").result).toEqual({ ok: true, value: 42 });
    expect(parseCsvCell(def("number"), "12%").result).toEqual({ ok: true, value: 12 });
    expect(parseCsvCell(def("number"), "(7)").result).toEqual({ ok: true, value: -7 });
    expect(parseCsvCell(def("number"), "lots").result.ok).toBe(false);
  });
  it("urls without a scheme are https; checkboxes take ticks and crosses; an empty cell clears", () => {
    expect(parseCsvCell(def("url"), "example.com/docs").result).toEqual({ ok: true, value: "https://example.com/docs" });
    expect(parseCsvCell(def("url"), "not a url").result.ok).toBe(false);
    expect(parseCsvCell(def("checkbox"), "✓").result).toEqual({ ok: true, value: true });
    expect(parseCsvCell(def("checkbox"), "x").result).toEqual({ ok: true, value: true });
    expect(parseCsvCell(def("checkbox"), "✗").result).toEqual({ ok: true, value: false });
    expect(parseCsvCell(def("checkbox"), "no").result).toEqual({ ok: true, value: false });
    expect(parseCsvCell(def("date"), "  ").result).toEqual({ ok: true, value: null });
  });
  it("selects resolve option names to ids and keep (and report) names the property lacks; a multi-select splits on , or ;", () => {
    const status = def("select", { options: [{ id: "o_tr", name: "Tracked", color: "green" }] });
    expect(parseCsvCell(status, "tracked")).toEqual({ result: { ok: true, value: "o_tr" } });
    expect(parseCsvCell(status, "Dropped")).toEqual({ result: { ok: true, value: "Dropped" }, newOptions: ["Dropped"] });
    const tags = def("multiSelect", { options: [{ id: "o_a", name: "Alpha", color: "blue" }] });
    expect(parseCsvCell(tags, "Alpha; Beta,Gamma")).toEqual({ result: { ok: true, value: ["o_a", "Beta", "Gamma"] }, newOptions: ["Beta", "Gamma"] });
    // A name no option could hold is a cell error, never a definition to write.
    expect(parseCsvCell(status, "x".repeat(201)).result).toMatchObject({ ok: false, reason: expect.stringContaining("200 characters") as string });
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
    expect(preview.newOptions).toEqual({});
  });

  it("collects the option names each select column needs, once each, across rows", () => {
    const parsed = parseCsv(["Name,Status,Tags", "A,Tracked,x;y", "B,dropped,y", "C,Dropped,"].join("\n"));
    const columns = resolveCsvColumns(properties, parsed.headers, {
      Name: { kind: "property", propertyId: TITLE },
      Status: { kind: "property", propertyId: STATUS },
      Tags: { kind: "new", name: "Tags", type: "multiSelect" },
    });
    const preview = previewCsvRows(columns, parsed);
    expect(preview.newOptions).toEqual({ [STATUS]: ["dropped"], "new:Tags": ["x", "y"] });
    expect(preview.rows.map((r) => r.values[STATUS])).toEqual(["o_tr", "dropped", "Dropped"]);
    expect(preview.importable).toBe(3);
  });
});
