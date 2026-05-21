"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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
  compactBandSpec,
  layoutHierarchical,
  type LayoutEdgeInput,
  type LayoutNodeInput,
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

const alignmentEdgeStyle = {
  stroke: "var(--color-border-primary)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};

const BAND_Y = { objectives: 0, features: 200, tickets: 400 };
const BAND_ROW_HEIGHT = 200;

/**
 * Three-band canvas — Objectives → Features → Tickets. Bands collapse
 * (and downstream bands shift up) when empty. Blocking edges between
 * Tickets are solid; alignment edges (Feature→Ticket, Objective→Feature)
 * are dashed and never red.
 */
export function DependencyGraphCanvas({
  tickets,
  features = [],
  objectives = [],
  blockingEdges = [],
  onNodeClick,
}: Props) {
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

    const presentBands = new Set<"objectives" | "features" | "tickets">();
    if (reachableObjectives.length > 0) presentBands.add("objectives");
    if (features.length > 0 || showUnaligned) presentBands.add("features");
    if (tickets.length > 0) presentBands.add("tickets");

    const bandSpec = compactBandSpec(
      { y: BAND_Y },
      presentBands,
      BAND_ROW_HEIGHT,
    );

    const layoutInputs: LayoutNodeInput[] = [];
    for (const o of reachableObjectives) {
      layoutInputs.push({ id: objectiveNodeId(o.id), band: "objectives" });
    }
    for (const f of features) {
      layoutInputs.push({ id: f.id, band: "features" });
    }
    if (showUnaligned) {
      layoutInputs.push({
        id: UNALIGNED_NODE_ID,
        band: "features",
        unaligned: true,
      });
    }
    for (const t of tickets) {
      layoutInputs.push({ id: t.id, band: "tickets" });
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

    const positioned = layoutHierarchical(layoutInputs, layoutEdges, bandSpec);

    const ticketById = new Map(tickets.map((t) => [t.id, t]));
    const featureById = new Map(features.map((f) => [f.id, f]));
    const objectiveByNodeId = new Map(
      reachableObjectives.map((o) => [objectiveNodeId(o.id), o]),
    );

    const flowNodes: Node[] = positioned.nodes.map((n) => {
      const position = { x: n.x, y: n.y };
      if (n.band === "tickets") {
        const t = ticketById.get(n.id)!;
        const data: TicketNodeData = {
          title: t.title,
          status: t.status,
          shortId: t.shortId,
          number: t.number,
          assignee: t.assignee,
          openBlockerCount: t.openBlockerCount,
          isBlocked: t.isBlocked,
        };
        return {
          id: n.id,
          type: "ticket",
          position,
          data,
          draggable: false,
        };
      }
      if (n.band === "features") {
        if (n.unaligned) {
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
        const f = featureById.get(n.id)!;
        const data: FeatureNodeData = {
          name: f.name,
          status: f.status,
        };
        return {
          id: n.id,
          type: "feature",
          position,
          data,
          draggable: false,
        };
      }
      // Objectives band
      const o = objectiveByNodeId.get(n.id)!;
      const data: ObjectiveNodeData = {
        title: o.title,
        period: o.period,
      };
      return {
        id: n.id,
        type: "objective",
        position,
        data,
        draggable: false,
      };
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
      });
    }

    // Blocking edges: solid; red when source Ticket is non-completed.
    for (const e of blockingEdges) {
      const source = ticketById.get(e.fromTicketId);
      const sourceCompleted = source
        ? COMPLETED_TICKET_STATUSES.includes(source.status)
        : false;
      const stroke = sourceCompleted
        ? "var(--color-border-primary)"
        : "var(--mantine-color-red-5)";
      flowEdges.push({
        id: `blocking:${e.fromTicketId}->${e.toTicketId}`,
        source: e.fromTicketId,
        target: e.toTicketId,
        type: "default",
        style: { stroke, strokeWidth: 1.5 },
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [tickets, features, objectives, blockingEdges]);

  return (
    <div
      className="rounded-md border border-border-primary bg-background-primary"
      style={{ height: 600 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
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
