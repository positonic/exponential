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

/**
 * Decision network canvas: one node per ADR, clustered by repo (one column
 * per repo with a header node), solid SUPERSEDES edges and dashed MENTIONS
 * edges (the same weaker treatment as the detail page's Related section).
 * Read-only — clicking a node navigates to the decision's detail page.
 */

export interface DecisionGraphNode {
  id: string;
  repositoryId: string;
  label: string | null;
  title: string;
  status: string;
}

export interface DecisionGraphEdge {
  id: string;
  type: "SUPERSEDES" | "MENTIONS";
  fromId: string;
  toId: string;
  evidence: string | null;
}

export interface DecisionGraphRepo {
  repositoryId: string;
  fullName: string;
  shortCode: string;
}

interface Props {
  repos: DecisionGraphRepo[];
  nodes: DecisionGraphNode[];
  edges: DecisionGraphEdge[];
  onNodeClick?: (adrId: string) => void;
}

const COLUMN_WIDTH = 280;
const NODE_HEIGHT = 64;
const NODE_GAP = 18;
const HEADER_HEIGHT = 40;

const SOLID_EDGE_COLOR = "var(--mantine-color-blue-6)";
const DASHED_EDGE_COLOR = "var(--color-border-primary)";

const STATUS_BORDER: Record<string, string> = {
  PROPOSED: "var(--mantine-color-blue-6)",
  ACCEPTED: "var(--mantine-color-green-6)",
  SUPERSEDED: "var(--mantine-color-orange-6)",
  DEPRECATED: "var(--mantine-color-red-6)",
  UNKNOWN: "var(--color-border-primary)",
};

export function DecisionGraphCanvas({ repos, nodes, edges, onNodeClick }: Props) {
  const flowNodes: Node[] = useMemo(() => {
    const result: Node[] = [];
    let columnIndex = 0;
    for (const repo of repos) {
      const repoDocs = nodes.filter((n) => n.repositoryId === repo.repositoryId);
      if (repoDocs.length === 0) continue;
      const x = columnIndex * COLUMN_WIDTH;
      columnIndex++;

      result.push({
        id: `repo:${repo.repositoryId}`,
        position: { x, y: 0 },
        data: { label: repo.fullName },
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      });

      repoDocs.forEach((doc, docIndex) => {
        result.push({
          id: doc.id,
          position: {
            x: x + 10,
            y: HEADER_HEIGHT + docIndex * (NODE_HEIGHT + NODE_GAP),
          },
          data: {
            label: `${doc.label ?? "—"}\n${doc.title.length > 46 ? `${doc.title.slice(0, 46)}…` : doc.title}`,
          },
          style: {
            width: COLUMN_WIDTH - 60,
            minHeight: NODE_HEIGHT - 12,
            background: "var(--color-background-primary)",
            border: `1.5px solid ${STATUS_BORDER[doc.status] ?? STATUS_BORDER.UNKNOWN}`,
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
  }, [repos, nodes]);

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const solid = edge.type === "SUPERSEDES";
        return {
          id: edge.id,
          source: edge.fromId,
          target: edge.toId,
          label: solid ? "supersedes" : undefined,
          labelStyle: { fontSize: 9, fill: "var(--color-text-muted)" },
          labelBgStyle: { fill: "var(--color-background-primary)" },
          style: solid
            ? { stroke: SOLID_EDGE_COLOR, strokeWidth: 2 }
            : {
                stroke: DASHED_EDGE_COLOR,
                strokeWidth: 1.5,
                strokeDasharray: "4 4",
              },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: solid ? SOLID_EDGE_COLOR : DASHED_EDGE_COLOR,
            width: 16,
            height: 16,
          },
        };
      }),
    [edges],
  );

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    if (!node.id.startsWith("repo:")) onNodeClick?.(node.id);
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
