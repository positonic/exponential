"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface ObjectiveNodeData extends Record<string, unknown> {
  title: string;
  period: string | null;
}

export function ObjectiveNode({ data }: NodeProps) {
  const d = data as unknown as ObjectiveNodeData;
  return (
    <div
      className="rounded-md border border-border-primary bg-surface-secondary px-3 py-2 shadow-sm"
      style={{ width: 240 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Stack gap={2}>
        <Group gap="xs" wrap="nowrap" align="center">
          <Text
            size="sm"
            fw={600}
            className="text-text-primary flex-1 min-w-0"
            lineClamp={1}
          >
            {d.title}
          </Text>
          {d.period && (
            <Badge size="xs" variant="light" color="indigo">
              {d.period}
            </Badge>
          )}
        </Group>
        {/* Slice 2 placeholder: "·N features elsewhere" badge slots in here. */}
      </Stack>
    </div>
  );
}
