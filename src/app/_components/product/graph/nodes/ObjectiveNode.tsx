"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ROADMAP_CARD_CLASS, ROADMAP_CARD_WIDTH } from "./nodeVisuals";

export interface ObjectiveNodeData extends Record<string, unknown> {
  title: string;
  period: string | null;
}

export function ObjectiveNode({ data }: NodeProps) {
  const d = data as unknown as ObjectiveNodeData;
  return (
    <div className={ROADMAP_CARD_CLASS} style={{ width: ROADMAP_CARD_WIDTH }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Stack gap={2}>
        <Group gap="xs" wrap="nowrap" align="center">
          <span
            role="img"
            aria-label="Objective"
            className="shrink-0 leading-none"
            style={{ fontSize: 16 }}
          >
            🎯
          </span>
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
