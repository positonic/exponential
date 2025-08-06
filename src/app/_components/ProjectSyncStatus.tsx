"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Alert,
  Collapse,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconClock,
  IconCloudUpload,
  IconCloudDownload,
  IconArrowsExchange,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface ProjectSyncStatusProps {
  project: {
    id: string;
    name: string;
    taskManagementTool?: string | null;
    taskManagementConfig?: any;
    notionProjectId?: string | null;
  };
  opened: boolean;
  onToggle: () => void;
}

export function ProjectSyncStatus({ project, opened }: ProjectSyncStatusProps) {
  const [notionProjectName, setNotionProjectName] = useState<string | null>(null);
  const { data: workflows = [] } = api.workflow.list.useQuery();
  // const { data: workflowRuns = [] } = api.workflow.list.useQuery();

  // Get config and derived values
  const config = project.taskManagementConfig as {
    workflowId?: string;
    syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
    conflictResolution?: 'local_wins' | 'remote_wins';
    deletionBehavior?: 'mark_deleted' | 'archive';
  } || {};

  const syncStrategy = config.syncStrategy || 'manual';
  const conflictResolution = config.conflictResolution || 'local_wins';
  const deletionBehavior = config.deletionBehavior || 'mark_deleted';

  // Find the configured workflow
  const configuredWorkflow = workflows.find(w => w.id === config.workflowId);

  // Fetch Notion project name if we have a notionProjectId
  useEffect(() => {
    if (project.notionProjectId && configuredWorkflow && project.taskManagementTool === 'notion') {
      // We would fetch the project name here, but for now we'll show the ID
      // In a real implementation, you'd want to cache this or fetch it from the API
      setNotionProjectName(`Project: ${project.notionProjectId.slice(-8)}`); // Show last 8 chars of ID
    } else {
      setNotionProjectName(null);
    }
  }, [project.notionProjectId, configuredWorkflow, project.taskManagementTool]);

  // Don't show for internal projects
  if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
    return null;
  }


  const getStrategyInfo = () => {
    switch (syncStrategy) {
      case 'notion_canonical':
        return {
          label: 'Notion Canonical',
          description: 'Notion is the source of truth. Changes in Notion override local changes.',
          color: 'violet' as const,
          icon: IconCloudDownload,
        };
      case 'auto_pull_then_push':
        return {
          label: 'Smart Sync',
          description: 'Automatically pulls from Notion before pushing to prevent conflicts.',
          color: 'blue' as const,
          icon: IconArrowsExchange,
        };
      default:
        return {
          label: 'Manual',
          description: 'Sync only when you click the sync buttons.',
          color: 'gray' as const,
          icon: IconCloudUpload,
        };
    }
  };

  const strategyInfo = getStrategyInfo();
  const integrationName = project.taskManagementTool === 'monday' ? 'Monday.com' : 
                         project.taskManagementTool === 'notion' ? 'Notion' : 
                         project.taskManagementTool;

  return (
    <Collapse in={opened}>
      <Card withBorder mb="md">
        <Stack gap="md">
          <Group gap="sm">
            <strategyInfo.icon size={20} />
            <Text size="sm" fw={500}>
              Connected to {integrationName}
            </Text>
          </Group>

        <Group gap="md" wrap="wrap">
          <Group gap="xs">
            <Text size="sm" fw={500}>Strategy:</Text>
            <Badge 
              color={strategyInfo.color} 
              variant="light"
              leftSection={<strategyInfo.icon size={12} />}
            >
              {strategyInfo.label}
            </Badge>
          </Group>

          <Group gap="xs">
            <Text size="sm" fw={500}>Conflicts:</Text>
            <Badge 
              color={conflictResolution === 'remote_wins' ? 'orange' : 'green'} 
              variant="light"
            >
              {conflictResolution === 'remote_wins' ? 'Remote Wins' : 'Local Wins'}
            </Badge>
          </Group>

          <Group gap="xs">
            <Text size="sm" fw={500}>Deletions:</Text>
            <Badge color="gray" variant="light">
              {deletionBehavior === 'mark_deleted' ? 'Mark Deleted' : 'Archive'}
            </Badge>
          </Group>
        </Group>

        <Alert 
          icon={<IconInfoCircle size={16} />} 
          color={strategyInfo.color}
          variant="light"
        >
          <Text size="sm">
            <strong>{strategyInfo.label} Mode:</strong> {strategyInfo.description}
          </Text>
          
          {syncStrategy === 'notion_canonical' && (
            <Text size="sm" mt="xs">
              💡 <strong>Your scenario:</strong> When you delete a task in Notion, it will be marked as deleted here. 
              Already-synced tasks won&apos;t be re-created.
            </Text>
          )}
          
          {syncStrategy === 'manual' && (
            <Text size="sm" mt="xs">
              💡 Use separate &ldquo;Push to {integrationName}&rdquo; and &ldquo;Pull from {integrationName}&rdquo; buttons for precise control.
            </Text>
          )}
        </Alert>

        {configuredWorkflow && (
          <Group gap="xs" align="center">
            <IconClock size={14} />
            <Text size="xs" c="dimmed">
              Using workflow: <strong>{configuredWorkflow.name}</strong>
              {configuredWorkflow.lastRunAt && (
                <> • Last run: {new Date(configuredWorkflow.lastRunAt).toLocaleString()}</>
              )}
            </Text>
          </Group>
        )}

        {notionProjectName && project.taskManagementTool === 'notion' && (
          <Group gap="xs" align="center">
            <IconArrowsExchange size={14} />
            <Text size="xs" c="dimmed">
              Linked to: <strong>{notionProjectName}</strong>
            </Text>
          </Group>
        )}
        </Stack>
      </Card>
    </Collapse>
  );
}