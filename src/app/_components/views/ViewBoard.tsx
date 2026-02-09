"use client";

import { useState } from "react";
import {
  Stack,
  Group,
  Title,
  SegmentedControl,
  ActionIcon,
  Tooltip,
  Skeleton,
  Paper,
  Text,
  Badge,
  Checkbox,
  MultiSelect,
} from "@mantine/core";
import {
  IconLayoutKanban,
  IconList,
  IconFilter,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { WorkspaceKanbanBoard } from "./WorkspaceKanbanBoard";
import { ActionList } from "../ActionList";
import type { ViewFilters, ViewType, ViewGroupBy } from "~/types/view";

interface ViewBoardProps {
  workspaceId: string;
  viewConfig?: {
    id?: string;
    name: string;
    viewType: ViewType;
    groupBy: ViewGroupBy;
    filters: ViewFilters;
    isVirtual?: boolean;
  };
}

export function ViewBoard({ workspaceId, viewConfig }: ViewBoardProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<ViewFilters>(viewConfig?.filters ?? {});
  const [viewType, setViewType] = useState<ViewType>(viewConfig?.viewType ?? "KANBAN");
  const [groupBy] = useState<ViewGroupBy>(viewConfig?.groupBy ?? "STATUS");
  const utils = api.useUtils();

  // Fetch projects for filter dropdown
  const { data: projects } = api.project.getAll.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch actions with filters
  const { data: actions, isLoading } = api.view.getViewActions.useQuery({
    workspaceId,
    viewId: viewConfig?.isVirtual ? undefined : viewConfig?.id,
    filters: localFilters,
  });

  // Bulk mutations for list view bulk edit
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: "Actions Deleted",
        message: `Successfully deleted ${data.count} actions`,
        color: "green",
      });
      void utils.view.getViewActions.invalidate();
      void utils.action.getAll.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Delete Failed",
        message: error.message ?? "Failed to delete actions",
        color: "red",
      });
    },
  });

  const bulkRescheduleMutation = api.action.bulkReschedule.useMutation({
    onSettled: () => {
      void utils.view.getViewActions.invalidate();
      void utils.action.getAll.invalidate();
    },
  });

  const bulkAssignProjectMutation = api.action.bulkAssignProject.useMutation({
    onSettled: () => {
      void utils.view.getViewActions.invalidate();
      void utils.action.getAll.invalidate();
    },
  });

  // Bulk operation handlers
  const handleBulkDelete = async (actionIds: string[]) => {
    bulkDeleteMutation.mutate({ actionIds });
  };

  const handleBulkReschedule = async (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    notifications.show({
      id: "bulk-reschedule-actions",
      title: "Rescheduling...",
      message: `Updating ${actionIds.length} action${actionIds.length !== 1 ? "s" : ""}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkRescheduleMutation.mutateAsync({
        actionIds,
        dueDate: date,
      });

      notifications.update({
        id: "bulk-reschedule-actions",
        title: "Rescheduled",
        message: `Successfully updated ${result.count} action${result.count !== 1 ? "s" : ""}`,
        loading: false,
        autoClose: 3000,
        color: "green",
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      notifications.update({
        id: "bulk-reschedule-actions",
        title: "Error",
        message: `Failed to reschedule: ${errMsg}`,
        loading: false,
        autoClose: 5000,
        color: "red",
      });
    }
  };

  const handleBulkAssignProject = async (projectId: string, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    notifications.show({
      id: "bulk-assign-project-actions",
      title: "Assigning to project...",
      message: `Updating ${actionIds.length} action${actionIds.length !== 1 ? "s" : ""}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkAssignProjectMutation.mutateAsync({
        actionIds,
        projectId,
      });

      notifications.update({
        id: "bulk-assign-project-actions",
        title: "Project Assigned",
        message: `Successfully assigned ${result.count} action${result.count !== 1 ? "s" : ""}`,
        loading: false,
        autoClose: 3000,
        color: "green",
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      notifications.update({
        id: "bulk-assign-project-actions",
        title: "Error",
        message: `Failed to assign project: ${errMsg}`,
        loading: false,
        autoClose: 5000,
        color: "red",
      });
    }
  };

  // Project filter options
  const projectOptions = projects?.map(p => ({
    value: p.id,
    label: p.name,
  })) ?? [];

  // Handle filter changes
  const handleProjectFilter = (projectIds: string[]) => {
    setLocalFilters(prev => ({
      ...prev,
      projectIds: projectIds.length > 0 ? projectIds : undefined,
    }));
  };

  const handleIncludeCompleted = (checked: boolean) => {
    setLocalFilters(prev => ({
      ...prev,
      includeCompleted: checked,
    }));
  };

  const clearFilters = () => {
    setLocalFilters({});
  };

  const hasActiveFilters =
    (localFilters.projectIds?.length ?? 0) > 0 ||
    localFilters.includeCompleted;

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} />
        <Group gap="md" wrap="nowrap">
          <Skeleton height={400} width={280} />
          <Skeleton height={400} width={280} />
          <Skeleton height={400} width={280} />
          <Skeleton height={400} width={280} />
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Header with view controls */}
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Title order={3} className="text-text-primary">
            {viewConfig?.name ?? "All Items"}
          </Title>
          {hasActiveFilters && (
            <Badge size="sm" variant="light" color="blue">
              Filtered
            </Badge>
          )}
        </Group>

        <Group gap="xs">
          <Tooltip label={showFilters ? "Hide filters" : "Show filters"}>
            <ActionIcon
              variant={showFilters ? "filled" : "subtle"}
              onClick={() => setShowFilters(!showFilters)}
              color={hasActiveFilters ? "blue" : "gray"}
            >
              <IconFilter size={18} />
            </ActionIcon>
          </Tooltip>

          <SegmentedControl
            size="xs"
            value={viewType}
            onChange={(value) => setViewType(value as ViewType)}
            data={[
              {
                value: "KANBAN",
                label: (
                  <Tooltip label="Kanban view">
                    <IconLayoutKanban size={16} />
                  </Tooltip>
                ),
              },
              {
                value: "LIST",
                label: (
                  <Tooltip label="List view">
                    <IconList size={16} />
                  </Tooltip>
                ),
              },
            ]}
          />
        </Group>
      </Group>

      {/* Filter panel */}
      {showFilters && (
        <Paper p="md" className="bg-surface-secondary border border-border-primary">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500} className="text-text-primary">
                Filters
              </Text>
              {hasActiveFilters && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={clearFilters}
                  color="gray"
                >
                  <IconX size={14} />
                </ActionIcon>
              )}
            </Group>

            <Group gap="md" wrap="wrap">
              <MultiSelect
                label="Projects"
                placeholder="All projects"
                data={projectOptions}
                value={localFilters.projectIds ?? []}
                onChange={handleProjectFilter}
                clearable
                searchable
                size="sm"
                w={250}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <Checkbox
                label="Include completed"
                checked={localFilters.includeCompleted ?? false}
                onChange={(e) => handleIncludeCompleted(e.currentTarget.checked)}
                size="sm"
                className="mt-6"
              />
            </Group>
          </Stack>
        </Paper>
      )}

      {/* View content */}
      {viewType === "KANBAN" && (
        <WorkspaceKanbanBoard
          workspaceId={workspaceId}
          actions={actions ?? []}
          groupBy={groupBy}
        />
      )}

      {viewType === "LIST" && (
        <ActionList
          viewName="actions"
          actions={(actions ?? []) as any}
          showProject={true}
          enableBulkEditForAll={true}
          onAllBulkDelete={handleBulkDelete}
          onAllBulkReschedule={handleBulkReschedule}
          onAllBulkAssignProject={handleBulkAssignProject}
          isLoading={isLoading}
        />
      )}
    </Stack>
  );
}
