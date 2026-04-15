"use client";

import { useState } from "react";
import React from "react";
import {
  Container,
  Title,
  Text,
  Group,
  Badge,
  Stack,
  Tabs,
  Table,
  Avatar,
  ActionIcon,
  Skeleton,
  Divider,
  Card,
  Menu,
} from "@mantine/core";
import {
  IconTarget,
  IconStar,
  IconDots,
  IconSettings,
  IconCircleCheckFilled,
  IconUsers,
  IconCalendar,
  IconMessage,
  IconMoodSmile,
  IconPencil,
  IconPlus,
  IconAdjustments,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import Link from "next/link";
import DOMPurify from "dompurify";
import { GoalDescriptionEditor } from "./GoalDescriptionEditor";
import { GoalActivityTab } from "./GoalActivityTab";
import { type HealthStatus, healthConfig } from "./healthConfig";
import { GoalIcon } from "../GoalIcon";
import { IconPicker } from "../IconPicker";
import { CreateProjectModal } from "../CreateProjectModal";
import { ProjectViewTabs, type ProjectView } from "../ProjectViewTabs";
import { ProjectsTasksView } from "../ProjectsTasksView/ProjectsTasksView";
import { ProjectTimelineView } from "../ProjectTimelineView";

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

function formatStatus(status: string): string {
  if (status === "on-hold") return "On Hold";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
    case "ACTIVE":
      return "green";
    case "planned":
      return "blue";
    case "completed":
    case "COMPLETED":
      return "teal";
    case "on-hold":
      return "yellow";
    case "archived":
    case "CANCELLED":
      return "gray";
    default:
      return "gray";
  }
}

const goalStatusOptions = [
  { key: "active" as const,    label: "Active",   color: "green"  },
  { key: "completed" as const, label: "Complete", color: "teal"   },
  { key: "on-hold" as const,   label: "On Hold",  color: "yellow" },
];

function getProjectStatusPercent(progress: number | null): string {
  if (progress === null || progress === undefined) return "0%";
  return `${Math.round(Number(progress) * 100)}%`;
}

interface GoalDetailContentProps {
  goalId: number;
  workspaceSlug: string;
}

export function GoalDetailContent({ goalId, workspaceSlug }: GoalDetailContentProps) {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [projectView, setProjectView] = useState<ProjectView>("table");

  const utils = api.useUtils();
  const { data: goal, isLoading } = api.goal.getById.useQuery({ id: goalId });

  const updateIconMutation = api.goal.updateGoalIcon.useMutation({
    onMutate: async (newData) => {
      await utils.goal.getById.cancel({ id: goalId });
      const previous = utils.goal.getById.getData({ id: goalId });
      if (previous) {
        utils.goal.getById.setData({ id: goalId }, {
          ...previous,
          icon: newData.icon,
          iconColor: newData.iconColor,
        });
      }
      return { previous };
    },
    onError: (_err, _newData, context) => {
      if (context?.previous) {
        utils.goal.getById.setData({ id: goalId }, context.previous);
      }
    },
    onSettled: () => {
      void utils.goal.getById.invalidate({ id: goalId });
    },
  });

  const updateStatusMutation = api.goal.updateGoalStatus.useMutation({
    onMutate: async (newData) => {
      await utils.goal.getById.cancel({ id: goalId });
      const previous = utils.goal.getById.getData({ id: goalId });
      if (previous) {
        utils.goal.getById.setData({ id: goalId }, { ...previous, status: newData.status });
      }
      return { previous };
    },
    onError: (_err, _newData, context) => {
      if (context?.previous) {
        utils.goal.getById.setData({ id: goalId }, context.previous);
      }
    },
    onSettled: () => {
      void utils.goal.getById.invalidate({ id: goalId });
    },
  });

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Stack gap="md">
          <Skeleton height={60} />
          <Skeleton height={40} />
          <Skeleton height={200} />
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  if (!goal) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Goal not found</Text>
      </Container>
    );
  }

  const healthKey = (goal.health as HealthStatus) ?? "no-update";
  const health = healthConfig[healthKey] ?? healthConfig["no-update"];
  const latestComment = goal.comments?.[0];

  // Group projects by status
  const projectsByStatus = goal.projects.reduce<Record<string, typeof goal.projects>>(
    (acc, project) => {
      const status = project.status ?? "ACTIVE";
      if (!acc[status]) acc[status] = [];
      acc[status].push(project);
      return acc;
    },
    {},
  );

  const statusOrder = ["ACTIVE", "COMPLETED", "CANCELLED"];

  return (
    <Container size="xl" className="w-full py-6">
      <Stack gap="lg">
        {/* Header */}
        <div>
          <Group justify="space-between" align="flex-start">
            <Group gap="sm" align="flex-start">
              <IconPicker
                value={goal.icon}
                color={goal.iconColor}
                onChange={(icon, iconColor) => {
                  updateIconMutation.mutate({ id: goal.id, icon, iconColor });
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-secondary text-xl hover:bg-surface-hover transition-colors cursor-pointer">
                  <GoalIcon icon={goal.icon} iconColor={goal.iconColor} size={24} />
                </div>
              </IconPicker>
              <div>
                <Group gap="xs" align="center">
                  <Title order={3} className="text-text-primary">
                    {goal.title}
                  </Title>
                  <ActionIcon variant="subtle" size="sm" color="gray">
                    <IconStar size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" size="sm" color="gray">
                    <IconDots size={16} />
                  </ActionIcon>
                </Group>
                {goal.description && (
                  <Text
                    size="sm"
                    className="text-text-secondary mt-1"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(goal.description),
                    }}
                  />
                )}
              </div>
            </Group>
          </Group>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(val) => setActiveTab(val ?? "overview")}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="activity">Activity</Tabs.Tab>
            <Tabs.Tab value="projects">Projects</Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={14} />} />
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Panel value="overview" pt="lg">
            <Stack gap="xl">
              {/* Properties */}
              <Group gap="xl">
                <Group gap="xs">
                  <Text size="sm" className="text-text-muted">
                    Properties
                  </Text>
                </Group>
                <Menu shadow="md" width={160}>
                  <Menu.Target>
                    <Badge
                      color={getStatusColor(goal.status)}
                      variant="dot"
                      size="lg"
                      className="cursor-pointer"
                    >
                      {formatStatus(goal.status)}
                    </Badge>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {goalStatusOptions.map((opt) => (
                      <Menu.Item
                        key={opt.key}
                        leftSection={<Badge color={opt.color} variant="dot" size="xs" />}
                        onClick={() => updateStatusMutation.mutate({ id: goal.id, status: opt.key })}
                      >
                        {opt.label}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
                <Group gap={6}>
                  <IconUsers size={14} className="text-text-muted" />
                  <Text size="sm" className="text-text-secondary">
                    {goal.driUser?.name ?? "Owner"}
                  </Text>
                </Group>
                <Group gap={6}>
                  <IconCalendar size={14} className="text-text-muted" />
                  <Text size="sm" className="text-text-secondary">
                    {goal.period ?? "Target date"}
                  </Text>
                </Group>
              </Group>

              {/* Resources */}
              <div>
                <Group gap="md">
                  <Text size="sm" className="text-text-muted">
                    Resources
                  </Text>
                  <Group
                    gap={6}
                    className="cursor-pointer"
                  >
                    <IconPlus size={14} className="text-text-muted" />
                    <Text size="sm" c="dimmed">
                      Add document or link...
                    </Text>
                  </Group>
                </Group>
              </div>

              <Divider className="border-border-primary" />

              {/* Latest Update */}
              <Card withBorder radius="md" p="lg" className="border-border-primary">
                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={500} className="text-text-muted">
                    Latest update
                  </Text>
                  <Group gap={6} className="cursor-pointer">
                    <IconPencil size={14} className="text-text-muted" />
                    <Text size="sm" className="text-text-secondary">
                      Update
                    </Text>
                  </Group>
                </Group>

                <Group gap="sm" mb="sm">
                  <Group gap={6}>
                    {(() => {
                      const HealthIcon = health.icon;
                      return <HealthIcon size={16} style={{ color: health.color }} />;
                    })()}
                    <Text size="sm" fw={500} style={{ color: health.color }}>
                      {health.label}
                    </Text>
                  </Group>
                  {latestComment && (
                    <>
                      <Avatar
                        src={latestComment.author.image}
                        size={24}
                        radius="xl"
                        color="brand"
                      >
                        {latestComment.author.name?.[0] ?? "?"}
                      </Avatar>
                      <Text size="sm" className="text-text-secondary">
                        {latestComment.author.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {getTimeAgo(latestComment.createdAt)}
                      </Text>
                    </>
                  )}
                </Group>

                {latestComment && (
                  <Text size="sm" className="text-text-primary mb-3">
                    {latestComment.content}
                  </Text>
                )}

                <Group gap="sm" mt="xs">
                  <ActionIcon variant="subtle" size="sm" color="gray">
                    <IconMessage size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" size="sm" color="gray">
                    <IconMoodSmile size={16} />
                  </ActionIcon>
                </Group>
              </Card>

              {/* Description */}
              <div>
                <Group gap={6} mb="xs">
                  <Text size="sm" fw={500} className="text-text-muted">
                    Description
                  </Text>
                </Group>
                <GoalDescriptionEditor
                  goalId={goal.id}
                  goalTitle={goal.title}
                  initialContent={goal.description}
                />
              </div>

              {/* Projects section (in overview) */}
              {goal.projects.length > 0 && (
                <div>
                  <Group justify="space-between" mb="md">
                    <Title order={4} className="text-text-primary">
                      Projects
                    </Title>
                    <Group gap="xs">
                      <ActionIcon variant="subtle" size="sm" color="gray">
                        <IconAdjustments size={16} />
                      </ActionIcon>
                      <CreateProjectModal
                        prefillGoalId={goal.id.toString()}
                        onSuccess={() => void utils.goal.getById.invalidate()}
                      >
                        <ActionIcon variant="subtle" size="sm" color="gray">
                          <IconPlus size={16} />
                        </ActionIcon>
                      </CreateProjectModal>
                    </Group>
                  </Group>
                  <ProjectViewTabs activeView={projectView} onViewChange={setProjectView} />
                  {projectView === "table" && (
                    <ProjectsTable
                      projectsByStatus={projectsByStatus}
                      statusOrder={statusOrder}
                      workspaceSlug={workspaceSlug}
                    />
                  )}
                  {projectView === "projects-tasks" && (
                    <ProjectsTasksView goalId={goal.id} standalone />
                  )}
                  {projectView === "timeline" && (
                    <ProjectTimelineView goalId={goal.id} standalone />
                  )}
                </div>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Activity Tab */}
          <Tabs.Panel value="activity" pt="lg">
            <GoalActivityTab goalId={goalId} workspaceSlug={workspaceSlug} />
          </Tabs.Panel>

          {/* Projects Tab */}
          <Tabs.Panel value="projects" pt="lg">
            <ProjectViewTabs activeView={projectView} onViewChange={setProjectView} />
            {projectView === "table" && (
              goal.projects.length > 0 ? (
                <ProjectsTable
                  projectsByStatus={projectsByStatus}
                  statusOrder={statusOrder}
                  workspaceSlug={workspaceSlug}
                />
              ) : (
                <Text size="sm" c="dimmed">
                  No projects linked to this goal.
                </Text>
              )
            )}
            {projectView === "projects-tasks" && (
              <ProjectsTasksView goalId={goal.id} standalone />
            )}
            {projectView === "timeline" && (
              <ProjectTimelineView goalId={goal.id} standalone />
            )}
          </Tabs.Panel>

          {/* Settings Tab */}
          <Tabs.Panel value="settings" pt="lg">
            <Text size="sm" c="dimmed">
              Goal settings coming soon.
            </Text>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}

interface ProjectsTableProps {
  projectsByStatus: Record<
    string,
    Array<{
      id: string;
      name: string;
      status: string | null;
      progress: number | null;
      priority: string | null;
      endDate: Date | null;
      createdById: string;
      createdBy: { id: string; name: string | null; image: string | null };
    }>
  >;
  statusOrder: string[];
  workspaceSlug: string;
}

function ProjectsTable({ projectsByStatus, statusOrder, workspaceSlug }: ProjectsTableProps) {
  return (
    <Table verticalSpacing="sm" highlightOnHover={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className="text-text-muted">Name</Table.Th>
          <Table.Th className="text-text-muted">Health</Table.Th>
          <Table.Th className="text-text-muted">Priority</Table.Th>
          <Table.Th className="text-text-muted">Lead</Table.Th>
          <Table.Th className="text-text-muted">Target date</Table.Th>
          <Table.Th className="text-text-muted">Status</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {statusOrder.map((status) => {
          const projects = projectsByStatus[status];
          if (!projects?.length) return null;
          return (
            <React.Fragment key={status}>
              <Table.Tr>
                <Table.Td colSpan={6} className="py-1">
                  <Text size="xs" c="dimmed" fw={500}>
                    {formatStatus(status)}
                  </Text>
                </Table.Td>
              </Table.Tr>
              {projects.map((project) => (
                <Table.Tr key={project.id}>
                  <Table.Td>
                    <Link
                      href={`/w/${workspaceSlug}/projects/${project.id}`}
                      className="no-underline"
                    >
                      <Group gap="sm" wrap="nowrap">
                        <IconTarget size={14} className="text-text-muted" />
                        <Text size="sm" className="text-text-primary">
                          {project.name}
                        </Text>
                      </Group>
                    </Link>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      No updates
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {project.priority ?? "---"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Avatar
                      src={project.createdBy.image}
                      size={24}
                      radius="xl"
                      color="brand"
                    >
                      {project.createdBy.name?.[0] ?? "?"}
                    </Avatar>
                  </Table.Td>
                  <Table.Td>
                    {project.endDate ? (
                      <Group gap={6} wrap="nowrap">
                        <IconCalendar size={14} className="text-text-muted" />
                        <Text size="sm" className="text-text-secondary">
                          {new Date(project.endDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year:
                              new Date(project.endDate).getFullYear() !== new Date().getFullYear()
                                ? "numeric"
                                : undefined,
                          })}
                        </Text>
                      </Group>
                    ) : (
                      <Group gap={6} wrap="nowrap">
                        <IconCalendar size={14} className="text-text-muted" />
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <IconCircleCheckFilled
                        size={14}
                        style={{ color: "var(--mantine-color-green-6)" }}
                      />
                      <Text size="sm" className="text-text-primary">
                        {getProjectStatusPercent(project.progress)}
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </React.Fragment>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
