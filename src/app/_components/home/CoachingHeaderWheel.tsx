'use client';

import { Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { api } from '~/trpc/react';

interface AxisPoint {
  label: string;
  value: number; // 1-10
}

const SIZE = 200;
const PAD = 18;
const CENTER = SIZE / 2;
const RADIUS = CENTER - PAD;
const RINGS = 4;

function polarToCartesian(angle: number, distance: number) {
  return {
    x: CENTER + Math.cos(angle) * distance,
    y: CENTER + Math.sin(angle) * distance,
  };
}

function angleFor(i: number, n: number) {
  return (2 * Math.PI * i) / n - Math.PI / 2;
}

function MiniRadar({ axes }: { axes: AxisPoint[] }) {
  const n = axes.length;
  if (n < 3) {
    // Radar requires at least 3 axes; otherwise just bail to a text fallback.
    return (
      <Text size="xs" className="text-text-muted">
        Add at least three life domains to see a radar.
      </Text>
    );
  }

  const ringPaths: string[] = [];
  for (let r = 1; r <= RINGS; r++) {
    const distance = (RADIUS * r) / RINGS;
    const points = Array.from({ length: n }, (_, i) => {
      const { x, y } = polarToCartesian(angleFor(i, n), distance);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    ringPaths.push(points.join(' '));
  }

  const valuePoints = axes
    .map((a, i) => {
      const clamped = Math.min(10, Math.max(0, a.value));
      const distance = (RADIUS * clamped) / 10;
      const { x, y } = polarToCartesian(angleFor(i, n), distance);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label="Wheel of Life radar"
      className="text-brand-primary"
    >
      {/* Grid rings */}
      {ringPaths.map((p, i) => (
        <polygon
          key={i}
          points={p}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
          className="text-text-muted"
        />
      ))}

      {/* Spokes */}
      {axes.map((_, i) => {
        const { x, y } = polarToCartesian(angleFor(i, n), RADIUS);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={x.toFixed(2)}
            y2={y.toFixed(2)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
            className="text-text-muted"
          />
        );
      })}

      {/* Value polygon */}
      <polygon
        points={valuePoints}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={1.5}
      />

      {/* Value points */}
      {axes.map((a, i) => {
        const clamped = Math.min(10, Math.max(0, a.value));
        const distance = (RADIUS * clamped) / 10;
        const { x, y } = polarToCartesian(angleFor(i, n), distance);
        return (
          <circle
            key={i}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r={2}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

function relativeDays(from: Date): string {
  const ms = Date.now() - from.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function CoachingHeaderWheel() {
  const { data, isLoading } = api.wheelOfLife.getLatestAssessment.useQuery();

  if (isLoading) {
    return <Skeleton height={SIZE} width={SIZE} radius="md" />;
  }

  if (!data) {
    return (
      <Stack
        gap="xs"
        align="flex-start"
        className="rounded-lg border border-border-primary bg-surface-secondary p-4"
      >
        <Text size="sm" fw={600} className="text-text-primary">
          Wheel of Life
        </Text>
        <Text size="xs" className="text-text-secondary">
          Score your Wheel of Life to anchor your coaching focus.
        </Text>
        <Button
          component={Link}
          href="/wheel-of-life/assessment"
          size="xs"
          variant="light"
        >
          Start assessment
        </Button>
      </Stack>
    );
  }

  const axes: AxisPoint[] = data.scores.map((s) => ({
    label: s.lifeDomain.title,
    // Prefer Deep `score` (1–10, higher is better). Fall back to inverted
    // `currentRank` (rank 1 = highest priority → value 10).
    value: s.score ?? Math.max(1, 11 - s.currentRank),
  }));

  const completedAt = new Date(data.completedAt);
  const ageDays = Math.floor(
    (Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isStale = ageDays > 90;

  return (
    <Stack gap={6} align="flex-start">
      <MiniRadar axes={axes} />
      <Group gap={6} align="center" wrap="nowrap">
        {isStale ? (
          <span
            aria-label="Stale assessment"
            className="inline-block h-2 w-2 rounded-full bg-status-warning"
            style={{ backgroundColor: 'var(--mantine-color-yellow-6)' }}
          />
        ) : null}
        <Text size="xs" className="text-text-secondary">
          Last scored: {relativeDays(completedAt)} ·{' '}
          <Text
            component={Link}
            href="/wheel-of-life/assessment"
            className="text-brand-primary hover:underline"
          >
            Rescore
          </Text>
        </Text>
      </Group>
    </Stack>
  );
}
