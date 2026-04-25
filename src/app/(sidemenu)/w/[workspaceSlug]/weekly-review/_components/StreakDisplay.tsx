"use client";

import { Group, Text, Tooltip, Badge } from "@mantine/core";
import { IconFlame, IconTrophy } from "@tabler/icons-react";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  totalReviews: number;
  thisWeekComplete?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StreakDisplay({
  currentStreak,
  longestStreak,
  totalReviews,
  thisWeekComplete = false,
  size = "md",
}: StreakDisplayProps) {
  const iconSize = size === "sm" ? 16 : size === "lg" ? 28 : 20;
  const textSize = size === "sm" ? "xs" : size === "lg" ? "lg" : "sm";

  // Milestone badges
  const milestones = [4, 12, 26, 52];
  const nextMilestone = milestones.find((m) => m > currentStreak) ?? null;
  const achievedMilestone = [...milestones]
    .reverse()
    .find((m) => currentStreak >= m);

  // Don't show anything if no reviews yet
  if (totalReviews === 0) {
    return null;
  }

  return (
    <Group gap="md">
      <Tooltip
        label={`${currentStreak} week${currentStreak !== 1 ? "s" : ""} in a row`}
      >
        <Group gap={4}>
          <IconFlame
            size={iconSize}
            className={currentStreak > 0 ? "text-orange-500" : "text-text-muted"}
          />
          <Text size={textSize} fw={600} className="text-text-primary">
            {currentStreak}
          </Text>
        </Group>
      </Tooltip>

      {longestStreak > currentStreak && (
        <Tooltip label={`Personal best: ${longestStreak} weeks`}>
          <Group gap={4}>
            <IconTrophy size={iconSize} className="text-yellow-500" />
            <Text size={textSize} className="text-text-muted">
              {longestStreak}
            </Text>
          </Group>
        </Tooltip>
      )}

      {achievedMilestone && (
        <Badge size="xs" variant="light" color="orange">
          {achievedMilestone}w
        </Badge>
      )}

      {nextMilestone && currentStreak > 0 && !thisWeekComplete && (
        <Badge size="xs" variant="light" color="gray">
          {nextMilestone - currentStreak} to {nextMilestone}w
        </Badge>
      )}
    </Group>
  );
}
