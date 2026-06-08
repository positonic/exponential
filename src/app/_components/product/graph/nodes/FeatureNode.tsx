"use client";

import { Group, Text, Tooltip } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ROADMAP_CARD_CLASS, ROADMAP_CARD_WIDTH } from "./nodeVisuals";

export interface FeatureNodeData extends Record<string, unknown> {
  name: string;
  status: string;
}

const FEATURE_STATUS_LABELS: Record<string, string> = {
  IDEA: "Idea",
  DEFINED: "Defined",
  IN_PROGRESS: "In progress",
  SHIPPED: "Shipped",
  ARCHIVED: "Archived",
};

export function FeatureNode({ data }: NodeProps) {
  const d = data as unknown as FeatureNodeData;
  const label = FEATURE_STATUS_LABELS[d.status] ?? d.status;
  return (
    <div className={ROADMAP_CARD_CLASS} style={{ width: ROADMAP_CARD_WIDTH }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={label} position="top" withArrow>
          <span
            role="img"
            aria-label={`Status: ${label}`}
            className="shrink-0 leading-none"
            style={{ fontSize: 16 }}
          >
            💡
          </span>
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
