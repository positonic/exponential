"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Group, Text } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { TYPE_MAP, SENTIMENT_COLORS } from "./insightMeta";

export interface InsightCardData {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  status: string;
  sentiment?: string | null;
  impact?: number | null;
  confidence?: number | null;
  category?: string | null;
  parkedAt?: Date | string | null;
}

interface InsightCardProps {
  insight: InsightCardData;
  isDragOverlay?: boolean;
  onClick?: () => void;
}

export function InsightCard({ insight, isDragOverlay, onClick }: InsightCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: insight.id,
  });

  const style = isDragOverlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const typeDef = TYPE_MAP[insight.type];
  const Icon = typeDef?.icon ?? IconBulb;
  const isParked = insight.parkedAt != null;

  return (
    <Card
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className="cursor-grab border border-border-subtle bg-surface-secondary transition-colors hover:border-border-focus active:cursor-grabbing"
      padding="sm"
      radius="sm"
      onClick={() => {
        if (!isDragging && !isDragOverlay) onClick?.();
      }}
    >
      <Group gap="xs" mb={6} wrap="nowrap">
        <Icon size={14} className={`text-${typeDef?.color ?? "gray"}-400 shrink-0`} />
        <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
          {insight.title}
        </Text>
      </Group>

      {insight.body && (
        <Text size="xs" className="text-text-muted mb-1" lineClamp={2}>
          {insight.body}
        </Text>
      )}

      <Group gap={6} mt={4}>
        <Badge size="xs" variant="light" color={typeDef?.color ?? "gray"}>
          {typeDef?.label ?? insight.type}
        </Badge>
        {insight.category && (
          <Badge size="xs" variant="outline" color="gray">
            {insight.category}
          </Badge>
        )}
        {insight.sentiment && (
          <Badge size="xs" variant="dot" color={SENTIMENT_COLORS[insight.sentiment] ?? "gray"}>
            {insight.sentiment}
          </Badge>
        )}
        {isParked && (
          <Badge size="xs" variant="light" color="orange">
            parked
          </Badge>
        )}
        {(insight.impact != null || insight.confidence != null) && (
          <Text size="xs" className="text-text-muted" fw={500}>
            {insight.impact != null ? `I${insight.impact}` : ""}
            {insight.impact != null && insight.confidence != null ? " · " : ""}
            {insight.confidence != null ? `C${insight.confidence}` : ""}
          </Text>
        )}
      </Group>
    </Card>
  );
}
