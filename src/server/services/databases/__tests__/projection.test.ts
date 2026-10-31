/**
 * The Markdown projection of a database block (ADR-0078 §7): a marker in the
 * stored body expands to a GFM table of the visible columns in view order,
 * and only for databases the page owns.
 */
import { describe, expect, it } from "vitest";

import {
  expandMarkers,
  renderDatabaseTable,
  type ProjectedDatabase,
} from "../projection";
import { collectDatabaseMarkerIds, databaseMarker } from "~/lib/databases/marker";
import { emptyView } from "~/lib/databases/schema";

const TITLE = "p_title";
const STATUS = "p_status";
const NOTES = "p_notes";

function metrics(overrides: Partial<ProjectedDatabase> = {}): ProjectedDatabase {
  return {
    id: "db1",
    name: "Metrics",
    properties: [
      { id: TITLE, name: "Name", type: "title" },
      { id: STATUS, name: "Status", type: "text" },
      { id: NOTES, name: "Notes", type: "text" },
    ],
    view: emptyView([TITLE, STATUS, NOTES]),
    rows: [
      {
        id: "r1",
        title: "Alert latency",
        properties: { [STATUS]: "Tracked", [NOTES]: "p95 | p99" },
        href: "/w/acme/pages/r1",
      },
      { id: "r2", title: "", properties: { [STATUS]: null } },
    ],
    ...overrides,
  };
}

describe("renderDatabaseTable", () => {
  it("renders visible columns in view order, one line per row, title linked", () => {
    expect(renderDatabaseTable(metrics(), TITLE)).toBe(
      [
        "| Name | Status | Notes |",
        "| --- | --- | --- |",
        "| [Alert latency](/w/acme/pages/r1) | Tracked | p95 \\| p99 |",
        "| Untitled |  |  |",
      ].join("\n"),
    );
  });

  it("honours hidden columns and a saved column order", () => {
    const db = metrics({
      view: { filters: [], hiddenPropertyIds: [NOTES], propertyOrder: [STATUS, TITLE] },
    });
    const table = renderDatabaseTable(db, TITLE);
    expect(table.split("\n")[0]).toBe("| Status | Name |");
    expect(table).not.toContain("Notes");
  });

  it("an empty database is a header with no rows", () => {
    expect(renderDatabaseTable(metrics({ rows: [] }), TITLE)).toBe(
      "| Name | Status | Notes |\n| --- | --- | --- |",
    );
  });
});

describe("expandMarkers", () => {
  const body = ["# Data strategy", "", databaseMarker("db1"), "", "Closing note."].join("\n");

  it("keeps the marker and puts the table under it", () => {
    const out = expandMarkers(body, (id) => (id === "db1" ? "| Name |\n| --- |" : null));
    expect(out).toBe(
      ["# Data strategy", "", databaseMarker("db1"), "", "| Name |", "| --- |", "", "Closing note."].join("\n"),
    );
  });

  it("leaves a marker the page does not own untouched", () => {
    expect(expandMarkers(body, () => null)).toBe(body);
  });

  it("collects marker ids once each, in document order", () => {
    const twice = [databaseMarker("b"), "text", databaseMarker("a"), databaseMarker("b")].join("\n");
    expect(collectDatabaseMarkerIds(twice)).toEqual(["b", "a"]);
    expect(collectDatabaseMarkerIds("no markers here <!-- database:x --> inline")).toEqual([]);
  });
});
