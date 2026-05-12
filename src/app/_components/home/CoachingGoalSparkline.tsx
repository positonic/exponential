'use client';

import { useId } from 'react';

interface CoachingGoalSparklineProps {
  points: { progress: number }[];
  /** CSS color reference, e.g. `var(--ch-accent-crm)`. */
  color: string;
  ariaLabel?: string;
}

const W = 240;
const H = 40;
const PAD_X = 2;
const PAD_Y = 5;

export function CoachingGoalSparkline({
  points,
  color,
  ariaLabel = 'Goal progress sparkline',
}: CoachingGoalSparklineProps) {
  const gradId = useId();

  if (points.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="No progress snapshots yet"
        style={{ color }}
      >
        <rect
          x={PAD_X}
          y={H - PAD_Y - 1}
          width={W - PAD_X * 2}
          height={1}
          fill="currentColor"
          opacity={0.2}
        />
      </svg>
    );
  }

  const values = points.map((p) => Math.min(100, Math.max(0, p.progress)));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;

  const pts = values.map((v, i) => {
    const x = PAD_X + i * step;
    const y = PAD_Y + (1 - (v - min) / range) * (H - PAD_Y * 2);
    return [x, y] as const;
  });

  if (pts.length === 1) {
    const [x, y] = pts[0]!;
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        style={{ color }}
      >
        <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={2.6} fill="currentColor" />
      </svg>
    );
  }

  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(' ');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${line} L ${last[0].toFixed(2)} ${H} L ${first[0].toFixed(2)} ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      style={{ color }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        stroke="currentColor"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last[0].toFixed(2)}
        cy={last[1].toFixed(2)}
        r={2.6}
        fill="currentColor"
      />
    </svg>
  );
}
