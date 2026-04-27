"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Table,
  Group,
  Badge,
  Skeleton,
  Stack,
  ActionIcon,
} from "@mantine/core";
import {
  IconPlus,
  IconTarget,
  IconCircleCheckFilled,
  IconAlertTriangleFilled,
  IconAlertCircleFilled,
  IconClockFilled,
  IconUsers,
  IconChartBar,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { GoalIcon } from "../GoalIcon";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { useTerminology } from "~/hooks/useTerminology";
import Link from "next/link";

type HealthStatus = "on-track" | "at-risk" | "off-track" | "no-update";

const healthConfig: Record<HealthStatus, { color: string; icon: typeof IconCircleCheckFilled; label: string }> = {
  "on-track": { color: "var(--mantine-color-green-6)", icon: IconCircleCheckFilled, label: "On track" },
  "at-risk": { color: "var(--mantine-color-yellow-6)", icon: IconAlertTriangleFilled, label: "At risk" },
  "off-track": { color: "var(--mantine-color-red-6)", icon: IconAlertCircleFilled, label: "Off track" },
  "no-update": { color: "var(--mantine-color-gray-6)", icon: IconClockFilled, label: "No update" },
};

function HealthCell({ health, updatedAt }: { health: string | null; updatedAt: Date | null }) {
  const config = healthConfig[(health as HealthStatus) ?? "no-update"] ?? healthConfig["no-update"];
  const Icon = config.icon;
  const timeAgo = updatedAt ? getTimeAgo(updatedAt) : null;

  return (
    <Group gap={6} wrap="nowrap">
      <Icon size={16} style={{ color: config.color }} />
      <Text size="sm" className="text-text-primary">
        {config.label}
      </Text>
      {timeAgo && (
        <Text size="xs" c="dimmed">
          {timeAgo}
        </Text>
      )}
    </Group>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w`;
}

function formatTargetDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface GoalRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  health: string | null;
  healthUpdatedAt: Date | null;
  period: string | null;
  dueDate: Date | null;
  parentGoalId: number | null;
  driUserId: string | null;
  icon: string | null;
  iconColor: string | null;
  projects: { id: string; name: string; progress: number; status: string }[];
  childGoals: { id: number; title: string; status: string; health: string | null }[];
  _count?: { keyResults: number };
}

function InitiativeRow({ goal, workspaceSlug }: { goal: GoalRow; workspaceSlug: string }) {
  const projectCount = goal.projects.length;
  const activeProjectCount = goal.projects.filter(p => p.status === "ACTIVE").length;
  const krCount = goal._count?.keyResults ?? 0;

  return (
    <Table.Tr
      className="cursor-pointer hover:bg-surface-hover transition-colors"
    >
      {/* Name */}
      <Table.Td>
        <Link
          href={`/w/${workspaceSlug}/goals/${goal.id}`}
          className="no-underline"
        >
          <Group gap="sm" wrap="nowrap">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-secondary">
              <GoalIcon icon={goal.icon} iconColor={goal.iconColor} size={16} />
            </div>
            <div className="min-w-0">
              <Group gap={6} wrap="nowrap">
                <Text size="sm" fw={500} className="text-text-primary" truncate="end">
                  {goal.title}
                </Text>
                {krCount > 0 && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="brand"
                    leftSection={<IconChartBar size={10} />}
                  >
                    {krCount} KR{krCount === 1 ? "" : "s"}
                  </Badge>
                )}
              </Group>
              {goal.description && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {goal.description}
                </Text>
              )}
            </div>
          </Group>
        </Link>
      </Table.Td>

      {/* Owner */}
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <IconUsers size={14} className="text-text-muted" />
          <Text size="sm" c="dimmed">
            {goal.driUserId ? "Assigned" : "Unassigned"}
          </Text>
        </Group>
      </Table.Td>

      {/* Target */}
      <Table.Td>
        <Text size="sm" className="text-text-secondary">
          {goal.period ?? formatTargetDate(goal.dueDate)}
        </Text>
      </Table.Td>

      {/* Projects */}
      <Table.Td>
        {projectCount > 0 ? (
          <Group gap={4} wrap="nowrap">
            <IconCircleCheckFilled size={14} style={{ color: "var(--mantine-color-green-6)" }} />
            <Text size="sm" className="text-text-primary">
              {activeProjectCount} / {projectCount}
            </Text>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">—</Text>
        )}
      </Table.Td>

      {/* Initiative Health */}
      <Table.Td>
        <HealthCell health={goal.health} updatedAt={goal.healthUpdatedAt} />
      </Table.Td>

      {/* Active Projects */}
      <Table.Td>
        <Text size="sm" c="dimmed">
          {activeProjectCount > 0 ? `${activeProjectCount} active` : "No updates"}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

export function InitiativeDashboard({ projectId }: { projectId?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const { workspaceId, workspaceSlug } = useWorkspace();
  const terminology = useTerminology();

  const { data: projectGoals, isLoading: projectGoalsLoading } = api.goal.getProjectGoals.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId },
  );

  const { data: allGoals, isLoading: workspaceGoalsLoading } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !projectId && !!workspaceId },
  );

  const isLoading = projectId ? projectGoalsLoading : workspaceGoalsLoading;
  const goalsSource = projectId ? (projectGoals ?? []) : (allGoals ?? []);

  // Filter goals by status; in workspace mode, show only root-level goals
  const filteredGoals = goalsSource.filter(g => {
    if (g.status !== statusFilter) return false;
    if (!projectId && g.parentGoalId !== null) return false;
    return true;
  });


  return (
    <Container size="xl" className="py-6">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Title order={3} className="text-text-primary">
            Goals
          </Title>
          <CreateGoalModal projectId={projectId}>
            <ActionIcon variant="subtle" size="lg">
              <IconPlus size={18} />
            </ActionIcon>
          </CreateGoalModal>
        </Group>

        {/* Status filter tabs - pill style like Linear */}
        <Group gap="xs">
          <Badge
            variant={statusFilter === "active" ? "filled" : "light"}
            color={statusFilter === "active" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("active")}
          >
            Active
          </Badge>
          <Badge
            variant={statusFilter === "planned" ? "filled" : "light"}
            color={statusFilter === "planned" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("planned")}
          >
            Planned
          </Badge>
          <Badge
            variant={statusFilter === "completed" ? "filled" : "light"}
            color={statusFilter === "completed" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </Badge>
        </Group>

        {/* Table */}
        {isLoading ? (
          <Stack gap="sm">
            <Skeleton height={40} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
        ) : filteredGoals.length > 0 ? (
          <Table verticalSpacing="sm" highlightOnHover={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-text-muted">Name</Table.Th>
                <Table.Th className="text-text-muted">Owner</Table.Th>
                <Table.Th className="text-text-muted">Target</Table.Th>
                <Table.Th className="text-text-muted">Projects</Table.Th>
                <Table.Th className="text-text-muted">Initiative Health</Table.Th>
                <Table.Th className="text-text-muted">Active Projects</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredGoals.map((goal) => (
                <InitiativeRow
                  key={goal.id}
                  goal={goal as unknown as GoalRow}
                  workspaceSlug={workspaceSlug ?? ""}
                />
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <div className="py-16 text-center">
            <IconTarget size={48} className="text-text-muted mx-auto mb-4" />
            <Text size="lg" fw={500} className="text-text-primary">
              No {statusFilter} goals
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              Create {terminology.goals.toLowerCase()} to track strategic objectives and their progress.
            </Text>
          </div>
        )}
      </Stack>
    </Container>
  );
}
