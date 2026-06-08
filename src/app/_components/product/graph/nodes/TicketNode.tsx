"use client";

import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
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
  assignee: { id: string; name: string | null; image: string | null } | null;
  openBlockerCount: number;
  isBlocked: boolean;
}

export function TicketNode({ data }: NodeProps) {
  const d = data as unknown as TicketNodeData;
  const statusLabel = STATUS_LABELS[d.status] ?? d.status;
  const displayId = d.shortId ?? `#${d.number}`;

  return (
    <div
      className={`${ROADMAP_CARD_CLASS} hover:border-border-focus`}
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
        <Text
          size="sm"
          fw={600}
          className="text-text-primary flex-1 min-w-0"
          lineClamp={1}
        >
          {d.title}
        </Text>
        <BlockedIndicator
          openBlockerCount={d.openBlockerCount}
          isBlocked={d.isBlocked}
        />
        {d.assignee ? (
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
