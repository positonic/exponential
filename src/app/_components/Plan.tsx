'use client';

import { Stack, Title, Text, Group, Button, Paper } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { api } from "~/trpc/react";
import { HTMLContent } from "./HTMLContent";
// Styles moved to inline styles since @mantine/styles is deprecated in v7

interface PlanProps {
  projectId: string;
}

interface Goal {
  id: number;
  title: string;
  description: string | null;
  dueDate: Date | null;
  lifeDomainId: number;
  userId: string;
}

interface Action {
  id: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  priority: string;
  status: string;
  projectId: string | null;
  createdById: string;
}

// interface Project {
//   id: string;
//   name: string;
//   description: string | null;
//   goals: Goal[];
//   outcomes: Array<{
//     type: string | null;
//     description: string;
//     id: string;
//     dueDate: Date | null;
//     userId: string;
//   }>;
//   actions: Action[];
// }

export function Plan({ projectId }: PlanProps) {
  const { data: project } = api.project.getById.useQuery({ id: projectId });

  if (!project) {
    return <div>Project not found</div>;
  }

  // Group actions by week
  const actionsByWeek = project.actions.reduce<Record<number, Action[]>>((acc, action) => {
    const weekMatch = /Week (\d+):/.exec(action.name);
    const week = weekMatch?.[1] ? parseInt(weekMatch[1]) : 0;
    if (!acc[week]) {
      acc[week] = [];
    }
    acc[week].push(action);
    return acc;
  }, {});

  // Get goals by week
  const goalsByWeek = project.goals.reduce<Record<number, Goal[]>>((acc, goal) => {
    const weekMatch = /Week (\d+):/.exec(goal.title);
    const week = weekMatch?.[1] ? parseInt(weekMatch[1]) : 0;
    if (!acc[week]) {
      acc[week] = [];
    }
    acc[week].push(goal);
    return acc;
  }, {});

  // Get weeks in order
  const weeks = [...new Set([
    ...Object.keys(actionsByWeek),
    ...Object.keys(goalsByWeek)
  ])].map(Number).sort((a, b) => a - b);

  return (
    <Stack gap="xl" className="w-full max-w-3xl mx-auto">
      <Title order={3}>📋 PART 3: Execution Plan (Lean Launch)</Title>

      <Text>
        This is your 3-week tactical roadmap to get {project.name} from &quot;ready&quot; to in the hands of early users with momentum, feedback, and visibility.
      </Text>

      <Stack gap="xl">
        <Title order={4}>📅 Week-by-Week Plan</Title>

        {weeks.map((week) => {
          const weekGoals = goalsByWeek[week] ?? [];
          const weekActions = actionsByWeek[week] ?? [];

          return (
            <Paper key={week} p="md" radius="md" withBorder className="mb-4">
              <Title order={2}>Week {week}</Title>
              
              {weekGoals.length > 0 && (
                <Stack>
                  <Title order={3}>Goals</Title>
                  {weekGoals.map((goal) => (
                    <div key={goal.id}>
                      <Text fw={500}>{goal.title}</Text>
                      {goal.description && <Text c="dimmed">{goal.description}</Text>}
                    </div>
                  ))}
                </Stack>
              )}

              {weekActions.length > 0 && (
                <Stack>
                  <Title order={3}>Tasks</Title>
                  {weekActions.map((action) => (
                    <div key={action.id}>
                      <Text fw={500}><HTMLContent html={action.name} /></Text>
                      {action.description && <Text c="dimmed">{action.description}</Text>}
                    </div>
                  ))}
                </Stack>
              )}

              {weekGoals.length === 0 && weekActions.length === 0 && (
                <Text c="dimmed">No tasks or goals planned for this week</Text>
              )}
            </Paper>
          );
        })}
      </Stack>

      <Group justify="flex-end" mt="xl" style={{ '@media print': { display: 'none' } }}>
        <Button
          variant="outline"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            window.print();
          }}
          leftSection={<IconDownload size={16} />}
        >
          Download PDF
        </Button>
      </Group>
    </Stack>
  );
} 