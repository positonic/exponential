"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Paper, Stack, Text, Badge, Group } from "@mantine/core";
import { DealCard } from "./DealCard";
import type { DealCardData } from "./DealCard";

interface DealColumnProps {
  id: string;
  title: string;
  color: string;
  deals: DealCardData[];
  totalValue: number;
  currency?: string;
  dragOverDealId?: string | null;
  onDealClick?: (dealId: string) => void;
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

export function DealColumn({
  id,
  title,
  color,
  deals,
  totalValue,
  currency = "USD",
  dragOverDealId,
  onDealClick,
}: DealColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const dealIds = deals.map((d) => d.id);

  return (
    <Paper
      ref={setNodeRef}
      className={`min-w-72 w-72 transition-all duration-200 ${
        isOver ? "ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover" : ""
      }`}
      p="md"
      radius="md"
      withBorder
      role="region"
      aria-label={`${title} column with ${deals.length} deal${deals.length !== 1 ? "s" : ""}`}
    >
      {/* Column header */}
      <Stack gap={4} mb="sm">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Badge size="xs" variant="light" color={color}>
            {deals.length}
          </Badge>
        </Group>
        {totalValue > 0 && (
          <Text size="xs" className="text-text-muted">
            {formatCompactCurrency(totalValue, currency)}
          </Text>
        )}
      </Stack>

      {/* Deal cards */}
      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        <Stack gap="sm">
          {deals.map((deal) => (
            <div key={deal.id}>
              {dragOverDealId === deal.id && (
                <div className="mb-2 h-1 rounded-full bg-blue-400 opacity-75" />
              )}
              <DealCard deal={deal} onClick={() => onDealClick?.(deal.id)} />
            </div>
          ))}
          {deals.length === 0 && (
            <div
              className="flex h-20 items-center justify-center rounded-md border-2 border-dashed border-border-secondary"
              role="region"
              aria-label={`Empty ${title.toLowerCase()} column. Drop deals here.`}
            >
              <Text size="sm" c="dimmed">
                Drop deals here
              </Text>
            </div>
          )}
        </Stack>
      </SortableContext>
    </Paper>
  );
}
