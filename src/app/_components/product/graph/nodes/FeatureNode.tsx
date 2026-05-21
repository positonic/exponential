"use client";

import { Group, Text, Tooltip } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FeatureNodeData extends Record<string, unknown> {
  name: string;
  status: string;
}

// Same status palette as the Features list page — kept in sync deliberately.
const FEATURE_STATUS_COLORS: Record<string, string> = {
  IDEA: "gray",
  DEFINED: "blue",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  ARCHIVED: "dark",
};

const FEATURE_STATUS_LABELS: Record<string, string> = {
  IDEA: "Idea",
  DEFINED: "Defined",
  IN_PROGRESS: "In progress",
  SHIPPED: "Shipped",
  ARCHIVED: "Archived",
};

export function FeatureNode({ data }: NodeProps) {
  const d = data as unknown as FeatureNodeData;
  const color = FEATURE_STATUS_COLORS[d.status] ?? "gray";
  const label = FEATURE_STATUS_LABELS[d.status] ?? d.status;
  return (
    <div
      className="rounded-md border border-border-primary bg-surface-secondary px-3 py-2 shadow-sm"
      style={{ width: 240 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={label} position="top" withArrow>
          <span
            role="img"
            aria-label={`Status: ${label}`}
            className="inline-block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              backgroundColor: `var(--mantine-color-${color}-6)`,
            }}
          />
        </Tooltip>
        <Text
          size="sm"
          fw={500}
          className="text-text-primary flex-1 min-w-0"
          lineClamp={1}
        >
          {d.name}
        </Text>
      </Group>
    </div>
  );
}
