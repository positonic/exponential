'use client';

import Link from 'next/link';
import { Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconRuler2 } from '@tabler/icons-react';
import type { RouterOutputs } from '~/trpc/react';
import { formatHours } from './format';

type Sizes = NonNullable<RouterOutputs['sprintAnalytics']['getDeliveryFlow']['sizes']>;

const fmt = (h: number) => {
  const f = formatHours(h);
  return `${f.value}${f.unit}`;
};

/**
 * Size versus actual cycle time (ticket light.hornet): one row per size
 * present in the window with its p50 / p85, a coverage line so the view is
 * honest about how many tickets are sized at all, and the tickets that took
 * longer than their size's p85 — the one estimation signal that improves
 * planning, since it points at unclear specs and blocked decisions rather
 * than at implementation time.
 */
export function SizeCalibrationCard({
  sizes,
  workspaceSlug,
}: {
  sizes: Sizes;
  workspaceSlug: string;
}) {
  const maxHours = Math.max(1, ...sizes.buckets.map((b) => b.p85Hours ?? b.p50Hours ?? 0));
  const anyPercentiles = sizes.buckets.some((b) => b.p50Hours != null);

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="xs">
            <IconRuler2 size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              Size vs actual
            </Text>
          </Group>
          <Text size="xs" className="text-text-muted">
            {sizes.sized} of {sizes.completed} completed {sizes.completed === 1 ? 'ticket is' : 'tickets are'} sized
          </Text>
        </Group>

        {sizes.completed === 0 ? (
          <Text size="sm" className="text-text-muted">
            Nothing completed in the window yet.
          </Text>
        ) : !anyPercentiles ? (
          <Text size="sm" className="text-text-muted">
            Each size needs at least 3 completed tickets with a recorded start before its cycle time
            can be compared. Size tickets as they are created, or run the size backfill.
          </Text>
        ) : (
          <Stack gap="xs">
            {sizes.buckets.map((b) => (
              <Group key={b.label} gap="sm" wrap="nowrap" align="center">
                <Text size="sm" fw={500} className="w-14 shrink-0 text-text-primary">
                  {b.label}
                </Text>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-hover">
                  {b.p85Hours != null && (
                    <Tooltip label={`85% within ${fmt(b.p85Hours)}`} withArrow>
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-border-primary"
                        style={{ width: `${(b.p85Hours / maxHours) * 100}%` }}
                      />
                    </Tooltip>
                  )}
                  {b.p50Hours != null && (
                    <Tooltip label={`Half within ${fmt(b.p50Hours)}`} withArrow>
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-brand-primary"
                        style={{ width: `${(b.p50Hours / maxHours) * 100}%` }}
                      />
                    </Tooltip>
                  )}
                </div>
                <Text size="xs" className="w-40 shrink-0 text-right text-text-muted">
                  {b.p50Hours != null && b.p85Hours != null
                    ? `${fmt(b.p50Hours)} · ${fmt(b.p85Hours)} · n=${b.sampleSize}`
                    : `${b.count} ${b.count === 1 ? 'ticket' : 'tickets'}, ${b.sampleSize} timed`}
                </Text>
              </Group>
            ))}
            <Text size="xs" className="text-text-muted">
              Bars: median (solid) and 85th percentile (faint) of started → done time per size.
            </Text>
          </Stack>
        )}

        {sizes.outliers.length > 0 && (
          <Stack gap={4}>
            <Text size="xs" fw={500} className="text-text-secondary">
              Took longer than their size
            </Text>
            {sizes.outliers.map((o) => (
              <Group key={o.ticket.id} gap="xs" wrap="nowrap" className="text-xs">
                <Link
                  href={`/w/${workspaceSlug}/products/${o.ticket.productSlug}/tickets/${o.ticket.urlId}`}
                  className="shrink-0 font-medium text-text-secondary hover:text-text-primary hover:underline"
                >
                  {o.ticket.displayId}
                </Link>
                <Text size="xs" className="min-w-0 flex-1 truncate text-text-primary">
                  {o.ticket.title}
                </Text>
                <Text size="xs" className="shrink-0 text-text-muted">
                  {o.size} · {fmt(o.cycleTimeHours)} vs {fmt(o.bucketP85Hours)}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
