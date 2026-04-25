"use client";

import { Badge, Tooltip } from "@mantine/core";
import { IconFlame } from "@tabler/icons-react";

interface StreakBadgeProps {
  streakCount: number;
  streakType: "daily_planning" | "habits" | "weekly_review";
  size?: "sm" | "md" | "lg";
}

export function StreakBadge({ streakCount, streakType, size = "md" }: StreakBadgeProps) {
  // Determine badge level and emoji
  const getBadgeInfo = (count: number) => {
    if (count >= 90) return { level: "legend", emoji: "👑", label: "Productivity Legend" };
    if (count >= 30) return { level: "master", emoji: "🏆", label: "Monthly Master" };
    if (count >= 14) return { level: "champion", emoji: "💪", label: "Fortnight Champion" };
    if (count >= 7) return { level: "warrior", emoji: "⚡", label: "Weekly Warrior" };
    if (count >= 3) return { level: "fire", emoji: "🔥", label: "On Fire" };
    return { level: "starting", emoji: "🌱", label: "Getting Started" };
  };

  // Determine badge color based on level
  const getBadgeColor = (level: string) => {
    switch (level) {
      case "legend":
        return "grape";
      case "master":
        return "yellow";
      case "champion":
        return "orange";
      case "warrior":
        return "blue";
      case "fire":
        return "red";
      default:
        return "gray";
    }
  };

  const badgeInfo = getBadgeInfo(streakCount);
  const badgeColor = getBadgeColor(badgeInfo.level);

  // Get streak type label
  const getStreakTypeLabel = (type: string) => {
    switch (type) {
      case "daily_planning":
        return "Daily Planning";
      case "habits":
        return "Habits";
      case "weekly_review":
        return "Weekly Review";
      default:
        return "Streak";
    }
  };

  const streakTypeLabel = getStreakTypeLabel(streakType);

  return (
    <Tooltip
      label={`${streakTypeLabel} Streak: ${streakCount} days - ${badgeInfo.label}`}
      position="top"
    >
      <Badge
        variant="light"
        color={badgeColor}
        size={size}
        leftSection={<IconFlame size={14} />}
        className="cursor-help"
      >
        {badgeInfo.emoji} {streakCount} day{streakCount !== 1 ? "s" : ""}
      </Badge>
    </Tooltip>
  );
}
