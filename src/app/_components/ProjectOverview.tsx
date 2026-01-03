"use client";

import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Avatar,
  Button,
  Paper,
  ActionIcon,
  Divider,
  Indicator,
  Tooltip,
} from "@mantine/core";
import { Calendar } from "@mantine/dates";
import {
  IconCalendar,
  IconEdit,
  IconUserPlus,
  IconTag,
  IconFileDescription,
  IconPlus,
  IconMicrophone,
  IconTrash,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  getAvatarColor,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";
import { CreateProjectModal } from "./CreateProjectModal";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { OutcomeTimeline } from "./OutcomeTimeline";

// Types
type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
}


// Helper function to get status color
function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "green";
    case "COMPLETED":
      return "blue";
    case "ON_HOLD":
      return "yellow";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

// Helper function to get status display text
function getStatusText(status: string): string {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "In Progress";
    case "COMPLETED":
      return "Completed";
    case "ON_HOLD":
      return "On Hold";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

// Helper function to get priority color
function getPriorityColor(priority: string): string {
  switch (priority.toUpperCase()) {
    case "HIGH":
      return "red";
    case "MEDIUM":
      return "yellow";
    case "LOW":
      return "blue";
    default:
      return "gray";
  }
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
  const utils = api.useUtils();

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

    // Check project due date
    if (project.reviewDate && new Date(project.reviewDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Project Due", color: "red" });
    }
    if (project.nextActionDate && new Date(project.nextActionDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Next Action", color: "orange" });
    }

    // Check goals
    goals.forEach((goal) => {
      if (goal.dueDate && new Date(goal.dueDate).toDateString() === dateStr) {
        items.push({ type: "goal", title: goal.title, color: "blue" });
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left Column - Project Information */}
      <div>
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          {/* Project Title with Edit Button */}
          <Group justify="space-between" align="flex-start" mb="lg">
            <Text fw={700} size="xl" className="text-text-primary">
              {project.name}
            </Text>
            <CreateProjectModal project={project}>
              <Button
                variant="default"
                size="xs"
                leftSection={<IconEdit size={14} />}
              >
                Edit
              </Button>
            </CreateProjectModal>
          </Group>

          <Stack gap="md">
            {/* Status */}
            <Group gap="lg">
              <Group gap="xs" w={100}>
                <div className="bg-text-muted h-2 w-2 rounded-full" />
                <Text size="sm" c="dimmed">
                  Status
                </Text>
              </Group>
              <Badge
                variant="light"
                color={getStatusColor(project.status)}
                size="md"
              >
                {getStatusText(project.status)}
              </Badge>
            </Group>

            {/* Due Date */}
            <Group gap="lg">
              <Group gap="xs" w={100}>
                <IconCalendar size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Due date
                </Text>
              </Group>
              <Badge
                variant="outline"
                color="gray"
                size="md"
                leftSection={<IconCalendar size={12} />}
              >
                {project.reviewDate
                  ? new Date(project.reviewDate).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : project.nextActionDate
                    ? new Date(project.nextActionDate).toLocaleDateString(
                        "en-US",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }
                      )
                    : "Not set"}
              </Badge>
            </Group>

            {/* Assignees */}
            <Group gap="lg">
              <Group gap="xs" w={100}>
                <IconUserPlus size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Assignee
                </Text>
              </Group>
              <Group gap="sm">
                <Avatar.Group spacing="xs">
                  {/* Mock avatars for assignees */}
                  {["Wade Warren", "Esther Howard", "Ralph Edwards"].map(
                    (name, i) => {
                      const bgColor = getAvatarColor(name.toLowerCase());
                      const textColor = getTextColor(bgColor);
                      return (
                        <Avatar
                          key={i}
                          radius="xl"
                          size="sm"
                          style={{ backgroundColor: bgColor, color: textColor }}
                        >
                          {getInitial(name, null)}
                        </Avatar>
                      );
                    }
                  )}
                  <Avatar radius="xl" size="sm">
                    3+
                  </Avatar>
                </Avatar.Group>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconUserPlus size={14} />}
                >
                  Invite
                </Button>
              </Group>
            </Group>

            {/* Tags */}
            <Group gap="lg">
              <Group gap="xs" w={100}>
                <IconTag size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Tags
                </Text>
              </Group>
              <Group gap="xs">
                <Badge variant="default" size="md">
                  Dashboard
                </Badge>
                {project.priority !== "NONE" && (
                  <Badge
                    variant="dot"
                    color={getPriorityColor(project.priority)}
                    size="md"
                  >
                    {project.priority === "HIGH"
                      ? "High Priority"
                      : project.priority === "MEDIUM"
                        ? "Medium Priority"
                        : "Low Priority"}
                  </Badge>
                )}
                {project.priority === "NONE" && (
                  <Badge variant="dot" color="red" size="md">
                    High Priority
                  </Badge>
                )}
              </Group>
            </Group>

            <Divider my="sm" />

            {/* Description */}
            <Stack gap="xs">
              <Group gap="xs">
                <IconFileDescription size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Description
                </Text>
              </Group>
              <Paper
                p="md"
                radius="sm"
                className="border-border-primary bg-background-secondary border"
              >
                <Text size="sm" className="text-text-secondary">
                  {project.description ??
                    "The project focuses on redesigning the hotel administration interface, streamlining the management of customer information and transaction records."}
                </Text>
              </Paper>
            </Stack>

            <Divider my="sm" />

            {/* Transcriptions */}
            <Stack gap="xs">
              <Group gap="xs">
                <IconMicrophone size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Meeting Transcriptions ({project.transcriptionSessions?.length ?? 0})
                </Text>
              </Group>
              <Stack gap="xs">
                {project.transcriptionSessions && project.transcriptionSessions.length > 0 ? (
                  project.transcriptionSessions.slice(0, 3).map((session) => (
                    <Paper
                      key={session.id}
                      p="sm"
                      radius="sm"
                      className="border-border-primary bg-background-secondary hover:bg-surface-hover cursor-pointer border transition-colors"
                    >
                      <Stack gap={2}>
                        <Text size="sm" fw={500} className="text-text-primary" lineClamp={1}>
                          {session.title ?? `Session ${session.sessionId}`}
                        </Text>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">
                            {new Date(session.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </Text>
                          {session.sourceIntegration && (
                            <Badge variant="dot" color="teal" size="xs">
                              {session.sourceIntegration.provider}
                            </Badge>
                          )}
                        </Group>
                      </Stack>
                    </Paper>
                  ))
                ) : (
                  <Text size="sm" c="dimmed" fs="italic" ta="center" py="md">
                    No transcriptions yet
                  </Text>
                )}
                {(project.transcriptionSessions?.length ?? 0) > 3 && (
                  <Text size="xs" c="dimmed" ta="center">
                    +{(project.transcriptionSessions?.length ?? 0) - 3} more transcriptions
                  </Text>
                )}
              </Stack>
            </Stack>
          </Stack>
        </Card>
      </div>

      {/* Middle Column - Calendar & Timeline */}
      <div className="space-y-6">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Text fw={600} size="lg" className="text-text-primary" mb="md">
            Project Calendar
          </Text>
          <div className="flex justify-center">
            <Calendar
              getDayProps={(date) => {
              const items = getItemsForDate(date);
              if (items.length === 0) return {};

              return {
                style: { position: "relative" as const },
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

      {/* Right Column - Sidebar */}
      <div className="space-y-6">
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
                                <Badge variant="light" color="blue" size="xs">
                                  {goal.lifeDomain.title}
                                </Badge>
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
      </div>
    </div>
  );
}
