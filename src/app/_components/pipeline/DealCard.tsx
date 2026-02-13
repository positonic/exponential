"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, Text, Group, Badge, Avatar, Stack } from "@mantine/core";
import { IconCurrencyDollar, IconUser } from "@tabler/icons-react";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";

export interface DealCardData {
  id: string;
  title: string;
  description?: string | null;
  value?: number | null;
  currency: string;
  probability?: number | null;
  expectedCloseDate?: Date | null;
  stageId: string;
  stageOrder: number;
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
  } | null;
  assignedTo?: {
    id: string;
    name?: string | null;
    image?: string | null;
  } | null;
}

interface DealCardProps {
  deal: DealCardData;
  isDragging?: boolean;
  onClick?: () => void;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.5 : 1,
  };

  const contactName = [deal.contact?.firstName, deal.contact?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab transition-shadow duration-200 hover:shadow-md ${
        isDragging ? "shadow-lg ring-2 ring-blue-400" : ""
      }`}
      padding="sm"
      radius="md"
      withBorder
      onClick={onClick}
    >
      <Stack gap="xs">
        {/* Title */}
        <Text fw={500} size="sm" lineClamp={2}>
          {deal.title}
        </Text>

        {/* Value */}
        {deal.value != null && deal.value > 0 && (
          <Group gap="xs">
            <IconCurrencyDollar size={14} className="text-text-muted" />
            <Text size="sm" fw={600} className="text-text-primary">
              {formatCurrency(deal.value, deal.currency)}
            </Text>
          </Group>
        )}

        {/* Contact / Organization */}
        {(contactName || deal.organization) && (
          <Group gap="xs">
            <IconUser size={14} className="text-text-muted" />
            <Text size="xs" className="text-text-secondary" lineClamp={1}>
              {contactName}
              {contactName && deal.organization && " · "}
              {deal.organization?.name}
            </Text>
          </Group>
        )}

        {/* Bottom row: probability + assignee + close date */}
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            {deal.probability != null && (
              <Badge
                size="xs"
                variant="light"
                color={
                  deal.probability >= 75
                    ? "green"
                    : deal.probability >= 50
                      ? "yellow"
                      : deal.probability >= 25
                        ? "orange"
                        : "gray"
                }
              >
                {deal.probability}%
              </Badge>
            )}
            {deal.expectedCloseDate && (
              <Text size="xs" className="text-text-muted">
                {new Date(deal.expectedCloseDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            )}
          </Group>

          {deal.assignedTo && (
            <Avatar
              src={deal.assignedTo.image}
              size="xs"
              radius="xl"
              color={getAvatarColor(getColorSeed(deal.assignedTo.name ?? ""))}
            >
              <span style={{ color: getTextColor(getAvatarColor(getColorSeed(deal.assignedTo.name ?? ""))) }}>
                {getInitial(deal.assignedTo.name ?? "")}
              </span>
            </Avatar>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
