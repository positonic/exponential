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
  IconShare,
  IconDots,
  IconDownload,
  IconEye,
  IconUserPlus,
  IconAlertCircle,
  IconStar,
  IconTargetArrow,
  IconTag,
  IconPaperclip,
  IconFileDescription,
} from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import {
  getAvatarColor,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";

// Types
type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
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

// Mock data for team chat
const MOCK_CHAT = [
  {
    id: "1",
    name: "Wade Warren",
    message: "Are you available tonight?",
    time: "9:41 AM",
    unread: 8,
  },
  {
    id: "2",
    name: "Esther Howard",
    message: "Wanna lunch with me?",
    time: "1 day ago",
  },
  {
    id: "3",
    name: "Ralph Edwards",
    message: "Missing your a lot.",
    time: "1 day ago",
    unread: 6,
  },
  {
    id: "4",
    name: "Rheresa Gebb",
    message: "Typing....",
    time: "3 day ago",
    isTyping: true,
  },
];

// Mock data for recent activity
const MOCK_ACTIVITY = [
  {
    id: "1",
    name: "Leslie Alexander",
    action: "You have a new comment from @asifmadmud",
    time: "Just now",
  },
  {
    id: "2",
    name: "Jenny Wilson",
    action: "A new system update is available. Please update your app.",
    time: "3 hours ago",
  },
  {
    id: "3",
    name: "Guy Hawkins",
    action:
      "You have a new comment: You've completed the task: @asifmahmud. Well done!",
    time: "16 hours ago",
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

export function ProjectOverview({ project, goals }: ProjectOverviewProps) {
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
              <Button
                variant="default"
                size="xs"
                leftSection={<IconShare size={14} />}
              >
                Share
              </Button>
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

            <Divider my="sm" />

            {/* Project Goals */}
            <Stack gap="xs">
              <Group gap="xs">
                <IconTargetArrow size={14} className="text-text-muted" />
                <Text size="sm" c="dimmed">
                  Project Goals
                </Text>
              </Group>
              {goals.length > 0 ? (
                <Stack gap="xs">
                  {goals.slice(0, 3).map((goal) => (
                    <Paper
                      key={goal.id}
                      p="sm"
                      radius="sm"
                      className="border-border-primary bg-background-secondary border"
                    >
                      <Group justify="space-between">
                        <Text size="sm" className="text-text-primary">
                          {goal.title}
                        </Text>
                        {goal.lifeDomain && (
                          <Badge variant="light" color="blue" size="xs">
                            {goal.lifeDomain.title}
                          </Badge>
                        )}
                      </Group>
                    </Paper>
                  ))}
                  {goals.length > 3 && (
                    <Text size="xs" c="dimmed" ta="center">
                      +{goals.length - 3} more goals
                    </Text>
                  )}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed" fs="italic">
                  No goals linked to this project yet
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
      </div>

      {/* Right Column - Sidebar */}
      <div className="space-y-6">
        {/* Team Chat Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Text fw={600} size="lg" className="text-text-primary">
              Team Chat
            </Text>
            <ActionIcon variant="subtle" size="md">
              <IconDots size={16} />
            </ActionIcon>
          </Group>

          <Stack gap="md">
            {MOCK_CHAT.map((chat) => {
              const bgColor = getAvatarColor(chat.name.toLowerCase());
              const textColor = getTextColor(bgColor);

              return (
                <Group
                  key={chat.id}
                  gap="sm"
                  align="flex-start"
                  className="cursor-pointer rounded-md p-2 hover:bg-surface-hover"
                >
                  <div className="relative">
                    <Avatar
                      radius="xl"
                      size="md"
                      style={{ backgroundColor: bgColor, color: textColor }}
                    >
                      {getInitial(chat.name, null)}
                    </Avatar>
                    <div className="bg-brand-success absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white" />
                  </div>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Group justify="space-between">
                      <Text size="sm" fw={500} className="text-text-primary">
                        {chat.name}
                      </Text>
                      <Text size="xs" className="text-text-disabled">
                        {chat.time}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text
                        size="xs"
                        c={chat.isTyping ? "green" : "dimmed"}
                        lineClamp={1}
                      >
                        {chat.message}
                      </Text>
                      {chat.unread && (
                        <Badge
                          variant="filled"
                          color="orange"
                          size="xs"
                          circle
                        >
                          {chat.unread}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Group>
              );
            })}
          </Stack>
        </Card>

        {/* Recent Activity Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Text fw={600} size="lg" className="text-text-primary">
              Recent Activity
            </Text>
            <ActionIcon variant="subtle" size="md">
              <IconDots size={16} />
            </ActionIcon>
          </Group>

          <Stack gap="md">
            {MOCK_ACTIVITY.map((activity, index) => {
              const bgColor = getAvatarColor(activity.name.toLowerCase());
              const textColor = getTextColor(bgColor);

              return (
                <Group
                  key={activity.id}
                  gap="sm"
                  align="flex-start"
                  className="relative"
                >
                  {/* Timeline line */}
                  {index < MOCK_ACTIVITY.length - 1 && (
                    <div className="bg-border-primary absolute left-5 top-10 h-full w-px" />
                  )}
                  <Avatar
                    radius="xl"
                    size="md"
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    {getInitial(activity.name, null)}
                  </Avatar>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm" fw={500} className="text-text-primary">
                        {activity.name}
                      </Text>
                      <Text size="xs" className="text-text-disabled">
                        {activity.time}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {activity.action}
                    </Text>
                  </Stack>
                </Group>
              );
            })}
          </Stack>
        </Card>
      </div>
    </div>
  );
}
