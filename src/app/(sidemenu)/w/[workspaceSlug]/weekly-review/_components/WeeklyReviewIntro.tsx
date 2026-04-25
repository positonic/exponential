"use client";

import { useState } from "react";
import { Card, Text, Stack, Button, Group, SegmentedControl, Badge } from "@mantine/core";
import { IconCalendarWeek, IconArrowRight, IconClock, IconRocket, IconListCheck } from "@tabler/icons-react";
import { StreakDisplay } from "./StreakDisplay";

export type ReviewMode = "full" | "quick";
export type TimerDuration = 10 | 15 | 25 | null;

interface WeeklyReviewIntroProps {
  projectCount: number;
  projectsNeedingAttention?: number;
  onStart: (mode: ReviewMode, timerMinutes: TimerDuration) => void;
  streakData?: {
    currentStreak: number;
    longestStreak: number;
    totalReviews: number;
    thisWeekComplete: boolean;
  };
  inboxCount?: number;
}

export function WeeklyReviewIntro({
  projectCount,
  projectsNeedingAttention = 0,
  onStart,
  streakData,
  inboxCount = 0,
}: WeeklyReviewIntroProps) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>("quick");
  const [timerDuration, setTimerDuration] = useState<TimerDuration>(15);

  const hasActiveStreak = streakData && streakData.currentStreak > 0;
  const canExtendStreak =
    hasActiveStreak && !streakData?.thisWeekComplete;

  const handleStart = () => {
    onStart(reviewMode, timerDuration);
  };

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="xl"
    >
      <Stack gap="lg" align="center" className="py-8">
        <div className="rounded-full bg-brand-primary/10 p-4">
          <IconCalendarWeek size={48} className="text-brand-primary" />
        </div>

        <Stack gap="md" align="center">
          <Text size="xl" fw={600} className="text-text-primary">
            Weekly Review
          </Text>

          {streakData && streakData.totalReviews > 0 && (
            <StreakDisplay
              currentStreak={streakData.currentStreak}
              longestStreak={streakData.longestStreak}
              totalReviews={streakData.totalReviews}
              thisWeekComplete={streakData.thisWeekComplete}
              size="md"
            />
          )}

          {canExtendStreak && (
            <Text size="sm" fw={500} className="text-orange-500">
              Keep your {streakData.currentStreak}-week streak alive!
            </Text>
          )}

          <Text
            size="sm"
            className="max-w-md text-center text-text-secondary"
          >
            Step back from daily firefighting. Review each project, set your
            next actions, and regain clarity on all your commitments.
          </Text>
        </Stack>

        {projectCount === 0 ? (
          <Text size="sm" className="text-text-muted">
            No active projects to review. Create a project to get started.
          </Text>
        ) : (
          <Stack gap="xl" align="center" className="w-full max-w-md">
            {/* Project stats */}
            <Group gap="lg" justify="center">
              <Stack gap={2} align="center">
                <Text size="xl" fw={600} className="text-text-primary">
                  {projectCount}
                </Text>
                <Text size="xs" className="text-text-muted">
                  project{projectCount !== 1 ? "s" : ""}
                </Text>
              </Stack>

              {projectsNeedingAttention > 0 && (
                <Stack gap={2} align="center">
                  <Text size="xl" fw={600} className="text-yellow-600">
                    {projectsNeedingAttention}
                  </Text>
                  <Text size="xs" className="text-text-muted">
                    need attention
                  </Text>
                </Stack>
              )}

              {inboxCount > 0 && (
                <Stack gap={2} align="center">
                  <Text size="xl" fw={600} className="text-text-secondary">
                    {inboxCount}
                  </Text>
                  <Text size="xs" className="text-text-muted">
                    in inbox
                  </Text>
                </Stack>
              )}
            </Group>

            {/* Review Mode Selection */}
            <Stack gap="xs" align="center" className="w-full">
              <Text size="sm" fw={500} className="text-text-secondary">
                Review Mode
              </Text>
              <SegmentedControl
                value={reviewMode}
                onChange={(value) => setReviewMode(value as ReviewMode)}
                data={[
                  {
                    value: "quick",
                    label: (
                      <Group gap="xs" wrap="nowrap">
                        <IconRocket size={16} />
                        <span>Quick Sweep</span>
                      </Group>
                    ),
                  },
                  {
                    value: "full",
                    label: (
                      <Group gap="xs" wrap="nowrap">
                        <IconListCheck size={16} />
                        <span>Full Review</span>
                      </Group>
                    ),
                  },
                ]}
                className="w-full"
              />
              <Text size="xs" className="text-center text-text-muted">
                {reviewMode === "quick"
                  ? "Focus on projects that need attention. Fast and focused."
                  : "Review every active project. Thorough and complete."}
              </Text>
            </Stack>

            {/* Timer Selection */}
            <Stack gap="xs" align="center" className="w-full">
              <Group gap="xs" align="center">
                <IconClock size={16} className="text-text-muted" />
                <Text size="sm" fw={500} className="text-text-secondary">
                  Time Box
                </Text>
              </Group>
              <SegmentedControl
                value={timerDuration?.toString() ?? "none"}
                onChange={(value) => setTimerDuration(value === "none" ? null : parseInt(value) as TimerDuration)}
                data={[
                  { value: "10", label: "10 min" },
                  { value: "15", label: "15 min" },
                  { value: "25", label: "25 min" },
                  { value: "none", label: "No limit" },
                ]}
                className="w-full"
              />
              <Text size="xs" className="text-center text-text-muted">
                {timerDuration
                  ? `You'll get a gentle reminder when ${timerDuration} minutes pass.`
                  : "Take as long as you need."}
              </Text>
            </Stack>

            {/* Start Button */}
            <Button
              size="lg"
              rightSection={<IconArrowRight size={18} />}
              onClick={handleStart}
              className="mt-2"
            >
              {reviewMode === "quick" ? "Start Quick Sweep" : "Start Full Review"}
            </Button>

            {reviewMode === "quick" && projectsNeedingAttention === 0 && (
              <Badge color="green" variant="light" size="sm">
                All projects looking healthy!
              </Badge>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
