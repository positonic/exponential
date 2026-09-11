/**
 * The decision graph's client-side model (ADR-0060's "one log, two sources"
 * applied to the graph): git-projected ADRs from `adr.graph` and
 * Exponential-owned Decisions from `decision.list` become one node shape,
 * one edge list and one set of lanes. The join happens here, as pure
 * functions, for the same reason the Decision Log's does — a server-side
 * union would drag `adr.graph`'s human-only gate onto decisions.
 *
 * The same module lays the graph out as a timeline: time runs left to
 * right, one horizontal lane per repository (ADRs) or per ceremony /
 * project / workspace bucket (Decisions), cards packed into rows inside a
 * lane wherever they would overlap. Undated nodes sit in a "No date" column
 * after the axis rather than being guessed onto it.
 */

import {
  decisionGroup,
  type DecisionRowInput,
  type LogGroup,
  type LogSource,
  type LogStatus,
} from "./decision-log";

export type GraphNodeKind = "adr" | "decision";

/**
 * SUPERSEDES points from the superseder to the superseded (both sources).
 * MENTIONS is a detected ADR→ADR reference. FORMALISED points from a
 * Decision to the ADR it became through a pull request.
 */
export type GraphEdgeType = "SUPERSEDES" | "MENTIONS" | "FORMALISED";

export interface GraphLane {
  key: string;
  kind: LogGroup["kind"];
  name: string;
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string | null;
  title: string;
  status: LogStatus;
  decidedAt: Date | string | null;
  source: LogSource;
  laneKey: string;
  href: string;
  /** Sequence within the lane: ADR number or decision number. */
  order: number;
}

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  fromId: string;
  toId: string;
}

export interface DecisionGraph {
  lanes: GraphLane[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The shape `adr.graph` returns. */
export interface AdrGraphInput {
  repos: Array<{ repositoryId: string; fullName: string }>;
  nodes: Array<{
    id: string;
    repositoryId: string;
    number: number | null;
    label: string | null;
    title: string;
    status: LogStatus;
    decidedAt: Date | string | null;
  }>;
  edges: Array<{
    id: string;
    type: "SUPERSEDES" | "MENTIONS";
    fromId: string;
    toId: string;
  }>;
}

/** A `decision.list` row, plus the two link columns the graph draws. */
export interface DecisionGraphRowInput extends DecisionRowInput {
  supersededById: string | null;
  adrDocumentId: string | null;
}

const LANE_KIND_ORDER: Record<LogGroup["kind"], number> = {
  repository: 0,
  ceremony: 1,
  project: 2,
  workspace: 3,
};

export function buildDecisionGraph(input: {
  adrs: AdrGraphInput;
  decisions: DecisionGraphRowInput[];
  workspaceSlug: string;
}): DecisionGraph {
  const { adrs, decisions, workspaceSlug } = input;
  const nodes: GraphNode[] = [];
  const lanesByKey = new Map<string, GraphLane>();

  for (const repo of adrs.repos) {
    const key = `repo:${repo.repositoryId}`;
    const docs = adrs.nodes.filter((n) => n.repositoryId === repo.repositoryId);
    if (docs.length === 0) continue;
    lanesByKey.set(key, { key, kind: "repository", name: repo.fullName });
    for (const doc of docs) {
      nodes.push({
        id: doc.id,
        kind: "adr",
        label: doc.label,
        title: doc.title,
        status: doc.status,
        decidedAt: doc.decidedAt,
        source: "code",
        laneKey: key,
        href: `/w/${workspaceSlug}/decisions/${doc.id}`,
        order: doc.number ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  for (const decision of decisions) {
    const group = decisionGroup(decision);
    if (!lanesByKey.has(group.key)) lanesByKey.set(group.key, group);
    nodes.push({
      id: decision.id,
      kind: "decision",
      label: decision.label,
      title: decision.statement,
      status: decision.status,
      decidedAt: decision.decidedAt,
      source: decision.source === "MEETING" ? "meeting" : "manual",
      laneKey: group.key,
      href: `/w/${workspaceSlug}/decisions/d/${decision.id}`,
      order: decision.number,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  // Both endpoints must be visible nodes: a link to a soft-deleted ADR, or
  // to a decision the caller may not read, drops out of the picture.
  for (const edge of adrs.edges) {
    if (nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)) edges.push(edge);
  }
  for (const decision of decisions) {
    if (decision.supersededById && nodeIds.has(decision.supersededById)) {
      edges.push({
        id: `dsup:${decision.id}`,
        type: "SUPERSEDES",
        fromId: decision.supersededById,
        toId: decision.id,
      });
    }
    if (decision.adrDocumentId && nodeIds.has(decision.adrDocumentId)) {
      edges.push({
        id: `dadr:${decision.id}`,
        type: "FORMALISED",
        fromId: decision.id,
        toId: decision.adrDocumentId,
      });
    }
  }

  // Repositories first, in enrolment order; then ceremonies, projects and
  // the workspace bucket by name — the same order as the index's headers.
  const repoOrder = new Map(adrs.repos.map((r, i) => [`repo:${r.repositoryId}`, i]));
  const lanes = [...lanesByKey.values()].sort((a, b) => {
    const kind = LANE_KIND_ORDER[a.kind] - LANE_KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    if (a.kind === "repository") {
      return (repoOrder.get(a.key) ?? 0) - (repoOrder.get(b.key) ?? 0);
    }
    return a.name.localeCompare(b.name);
  });

  return { lanes, nodes, edges };
}

// ---------------------------------------------------------------------------
// Timeline layout
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export interface TimelineRange {
  /** First day on the axis (a month start, UTC). */
  start: Date;
  /** Last day on the axis (a month end, UTC, exclusive). */
  end: Date;
  days: number;
}

function timeOf(date: Date | string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? null : t;
}

function startOfMonthUtc(t: number): Date {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

/**
 * The axis spans from the month of the earliest dated node to the end of
 * the month of the latest one or today, whichever is later — so "now" is
 * always on the axis and a fresh decision never hangs off its right edge.
 * Null when nothing is dated.
 */
export function timelineRange(nodes: GraphNode[], now: Date = new Date()): TimelineRange | null {
  let min: number | null = null;
  let max: number | null = null;
  for (const node of nodes) {
    const t = timeOf(node.decidedAt);
    if (t === null) continue;
    if (min === null || t < min) min = t;
    if (max === null || t > max) max = t;
  }
  if (min === null || max === null) return null;
  const start = startOfMonthUtc(min);
  const end = addMonthsUtc(startOfMonthUtc(Math.max(max, now.getTime())), 1);
  return { start, end, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) };
}

export interface TimelineOptions {
  pxPerDay: number;
  cardWidth: number;
  cardHeight: number;
  /** Horizontal room between two cards on the same row. */
  cardGap: number;
  rowGap: number;
  lanePadding: number;
  /** Room between the axis end and the "No date" column. */
  undatedGap: number;
  now?: Date;
}

export interface TimelineTick {
  x: number;
  /** `Jun`, or `Jun 2026` on the first tick and each January. */
  label: string | null;
  major: boolean;
}

export interface PlacedNode {
  node: GraphNode;
  x: number;
  y: number;
  row: number;
  dated: boolean;
}

export interface TimelineLane {
  lane: GraphLane;
  y: number;
  height: number;
  rows: number;
  count: number;
}

export interface TimelineLayout {
  range: TimelineRange | null;
  /** Width of the dated axis (0 when nothing is dated). */
  axisWidth: number;
  /** Full content width including the "No date" column. */
  width: number;
  height: number;
  lanes: TimelineLane[];
  nodes: PlacedNode[];
  ticks: TimelineTick[];
  todayX: number | null;
  undated: { x: number; width: number } | null;
}

/**
 * Greedy row packing: cards sorted by x take the first row whose last card
 * ends before they start, else open a new row. Returns each card's row.
 */
function packRows(
  items: Array<{ x: number }>,
  cardWidth: number,
  cardGap: number,
): number[] {
  const rowRight: number[] = [];
  return items.map((item) => {
    let row = rowRight.findIndex((right) => right + cardGap <= item.x);
    if (row === -1) {
      row = rowRight.length;
      rowRight.push(item.x + cardWidth);
    } else {
      rowRight[row] = item.x + cardWidth;
    }
    return row;
  });
}

/**
 * Pixels per day that fit the whole dated range into `availableWidth`
 * (minus one card, so the last card stays inside), clamped to a readable
 * band. `null` range → 1, the caller has nothing to fit anyway.
 */
export const MIN_PX_PER_DAY = 1.5;
export const MAX_PX_PER_DAY = 40;

export function fitPxPerDay(range: TimelineRange | null, availableWidth: number, cardWidth: number): number {
  if (!range || range.days <= 0) return 1;
  const px = (availableWidth - cardWidth) / range.days;
  return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, px));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function layoutTimeline(graph: DecisionGraph, opts: TimelineOptions): TimelineLayout {
  const now = opts.now ?? new Date();
  const range = timelineRange(graph.nodes, now);
  const xOf = (t: number) =>
    range ? ((t - range.start.getTime()) / DAY_MS) * opts.pxPerDay : 0;

  // Dated cards first, so the axis width is known before the undated column
  // is placed after it.
  const byLane = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    const list = byLane.get(node.laneKey) ?? [];
    list.push(node);
    byLane.set(node.laneKey, list);
  }

  let maxRight = range ? range.days * opts.pxPerDay : 0;
  const datedPlacements = new Map<string, Array<{ node: GraphNode; x: number; row: number }>>();
  const undatedByLane = new Map<string, GraphNode[]>();
  for (const lane of graph.lanes) {
    const nodes = byLane.get(lane.key) ?? [];
    const dated: Array<{ node: GraphNode; x: number; t: number }> = [];
    const undated: GraphNode[] = [];
    for (const node of nodes) {
      const t = timeOf(node.decidedAt);
      if (t === null) undated.push(node);
      else dated.push({ node, x: xOf(t), t });
    }
    dated.sort((a, b) => a.t - b.t || a.node.order - b.node.order);
    const rows = packRows(dated, opts.cardWidth, opts.cardGap);
    datedPlacements.set(
      lane.key,
      dated.map((d, i) => ({ node: d.node, x: d.x, row: rows[i]! })),
    );
    for (const d of dated) maxRight = Math.max(maxRight, d.x + opts.cardWidth + opts.cardGap);
    undated.sort((a, b) => a.order - b.order);
    undatedByLane.set(lane.key, undated);
  }

  const axisWidth = range ? maxRight : 0;
  const hasUndated = [...undatedByLane.values()].some((list) => list.length > 0);
  const undated = hasUndated
    ? { x: axisWidth + (range ? opts.undatedGap : 0), width: opts.cardWidth + opts.cardGap * 2 }
    : null;

  const lanes: TimelineLane[] = [];
  const placed: PlacedNode[] = [];
  let y = 0;
  for (const lane of graph.lanes) {
    const dated = datedPlacements.get(lane.key) ?? [];
    const undatedNodes = undatedByLane.get(lane.key) ?? [];
    const rows = Math.max(1, ...dated.map((d) => d.row + 1), undatedNodes.length);
    const height = opts.lanePadding * 2 + rows * opts.cardHeight + (rows - 1) * opts.rowGap;
    lanes.push({ lane, y, height, rows, count: dated.length + undatedNodes.length });
    const rowY = (row: number) => y + opts.lanePadding + row * (opts.cardHeight + opts.rowGap);
    for (const d of dated) {
      placed.push({ node: d.node, x: d.x, y: rowY(d.row), row: d.row, dated: true });
    }
    undatedNodes.forEach((node, row) => {
      placed.push({ node, x: (undated?.x ?? 0) + opts.cardGap, y: rowY(row), row, dated: false });
    });
    y += height;
  }

  const ticks: TimelineTick[] = [];
  if (range) {
    // Month lines always; labels thin out when months get narrow.
    const monthPx = 30 * opts.pxPerDay;
    const labelEvery = Math.max(1, Math.ceil(52 / monthPx));
    let cursor = range.start;
    let i = 0;
    while (cursor.getTime() < range.end.getTime()) {
      const month = cursor.getUTCMonth();
      const major = i === 0 || month === 0;
      const show = i % labelEvery === 0 || month === 0;
      ticks.push({
        x: xOf(cursor.getTime()),
        label: show ? (major ? `${MONTH_LABELS[month]} ${cursor.getUTCFullYear()}` : MONTH_LABELS[month]!) : null,
        major,
      });
      cursor = addMonthsUtc(cursor, 1);
      i++;
    }
  }

  const todayT = now.getTime();
  const todayX =
    range && todayT >= range.start.getTime() && todayT < range.end.getTime() ? xOf(todayT) : null;

  return {
    range,
    axisWidth,
    width: undated ? undated.x + undated.width : axisWidth,
    height: y,
    lanes,
    nodes: placed,
    ticks,
    todayX,
    undated,
  };
}
