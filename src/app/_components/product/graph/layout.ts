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
