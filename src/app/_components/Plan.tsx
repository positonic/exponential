'use client';

import { Stack, Title, Text, Checkbox, Group, Button, Paper } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { api } from "~/trpc/react";
import { createStyles } from '@mantine/styles';

const useStyles = createStyles((theme) => ({
  printContainer: {
    '@media print': {
      padding: '20px',
      '& button': {
        display: 'none',
      }
    }
  },
  actionButtons: {
    '@media print': {
      display: 'none'
    }
  },
  weekTitle: {
    fontSize: '1.25rem',
    fontWeight: 500,
    marginBottom: '0.5rem'
  },
  weekDescription: {
    color: theme.colors.gray[6],
    marginBottom: '1rem'
  },
  taskList: {
    marginLeft: '1rem',
    marginTop: '0.5rem'
  },
  weekContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.gray[2]}`,
    marginBottom: theme.spacing.md
  }
}));

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

interface Project {
  id: string;
  name: string;
  description: string | null;
  goals: Goal[];
  outcomes: Array<{
    type: string | null;
    description: string;
    id: string;
    dueDate: Date | null;
    userId: string;
  }>;
  actions: Action[];
}

export function Plan({ projectId }: PlanProps) {
  const { data: project } = api.project.getById.useQuery({ id: projectId });
  const { classes } = useStyles();

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
    <Stack gap="xl" className={classes.printContainer}>
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
            <Paper key={week} className={classes.weekContainer}>
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
                      <Text fw={500}>{action.name}</Text>
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

      <Group justify="flex-end" mt="xl" className={classes.actionButtons}>
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