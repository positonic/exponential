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
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconArchiveOff, IconPlayerPause } from "@tabler/icons-react";
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
  parkedAt: Date | null;
  parkReason: string | null;
}

const PARKED_LANE_ID = "PARKED";

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
// Card body (shared by draggable + parked variants)
// ---------------------------------------------------------------------------

function CardBody({ problem }: { problem: ProblemCardItem }) {
  return (
    <>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// ProblemCard (draggable, active lanes) — with a Park affordance
// ---------------------------------------------------------------------------

function ProblemCard({
  problem,
  isDragOverlay,
  onPark,
}: {
  problem: ProblemCardItem;
  isDragOverlay?: boolean;
  onPark?: (id: string) => void;
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
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <div className="min-w-0 flex-1">
          <CardBody problem={problem} />
        </div>
        {!isDragOverlay && onPark && (
          <Tooltip label="Park" withinPortal>
            <ActionIcon
              variant="subtle"
              size="xs"
              className="text-text-muted shrink-0"
              // Pointer listeners on the card start a drag; stop them here so
              // the click registers as a Park, not a drag.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onPark(problem.id);
              }}
            >
              <IconPlayerPause size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ParkedCard (static) — with an Unpark affordance + reason
// ---------------------------------------------------------------------------

function ParkedCard({
  problem,
  onUnpark,
}: {
  problem: ProblemCardItem;
  onUnpark: (id: string) => void;
}) {
  return (
    <Card
      className="border border-border-primary bg-surface-secondary opacity-80"
      padding="sm"
      radius="sm"
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <div className="min-w-0 flex-1">
          <CardBody problem={problem} />
          {problem.parkReason && (
            <Text size="xs" className="text-text-muted mt-1" lineClamp={2}>
              {problem.parkReason}
            </Text>
          )}
        </div>
        <Tooltip label="Unpark" withinPortal>
          <ActionIcon
            variant="subtle"
            size="xs"
            className="text-text-muted shrink-0"
            onClick={() => onUnpark(problem.id)}
          >
            <IconArchiveOff size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stage lane (droppable)
// ---------------------------------------------------------------------------

function BoardLane({
  id,
  label,
  color,
  count,
  children,
}: {
  id: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

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
          {count}
        </Text>
      </Group>
      <Stack gap="xs">{children}</Stack>
    </Paper>
  );
}

function EmptyDropHint() {
  return (
    <div className="h-16 border-2 border-dashed border-border-secondary rounded-md flex items-center justify-center">
      <Text size="xs" className="text-text-muted">
        Drop here
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

interface ProblemKanbanBoardProps {
  problems: ProblemCardItem[];
  productId: string;
  /** Open the reason prompt to park a Problem (the reason is captured upstream). */
  onPark: (id: string) => void;
  onUnpark: (id: string) => void;
}

export function ProblemKanbanBoard({
  problems,
  productId,
  onPark,
  onUnpark,
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

  // Parked items go to the Parked lane regardless of stage; active items group
  // into their stage lane.
  const { laneProblems, parked } = useMemo(() => {
    const lanes: Record<ProblemStage, ProblemCardItem[]> = {
      IDEA: [],
      QUALIFIED: [],
      PRIORITISED: [],
    };
    const parkedList: ProblemCardItem[] = [];
    for (const p of effectiveProblems) {
      if (p.parkedAt) parkedList.push(p);
      else lanes[p.stage].push(p);
    }
    return { laneProblems: lanes, parked: parkedList };
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
      const problem = effectiveProblems.find((p) => p.id === problemId);
      if (!problem || problem.parkedAt) return; // parked cards aren't draggable

      const overId = String(over.id);

      // Dropped on the Parked lane → request a park (reason captured upstream).
      if (overId === PARKED_LANE_ID) {
        onPark(problemId);
        return;
      }

      const overLane = STAGE_LANES.find((l) => l.value === overId);
      const overProblem = effectiveProblems.find((p) => p.id === overId);
      const nextStage = overLane?.value ?? overProblem?.stage;
      if (!nextStage || problem.stage === nextStage) return;

      setOptimisticMoves((prev) => ({ ...prev, [problemId]: nextStage }));
      updateProblem.mutate({ id: problemId, stage: nextStage });
    },
    [effectiveProblems, updateProblem, onPark],
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
            id={lane.value}
            label={lane.label}
            color={lane.color}
            count={laneProblems[lane.value].length}
          >
            {laneProblems[lane.value].map((problem) => (
              <ProblemCard key={problem.id} problem={problem} onPark={onPark} />
            ))}
            {laneProblems[lane.value].length === 0 && <EmptyDropHint />}
          </BoardLane>
        ))}

        <BoardLane
          id={PARKED_LANE_ID}
          label="Parked"
          color="yellow"
          count={parked.length}
        >
          {parked.map((problem) => (
            <ParkedCard key={problem.id} problem={problem} onUnpark={onUnpark} />
          ))}
          {parked.length === 0 && <EmptyDropHint />}
        </BoardLane>
      </div>
      <DragOverlay>
        {activeProblem && <ProblemCard problem={activeProblem} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
