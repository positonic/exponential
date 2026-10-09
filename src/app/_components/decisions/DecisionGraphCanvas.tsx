"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DecisionGraph, GraphEdgeType, GraphNode } from "~/lib/decision-graph";

/**
 * Decision network canvas: one node per decision from either source,
 * clustered into one column per lane (a repository for ADRs; a ceremony,
 * project or the workspace bucket for Decisions) with a header node.
 * SUPERSEDES edges solid, detected MENTIONS edges dashed (the same weaker
 * treatment as the detail page's Related section), FORMALISED — a Decision
 * that became an ADR through a pull request — dotted. Read-only: clicking
 * a node navigates to its detail page.
 */

interface Props {
  graph: DecisionGraph;
  onNodeClick?: (node: GraphNode) => void;
}

const COLUMN_WIDTH = 280;
const NODE_HEIGHT = 64;
const NODE_GAP = 18;
const HEADER_HEIGHT = 40;

const EDGE_COLOR: Record<GraphEdgeType, string> = {
  SUPERSEDES: "var(--brand-400)",
  MENTIONS: "var(--color-border-strong)",
  FORMALISED: "var(--accent-crm)",
};

const EDGE_LABEL: Partial<Record<GraphEdgeType, string>> = {
  SUPERSEDES: "supersedes",
  FORMALISED: "formalised as",
};

const STATUS_BORDER: Record<string, string> = {
  PROPOSED: "var(--color-text-muted)",
  OPEN: "var(--accent-okr)",
  ACCEPTED: "var(--accent-crm)",
  SUPERSEDED: "var(--accent-okr)",
  DEPRECATED: "var(--accent-due)",
  UNKNOWN: "var(--color-border-primary)",
};

const LANE_KIND_WORD: Record<DecisionGraph["lanes"][number]["kind"], string> = {
  repository: "repository",
  ceremony: "ceremony",
  project: "project",
  workspace: "workspace",
};

export function DecisionGraphCanvas({ graph, onNodeClick }: Props) {
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const flowNodes: Node[] = useMemo(() => {
    const result: Node[] = [];
    let columnIndex = 0;
    for (const lane of graph.lanes) {
      const laneNodes = graph.nodes
        .filter((n) => n.laneKey === lane.key)
        .sort((a, b) => a.order - b.order);
      if (laneNodes.length === 0) continue;
      const x = columnIndex * COLUMN_WIDTH;
      columnIndex++;

      result.push({
        id: `lane:${lane.key}`,
        position: { x, y: 0 },
        data: {
          label:
            lane.kind === "repository" ? lane.name : `${lane.name} · ${LANE_KIND_WORD[lane.kind]}`,
        },
        draggable: false,
        selectable: false,
        style: {
          width: COLUMN_WIDTH - 40,
          height: HEADER_HEIGHT - 10,
          background: "var(--color-surface-secondary)",
          border: "1px solid var(--color-border-primary)",
          borderRadius: 8,
          color: "var(--color-text-secondary)",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: lane.kind === "repository" ? "var(--font-mono)" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      });

      laneNodes.forEach((node, index) => {
        const title = node.title.replace(/`/g, "");
        result.push({
          id: node.id,
          position: {
            x: x + 10,
            y: HEADER_HEIGHT + index * (NODE_HEIGHT + NODE_GAP),
          },
          data: {
            label: `${node.label ?? "—"}\n${title.length > 46 ? `${title.slice(0, 46)}…` : title}`,
          },
          style: {
            width: COLUMN_WIDTH - 60,
            minHeight: NODE_HEIGHT - 12,
            background: "var(--color-background-primary)",
            border: `1.5px ${node.kind === "decision" ? "dashed" : "solid"} ${
              STATUS_BORDER[node.status] ?? STATUS_BORDER.UNKNOWN
            }`,
            borderRadius: 8,
            color: "var(--color-text-primary)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            padding: 6,
            cursor: "pointer",
          },
        });
      });
    }
    return result;
  }, [graph.lanes, graph.nodes]);

  const flowEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => {
        const color = EDGE_COLOR[edge.type];
        const label = EDGE_LABEL[edge.type];
        return {
          id: edge.id,
          source: edge.fromId,
          target: edge.toId,
          label,
          labelStyle: { fontSize: 9, fill: "var(--color-text-muted)" },
          labelBgStyle: { fill: "var(--color-background-primary)" },
          style:
            edge.type === "SUPERSEDES"
              ? { stroke: color, strokeWidth: 2 }
              : edge.type === "MENTIONS"
                ? { stroke: color, strokeWidth: 1.5, strokeDasharray: "4 4" }
                : { stroke: color, strokeWidth: 2, strokeDasharray: "1.5 3.5", strokeLinecap: "round" },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        };
      }),
    [graph.edges],
  );

  const handleNodeClick: NodeMouseHandler = (_event, flowNode) => {
    const node = nodeById.get(flowNode.id);
    if (node) onNodeClick?.(node);
  };

  return (
    <div className="h-full w-full rounded-lg border border-border-primary">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
