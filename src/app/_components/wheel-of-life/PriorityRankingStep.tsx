"use client";

import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Paper, Title, Text, Stack, Group, Badge } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";

interface LifeDomain {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface PriorityRankingStepProps {
  title: string;
  description: string;
  domains: LifeDomain[];
  ranking: number[];
  onRankingChange: (ranking: number[]) => void;
}

interface SortableItemProps {
  domain: LifeDomain;
  rank: number;
}

function SortableItem({ domain, rank }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: domain.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      p="md"
      radius="md"
      className={`bg-surface-primary border border-border-primary ${
        isDragging ? "shadow-lg" : ""
      }`}
    >
      <Group gap="md" wrap="nowrap">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover"
        >
          <IconGripVertical size={20} className="text-text-muted" />
        </div>

        {/* Rank Badge */}
        <Badge
          size="lg"
          variant="filled"
          color={rank <= 3 ? "green" : rank <= 6 ? "yellow" : "gray"}
          className="min-w-[40px]"
        >
          #{rank}
        </Badge>

        {/* Domain Info */}
        <div className="flex-1">
          <Text fw={600} size="sm">
            {domain.title}
          </Text>
          {domain.description && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {domain.description}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
}

export function PriorityRankingStep({
  title,
  description,
  domains,
  ranking,
  onRankingChange,
}: PriorityRankingStepProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const orderedDomains = useMemo(() => {
    return ranking
      .map((id) => domains.find((d) => d.id === id))
      .filter((d): d is LifeDomain => d !== undefined);
  }, [ranking, domains]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = ranking.indexOf(Number(active.id));
      const newIndex = ranking.indexOf(Number(over.id));
      onRankingChange(arrayMove(ranking, oldIndex, newIndex));
    }
  };

  return (
    <Stack gap="lg">
      <div className="text-center mb-2">
        <Title order={3} mb="xs">
          {title}
        </Title>
        <Text c="dimmed" size="sm" maw={600} mx="auto">
          {description}
        </Text>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
          <Stack gap="sm">
            {orderedDomains.map((domain, index) => (
              <SortableItem key={domain.id} domain={domain} rank={index + 1} />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      <Text size="xs" c="dimmed" ta="center" mt="md">
        Drag and drop to reorder. Top = highest priority (#1)
      </Text>
    </Stack>
  );
}
