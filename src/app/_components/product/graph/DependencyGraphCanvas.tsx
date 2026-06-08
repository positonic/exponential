"use client";

import { useMemo } from "react";
import { useComputedColorScheme } from "@mantine/core";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TicketNode, type TicketNodeData } from "./nodes/TicketNode";
import { FeatureNode, type FeatureNodeData } from "./nodes/FeatureNode";
import { ObjectiveNode, type ObjectiveNodeData } from "./nodes/ObjectiveNode";
import {
  UnalignedContainer,
  type UnalignedContainerData,
} from "./nodes/UnalignedContainer";
import {
  layoutRoadmap,
  type LayoutEdgeInput,
  type RoadmapNodeInput,
} from "./layout";
import { COMPLETED_TICKET_STATUSES } from "~/lib/ticket-statuses";
import type {
  DependencyGraphBlockingEdge,
  DependencyGraphFeature,
  DependencyGraphObjective,
  DependencyGraphTicket,
} from "~/plugins/product/server/services/DependencyGraphService";

const nodeTypes = {
  ticket: TicketNode,
  feature: FeatureNode,
  objective: ObjectiveNode,
  unaligned: UnalignedContainer,
};

const UNALIGNED_NODE_ID = "unaligned-container";

export type GraphNodeClick =
  | { kind: "ticket"; ticketId: string }
  | { kind: "feature"; featureId: string }
  | { kind: "objective"; goalId: number }
  | { kind: "unaligned" };

interface Props {
  tickets: DependencyGraphTicket[];
  features?: DependencyGraphFeature[];
  objectives?: DependencyGraphObjective[];
  blockingEdges?: DependencyGraphBlockingEdge[];
  onNodeClick?: (event: GraphNodeClick) => void;
}

// Amber connector for active dependency ("blocking") edges — the roadmap look.
const BLOCKING_EDGE_COLOR = "var(--mantine-color-yellow-7)";
// Muted connector once the blocker is completed, and for structural alignment.
const MUTED_EDGE_COLOR = "var(--color-border-primary)";

const alignmentEdgeStyle = {
  stroke: MUTED_EDGE_COLOR,
  strokeWidth: 1.5,
  strokeDasharray: "2 4",
};

const alignmentMarker = {
  type: MarkerType.ArrowClosed,
  color: MUTED_EDGE_COLOR,
  width: 14,
  height: 14,
} as const;

/**
 * Roadmap canvas — a single left-to-right dependency cascade. Objectives and
 * Features flow into the Tickets that realise them; blocking dependencies push
 * dependents further right and are drawn as curvy amber arrows. Alignment edges
 * (Feature→Ticket, Objective→Feature) are subtle dashed connectors.
 */
export function DependencyGraphCanvas({
  tickets,
  features = [],
  objectives = [],
  blockingEdges = [],
  onNodeClick,
}: Props) {
  // Theme the xyflow chrome (Controls / Background) to the app's color scheme
  // so the zoom controls don't render as a white block in dark mode.
  const colorMode = useComputedColorScheme("dark");
  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    if (!onNodeClick) return;
    if (node.type === "ticket") {
      onNodeClick({ kind: "ticket", ticketId: node.id });
    } else if (node.type === "feature") {
      onNodeClick({ kind: "feature", featureId: node.id });
    } else if (node.type === "objective") {
      const goalId = parseObjectiveNodeId(node.id);
      if (goalId !== null) onNodeClick({ kind: "objective", goalId });
    } else if (node.type === "unaligned") {
      onNodeClick({ kind: "unaligned" });
    }
  };
  const { nodes, edges } = useMemo(() => {
    const orphanTickets = tickets.filter((t) => t.featureId === null);
    const showUnaligned = orphanTickets.length > 0;

    // Objective ids that are reachable via at least one visible Feature.
    const reachableObjectiveIds = new Set<number>();
    for (const f of features) {
      if (f.goalId !== null) reachableObjectiveIds.add(f.goalId);
    }
    const reachableObjectives = objectives.filter((o) =>
      reachableObjectiveIds.has(o.id),
    );

    const layoutInputs: RoadmapNodeInput[] = [];
    for (const o of reachableObjectives) {
      layoutInputs.push({ id: objectiveNodeId(o.id) });
    }
    for (const f of features) {
      layoutInputs.push({ id: f.id });
    }
    if (showUnaligned) {
      layoutInputs.push({ id: UNALIGNED_NODE_ID });
    }
    for (const t of tickets) {
      layoutInputs.push({ id: t.id });
    }

    const layoutEdges: LayoutEdgeInput[] = [];
    for (const f of features) {
      if (f.goalId !== null) {
        layoutEdges.push({
          source: objectiveNodeId(f.goalId),
          target: f.id,
          kind: "alignment",
        });
      }
    }
    for (const t of tickets) {
      if (t.featureId) {
        layoutEdges.push({
          source: t.featureId,
          target: t.id,
          kind: "alignment",
        });
      } else if (showUnaligned) {
        layoutEdges.push({
          source: UNALIGNED_NODE_ID,
          target: t.id,
          kind: "alignment",
        });
      }
    }
    for (const e of blockingEdges) {
      layoutEdges.push({
        source: e.fromTicketId,
        target: e.toTicketId,
        kind: "blocking",
      });
    }

    const positioned = layoutRoadmap(layoutInputs, layoutEdges);

    const ticketById = new Map(tickets.map((t) => [t.id, t]));
    const featureById = new Map(features.map((f) => [f.id, f]));
    const objectiveByNodeId = new Map(
      reachableObjectives.map((o) => [objectiveNodeId(o.id), o]),
    );

    const flowNodes: Node[] = positioned.map((n) => {
      const position = { x: n.x, y: n.y };
      const t = ticketById.get(n.id);
      if (t) {
        const data: TicketNodeData = {
          title: t.title,
          status: t.status,
          shortId: t.shortId,
          number: t.number,
          assignee: t.assignee,
          openBlockerCount: t.openBlockerCount,
          isBlocked: t.isBlocked,
        };
        return { id: n.id, type: "ticket", position, data, draggable: false };
      }
      if (n.id === UNALIGNED_NODE_ID) {
        const data: UnalignedContainerData = {
          ticketCount: orphanTickets.length,
        };
        return {
          id: n.id,
          type: "unaligned",
          position,
          data,
          draggable: false,
        };
      }
      const f = featureById.get(n.id);
      if (f) {
        const data: FeatureNodeData = { name: f.name, status: f.status };
        return { id: n.id, type: "feature", position, data, draggable: false };
      }
      const o = objectiveByNodeId.get(n.id)!;
      const data: ObjectiveNodeData = { title: o.title, period: o.period };
      return { id: n.id, type: "objective", position, data, draggable: false };
    });

    const flowEdges: Edge[] = [];

    // Alignment edges: Objective → Feature.
    for (const f of features) {
      if (f.goalId === null) continue;
      const source = objectiveNodeId(f.goalId);
      if (!objectiveByNodeId.has(source)) continue;
      flowEdges.push({
        id: `alignment:${source}->${f.id}`,
        source,
        target: f.id,
        type: "default",
        style: alignmentEdgeStyle,
        markerEnd: alignmentMarker,
      });
    }

    // Alignment edges: Feature → Ticket (or UnalignedContainer → orphan ticket).
    for (const t of tickets) {
      const source = t.featureId ?? (showUnaligned ? UNALIGNED_NODE_ID : null);
      if (!source) continue;
      flowEdges.push({
        id: `alignment:${source}->${t.id}`,
        source,
        target: t.id,
        type: "default",
        style: alignmentEdgeStyle,
        markerEnd: alignmentMarker,
      });
    }

    // Blocking edges: curvy amber arrows; muted once the blocker is completed.
    for (const e of blockingEdges) {
      const source = ticketById.get(e.fromTicketId);
      const sourceCompleted = source
        ? COMPLETED_TICKET_STATUSES.includes(source.status)
        : false;
      const stroke = sourceCompleted ? MUTED_EDGE_COLOR : BLOCKING_EDGE_COLOR;
      flowEdges.push({
        id: `blocking:${e.fromTicketId}->${e.toTicketId}`,
        source: e.fromTicketId,
        target: e.toTicketId,
        type: "default",
        style: { stroke, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 18,
          height: 18,
        },
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [tickets, features, objectives, blockingEdges]);

  return (
    <div
      className="rounded-md border border-border-primary bg-background-primary"
      style={{ height: 640 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        colorMode={colorMode}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// Objective.id is numeric (legacy Goal table); React Flow needs string node ids.
function objectiveNodeId(goalId: number): string {
  return `objective:${goalId}`;
}

function parseObjectiveNodeId(id: string): number | null {
  const m = /^objective:(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
