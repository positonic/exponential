"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Group, Paper, Stack, Text } from "@mantine/core";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Types — kept Problem-specific. A reusable Table+Triage board is extracted
// when the second pipeline entity (Hypothesis, v2) lands (beads exponential-mc19).
// ---------------------------------------------------------------------------

export type ProblemStage = "IDEA" | "QUALIFIED" | "PRIORITISED";

export interface ProblemCardItem {
  id: string;
  title: string;
  category: string | null;
  impact: number | null;
  confidence: number | null;
  stage: ProblemStage;
}

const STAGE_LANES: ReadonlyArray<{
  value: ProblemStage;
  label: string;
  color: string;
}> = [
  { value: "IDEA", label: "Idea", color: "gray" },
  { value: "QUALIFIED", label: "Qualified", color: "blue" },
  { value: "PRIORITISED", label: "Prioritised", color: "green" },
];

// ---------------------------------------------------------------------------
// ProblemCard (draggable)
// ---------------------------------------------------------------------------

function ProblemCard({
  problem,
  isDragOverlay,
}: {
  problem: ProblemCardItem;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: problem.id });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  return (
    <Card
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-grab active:cursor-grabbing"
      padding="sm"
      radius="sm"
    >
      <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
        {problem.title}
      </Text>
      <Group gap="xs" mt="xs">
        {problem.category && (
          <Badge size="xs" variant="light" color="grape">
            {problem.category}
          </Badge>
        )}
        {problem.impact != null && (
          <Badge size="xs" variant="outline" color="orange" title="Impact">
            I{problem.impact}
          </Badge>
        )}
        {problem.confidence != null && (
          <Badge size="xs" variant="outline" color="teal" title="Confidence">
            C{problem.confidence}
          </Badge>
        )}
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lane (droppable)
// ---------------------------------------------------------------------------

function BoardLane({
  stage,
  label,
  color,
  problems,
}: {
  stage: ProblemStage;
  label: string;
  color: string;
  problems: ProblemCardItem[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <Paper
      ref={setNodeRef}
      className={`min-w-64 w-64 shrink-0 transition-all duration-200 ${
        isOver ? "ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover" : ""
      }`}
      p="sm"
      radius="md"
      withBorder
    >
      <Group justify="space-between" mb="sm">
        <Badge
          size="sm"
          variant="filled"
          color={color}
          styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
        >
          {label}
        </Badge>
        <Text size="xs" fw={600} className="text-text-muted">
          {problems.length}
        </Text>
      </Group>
      <Stack gap="xs">
        {problems.map((problem) => (
          <ProblemCard key={problem.id} problem={problem} />
        ))}
        {problems.length === 0 && (
          <div className="h-16 border-2 border-dashed border-border-secondary rounded-md flex items-center justify-center">
            <Text size="xs" className="text-text-muted">
              Drop here
            </Text>
          </div>
        )}
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

interface ProblemKanbanBoardProps {
  problems: ProblemCardItem[];
  productId: string;
}

export function ProblemKanbanBoard({
  problems,
  productId,
}: ProblemKanbanBoardProps) {
  const utils = api.useUtils();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Record<string, ProblemStage>
  >({});

  const updateProblem = api.product.problem.update.useMutation({
    onSuccess: async () => {
      await utils.product.problem.list.invalidate({ productId });
    },
    onError: (_err, variables) => {
      // Roll back the optimistic move on failure.
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const effectiveProblems = useMemo(
    () =>
      problems.map((p) =>
        optimisticMoves[p.id] ? { ...p, stage: optimisticMoves[p.id]! } : p,
      ),
    [problems, optimisticMoves],
  );

  const laneProblems = useMemo(() => {
    const map: Record<ProblemStage, ProblemCardItem[]> = {
      IDEA: [],
      QUALIFIED: [],
      PRIORITISED: [],
    };
    for (const p of effectiveProblems) {
      map[p.stage].push(p);
    }
    return map;
  }, [effectiveProblems]);

  const activeProblem = activeId
    ? effectiveProblems.find((p) => p.id === activeId)
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const problemId = active.id as string;
      const overId = String(over.id);
      const overLane = STAGE_LANES.find((l) => l.value === overId);
      const overProblem = effectiveProblems.find((p) => p.id === overId);
      const nextStage = overLane?.value ?? overProblem?.stage;
      if (!nextStage) return;

      const problem = effectiveProblems.find((p) => p.id === problemId);
      if (!problem || problem.stage === nextStage) return;

      setOptimisticMoves((prev) => ({ ...prev, [problemId]: nextStage }));
      updateProblem.mutate({ id: problemId, stage: nextStage });
    },
    [effectiveProblems, updateProblem],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 w-full min-w-0">
        {STAGE_LANES.map((lane) => (
          <BoardLane
            key={lane.value}
            stage={lane.value}
            label={lane.label}
            color={lane.color}
            problems={laneProblems[lane.value]}
          />
        ))}
      </div>
      <DragOverlay>
        {activeProblem && <ProblemCard problem={activeProblem} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
