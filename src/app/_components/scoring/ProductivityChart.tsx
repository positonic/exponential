"use client";

import { useState } from "react";
import { Card, Text, Group, Stack, Loader, Collapse, ActionIcon } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format, startOfDay } from "date-fns";
import { ScoreBreakdown } from "./ScoreBreakdown";

interface ProductivityChartProps {
  workspaceId?: string;
}

export function ProductivityChart({ workspaceId }: ProductivityChartProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // Fetch last 30 days of scores
  const { data: scores, isLoading } = api.scoring.getLast30Days.useQuery({
    workspaceId,
  });

  // Fetch productivity stats
  const { data: stats } = api.scoring.getProductivityStats.useQuery({
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

  if (!scores || scores.length === 0) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Text className="text-text-muted text-center">
          No data available yet. Start tracking your productivity!
        </Text>
      </Card>
    );
  }

  // Calculate max score for scaling
  const maxScore = Math.max(...scores.map((s) => s.totalScore), 100);

  // Get color based on score
  const getBarColor = (score: number) => {
    if (score >= 80) return "var(--mantine-color-green-6)";
    if (score >= 60) return "var(--mantine-color-blue-6)";
    if (score >= 40) return "var(--mantine-color-yellow-6)";
    return "var(--mantine-color-orange-6)";
  };

  const handleBarClick = (index: number) => {
    setSelectedDayIndex((prev) => (prev === index ? null : index));
  };

  const selectedScore =
    selectedDayIndex !== null ? scores[selectedDayIndex] : null;

  return (
    <Card className="bg-surface-primary border-border-primary">
      <Stack gap="md">
        {/* Header */}
        <div>
          <Text className="text-text-primary font-semibold mb-1">30-Day Productivity Trend</Text>
          {stats && (
            <Group gap="md" className="text-xs text-text-secondary">
              <span>30-day avg: <strong>{stats.month}</strong></span>
              <span>7-day avg: <strong>{stats.week}</strong></span>
              <span>Consistency: <strong>{stats.consistency}%</strong></span>
            </Group>
          )}
        </div>

        {/* Simple bar chart */}
        <div className="relative h-32 flex items-end gap-[2px] px-1">
          {scores.map((score, index) => {
            const height = (score.totalScore / maxScore) * 100;
            const isToday = index === scores.length - 1;
            const isWeekend = new Date(score.date).getDay() === 0 || new Date(score.date).getDay() === 6;
            const isSelected = selectedDayIndex === index;

            return (
              <div
                key={score.id}
                className="flex-1 relative group cursor-pointer"
                style={{ height: "100%" }}
                onClick={() => handleBarClick(index)}
              >
                {/* Bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-sm transition-all hover:opacity-80"
                  style={{
                    height: `${height}%`,
                    backgroundColor: getBarColor(score.totalScore),
                    opacity: isSelected ? 1 : isToday ? 0.85 : 0.7,
                    minHeight: score.totalScore > 0 ? "4px" : "0px",
                    boxShadow: isSelected
                      ? `0 0 0 2px ${getBarColor(score.totalScore)}`
                      : undefined,
                  }}
                />

                {/* Weekend indicator */}
                {isWeekend && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-secondary opacity-30" />
                )}

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-background-primary border border-border-primary rounded-md px-2 py-1 shadow-lg whitespace-nowrap">
                    <Text className="text-text-primary text-xs font-medium">
                      {format(startOfDay(new Date(score.date)), "MMM d")}
                    </Text>
                    <Text className="text-text-secondary text-xs">
                      Score: {score.totalScore}
                    </Text>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hint text when nothing selected */}
        {selectedDayIndex === null && (
          <Text className="text-text-muted text-xs text-center">
            Click a bar to see point breakdown
          </Text>
        )}

        {/* Selected day breakdown */}
        <Collapse in={selectedScore !== null}>
          {selectedScore && (
            <div className="border-t border-border-primary pt-4">
              <Group className="justify-between mb-2">
                <Text className="text-text-secondary text-sm font-medium">
                  {format(startOfDay(new Date(selectedScore.date)), "EEEE, MMMM d")}
                  {" \u2014 "}
                  <span className="font-bold" style={{ color: getBarColor(selectedScore.totalScore) }}>
                    {selectedScore.totalScore}
                  </span>
                  /100
                </Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setSelectedDayIndex(null)}
                  aria-label="Close breakdown"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <ScoreBreakdown score={selectedScore} />
            </div>
          )}
        </Collapse>

        {/* Legend */}
        <Group gap="sm" className="justify-center text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--mantine-color-green-6)" }} />
            <span className="text-text-muted">80+</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--mantine-color-blue-6)" }} />
            <span className="text-text-muted">60-79</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--mantine-color-yellow-6)" }} />
            <span className="text-text-muted">40-59</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--mantine-color-orange-6)" }} />
            <span className="text-text-muted">&lt;40</span>
          </div>
        </Group>
      </Stack>
    </Card>
  );
}
