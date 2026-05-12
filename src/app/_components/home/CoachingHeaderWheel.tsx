'use client';

import { Skeleton } from '@mantine/core';
import { IconArrowRight, IconCompass } from '@tabler/icons-react';
import Link from 'next/link';
import { useId } from 'react';
import { api } from '~/trpc/react';

interface AxisPoint {
  label: string;
  value: number; // 1–10
  color: string; // CSS color reference (e.g. var(--ch-accent-meetings))
}

// Maps a LifeDomain.color semantic key to a coaching-home scoped CSS var.
function lifeDomainAccent(color: string | null | undefined): string {
  if (!color) return 'var(--ch-accent)';
  const map: Record<string, string> = {
    'brand-primary': 'var(--ch-brand-400)',
    blue: 'var(--ch-brand-400)',
    indigo: 'var(--ch-accent-ritual)',
    green: 'var(--ch-accent-crm)',
    teal: 'var(--ch-accent-knowledge)',
    cyan: 'var(--ch-accent-knowledge)',
    yellow: 'var(--ch-accent-okr)',
    amber: 'var(--ch-accent-okr)',
    orange: 'var(--ch-accent-okr)',
    red: 'var(--ch-accent-due)',
    pink: 'var(--ch-accent-due)',
    violet: 'var(--ch-accent-meetings)',
    purple: 'var(--ch-accent-meetings)',
    grape: 'var(--ch-accent-meetings)',
    gray: 'var(--ch-accent-neutral)',
    neutral: 'var(--ch-accent-neutral)',
  };
  return map[color.toLowerCase()] ?? 'var(--ch-accent)';
}

const CENTER = 110;
const R_MAX = 80;

function polar(angle: number, distance: number) {
  return {
    x: CENTER + Math.cos(angle) * distance,
    y: CENTER + Math.sin(angle) * distance,
  };
}
function angleFor(i: number, n: number) {
  return (i / n) * Math.PI * 2 - Math.PI / 2;
}

function MiniRadar({ axes }: { axes: AxisPoint[] }) {
  const gradId = useId();
  const n = axes.length;

  if (n < 3) {
    return (
      <div className="ch-wheel-card__empty">
        <span className="text-text-muted text-xs">
          At least three life domains needed for the radar.
        </span>
      </div>
    );
  }

  const poly = axes
    .map((a, i) => {
      const r = (Math.min(10, Math.max(0, a.value)) / 10) * R_MAX;
      const { x, y } = polar(angleFor(i, n), r);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const avg = (axes.reduce((s, a) => s + a.value, 0) / n).toFixed(1);

  return (
    <svg viewBox="0 0 220 220" className="ch-wheel" aria-label="Wheel of life radar">
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="var(--ch-accent-violet-45)" />
          <stop offset="100%" stopColor="var(--ch-accent-blue-18)" />
        </radialGradient>
      </defs>

      {/* Concentric rings at scores 2/4/6/8/10 */}
      {[2, 4, 6, 8, 10].map((lvl) => (
        <circle
          key={lvl}
          cx={CENTER}
          cy={CENTER}
          r={(lvl / 10) * R_MAX}
          className="ch-wheel__ring"
        />
      ))}

      {/* Spokes */}
      {axes.map((_, i) => {
        const { x, y } = polar(angleFor(i, n), R_MAX);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={x.toFixed(2)}
            y2={y.toFixed(2)}
            className="ch-wheel__axis"
          />
        );
      })}

      {/* Value polygon */}
      <polygon points={poly} className="ch-wheel__poly" fill={`url(#${gradId})`} />

      {/* Per-domain point dots */}
      {axes.map((a, i) => {
        const r = (Math.min(10, Math.max(0, a.value)) / 10) * R_MAX;
        const { x, y } = polar(angleFor(i, n), r);
        return (
          <circle
            key={i}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r={3.6}
            fill={a.color}
            stroke="var(--ch-bg-elevated)"
            strokeWidth={1.6}
          />
        );
      })}

      {/* Axis labels */}
      {axes.map((a, i) => {
        const { x, y } = polar(angleFor(i, n), R_MAX);
        const dx = (x - CENTER) * 1.22 + CENTER;
        const dy = (y - CENTER) * 1.22 + CENTER + 3;
        return (
          <text
            key={i}
            x={dx}
            y={dy}
            textAnchor="middle"
            className="ch-wheel__label"
          >
            {a.label.length > 14 ? `${a.label.slice(0, 13)}…` : a.label}
          </text>
        );
      })}

      <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="ch-wheel__center-num">
        {avg}
      </text>
      <text x={CENTER} y={CENTER + 11} textAnchor="middle" className="ch-wheel__center-label">
        avg · 10
      </text>
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
    return (
      <div className="ch-wheel-card">
        <Skeleton height={220} radius="md" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ch-wheel-card">
        <div className="ch-wheel-card__head">
          <span className="ch-wheel-card__title">
            <IconCompass size={13} /> Wheel of life
          </span>
        </div>
        <div className="ch-wheel-card__empty">
          <p style={{ fontSize: 12, color: 'var(--ch-text-secondary)' }}>
            Score your Wheel of Life to anchor your coaching focus.
          </p>
          <Link className="ch-wheel-card__cta" href="/wheel-of-life/assessment">
            Start assessment <IconArrowRight size={11} />
          </Link>
        </div>
      </div>
    );
  }

  const axes: AxisPoint[] = data.scores.map((s) => ({
    label: s.lifeDomain.title,
    // Prefer Deep `score` (1–10, higher is better). Fall back to inverted
    // `currentRank` (rank 1 = highest priority → value 10).
    value: s.score ?? Math.max(1, 11 - s.currentRank),
    color: lifeDomainAccent(s.lifeDomain.color),
  }));

  const completedAt = new Date(data.completedAt);
  const ageDays = Math.floor(
    (Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isStale = ageDays > 90;

  return (
    <div className="ch-wheel-card">
      <div className="ch-wheel-card__head">
        <span className="ch-wheel-card__title">
          <IconCompass size={13} /> Wheel of life
        </span>
        <span className="ch-wheel-card__meta">
          {isStale ? <span className="ch-stale" aria-label="Stale assessment" /> : null}
          assessed {relativeDays(completedAt)}
        </span>
      </div>

      <MiniRadar axes={axes} />

      <div className="ch-wheel-card__legend">
        {axes.map((a, i) => (
          <div key={i} className="ch-wheel-card__legend-row">
            <span
              className="ch-wheel-card__legend-dot"
              style={{ background: a.color }}
              aria-hidden
            />
            <span className="ch-wheel-card__legend-name">{a.label}</span>
            <span className="ch-wheel-card__legend-score">{a.value}</span>
          </div>
        ))}
      </div>

      <Link className="ch-wheel-card__cta" href="/wheel-of-life/assessment">
        Reassess the wheel <IconArrowRight size={11} />
      </Link>
    </div>
  );
}
