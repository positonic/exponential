'use client';

import { Badge, Tooltip } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { deriveActionBlocked } from '~/lib/actions/blocked';

interface BlockerRef {
  dependsOn: { id: string; name: string; status: string };
}

interface BlockedBadgeProps {
  /** Coarse status of the action itself; a card without one is treated as ACTIVE. */
  status?: string;
  depsOut?: BlockerRef[] | null;
  size?: 'xs' | 'sm';
}

/**
 * "Blocked" chip for an Action card: shown only while at least one blocker
 * is still active (`deriveActionBlocked`), naming the open blockers on hover.
 */
export function BlockedBadge({ status = 'ACTIVE', depsOut, size = 'sm' }: BlockedBadgeProps) {
  const { openBlockerCount, isBlocked } = deriveActionBlocked({ status, depsOut });
  if (!isBlocked) return null;
  const names = (depsOut ?? [])
    .filter((d) => d.dependsOn.status === 'ACTIVE')
    .map((d) => d.dependsOn.name);
  return (
    <Tooltip label={`Blocked by: ${names.join(', ')}`} multiline maw={320}>
      <Badge size={size} variant="light" color="red" leftSection={<IconLock size={10} />}>
        Blocked{openBlockerCount > 1 ? ` (${openBlockerCount})` : ''}
      </Badge>
    </Tooltip>
  );
}
