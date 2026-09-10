/**
 * The Decision Log's client-side merge (ADR-0060): ADRs and Decisions become
 * one row shape; the Source facet, status filter, search, flat ordering and
 * grouping headers are pure functions here.
 */

import { describe, it, expect } from "vitest";
import {
  adrToLogRow,
  decisionGroup,
  decisionSourceFacet,
  decisionToLogRow,
  filterLogRows,
  groupLogRows,
  sortFlat,
  type AdrRowInput,
  type DecisionRowInput,
} from "../decision-log";

const adr = (overrides: Partial<AdrRowInput> = {}): AdrRowInput => ({
  id: "adr-1",
  label: "API-0003",
  number: 3,
  title: "Use tRPC for every API",
  status: "ACCEPTED",
  decidedAt: "2026-06-01T00:00:00.000Z",
  repositoryId: "repo-1",
  repositoryFullName: "positonic/exponential",
  productId: "prod-1",
  ...overrides,
});

const decision = (overrides: Partial<DecisionRowInput> = {}): DecisionRowInput => ({
  id: "dec-1",
  label: "D-0001",
  number: 1,
  statement: "Park prioritisation debates for the prioritisation ceremony",
  status: "ACCEPTED",
  source: "MEETING",
  decidedAt: "2026-09-08T07:00:00.000Z",
  productId: null,
  occurrence: { id: "occ-1", ceremony: { id: "cer-1", name: "Daily Standup" } },
  project: null,
  ...overrides,
});

describe("row mapping", () => {
  it("maps an ADR to a Code row under its repository, linking to the ADR page", () => {
    const row = adrToLogRow(adr(), "acme");
    expect(row).toMatchObject({
      kind: "adr",
      source: "code",
      label: "API-0003",
      group: { kind: "repository", key: "repo:repo-1", name: "positonic/exponential" },
      href: "/w/acme/decisions/adr-1",
    });
  });

  it("maps a Decision to its Source facet and the /decisions/d/ route", () => {
    const row = decisionToLogRow(decision(), "acme");
    expect(row).toMatchObject({
      kind: "decision",
      source: "meeting",
      label: "D-0001",
      title: "Park prioritisation debates for the prioritisation ceremony",
      href: "/w/acme/decisions/d/dec-1",
    });
  });

  it("folds AGENT-logged decisions into the Manual facet", () => {
    expect(decisionSourceFacet("MANUAL")).toBe("manual");
    expect(decisionSourceFacet("AGENT")).toBe("manual");
    expect(decisionSourceFacet("MEETING")).toBe("meeting");
  });
});

describe("decisionGroup", () => {
  it("groups under the ceremony when an occurrence is set, even when a project is too", () => {
    const g = decisionGroup(
      decision({ project: { id: "p-1", name: "Fixture Project" } }),
    );
    expect(g).toEqual({ key: "ceremony:cer-1", kind: "ceremony", name: "Daily Standup" });
  });

  it("falls back to the project, then to the workspace bucket", () => {
    expect(
      decisionGroup(decision({ occurrence: null, project: { id: "p-1", name: "Fixture Project" } })),
    ).toEqual({ key: "project:p-1", kind: "project", name: "Fixture Project" });
    expect(decisionGroup(decision({ occurrence: null, project: null }))).toEqual({
      key: "workspace",
      kind: "workspace",
      name: "Workspace",
    });
  });
});

describe("filterLogRows", () => {
  const rows = [
    adrToLogRow(adr(), "acme"),
    decisionToLogRow(decision(), "acme"),
    decisionToLogRow(
      decision({ id: "dec-2", label: "D-0002", number: 2, source: "MANUAL", status: "OPEN", statement: "Should standups move to 10am?" }),
      "acme",
    ),
  ];

  it("the Source facet keeps only rows from that source", () => {
    expect(filterLogRows(rows, { source: "meeting", status: "all", query: "" }).map((r) => r.id)).toEqual(["dec-1"]);
    expect(filterLogRows(rows, { source: "code", status: "all", query: "" }).map((r) => r.id)).toEqual(["adr-1"]);
    expect(filterLogRows(rows, { source: "manual", status: "all", query: "" }).map((r) => r.id)).toEqual(["dec-2"]);
  });

  it("status and search compose with the facet; body matches are unioned in by id", () => {
    expect(filterLogRows(rows, { source: "all", status: "OPEN", query: "" }).map((r) => r.id)).toEqual(["dec-2"]);
    expect(filterLogRows(rows, { source: "all", status: "all", query: "d-0001" }).map((r) => r.id)).toEqual(["dec-1"]);
    expect(
      filterLogRows(rows, { source: "all", status: "all", query: "zzz", bodyMatchIds: new Set(["adr-1"]) }).map((r) => r.id),
    ).toEqual(["adr-1"]);
  });
});

describe("ordering and grouping", () => {
  it("flat order is newest decided first, undated last", () => {
    const rows = [
      adrToLogRow(adr({ decidedAt: "2026-01-01T00:00:00.000Z" }), "acme"),
      decisionToLogRow(decision({ id: "undated", decidedAt: null }), "acme"),
      decisionToLogRow(decision(), "acme"),
    ];
    expect(sortFlat(rows).map((r) => r.id)).toEqual(["dec-1", "adr-1", "undated"]);
  });

  it("groups repositories first, then ceremonies, projects and the workspace bucket", () => {
    const rows = [
      decisionToLogRow(decision({ id: "ws", occurrence: null }), "acme"),
      decisionToLogRow(decision({ id: "proj", occurrence: null, project: { id: "p-1", name: "Alpha" } }), "acme"),
      decisionToLogRow(decision({ id: "cer" }), "acme"),
      adrToLogRow(adr({ id: "adr-b", number: 2 }), "acme"),
      adrToLogRow(adr({ id: "adr-a", number: 1 }), "acme"),
    ];
    const groups = groupLogRows(rows);
    expect(groups.map((g) => g.group.kind)).toEqual(["repository", "ceremony", "project", "workspace"]);
    // ADRs keep number order inside their repository (conflict bracketing relies on it).
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["adr-a", "adr-b"]);
  });
});
