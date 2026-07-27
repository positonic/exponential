"use client";

import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
import {
  PriorityIcon,
  PRIORITY_LABELS,
} from "~/app/_components/product/PriorityIcon";
import {
  assigneePillColor,
  ROADMAP_CARD_CLASS,
  ROADMAP_CARD_WIDTH,
  ticketStatusEmoji,
} from "./nodeVisuals";

export interface TicketNodeData extends Record<string, unknown> {
  title: string;
  status: string;
  shortId: string | null;
  number: number;
  priority: number | null;
  points: number | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
  openBlockerCount: number;
  isBlocked: boolean;
  /** Out-of-cycle direct blocker shown under a cycle filter. */
  dimmed: boolean;
  /** Cycle name for the chip on dimmed cards; null reads as "No cycle". */
  cycleName: string | null;
}

/** Priorities 0–3 carry signal; 4 / null ("No priority") renders nothing. */
function hasPriority(priority: number | null): priority is number {
  return priority !== null && priority >= 0 && priority <= 3;
}

export function TicketNode({ data }: NodeProps) {
  const d = data as unknown as TicketNodeData;
  const statusLabel = STATUS_LABELS[d.status] ?? d.status;
  const displayId = d.shortId ?? `#${d.number}`;

  return (
    <div
      className={`${ROADMAP_CARD_CLASS} hover:border-border-focus ${
        d.dimmed ? "opacity-50" : ""
      }`}
      style={{ width: ROADMAP_CARD_WIDTH }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={statusLabel} position="top" withArrow>
          <span
            role="img"
            aria-label={`Status: ${statusLabel}`}
            className="shrink-0 leading-none"
            style={{ fontSize: 16 }}
          >
            {ticketStatusEmoji(d.status)}
          </span>
        </Tooltip>
        {hasPriority(d.priority) && (
          <Tooltip
            label={PRIORITY_LABELS[d.priority] ?? "Priority"}
            position="top"
            withArrow
          >
            <span className="shrink-0 leading-none">
              <PriorityIcon priority={d.priority} size={16} />
            </span>
          </Tooltip>
        )}
        <Text
          size="sm"
          fw={600}
          className="text-text-primary flex-1 min-w-0"
          lineClamp={1}
        >
          {d.title}
        </Text>
        {d.points !== null && (
          <Tooltip label={`${d.points} points`} position="top" withArrow>
            <Text size="xs" className="text-text-muted shrink-0">
              {d.points}
            </Text>
          </Tooltip>
        )}
        <BlockedIndicator
          openBlockerCount={d.openBlockerCount}
          isBlocked={d.isBlocked}
        />
        {d.dimmed ? (
          <Badge
            variant="light"
            color="gray"
            radius="sm"
            size="sm"
            className="shrink-0 normal-case"
          >
            {d.cycleName ?? "No cycle"}
          </Badge>
        ) : d.assignee ? (
          <Badge
            variant="light"
            color={assigneePillColor(d.assignee.id)}
            radius="sm"
            size="sm"
            className="shrink-0 normal-case"
          >
            {d.assignee.name ?? "Unassigned"}
          </Badge>
        ) : (
          <Text size="xs" className="text-text-muted shrink-0">
            {displayId}
          </Text>
        )}
      </Group>
    </div>
  );
}
