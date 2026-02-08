"use client";

import { Text, Tooltip, Group } from "@mantine/core";
import {
  IconTarget,
  IconActivity,
  IconPlayerPlay,
  IconCalendarCheck,
  IconTrendingUp,
} from "@tabler/icons-react";

export interface ProjectHealthData {
  progress: number;
  actions: Array<{
    id: string;
    status: string;
    completedAt: Date | null;
    dueDate: Date | null;
  }>;
  outcomes: Array<{
    id: string;
  }>;
}

export interface HealthIndicators {
  weeklyPlanning: boolean;
  recentActivity: boolean;
  momentum: boolean;
  onTrack: boolean;
  hasProgress: boolean;
}

export function calculateProjectHealth(project: ProjectHealthData): {
  score: number;
  indicators: HealthIndicators;
} {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weeklyPlanning = project.outcomes.length > 0;
  const recentActivity = project.actions.some(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );
  const momentum = project.actions.some((a) => a.status === "ACTIVE");
  const onTrack = !project.actions.some(
    (a) =>
      a.dueDate &&
      new Date(a.dueDate) < today &&
      a.status !== "COMPLETED" &&
      a.status !== "DONE"
  );
  const hasProgress = project.progress > 0;

  const indicators = { weeklyPlanning, recentActivity, momentum, onTrack, hasProgress };
  const score = Object.values(indicators).filter(Boolean).length * 20;

  return { score, indicators };
}

export function HealthRing({ score, size = 32 }: { score: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const colorClass =
    score >= 60
      ? "text-green-500"
      : score >= 40
        ? "text-yellow-500"
        : "text-red-500";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-surface-hover"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={`stroke-current ${colorClass}`}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text size="xs" fw={600} className={colorClass}>
          {score / 10}
        </Text>
      </div>
    </div>
  );
}

export function HealthIndicatorIcons({ indicators }: { indicators: HealthIndicators }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip
        label={
          indicators.weeklyPlanning
            ? "Outcomes linked"
            : "No outcomes linked"
        }
        withArrow
      >
        <IconTarget
          size={14}
          className={
            indicators.weeklyPlanning
              ? "text-green-500"
              : "text-red-500"
          }
        />
      </Tooltip>
      <Tooltip
        label={
          indicators.recentActivity
            ? "Recent activity"
            : "No recent activity"
        }
        withArrow
      >
        <IconActivity
          size={14}
          className={
            indicators.recentActivity
              ? "text-green-500"
              : "text-yellow-500"
          }
        />
      </Tooltip>
      <Tooltip
        label={
          indicators.momentum
            ? "Active actions in progress"
            : "No active actions"
        }
        withArrow
      >
        <IconPlayerPlay
          size={14}
          className={
            indicators.momentum
              ? "text-green-500"
              : "text-yellow-500"
          }
        />
      </Tooltip>
      <Tooltip
        label={
          indicators.onTrack
            ? "On track"
            : "Has overdue actions"
        }
        withArrow
      >
        <IconCalendarCheck
          size={14}
          className={
            indicators.onTrack
              ? "text-green-500"
              : "text-red-500"
          }
        />
      </Tooltip>
      <Tooltip
        label={
          indicators.hasProgress
            ? "Progress tracked"
            : "No progress set"
        }
        withArrow
      >
        <IconTrendingUp
          size={14}
          className={
            indicators.hasProgress
              ? "text-green-500"
              : "text-text-muted"
          }
        />
      </Tooltip>
    </Group>
  );
}
