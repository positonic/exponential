"use client";

import { Stack, Text, Group, Progress } from "@mantine/core";

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

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const { breakdown, metadata } = score;

  // Category definitions with max points
  const categories = [
    {
      name: "Planning",
      items: [
        {
          label: "Plan Created",
          points: breakdown.planCreated,
          maxPoints: 20,
          color: "blue",
        },
        {
          label: "Plan Completed",
          points: breakdown.planCompleted,
          maxPoints: 20,
          color: "green",
        },
      ],
      total: breakdown.planCreated + breakdown.planCompleted,
      maxTotal: 40,
    },
    {
      name: "Task Execution",
      items: [
        {
          label: `Completed ${metadata.completedTasks}/${metadata.totalPlannedTasks} tasks`,
          points: breakdown.taskCompletion,
          maxPoints: 25,
          color: "teal",
        },
      ],
      total: breakdown.taskCompletion,
      maxTotal: 25,
    },
    {
      name: "Habit Completion",
      items: [
        {
          label: `Completed ${metadata.completedHabits}/${metadata.scheduledHabits} habits`,
          points: breakdown.habitCompletion,
          maxPoints: 20,
          color: "violet",
        },
      ],
      total: breakdown.habitCompletion,
      maxTotal: 20,
    },
    {
      name: "Bonus Points",
      items: [
        ...(breakdown.schedulingBonus > 0
          ? [
              {
                label: "Used AI Scheduling",
                points: breakdown.schedulingBonus,
                maxPoints: 5,
                color: "indigo",
              },
            ]
          : []),
        ...(breakdown.inboxBonus > 0
          ? [
              {
                label: "Processed Overdue Tasks",
                points: breakdown.inboxBonus,
                maxPoints: 5,
                color: "cyan",
              },
            ]
          : []),
        ...(breakdown.estimationBonus > 0
          ? [
              {
                label: `Accurate Estimates (${metadata.estimationAccuracy?.toFixed(0)}%)`,
                points: breakdown.estimationBonus,
                maxPoints: 5,
                color: "lime",
              },
            ]
          : []),
        ...(breakdown.weeklyReviewBonus > 0
          ? [
              {
                label: "Weekly Review Bonus",
                points: breakdown.weeklyReviewBonus,
                maxPoints: 10,
                color: "yellow",
              },
            ]
          : []),
      ],
      total:
        breakdown.schedulingBonus +
        breakdown.inboxBonus +
        breakdown.estimationBonus +
        breakdown.weeklyReviewBonus,
      maxTotal: 15,
    },
  ];

  return (
    <Stack gap="lg" className="pt-4 border-t border-border-primary">
      <Text className="text-text-primary font-semibold text-sm">Point Breakdown</Text>

      {categories.map((category) => (
        <div key={category.name}>
          <Group className="justify-between mb-2">
            <Text className="text-text-secondary text-sm">{category.name}</Text>
            <Text className="text-text-primary text-sm font-medium">
              {category.total}/{category.maxTotal}
            </Text>
          </Group>

          <Stack gap="xs">
            {category.items.map((item, index) => (
              <div key={index}>
                <Group className="justify-between mb-1">
                  <Text className="text-text-muted text-xs">{item.label}</Text>
                  <Text className="text-text-secondary text-xs">
                    {item.points}/{item.maxPoints}
                  </Text>
                </Group>
                <Progress
                  value={(item.points / item.maxPoints) * 100}
                  size="sm"
                  radius="sm"
                  color={item.color}
                />
              </div>
            ))}
          </Stack>
        </div>
      ))}

      {/* Tips section */}
      {score.totalScore < 60 && (
        <div className="bg-surface-secondary rounded-md p-3 border border-border-primary">
          <Text className="text-text-secondary text-xs font-medium mb-1">💡 Tips to improve:</Text>
          <ul className="text-text-muted text-xs list-disc list-inside space-y-1">
            {breakdown.planCreated === 0 && <li>Create your daily plan to earn 20 points</li>}
            {breakdown.planCompleted === 0 && breakdown.planCreated > 0 && (
              <li>Complete your plan to earn another 20 points</li>
            )}
            {metadata.totalPlannedTasks > 0 &&
              metadata.completedTasks / metadata.totalPlannedTasks < 0.5 && (
                <li>Complete more of your planned tasks</li>
              )}
            {metadata.scheduledHabits > 0 && metadata.completedHabits === 0 && (
              <li>Complete your scheduled habits</li>
            )}
          </ul>
        </div>
      )}
    </Stack>
  );
}
