"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { DealCard } from "./DealCard";
import type { DealCardData } from "./DealCard";
import { KanbanBoard as SharedKanbanBoard } from "~/app/_components/shared/kanban";
import type { ColumnAccent, KanbanColumnDef, KanbanItem } from "~/app/_components/shared/kanban";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  type: string;
}

interface DealKanbanBoardProps {
  projectId: string;
  stages: PipelineStage[];
  deals: DealCardData[];
  onDealClick?: (dealId: string) => void;
}

type BoardItem = DealCardData & KanbanItem;

// Map the DB-driven PipelineStage.color (freeform Mantine palette names) onto the
// shared board's accent vocabulary (ADR-0037) — no schema change.
function mapStageColorToAccent(color: string): ColumnAccent {
  switch (color) {
    case "blue":
    case "indigo":
    case "cyan":
      return "brand";
    case "grape":
    case "violet":
    case "pink":
      return "violet";
    case "yellow":
    case "orange":
    case "lime":
      return "amber";
    case "green":
    case "teal":
      return "green";
    case "red":
      return "red";
    case "gray":
    case "dark":
    default:
      return "slate";
  }
}

function formatCompactCurrency(value: number, currency = "USD"): string {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function DealKanbanBoard({
  projectId,
  stages,
  deals,
  onDealClick,
}: DealKanbanBoardProps) {
  const utils = api.useUtils();

  const moveDealMutation = api.pipeline.moveDeal.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Deal moved",
        message: "Deal stage updated successfully",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Move failed",
        message: error.message ?? "Failed to move deal",
        color: "red",
      });
    },
    onSettled: () => {
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
    },
  });

  // Deals grouped + sorted per stage, flattened into board items (stageId = column).
  const items = useMemo<BoardItem[]>(() => {
    const flattened: BoardItem[] = [];
    for (const stage of stages) {
      const stageDeals = deals
        .filter((d) => d.stageId === stage.id)
        .sort((a, b) => a.stageOrder - b.stageOrder);
      for (const deal of stageDeals) {
        flattened.push({ ...deal, columnId: stage.id });
      }
    }
    return flattened;
  }, [stages, deals]);

  const stageTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const stage of stages) {
      totals[stage.id] = items
        .filter((i) => i.columnId === stage.id)
        .reduce((sum, d) => sum + (d.value ?? 0), 0);
    }
    return totals;
  }, [stages, items]);

  const columns = useMemo<KanbanColumnDef[]>(
    () =>
      stages.map((stage) => {
        const total = stageTotals[stage.id] ?? 0;
        return {
          id: stage.id,
          title: stage.name,
          accent: mapStageColorToAccent(stage.color),
          headerAccessory:
            total > 0 ? (
              <Text size="xs" className="text-text-muted">
                {formatCompactCurrency(total)}
              </Text>
            ) : undefined,
        };
      }),
    [stages, stageTotals],
  );

  // Translate (itemId, toColumnId, toIndex) into the stageId + stageOrder mutation.
  // A column-end drop appends (max order + 1); a drop onto a card takes that card's
  // order (matching the previous board's insert semantics).
  const handleMove = (itemId: string, toColumnId: string, toIndex: number) => {
    const columnDeals = items.filter((i) => i.columnId === toColumnId);
    let stageOrder: number;
    if (toIndex >= columnDeals.length) {
      stageOrder = columnDeals.length
        ? Math.max(...columnDeals.map((d) => d.stageOrder)) + 1
        : 0;
    } else {
      stageOrder = columnDeals[toIndex]!.stageOrder;
    }

    const deal = items.find((i) => i.id === itemId);
    if (deal && deal.stageId === toColumnId && deal.stageOrder === stageOrder) {
      return Promise.resolve();
    }

    return moveDealMutation.mutateAsync({ id: itemId, stageId: toColumnId, stageOrder });
  };

  return (
    <SharedKanbanBoard<BoardItem>
      columns={columns}
      items={items}
      onMove={handleMove}
      getItemLabel={(item) => item.title}
      columnEmptyState="Drop deals here"
      renderCard={(item, { isOverlay }) => (
        <DealCard deal={item} isDragging={isOverlay} onClick={() => onDealClick?.(item.id)} />
      )}
    />
  );
}
