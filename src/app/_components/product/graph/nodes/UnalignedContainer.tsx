"use client";

import { Group, Text } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { Handle, Position } from "@xyflow/react";

export interface UnalignedContainerData extends Record<string, unknown> {
  ticketCount: number;
}

/**
 * Synthetic Feature-band sibling for Tickets with `featureId === null`.
 * Visually distinct (dashed border) so it doesn't read as a real Feature.
 */
export function UnalignedContainer({
  data,
}: {
  data: UnalignedContainerData;
}) {
  return (
    <div
      className="rounded-md border border-dashed border-border-primary bg-surface-secondary/40 px-3 py-2"
      style={{ width: 240 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group gap="xs" wrap="nowrap" align="center">
        <IconLink size={14} className="text-text-muted" />
        <Text size="sm" fw={500} className="text-text-muted">
          Unaligned
        </Text>
        <Text size="xs" className="text-text-muted">
          {data.ticketCount}
        </Text>
      </Group>
    </div>
  );
}
