/**
 * The decision graph's client-side merge and timeline layout are pure
 * functions: lanes per repository / ceremony / project, edges from both
 * sources (ADR links, decision supersedes, decision → ADR "formalised as"),
 * and the left-to-right layout with greedy row packing and a "No date"
 * column.
 */

import { describe, it, expect } from "vitest";
import {
  buildDecisionGraph,
  fitPxPerDay,
  layoutTimeline,
  timelineRange,
  type AdrGraphInput,
  type DecisionGraphRowInput,
  type TimelineOptions,
} from "../decision-graph";

const adrs = (overrides: Partial<AdrGraphInput> = {}): AdrGraphInput => ({
  repos: [
    { repositoryId: "repo-a", fullName: "acme/api" },
    { repositoryId: "repo-b", fullName: "acme/web" },
    { repositoryId: "repo-empty", fullName: "acme/empty" },
  ],
  nodes: [
    { id: "adr-1", repositoryId: "repo-a", number: 1, label: "API-0001", title: "Use tRPC", status: "SUPERSEDED", decidedAt: "2026-06-01T00:00:00.000Z" },
    { id: "adr-2", repositoryId: "repo-a", number: 2, label: "API-0002", title: "Use tRPC v11", status: "ACCEPTED", decidedAt: "2026-06-20T00:00:00.000Z" },
    { id: "adr-3", repositoryId: "repo-b", number: 1, label: "WEB-0001", title: "Static HTML", status: "ACCEPTED", decidedAt: null },
  ],
  edges: [
    { id: "l-1", type: "SUPERSEDES", fromId: "adr-2", toId: "adr-1" },
    { id: "l-gone", type: "MENTIONS", fromId: "adr-2", toId: "adr-deleted" },
  ],
  ...overrides,
});

const decision = (overrides: Partial<DecisionGraphRowInput> = {}): DecisionGraphRowInput => ({
  id: "dec-1",
  label: "D-0001",
  number: 1,
  statement: "Park prioritisation debates",
  status: "ACCEPTED",
  source: "MEETING",
  decidedAt: "2026-09-08T00:00:00.000Z",
  productId: null,
  occurrence: { id: "occ-1", ceremony: { id: "cer-1", name: "Daily Standup" } },
  project: null,
  supersededById: null,
  adrDocumentId: null,
  ...overrides,
});

describe("buildDecisionGraph", () => {
  it("lanes: repositories with nodes first (enrolment order), then ceremonies, projects, workspace", () => {
    const graph = buildDecisionGraph({
      adrs: adrs(),
      decisions: [
        decision({ id: "dec-ws", number: 3, occurrence: null }),
        decision({ id: "dec-proj", number: 2, occurrence: null, project: { id: "p-1", name: "Fixture" } }),
        decision(),
      ],
      workspaceSlug: "acme",
    });
    expect(graph.lanes.map((l) => `${l.kind}:${l.name}`)).toEqual([
      "repository:acme/api",
      "repository:acme/web",
      "ceremony:Daily Standup",
      "project:Fixture",
      "workspace:Workspace",
    ]);
  });

  it("nodes carry their source, lane and detail route", () => {
    const graph = buildDecisionGraph({ adrs: adrs(), decisions: [decision()], workspaceSlug: "acme" });
    expect(graph.nodes.find((n) => n.id === "adr-1")).toMatchObject({
      kind: "adr",
      source: "code",
      laneKey: "repo:repo-a",
      href: "/w/acme/decisions/adr-1",
      order: 1,
    });
    expect(graph.nodes.find((n) => n.id === "dec-1")).toMatchObject({
      kind: "decision",
      source: "meeting",
      laneKey: "ceremony:cer-1",
      title: "Park prioritisation debates",
      href: "/w/acme/decisions/d/dec-1",
    });
  });

  it("edges: ADR links, decision supersedes (superseder → superseded) and formalised-as, endpoints both visible", () => {
    const graph = buildDecisionGraph({
      adrs: adrs(),
      decisions: [
        decision({ id: "dec-old", number: 1, status: "SUPERSEDED", supersededById: "dec-new", adrDocumentId: "adr-2" }),
        decision({ id: "dec-new", number: 2, adrDocumentId: "adr-missing" }),
        decision({ id: "dec-orphan", number: 3, supersededById: "dec-hidden" }),
      ],
      workspaceSlug: "acme",
    });
    expect(graph.edges).toEqual([
      { id: "l-1", type: "SUPERSEDES", fromId: "adr-2", toId: "adr-1" },
      { id: "dsup:dec-old", type: "SUPERSEDES", fromId: "dec-new", toId: "dec-old" },
      { id: "dadr:dec-old", type: "FORMALISED", fromId: "dec-old", toId: "adr-2" },
    ]);
  });
});

const opts: TimelineOptions = {
  pxPerDay: 10,
  cardWidth: 100,
  cardHeight: 40,
  cardGap: 10,
  rowGap: 6,
  lanePadding: 8,
  undatedGap: 30,
  now: new Date("2026-09-11T12:00:00.000Z"),
};

describe("timelineRange", () => {
  it("spans the month of the earliest node to the end of the month of the latest node or today", () => {
    const graph = buildDecisionGraph({ adrs: adrs(), decisions: [], workspaceSlug: "acme" });
    const range = timelineRange(graph.nodes, opts.now);
    expect(range?.start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    // Today (Sep 2026) is later than the last dated node (Jun 2026).
    expect(range?.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range?.days).toBe(122);
  });

  it("is null when nothing is dated", () => {
    expect(timelineRange([{ id: "x", kind: "adr", label: null, title: "t", status: "UNKNOWN", decidedAt: null, source: "code", laneKey: "k", href: "/", order: 1 }])).toBeNull();
  });
});

describe("layoutTimeline", () => {
  it("places dated cards at (days since axis start) × pxPerDay and packs overlaps into rows", () => {
    const graph = buildDecisionGraph({
      adrs: adrs({
        nodes: [
          { id: "a", repositoryId: "repo-a", number: 1, label: "A-1", title: "a", status: "ACCEPTED", decidedAt: "2026-06-01T00:00:00.000Z" },
          { id: "b", repositoryId: "repo-a", number: 2, label: "A-2", title: "b", status: "ACCEPTED", decidedAt: "2026-06-05T00:00:00.000Z" },
          { id: "c", repositoryId: "repo-a", number: 3, label: "A-3", title: "c", status: "ACCEPTED", decidedAt: "2026-06-13T00:00:00.000Z" },
        ],
        edges: [],
      }),
      decisions: [],
      workspaceSlug: "acme",
    });
    const layout = layoutTimeline(graph, opts);
    const at = (id: string) => layout.nodes.find((p) => p.node.id === id)!;
    expect(at("a")).toMatchObject({ x: 0, row: 0, dated: true });
    // 4 days × 10px = 40px < card width + gap (110) → second row.
    expect(at("b")).toMatchObject({ x: 40, row: 1 });
    // 12 days × 10px = 120px ≥ 110 → back on row 0.
    expect(at("c")).toMatchObject({ x: 120, row: 0 });
    expect(layout.lanes[0]).toMatchObject({ rows: 2, count: 3, y: 0, height: 8 * 2 + 2 * 40 + 6 });
    expect(at("b").y).toBe(8 + 40 + 6);
    expect(layout.undated).toBeNull();
    expect(layout.width).toBe(layout.axisWidth);
  });

  it("stacks lanes vertically and puts undated cards in a column after the axis", () => {
    const graph = buildDecisionGraph({ adrs: adrs(), decisions: [decision({ decidedAt: null })], workspaceSlug: "acme" });
    const layout = layoutTimeline(graph, opts);
    expect(layout.lanes.map((l) => l.lane.name)).toEqual(["acme/api", "acme/web", "Daily Standup"]);
    expect(layout.lanes[1]!.y).toBe(layout.lanes[0]!.height);
    expect(layout.height).toBe(layout.lanes.reduce((h, l) => h + l.height, 0));

    const web = layout.nodes.find((p) => p.node.id === "adr-3")!;
    const dec = layout.nodes.find((p) => p.node.id === "dec-1")!;
    expect(web.dated).toBe(false);
    expect(dec.dated).toBe(false);
    expect(layout.undated).not.toBeNull();
    expect(web.x).toBe(layout.undated!.x + opts.cardGap);
    expect(dec.x).toBe(web.x);
    expect(layout.undated!.x).toBeGreaterThanOrEqual(layout.axisWidth + opts.undatedGap);
    expect(layout.width).toBe(layout.undated!.x + layout.undated!.width);
  });

  it("marks today and one tick per month, labelling the first and each January with the year", () => {
    const graph = buildDecisionGraph({ adrs: adrs(), decisions: [], workspaceSlug: "acme" });
    const layout = layoutTimeline(graph, { ...opts, now: new Date("2027-01-15T00:00:00.000Z") });
    expect(layout.ticks.map((t) => t.label)).toEqual(["Jun 2026", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan 2027"]);
    expect(layout.ticks[0]!.x).toBe(0);
    expect(layout.ticks[1]!.x).toBe(30 * 10);
    // 2026-06-01 → 2027-01-15 = 228 days.
    expect(layout.todayX).toBe(228 * 10);
  });

  it("thins tick labels when months are narrow but keeps every line", () => {
    const graph = buildDecisionGraph({ adrs: adrs(), decisions: [], workspaceSlug: "acme" });
    const layout = layoutTimeline(graph, { ...opts, pxPerDay: 1 });
    expect(layout.ticks).toHaveLength(4);
    expect(layout.ticks.filter((t) => t.label !== null).map((t) => t.label)).toEqual(["Jun 2026", "Aug"]);
  });

  it("with nothing dated: no axis, no ticks, only the undated column", () => {
    const graph = buildDecisionGraph({
      adrs: adrs({ nodes: [{ id: "u", repositoryId: "repo-a", number: 1, label: "A-1", title: "u", status: "UNKNOWN", decidedAt: null }], edges: [] }),
      decisions: [],
      workspaceSlug: "acme",
    });
    const layout = layoutTimeline(graph, opts);
    expect(layout.range).toBeNull();
    expect(layout.axisWidth).toBe(0);
    expect(layout.ticks).toEqual([]);
    expect(layout.todayX).toBeNull();
    expect(layout.undated).toEqual({ x: 0, width: opts.cardWidth + opts.cardGap * 2 });
  });
});

describe("fitPxPerDay", () => {
  it("fits the range into the available width minus one card, within the clamp", () => {
    const range = { start: new Date("2026-06-01T00:00:00.000Z"), end: new Date("2026-10-01T00:00:00.000Z"), days: 122 };
    expect(fitPxPerDay(range, 122 * 4 + 100, 100)).toBe(4);
    expect(fitPxPerDay(range, 10, 100)).toBe(1.5);
    expect(fitPxPerDay(range, 100_000, 100)).toBe(40);
    expect(fitPxPerDay(null, 800, 100)).toBe(1);
  });
});
