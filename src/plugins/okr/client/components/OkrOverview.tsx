"use client";

import { Card, Group, RingProgress, Text, SimpleGrid } from "@mantine/core";
import {
  IconCalendarTime,
  IconTrendingUp,
  IconChecklist,
  IconGauge,
} from "@tabler/icons-react";

interface OkrOverviewProps {
  stats: {
    totalKeyResults: number;
    completedKeyResults: number;
    averageProgress: number;
    averageConfidence: number | null;
    periodEndDate: Date | string | null;
  } | null;
  isLoading?: boolean;
}

/**
 * Calculate days remaining until a date.
 */
function getDaysLeft(endDate: Date | string | null): number | null {
  if (!endDate) return null;

  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

/**
 * Get color based on days remaining (urgency indicator).
 */
function getDaysLeftColor(daysLeft: number | null): string {
  if (daysLeft === null) return "gray";
  if (daysLeft <= 7) return "red";
  if (daysLeft <= 30) return "yellow";
  return "blue";
}

/**
 * Get color based on progress percentage.
 */
function getProgressColor(progress: number): string {
  if (progress >= 70) return "green";
  if (progress >= 40) return "yellow";
  return "red";
}

/**
 * Get color based on confidence score.
 */
function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return "gray";
  if (confidence >= 70) return "green";
  if (confidence >= 40) return "yellow";
  return "red";
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  ringValue?: number;
  ringColor?: string;
}

function MetricCard({
  icon,
  label,
  value,
  subtext,
  ringValue,
  ringColor = "blue",
}: MetricCardProps) {
  return (
    <Card
      padding="md"
      className="bg-surface-secondary border border-border-primary"
    >
      <Group gap="md" wrap="nowrap">
        {ringValue !== undefined ? (
          <RingProgress
            size={48}
            thickness={4}
            roundCaps
            sections={[{ value: ringValue, color: ringColor }]}
            label={
              <div className="flex items-center justify-center">{icon}</div>
            }
          />
        ) : (
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-tertiary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <Text size="xs" className="text-text-muted uppercase tracking-wide">
            {label}
          </Text>
          <Text size="xl" fw={600} className="text-text-primary">
            {value}
          </Text>
          {subtext && (
            <Text size="xs" className="text-text-muted">
              {subtext}
            </Text>
          )}
        </div>
      </Group>
    </Card>
  );
}

/**
 * Overview dashboard strip showing 4 key OKR metrics.
 */
export function OkrOverview({ stats, isLoading }: OkrOverviewProps) {
  if (isLoading || !stats) {
    return (
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" className="mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card
            key={i}
            padding="md"
            className="bg-surface-secondary border border-border-primary animate-pulse"
          >
            <div className="h-16" />
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  const daysLeft = getDaysLeft(stats.periodEndDate);
  const daysLeftColor = getDaysLeftColor(daysLeft);
  const progressColor = getProgressColor(stats.averageProgress);
  const confidenceColor = getConfidenceColor(stats.averageConfidence);

  // Calculate completion percentage for ring
  const completionPercent =
    stats.totalKeyResults > 0
      ? Math.round((stats.completedKeyResults / stats.totalKeyResults) * 100)
      : 0;

  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" className="mb-6">
      <MetricCard
        icon={
          <IconCalendarTime size={20} className="text-text-secondary" />
        }
        label="Days Left"
        value={daysLeft ?? "—"}
        ringValue={daysLeft !== null ? Math.min(100, (daysLeft / 90) * 100) : 0}
        ringColor={daysLeftColor}
      />

      <MetricCard
        icon={<IconTrendingUp size={20} className="text-text-secondary" />}
        label="Overall Progress"
        value={`${stats.averageProgress}%`}
        ringValue={stats.averageProgress}
        ringColor={progressColor}
      />

      <MetricCard
        icon={<IconChecklist size={20} className="text-text-secondary" />}
        label="Completed"
        value={`${stats.completedKeyResults}/${stats.totalKeyResults}`}
        subtext="Key Results"
        ringValue={completionPercent}
        ringColor="green"
      />

      <MetricCard
        icon={<IconGauge size={20} className="text-text-secondary" />}
        label="Confidence"
        value={stats.averageConfidence !== null ? `${stats.averageConfidence}%` : "N/A"}
        ringValue={stats.averageConfidence ?? 0}
        ringColor={confidenceColor}
      />
    </SimpleGrid>
  );
}
