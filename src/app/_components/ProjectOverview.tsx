"use client";

import { useState } from "react";
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Paper,
  ActionIcon,
  Indicator,
  Tooltip,
} from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { isSameDay } from "date-fns";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { CreateActionModal } from "./CreateActionModal";
import { OutcomeTimeline } from "./OutcomeTimeline";
import { ActionList } from "./ActionList";
import { ProjectCalendarCard } from "./ProjectCalendarCard";

// Types
type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
}

// Helper function to get outcome type color
function getOutcomeTypeColor(type: string | null): string {
  switch (type?.toUpperCase()) {
    case "DAILY":
      return "blue";
    case "WEEKLY":
      return "teal";
    case "MONTHLY":
      return "violet";
    case "QUARTERLY":
      return "orange";
    default:
      return "gray";
  }
}

export function ProjectOverview({ project, goals, outcomes }: ProjectOverviewProps) {
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date>(new Date());
  const utils = api.useUtils();
  const { data: actions = [] } = api.action.getProjectActions.useQuery({ projectId: project.id });

  const deleteGoalMutation = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getProjectGoals.invalidate({ projectId: project.id });
    },
  });

  const handleDeleteGoal = (goalId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this goal?")) {
      deleteGoalMutation.mutate({ id: goalId });
    }
  };

  // Helper to get items for a specific date
  const getItemsForDate = (date: Date) => {
    const dateStr = date.toDateString();
    const items: { type: "goal" | "outcome" | "project"; title: string; color: string }[] = [];

    // Check project start/end dates
    if (project.reviewDate && new Date(project.reviewDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Project End", color: "red" });
    }
    if (project.nextActionDate && new Date(project.nextActionDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Project Start", color: "orange" });
    }

    // Check goals
    goals.forEach((goal) => {
      if (goal.dueDate && new Date(goal.dueDate).toDateString() === dateStr) {
        items.push({ type: "goal", title: goal.title, color: "yellow" });
      }
    });

    // Check outcomes
    outcomes.forEach((outcome) => {
      if (outcome.dueDate && new Date(outcome.dueDate).toDateString() === dateStr) {
        items.push({ type: "outcome", title: outcome.description, color: "teal" });
      }
    });

    return items;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-8">
      {/* Left Column - Calendar */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          p="sm"
          className="border-border-primary bg-surface-secondary"
        >
          <div className="flex justify-center">
            <Calendar
              date={calendarSelectedDate}
              getDayProps={(date) => {
                const items = getItemsForDate(date);
                return {
                  selected: isSameDay(date, calendarSelectedDate),
                  onClick: () => setCalendarSelectedDate(date),
                  ...(items.length > 0 ? { style: { position: "relative" as const } } : {}),
                };
              }}
              renderDay={(date) => {
                const day = date.getDate();
                const items = getItemsForDate(date);

                if (items.length === 0) {
                  return <div>{day}</div>;
                }

                return (
                  <Tooltip
                    label={
                      <Stack gap={4}>
                        {items.map((item, idx) => (
                          <Group key={idx} gap="xs">
                            <Badge size="xs" color={item.color} variant="filled">
                              {item.type}
                            </Badge>
                            <Text size="xs" lineClamp={1}>
                              {item.title}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    }
                    withArrow
                    multiline
                    w={220}
                  >
                    <Indicator
                      size={6}
                      color={items[0]?.color ?? "blue"}
                      offset={-2}
                    >
                      <div>{day}</div>
                    </Indicator>
                  </Tooltip>
                );
              }}
            />
          </div>
        </Card>

        {/* Google Calendar Events */}
        <ProjectCalendarCard projectId={project.id} projectName={project.name} selectedDate={calendarSelectedDate} />
      </div>

      {/* Middle Column - Goals, Outcomes, Timeline */}
      <div className="space-y-6 lg:col-span-3">
        {/* Goals Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Text fw={600} size="lg" className="text-text-primary">
              Goals
            </Text>
            <CreateGoalModal projectId={project.id}>
              <ActionIcon variant="subtle" size="md" aria-label="Add goal">
                <IconPlus size={16} />
              </ActionIcon>
            </CreateGoalModal>
          </Group>

          <Stack gap="sm">
            {goals.length > 0 ? (
              goals.slice(0, 5).map((goal) => (
                <Paper
                  key={goal.id}
                  p="sm"
                  radius="sm"
                  className="border-border-primary bg-background-secondary group border transition-colors"
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <CreateGoalModal
                      goal={{
                        id: goal.id,
                        title: goal.title,
                        description: goal.description,
                        whyThisGoal: goal.whyThisGoal,
                        notes: goal.notes,
                        dueDate: goal.dueDate,
                        lifeDomainId: goal.lifeDomainId,
                        outcomes: goal.outcomes,
                      }}
                      trigger={
                        <div className="hover:bg-surface-hover flex-1 cursor-pointer rounded p-1 transition-colors">
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
                                {goal.title}
                              </Text>
                              {goal.lifeDomain && (
                                <Badge variant="light" color="yellow" size="xs">
                                  {goal.lifeDomain.title}
                                </Badge>
                              )}
                              {goal.dueDate && (
                                <Text size="xs" className="text-text-disabled">
                                  Due: {new Date(goal.dueDate).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </Text>
                              )}
                            </Group>
                            {goal.description && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {goal.description}
                              </Text>
                            )}
                          </Stack>
                        </div>
                      }
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => handleDeleteGoal(goal.id, e)}
                      loading={deleteGoalMutation.isPending}
                      aria-label="Delete goal"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed" fs="italic" ta="center" py="md">
                No goals linked to this project yet
              </Text>
            )}
            {goals.length > 5 && (
              <Text size="xs" c="dimmed" ta="center">
                +{goals.length - 5} more goals
              </Text>
            )}
          </Stack>
        </Card>

        {/* Outcomes Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Text fw={600} size="lg" className="text-text-primary">
              Outcomes
            </Text>
            <CreateOutcomeModal projectId={project.id}>
              <ActionIcon variant="subtle" size="md" aria-label="Add outcome">
                <IconPlus size={16} />
              </ActionIcon>
            </CreateOutcomeModal>
          </Group>

          <Stack gap="sm">
            {outcomes.length > 0 ? (
              outcomes.slice(0, 5).map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: (outcome.type ?? "daily") as "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "life" | "problem",
                    whyThisOutcome: outcome.whyThisOutcome,
                    projectId: project.id,
                    goalId: outcome.goals?.[0]?.id,
                  }}
                  trigger={
                    <Paper
                      p="sm"
                      radius="sm"
                      className="border-border-primary bg-background-secondary hover:bg-surface-hover cursor-pointer border transition-colors"
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start">
                          <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
                            {outcome.description}
                          </Text>
                          {outcome.type && (
                            <Badge
                              variant="light"
                              color={getOutcomeTypeColor(outcome.type)}
                              size="xs"
                            >
                              {outcome.type}
                            </Badge>
                          )}
                        </Group>
                        {outcome.dueDate && (
                          <Text size="xs" className="text-text-disabled">
                            Due: {new Date(outcome.dueDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  }
                />
              ))
            ) : (
              <Text size="sm" c="dimmed" fs="italic" ta="center" py="md">
                No outcomes linked to this project yet
              </Text>
            )}
            {outcomes.length > 5 && (
              <Text size="xs" c="dimmed" ta="center">
                +{outcomes.length - 5} more outcomes
              </Text>
            )}
          </Stack>
        </Card>

        {/* Timeline Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Text fw={600} size="lg" className="text-text-primary" mb="md">
            Timeline
          </Text>
          <OutcomeTimeline projectId={project.id} />
        </Card>
      </div>

      {/* Right Column - Actions */}
      <div className="lg:col-span-3">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          {/* Card Header */}
          <Group justify="space-between" mb="lg">
            <Text fw={600} size="lg" className="text-text-primary">
              Project Actions
            </Text>
            <CreateActionModal projectId={project.id} viewName={`project-${project.id}`}>
              <ActionIcon variant="subtle" size="md" aria-label="Add action">
                <IconPlus size={16} />
              </ActionIcon>
            </CreateActionModal>
          </Group>

          {/* Action List */}
          <ActionList
            viewName={`project-${project.id}`}
            actions={actions}
            showCheckboxes={false}
            enableBulkEditForOverdue={true}
          />
        </Card>
      </div>
    </div>
  );
}
