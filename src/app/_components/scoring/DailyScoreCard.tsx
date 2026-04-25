"use client";

import { Card, Text, Progress, Group, Stack, Badge, Loader, Collapse } from "@mantine/core";
import { useState } from "react";
import { api } from "~/trpc/react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { StreakBadge } from "./StreakBadge";

interface DailyScoreCardProps {
  date?: Date;
  workspaceId?: string;
  compact?: boolean;
}

export function DailyScoreCard({ date, workspaceId, compact = false }: DailyScoreCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Fetch today's score
  const { data: score, isLoading } = api.scoring.getTodayScore.useQuery({
    date,
    workspaceId,
  });

  // Fetch daily planning streak
  const { data: streak } = api.scoring.getStreakByType.useQuery({
    streakType: "daily_planning",
    workspaceId,
  });

  if (isLoading) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Group className="justify-center p-6">
          <Loader size="sm" />
        </Group>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Text className="text-text-muted text-center">
          No score available yet. Create a daily plan to get started!
        </Text>
      </Card>
    );
  }

  // Determine score color
  const getScoreColor = (totalScore: number) => {
    if (totalScore >= 80) return "var(--mantine-color-green-6)";
    if (totalScore >= 60) return "var(--mantine-color-blue-6)";
    if (totalScore >= 40) return "var(--mantine-color-yellow-6)";
    return "var(--mantine-color-orange-6)";
  };

  // Determine score label
  const getScoreLabel = (totalScore: number) => {
    if (totalScore >= 90) return "Exceptional! 🏆";
    if (totalScore >= 80) return "Great day! 🌟";
    if (totalScore >= 70) return "Good work! 💪";
    if (totalScore >= 60) return "Making progress 👍";
    if (totalScore >= 40) return "Keep going 🚀";
    return "Today&apos;s score";
  };

  const scoreColor = getScoreColor(score.totalScore);
  const scoreLabel = getScoreLabel(score.totalScore);

  if (compact) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Group className="justify-between">
          <div>
            <Text className="text-text-secondary text-sm">Today&apos;s Score</Text>
            <Text className="text-text-primary text-2xl font-bold" style={{ color: scoreColor }}>
              {score.totalScore}
            </Text>
          </div>
          {streak && streak.currentStreak > 0 && (
            <StreakBadge streakCount={streak.currentStreak} streakType="daily_planning" />
          )}
        </Group>
      </Card>
    );
  }

  return (
    <Card className="bg-surface-primary border-border-primary">
      <Stack gap="md">
        {/* Header with score and streak */}
        <Group className="justify-between items-start">
          <div>
            <Text className="text-text-secondary text-sm mb-1">Daily Productivity Score</Text>
            <Group gap="sm" className="items-baseline">
              <Text className="text-text-primary text-5xl font-bold" style={{ color: scoreColor }}>
                {score.totalScore}
              </Text>
              <Text className="text-text-secondary text-xl">/100</Text>
            </Group>
            <Text className="text-text-secondary text-sm mt-1">{scoreLabel}</Text>
          </div>

          {streak && streak.currentStreak > 0 && (
            <StreakBadge streakCount={streak.currentStreak} streakType="daily_planning" />
          )}
        </Group>

        {/* Progress bar */}
        <Progress
          value={score.totalScore}
          size="lg"
          radius="md"
          color={scoreColor}
          className="w-full"
        />

        {/* Quick stats badges */}
        <Group gap="xs">
          {score.breakdown.planCreated > 0 && (
            <Badge variant="light" color="blue" size="sm">
              Plan Created
            </Badge>
          )}
          {score.breakdown.planCompleted > 0 && (
            <Badge variant="light" color="green" size="sm">
              Plan Completed
            </Badge>
          )}
          {score.metadata.completedTasks > 0 && (
            <Badge variant="light" color="teal" size="sm">
              {score.metadata.completedTasks}/{score.metadata.totalPlannedTasks} Tasks
            </Badge>
          )}
          {score.metadata.completedHabits > 0 && (
            <Badge variant="light" color="violet" size="sm">
              {score.metadata.completedHabits}/{score.metadata.scheduledHabits} Habits
            </Badge>
          )}
        </Group>

        {/* Expandable breakdown */}
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="flex items-center justify-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm mt-2"
        >
          <span>{showBreakdown ? "Hide" : "Show"} breakdown</span>
          {showBreakdown ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>

        <Collapse in={showBreakdown}>
          <ScoreBreakdown score={score} />
        </Collapse>
      </Stack>
    </Card>
  );
}
