"use client";

import { Avatar, Group, Text, Tooltip } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATUS_COLORS, STATUS_LABELS } from "~/lib/ticket-statuses";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";

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
  const statusColor = STATUS_COLORS[d.status] ?? "gray";
  const statusLabel = STATUS_LABELS[d.status] ?? d.status;
  const displayId = d.shortId ?? `#${d.number}`;

  return (
    <div
      className="rounded-md border border-border-primary bg-surface-secondary px-3 py-2 shadow-sm hover:border-border-focus transition-colors"
      style={{ width: 240 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={statusLabel} position="top" withArrow>
          <span
            role="img"
            aria-label={`Status: ${statusLabel}`}
            className="inline-block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              backgroundColor: `var(--mantine-color-${statusColor}-6)`,
            }}
          />
        </Tooltip>
        <Text size="xs" className="text-text-muted shrink-0" fw={500}>
          {displayId}
        </Text>
        <Text
          size="sm"
          className="text-text-primary flex-1 min-w-0"
          lineClamp={1}
        >
          {d.title}
        </Text>
        <BlockedIndicator
          openBlockerCount={d.openBlockerCount}
          isBlocked={d.isBlocked}
        />
        {d.assignee && (
          <Avatar
            src={d.assignee.image}
            size={18}
            radius="xl"
            alt={d.assignee.name ?? "Assignee"}
          >
            {(d.assignee.name ?? "?").slice(0, 1).toUpperCase()}
          </Avatar>
        )}
      </Group>
    </div>
  );
}
