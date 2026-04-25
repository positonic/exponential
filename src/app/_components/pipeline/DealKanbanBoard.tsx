"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ScrollArea, Group } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { DealColumn } from "./DealColumn";
import { DealCard } from "./DealCard";
import type { DealCardData } from "./DealCard";

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

export function DealKanbanBoard({
  projectId,
  stages,
  deals,
  onDealClick,
}: DealKanbanBoardProps) {
  const [activeDeal, setActiveDeal] = useState<DealCardData | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Record<string, { stageId: string; stageOrder: number }>
  >({});
  const [dragOverDealId, setDragOverDealId] = useState<string | null>(null);

  const utils = api.useUtils();

  const moveDealMutation = api.pipeline.moveDeal.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Deal moved",
        message: "Deal stage updated successfully",
        color: "green",
      });
    },
    onError: (error, variables) => {
      // Rollback optimistic update
      setOptimisticMoves((prev) => {
        const updated = { ...prev };
        delete updated[variables.id];
        return updated;
      });
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

  // Apply optimistic updates to deals
  const dealsWithOptimistic = useMemo(() => {
    return deals.map((deal) => {
      const move = optimisticMoves[deal.id];
      if (move) {
        return { ...deal, stageId: move.stageId, stageOrder: move.stageOrder };
      }
      return deal;
    });
  }, [deals, optimisticMoves]);

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, DealCardData[]> = {};
    for (const stage of stages) {
      grouped[stage.id] = dealsWithOptimistic
        .filter((d) => d.stageId === stage.id)
        .sort((a, b) => a.stageOrder - b.stageOrder);
    }
    return grouped;
  }, [stages, dealsWithOptimistic]);

  // Calculate total value per stage
  const stageValues = useMemo(() => {
    const values: Record<string, number> = {};
    for (const stage of stages) {
      values[stage.id] = (dealsByStage[stage.id] ?? []).reduce(
        (sum, d) => sum + (d.value ?? 0),
        0,
      );
    }
    return values;
  }, [stages, dealsByStage]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const deal = dealsWithOptimistic.find((d) => d.id === event.active.id);
    setActiveDeal(deal ?? null);
    setDragOverDealId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      const overId = over.id as string;
      const isColumn = stages.some((s) => s.id === overId);
      setDragOverDealId(isColumn ? null : overId);
    } else {
      setDragOverDealId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverDealId(null);

    if (!over) {
      setActiveDeal(null);
      return;
    }

    const dealId = active.id as string;
    const overId = over.id as string;

    const deal = dealsWithOptimistic.find((d) => d.id === dealId);
    if (!deal) {
      setActiveDeal(null);
      return;
    }

    if (moveDealMutation.isPending) {
      setActiveDeal(null);
      return;
    }

    // Determine target stage
    const isColumn = stages.some((s) => s.id === overId);
    let targetStageId: string;
    let targetOrder: number;

    if (isColumn) {
      targetStageId = overId;
      // Place at end of column
      const columnDeals = dealsByStage[targetStageId] ?? [];
      targetOrder = columnDeals.length > 0
        ? Math.max(...columnDeals.map((d) => d.stageOrder)) + 1
        : 0;
    } else {
      // Dropped on another deal — use that deal's stage
      const targetDeal = dealsWithOptimistic.find((d) => d.id === overId);
      if (!targetDeal) {
        setActiveDeal(null);
        return;
      }
      targetStageId = targetDeal.stageId;
      targetOrder = targetDeal.stageOrder;
    }

    // Skip if no change
    if (deal.stageId === targetStageId && deal.stageOrder === targetOrder) {
      setActiveDeal(null);
      return;
    }

    // Apply optimistic update BEFORE clearing active deal
    setOptimisticMoves((prev) => ({
      ...prev,
      [dealId]: { stageId: targetStageId, stageOrder: targetOrder },
    }));

    setActiveDeal(null);

    moveDealMutation.mutate({
      id: dealId,
      stageId: targetStageId,
      stageOrder: targetOrder,
    });
  };

  const handleDragCancel = () => {
    setActiveDeal(null);
    setDragOverDealId(null);
  };

  return (
    <div className="w-full" role="application" aria-label="Deal Pipeline Kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <ScrollArea>
          <Group
            gap="md"
            align="flex-start"
            wrap="nowrap"
            className="pb-4"
            style={{ minWidth: `${stages.length * 304}px` }}
          >
            {stages.map((stage) => (
              <DealColumn
                key={stage.id}
                id={stage.id}
                title={stage.name}
                color={stage.color}
                deals={dealsByStage[stage.id] ?? []}
                totalValue={stageValues[stage.id] ?? 0}
                dragOverDealId={dragOverDealId}
                onDealClick={onDealClick}
              />
            ))}
          </Group>
        </ScrollArea>

        <DragOverlay>
          {activeDeal && <DealCard deal={activeDeal} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
