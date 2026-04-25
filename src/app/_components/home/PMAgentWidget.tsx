"use client";

import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Button,
  ActionIcon,
  Tooltip,
  Loader,
  Collapse,
} from "@mantine/core";
import {
  IconRobot,
  IconPlayerPlay,
  IconRefresh,
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconX,
  IconClock,
} from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { formatDistanceToNow } from "date-fns";
import { useAgentModal } from "~/providers/AgentModalProvider";

interface WorkflowRun {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  definition: {
    name: string;
  };
}

export function PMAgentWidget() {
  const [expanded, setExpanded] = useState(false);
  const { setPendingNotification } = useAgentModal();

  // Fetch scheduler status
  const schedulerStatus = api.pmScheduler.getStatus.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent workflow runs
  const recentRuns = api.workflowPipeline.listRuns.useQuery(
    { definitionId: "", limit: 5 }, // Empty definitionId returns all runs
    {
      refetchInterval: 30000,
    }
  );

  // Mutations
  const startScheduler = api.pmScheduler.start.useMutation({
    onSuccess: () => schedulerStatus.refetch(),
  });
  const stopScheduler = api.pmScheduler.stop.useMutation({
    onSuccess: () => schedulerStatus.refetch(),
  });
  const runTask = api.pmScheduler.runTask.useMutation({
    onSuccess: (data) => {
      void recentRuns.refetch();
      if (data.summary) {
        setPendingNotification({
          message: data.summary,
          preview: "Your standup is ready",
        });
      }
    },
  });

  const activeTasks = schedulerStatus.data?.filter((t) => t.running).length ?? 0;
  const totalTasks = schedulerStatus.data?.length ?? 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <IconCheck size={14} className="text-green-500" />;
      case "FAILED":
        return <IconX size={14} className="text-red-500" />;
      case "RUNNING":
        return <Loader size={14} />;
      default:
        return <IconClock size={14} className="text-text-muted" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "green";
      case "FAILED":
        return "red";
      case "RUNNING":
        return "blue";
      default:
        return "gray";
    }
  };

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="md"
    >
      <Group justify="space-between" mb="sm">
        <Group gap="sm">
          <IconRobot size={20} className="text-violet-400" />
          <Text fw={600} size="sm" className="text-text-primary">
            PM Agent
          </Text>
        </Group>
        <Group gap="xs">
          <Badge
            variant="light"
            color={activeTasks > 0 ? "green" : "gray"}
            size="sm"
          >
            {activeTasks}/{totalTasks} active
          </Badge>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
      </Group>

      {/* Quick Actions */}
      <Group gap="xs" mb="sm">
        <Tooltip label="Generate Standup Summary">
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => runTask.mutate({ taskId: "daily-standup-workflow" })}
            loading={runTask.isPending}
          >
            Standup
          </Button>
        </Tooltip>
        <Tooltip label="Run Project Health Check">
          <Button
            variant="light"
            size="xs"
            color="orange"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => runTask.mutate({ taskId: "project-health-workflow" })}
            loading={runTask.isPending}
          >
            Health Check
          </Button>
        </Tooltip>
        <Tooltip label="Refresh">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => {
              void schedulerStatus.refetch();
              void recentRuns.refetch();
            }}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Recent Runs */}
      {recentRuns.data?.runs && recentRuns.data.runs.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" className="text-text-muted" fw={500}>
            Recent Runs
          </Text>
          {recentRuns.data.runs.slice(0, 3).map((run: WorkflowRun) => (
            <Group key={run.id} justify="space-between" gap="xs">
              <Group gap="xs">
                {getStatusIcon(run.status)}
                <Text size="xs" className="text-text-secondary" lineClamp={1}>
                  {run.definition.name}
                </Text>
              </Group>
              <Group gap="xs">
                <Badge size="xs" variant="light" color={getStatusColor(run.status)}>
                  {run.status.toLowerCase()}
                </Badge>
                <Text size="xs" c="dimmed">
                  {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                </Text>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {/* Expanded Details */}
      <Collapse in={expanded}>
        <Stack gap="sm" mt="md" pt="md" className="border-t border-border-primary">
          <Text size="xs" className="text-text-muted" fw={500}>
            Scheduled Tasks
          </Text>
          {schedulerStatus.data?.map((task) => (
            <Group key={task.id} justify="space-between">
              <Text size="xs" className="text-text-secondary">
                {task.name}
              </Text>
              <Badge
                size="xs"
                variant="light"
                color={task.running ? "green" : "gray"}
              >
                {task.running ? "active" : "stopped"}
              </Badge>
            </Group>
          ))}
          <Group gap="xs" mt="xs">
            <Button
              variant="light"
              size="xs"
              color="green"
              onClick={() => startScheduler.mutate()}
              loading={startScheduler.isPending}
              disabled={activeTasks === totalTasks}
            >
              Start All
            </Button>
            <Button
              variant="light"
              size="xs"
              color="red"
              onClick={() => stopScheduler.mutate()}
              loading={stopScheduler.isPending}
              disabled={activeTasks === 0}
            >
              Stop All
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Card>
  );
}
