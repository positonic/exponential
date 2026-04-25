"use client";

import { Stack, Text, Group, Progress, RingProgress, Paper, SimpleGrid, ThemeIcon, Alert } from "@mantine/core";
import {
  IconClipboardCheck,
  IconChecklist,
  IconRepeat,
  IconStar,
  IconBulb,
} from "@tabler/icons-react";

interface ScoreBreakdownProps {
  score: {
    totalScore: number;
    breakdown: {
      planCreated: number;
      planCompleted: number;
      taskCompletion: number;
      habitCompletion: number;
      schedulingBonus: number;
      inboxBonus: number;
      estimationBonus: number;
      weeklyReviewBonus: number;
    };
    metadata: {
      totalPlannedTasks: number;
      completedTasks: number;
      scheduledHabits: number;
      completedHabits: number;
      estimationAccuracy: number | null;
    };
  };
}

// Score tier color
function getScoreColor(totalScore: number) {
  if (totalScore >= 80) return "green";
  if (totalScore >= 60) return "blue";
  if (totalScore >= 40) return "yellow";
  return "orange";
}

// Score tier label
function getScoreLabel(totalScore: number) {
  if (totalScore >= 90) return "Exceptional!";
  if (totalScore >= 80) return "Great day!";
  if (totalScore >= 70) return "Good work!";
  if (totalScore >= 60) return "Making progress";
  if (totalScore >= 40) return "Keep going";
  return "Just getting started";
}

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const { breakdown, metadata } = score;
  const color = getScoreColor(score.totalScore);

  const categories = [
    {
      name: "Planning",
      icon: IconClipboardCheck,
      color: "blue" as const,
      items: [
        { label: "Plan Created", points: breakdown.planCreated, maxPoints: 20 },
        { label: "Plan Completed", points: breakdown.planCompleted, maxPoints: 20 },
      ],
      total: breakdown.planCreated + breakdown.planCompleted,
      maxTotal: 40,
    },
    {
      name: "Tasks",
      icon: IconChecklist,
      color: "teal" as const,
      items: [
        {
          label: `${metadata.completedTasks}/${metadata.totalPlannedTasks} completed`,
          points: breakdown.taskCompletion,
          maxPoints: 25,
        },
      ],
      total: breakdown.taskCompletion,
      maxTotal: 25,
    },
    {
      name: "Habits",
      icon: IconRepeat,
      color: "violet" as const,
      items: [
        {
          label: `${metadata.completedHabits}/${metadata.scheduledHabits} completed`,
          points: breakdown.habitCompletion,
          maxPoints: 20,
        },
      ],
      total: breakdown.habitCompletion,
      maxTotal: 20,
    },
    {
      name: "Bonus",
      icon: IconStar,
      color: "yellow" as const,
      items: [
        ...(breakdown.schedulingBonus > 0
          ? [{ label: "AI Scheduling", points: breakdown.schedulingBonus, maxPoints: 5 }]
          : []),
        ...(breakdown.inboxBonus !== 0
          ? [{
              label: breakdown.inboxBonus > 0 ? "Overdue Cleared" : "Overdue Penalty",
              points: breakdown.inboxBonus,
              maxPoints: breakdown.inboxBonus > 0 ? 5 : 15,
            }]
          : []),
        ...(breakdown.estimationBonus > 0
          ? [{ label: `Estimates (${metadata.estimationAccuracy?.toFixed(0)}%)`, points: breakdown.estimationBonus, maxPoints: 5 }]
          : []),
        ...(breakdown.weeklyReviewBonus > 0
          ? [{ label: "Weekly Review", points: breakdown.weeklyReviewBonus, maxPoints: 10 }]
          : []),
      ],
      total: Math.max(
        0,
        breakdown.schedulingBonus +
        breakdown.inboxBonus +
        breakdown.estimationBonus +
        breakdown.weeklyReviewBonus
      ),
      maxTotal: 15,
    },
  ];

  // Build tips list
  const tips: string[] = [];
  if (breakdown.planCreated === 0) tips.push("Create your daily plan to earn 20 points");
  if (breakdown.planCompleted === 0 && breakdown.planCreated > 0) tips.push("Complete your plan to earn another 20 points");
  if (metadata.totalPlannedTasks > 0 && metadata.completedTasks / metadata.totalPlannedTasks < 0.5) tips.push("Complete more of your planned tasks");
  if (metadata.scheduledHabits > 0 && metadata.completedHabits === 0) tips.push("Complete your scheduled habits");
  if (breakdown.inboxBonus < 0) tips.push("Reschedule or complete overdue tasks to remove the penalty");

  return (
    <Stack gap="lg">
      {/* Hero: Ring Progress */}
      <div className="flex flex-col items-center gap-1 py-2">
        <RingProgress
          size={120}
          thickness={10}
          roundCaps
          sections={[{ value: score.totalScore, color }]}
          label={
            <Text ta="center" size="xl" fw={700} className="text-text-primary">
              {score.totalScore}
            </Text>
          }
        />
        <Text size="sm" className="text-text-secondary">
          {getScoreLabel(score.totalScore)}
        </Text>
      </div>

      {/* Category Grid */}
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        {categories.map((cat) => (
          <Paper
            key={cat.name}
            p="sm"
            radius="md"
            className="bg-surface-secondary border border-border-primary"
          >
            <Group gap="xs" className="mb-2" justify="space-between">
              <Group gap="xs">
                <ThemeIcon size="sm" variant="light" color={cat.color} radius="sm">
                  <cat.icon size={14} />
                </ThemeIcon>
                <Text size="xs" fw={600} className="text-text-primary">
                  {cat.name}
                </Text>
              </Group>
              <Text size="xs" fw={600} className="text-text-secondary">
                {cat.total}/{cat.maxTotal}
              </Text>
            </Group>

            <Stack gap={6}>
              {cat.items.length > 0 ? (
                cat.items.map((item, i) => (
                  <div key={i}>
                    <Group justify="space-between" className="mb-0.5">
                      <Text size="xs" className="text-text-muted">
                        {item.label}
                      </Text>
                      <Text size="xs" className={item.points < 0 ? "text-red-500" : "text-text-muted"}>
                        {item.points < 0 ? `${item.points}` : `${item.points}/${item.maxPoints}`}
                      </Text>
                    </Group>
                    <Progress
                      value={item.points < 0 ? (Math.abs(item.points) / item.maxPoints) * 100 : (item.points / item.maxPoints) * 100}
                      size={6}
                      radius="xl"
                      color={item.points < 0 ? "red" : cat.color}
                    />
                  </div>
                ))
              ) : (
                <Text size="xs" className="text-text-muted">
                  No bonuses earned yet
                </Text>
              )}
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Tips */}
      {score.totalScore < 60 && tips.length > 0 && (
        <Alert
          icon={<IconBulb size={18} />}
          color="yellow"
          variant="light"
          title="Tips to improve"
          radius="md"
        >
          <ul className="text-xs list-disc list-inside space-y-0.5">
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Stack>
  );
}
