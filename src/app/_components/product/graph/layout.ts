import dagre from "@dagrejs/dagre";

/** Which horizontal band a node sits in. */
export type Band = "objectives" | "features" | "tickets";

export interface LayoutNodeInput {
  id: string;
  band: Band;
  /**
   * When true, the node is the synthetic "Unaligned" container that sits in
   * the Features band but is visually distinct.
   */
  unaligned?: boolean;
  width?: number;
  height?: number;
}

export interface LayoutEdgeInput {
  source: string;
  target: string;
  /**
   * "blocking" edges are peer Ticket→Ticket dependencies. They live entirely
   * within the Tickets band, so dagre should not use them to pull endpoints
   * apart in rank space.
   *
   * "alignment" edges run Feature→Ticket or Objective→Feature, i.e. between
   * bands. They are the structural edges that drive rank assignment.
   */
  kind: "blocking" | "alignment";
}

export interface LayoutBandSpec {
  /** Pixel Y-coordinate for each band's row. */
  y: Record<Band, number>;
  /** Y-offset applied to the Unaligned container relative to the Features band. */
  unalignedOffsetY?: number;
  /** Fallback node size when an input doesn't specify one. */
  defaultWidth?: number;
  defaultHeight?: number;
  /** Horizontal padding between nodes. */
  nodeSep?: number;
}

export interface PositionedNode {
  id: string;
  band: Band;
  unaligned: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  /** Which bands actually contain at least one node. */
  bandsUsed: Set<Band>;
}

const DEFAULT_BAND_SPEC: Required<Omit<LayoutBandSpec, "y">> & { y: Record<Band, number> } = {
  y: { objectives: 0, features: 200, tickets: 400 },
  unalignedOffsetY: 0,
  defaultWidth: 240,
  defaultHeight: 80,
  nodeSep: 40,
};

/**
 * Lay out a set of nodes into three horizontal bands using dagre for
 * horizontal positioning within each band. Y-coordinates are pinned by band;
 * dagre's rank output is discarded so that, for example, a blocking edge
 * between two Tickets can never push one of them down to a lower band.
 *
 * Pure function — zero React, zero DOM, no Prisma.
 */
export function layoutHierarchical(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  bandSpec: Partial<LayoutBandSpec> = {},
): LayoutResult {
  const spec = {
    ...DEFAULT_BAND_SPEC,
    ...bandSpec,
    y: { ...DEFAULT_BAND_SPEC.y, ...(bandSpec.y ?? {}) },
  };

  const bandsUsed = new Set<Band>();
  for (const n of nodes) bandsUsed.add(n.band);

  if (nodes.length === 0) {
    return { nodes: [], bandsUsed };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: spec.nodeSep,
    ranksep: 1, // pinned Y-coords make ranksep irrelevant
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.width ?? spec.defaultWidth,
      height: n.height ?? spec.defaultHeight,
    });
  }

  for (const e of edges) {
    // Blocking edges live inside one band — we still feed them to dagre so
    // connected components stay horizontally near each other, but we discard
    // dagre's Y output and pin Y by band below, which means rank-influencing
    // weight is moot.
    const weight = e.kind === "blocking" ? 0 : 1;
    g.setEdge(e.source, e.target, { weight, minlen: 1 });
  }

  dagre.layout(g);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positioned: PositionedNode[] = nodes.map((n) => {
    const dn = g.node(n.id);
    const width = n.width ?? spec.defaultWidth;
    const height = n.height ?? spec.defaultHeight;
    const baseY = spec.y[n.band];
    const y = n.unaligned ? baseY + spec.unalignedOffsetY : baseY;
    return {
      id: n.id,
      band: n.band,
      unaligned: Boolean(n.unaligned),
      // dagre returns the node's center; React Flow expects top-left.
      x: (dn?.x ?? 0) - width / 2,
      y,
      width,
      height,
    };
  });
  // Touch byId to keep TS happy when noUnusedLocals is on; harmless otherwise.
  void byId;

  return { nodes: positioned, bandsUsed };
}

/** A node for the roadmap (left-to-right cascade) layout. */
export interface RoadmapNodeInput {
  id: string;
  width?: number;
  height?: number;
}

/** A positioned node from {@link layoutRoadmap} (top-left origin). */
export interface RoadmapPositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoadmapLayoutOptions {
  defaultWidth?: number;
  defaultHeight?: number;
  /** Horizontal gap between dependency ranks (drives the cascade's stride). */
  rankSep?: number;
  /** Vertical gap between nodes sharing a rank. */
  nodeSep?: number;
}

const ROADMAP_DEFAULTS: Required<RoadmapLayoutOptions> = {
  defaultWidth: 260,
  defaultHeight: 56,
  rankSep: 96,
  nodeSep: 28,
};

/**
 * Roadmap layout — a single left-to-right dependency cascade (no fixed bands).
 *
 * Unlike {@link layoutHierarchical}, this keeps dagre's native x/y so the flow
 * reads like a timeline: roots (objectives / features / unblocked tickets) sit
 * on the left and each dependent steps to the right (and stacks vertically) of
 * whatever it depends on. Both alignment and blocking edges drive ranks;
 * blocking edges are weighted heavier so dependency chains stay tight.
 *
 * Pure function — zero React, zero DOM, no Prisma.
 */
export function layoutRoadmap(
  nodes: RoadmapNodeInput[],
  edges: LayoutEdgeInput[],
  options: RoadmapLayoutOptions = {},
): RoadmapPositionedNode[] {
  const opts = { ...ROADMAP_DEFAULTS, ...options };

  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: opts.nodeSep,
    ranksep: opts.rankSep,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.width ?? opts.defaultWidth,
      height: n.height ?? opts.defaultHeight,
    });
  }
  for (const e of edges) {
    // Skip edges that reference a node we aren't drawing.
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    g.setEdge(e.source, e.target, {
      weight: e.kind === "blocking" ? 3 : 1,
      minlen: 1,
    });
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const dn = g.node(n.id);
    const width = n.width ?? opts.defaultWidth;
    const height = n.height ?? opts.defaultHeight;
    return {
      id: n.id,
      // dagre returns the node center; React Flow wants top-left.
      x: (dn?.x ?? 0) - width / 2,
      y: (dn?.y ?? 0) - height / 2,
      width,
      height,
    };
  });
}

/**
 * Convenience helper: compact a band-spec when a band has no nodes, so the
 * upstream bands shift up to absorb the empty row. Used by the client to
 * collapse the Objectives band when no Objectives are visible.
 */
export function compactBandSpec(
  spec: LayoutBandSpec,
  presentBands: Set<Band>,
  rowHeight: number,
): LayoutBandSpec {
  const order: Band[] = ["objectives", "features", "tickets"];
  let nextY = spec.y[order[0]!];
  const collapsed: Record<Band, number> = { ...spec.y };
  for (const b of order) {
    if (presentBands.has(b)) {
      collapsed[b] = nextY;
      nextY += rowHeight;
    }
  }
  return { ...spec, y: collapsed };
}
