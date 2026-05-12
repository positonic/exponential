'use client';

import { Badge, Group, Stack, Text } from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { CoachingGoalSparkline } from './CoachingGoalSparkline';

type Health = 'on-track' | 'at-risk' | 'off-track' | 'no-update' | null;

interface CoachingGoalCardProps {
  goal: {
    id: number;
    title: string;
    health: string | null;
    lifeDomain: {
      id: number;
      title: string;
      color: string | null;
      icon: string | null;
    } | null;
    snapshots: { progress: number; snapshotDate: Date | string }[];
    latestUpdate: { id: string; content: string; createdAt: Date | string } | null;
    commentCount: number;
  };
}

const HEALTH_LABELS: Record<Exclude<Health, null>, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  'no-update': 'No update',
};

// Map a Goal.health value to a Mantine Badge color name. We keep the palette
// inside Mantine's built-in named colors so the badge respects theme tokens
// (no hex literals).
const HEALTH_BADGE_COLOR: Record<Exclude<Health, null>, string> = {
  'on-track': 'teal',
  'at-risk': 'yellow',
  'off-track': 'red',
  'no-update': 'gray',
};

function HealthPill({ health }: { health: Health }) {
  const key: Exclude<Health, null> =
    health && health in HEALTH_LABELS ? health : 'no-update';
  return (
    <Badge size="sm" variant="light" color={HEALTH_BADGE_COLOR[key]}>
      {HEALTH_LABELS[key]}
    </Badge>
  );
}

function LifeDomainBadge({
  lifeDomain,
}: {
  lifeDomain: CoachingGoalCardProps['goal']['lifeDomain'];
}) {
  if (!lifeDomain) return null;

  // `color` is a semantic token key (e.g., "brand-primary"). Render the dot
  // via CSS variable so we don't bake a hex literal and don't depend on
  // Tailwind's static class generation.
  const dotStyle = lifeDomain.color
    ? { backgroundColor: `var(--${lifeDomain.color})` }
    : undefined;

  return (
    <Group gap={6} align="center" wrap="nowrap">
      <span
        className="inline-block h-2 w-2 rounded-full bg-text-muted"
        style={dotStyle}
        aria-hidden
      />
      <Text size="xs" className="text-text-secondary">
        {lifeDomain.title}
      </Text>
    </Group>
  );
}

export function CoachingGoalCard({ goal }: CoachingGoalCardProps) {
  const updateText = goal.latestUpdate?.content?.trim() ?? '';
  const health = goal.health as Health;

  return (
    <Stack
      gap="sm"
      className="min-h-[200px] rounded-lg border border-border-primary bg-surface-primary p-4"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} className="min-w-0">
          <Text size="sm" fw={600} className="truncate text-text-primary">
            {goal.title}
          </Text>
          <LifeDomainBadge lifeDomain={goal.lifeDomain} />
        </Stack>
        <HealthPill health={health} />
      </Group>

      <CoachingGoalSparkline
        points={goal.snapshots}
        ariaLabel={`Progress sparkline for ${goal.title}`}
      />

      <Text size="xs" className="line-clamp-2 text-text-secondary">
        {updateText.length > 0 ? updateText : 'No status updates yet.'}
      </Text>

      <Group gap={4} align="center" className="text-text-muted">
        <IconMessage size={14} aria-hidden />
        <Text size="xs" className="text-text-muted">
          {goal.commentCount}
        </Text>
      </Group>
    </Stack>
  );
}
