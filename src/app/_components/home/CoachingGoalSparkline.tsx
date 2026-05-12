'use client';

interface CoachingGoalSparklineProps {
  points: { progress: number }[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}

export function CoachingGoalSparkline({
  points,
  width = 160,
  height = 32,
  ariaLabel = 'Goal progress sparkline',
}: CoachingGoalSparklineProps) {
  if (points.length === 0) {
    return (
      <div
        className="h-8 w-full rounded bg-surface-hover"
        aria-label="No progress snapshots yet"
      />
    );
  }

  if (points.length === 1) {
    const cy = height - (Math.min(100, Math.max(0, points[0]!.progress)) / 100) * height;
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-8 w-full text-brand-primary"
        role="img"
        aria-label={ariaLabel}
      >
        <circle cx={width / 2} cy={cy} r={2.5} fill="currentColor" />
      </svg>
    );
  }

  const padY = 2;
  const usable = height - padY * 2;
  const step = width / (points.length - 1);
  const polyPoints = points
    .map((p, i) => {
      const clamped = Math.min(100, Math.max(0, p.progress));
      const x = i * step;
      const y = padY + (1 - clamped / 100) * usable;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full text-brand-primary"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={polyPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
