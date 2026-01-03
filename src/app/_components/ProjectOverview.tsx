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
} from "@mantine/core";
import {
  IconCalendar,
  IconDots,
  IconEdit,
  IconDownload,
  IconEye,
  IconUserPlus,
  IconAlertCircle,
  IconStar,
  IconTag,
  IconPaperclip,
  IconFileDescription,
  IconPlus,
} from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import {
  getAvatarColor,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";
import { CreateProjectModal } from "./CreateProjectModal";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateOutcomeModal } from "./CreateOutcomeModal";

// Types
type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
}

// Mock data for attachments
const MOCK_ATTACHMENTS = [
  {
    id: "1",
    name: "Medical dashboard",
    timestamp: "11:30 AM, 16 Aug 2024",
    type: "alert" as const,
  },
  {
    id: "2",
    name: "Medical dashboard",
    timestamp: "11:30 AM, 16 Aug 2024",
    type: "star" as const,
  },
];

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
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left Column - Project Information */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          {/* Card Header */}
          <Group justify="space-between" mb="lg">
            <Text fw={600} size="lg" className="text-text-primary">
              Project Information
            </Text>
            <Group gap="xs">
              <CreateProjectModal project={project}>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconEdit size={14} />}
                >
                  Edit
                </Button>
              </CreateProjectModal>
              <ActionIcon variant="subtle" size="md">
                <IconDots size={16} />
              </ActionIcon>
            </Group>
          </Group>

          {/* Project Title */}
          <Text fw={700} size="xl" mb="lg" className="text-text-primary">
            {project.name}
          </Text>

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
                    : "16 June 2024"}
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

            {/* Attachments */}
            <Stack gap="xs">
              <Group gap="xs">
                <IconPaperclip size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Attachment ({MOCK_ATTACHMENTS.length})
                </Text>
              </Group>
              <Stack gap="xs">
                {MOCK_ATTACHMENTS.map((attachment) => (
                  <Paper
                    key={attachment.id}
                    p="sm"
                    radius="sm"
                    className="border-border-primary bg-background-secondary border"
                  >
                    <Group justify="space-between">
                      <Group gap="sm">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            attachment.type === "alert"
                              ? "bg-orange-500/20 text-orange-500"
                              : "bg-blue-500/20 text-blue-500"
                          }`}
                        >
                          {attachment.type === "alert" ? (
                            <IconAlertCircle size={20} />
                          ) : (
                            <IconStar size={20} />
                          )}
                        </div>
                        <Stack gap={2}>
                          <Text size="sm" fw={500} className="text-text-primary">
                            {attachment.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {attachment.timestamp}
                          </Text>
                        </Stack>
                      </Group>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconEye size={14} />}
                        >
                          View
                        </Button>
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconDownload size={14} />}
                        >
                          Download
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Stack>
          </Stack>
        </Card>
      </div>

      {/* Right Column - Sidebar */}
      <div className="space-y-6">
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
                <Paper
                  key={outcome.id}
                  p="sm"
                  radius="sm"
                  className="border-border-primary bg-background-secondary border"
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
                  className="border-border-primary bg-background-secondary border"
                >
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
      </div>
    </div>
  );
}
