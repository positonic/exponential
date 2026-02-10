"use client";

import { useCallback, useState } from "react";
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
  Select,
  Button,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconLayoutKanban,
  IconList,
  IconFilter,
  IconX,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { WorkspaceKanbanBoard } from "./WorkspaceKanbanBoard";
import { ActionList } from "../ActionList";
import { ViewSwitcher } from "./ViewSwitcher";
import { SaveViewModal } from "./SaveViewModal";
import { DEFAULT_VIEW_CONFIG } from "~/types/view";
import type { ViewFilters, ViewType, ViewGroupBy } from "~/types/view";
import type { ViewConfig } from "./ViewSwitcher";
import { PRIORITY_OPTIONS } from "~/types/action";

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const GROUP_BY_OPTIONS = [
  { value: "STATUS", label: "Status" },
  { value: "PROJECT", label: "Project" },
  { value: "LIST", label: "List" },
  { value: "PRIORITY", label: "Priority" },
];

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
  const [activeView, setActiveView] = useState<ViewConfig>({
    id: viewConfig?.id ?? DEFAULT_VIEW_CONFIG.id,
    name: viewConfig?.name ?? DEFAULT_VIEW_CONFIG.name,
    viewType: viewConfig?.viewType ?? DEFAULT_VIEW_CONFIG.viewType,
    groupBy: viewConfig?.groupBy ?? DEFAULT_VIEW_CONFIG.groupBy,
    filters: viewConfig?.filters ?? DEFAULT_VIEW_CONFIG.filters,
    isVirtual: viewConfig?.isVirtual ?? true,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<ViewFilters>(activeView.filters);
  const [viewType, setViewType] = useState<ViewType>(activeView.viewType);
  const [groupBy, setGroupBy] = useState<ViewGroupBy>(activeView.groupBy);
  const [saveModalOpened, { open: openSaveModal, close: closeSaveModal }] = useDisclosure(false);
  const utils = api.useUtils();

  // Fetch projects for filter dropdown
  const { data: projects } = api.project.getAll.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch lists for filter dropdown
  const { data: lists } = api.list.list.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch tags for filter dropdown
  const { data: tags } = api.tag.list.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch actions with filters
  const { data: actions, isLoading } = api.view.getViewActions.useQuery({
    workspaceId,
    viewId: activeView.isVirtual ? undefined : activeView.id,
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

  // Filter options
  const projectOptions = projects?.map(p => ({
    value: p.id,
    label: p.name,
  })) ?? [];

  const listOptions = lists?.map(l => ({
    value: l.id,
    label: `${l.name}${l.listType === "SPRINT" ? " (Sprint)" : ""}`,
  })) ?? [];

  const tagOptions = tags?.allTags?.map(t => ({
    value: t.id,
    label: t.name,
  })) ?? [];

  const priorityOptions = PRIORITY_OPTIONS.map(p => ({
    value: p,
    label: p,
  }));

  // Handle filter changes
  const updateFilter = useCallback(<K extends keyof ViewFilters>(
    key: K,
    value: ViewFilters[K],
  ) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleArrayFilter = useCallback((key: keyof ViewFilters, values: string[]) => {
    updateFilter(key, values.length > 0 ? values : undefined);
  }, [updateFilter]);

  const clearFilters = () => {
    setLocalFilters({});
  };

  const handleViewChange = useCallback((view: ViewConfig) => {
    setActiveView(view);
    setLocalFilters(view.filters);
    setViewType(view.viewType);
    setGroupBy(view.groupBy);
  }, []);

  const handleViewSaved = useCallback((savedView: { id: string; name: string; viewType: string; groupBy: string; filters: unknown }) => {
    void utils.view.list.invalidate();
    setActiveView({
      id: savedView.id,
      name: savedView.name,
      viewType: savedView.viewType as ViewType,
      groupBy: savedView.groupBy as ViewGroupBy,
      filters: (savedView.filters as ViewFilters) ?? {},
    });
  }, [utils.view.list]);

  const hasActiveFilters =
    (localFilters.projectIds?.length ?? 0) > 0 ||
    (localFilters.statuses?.length ?? 0) > 0 ||
    (localFilters.priorities?.length ?? 0) > 0 ||
    (localFilters.listIds?.length ?? 0) > 0 ||
    (localFilters.tagIds?.length ?? 0) > 0 ||
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
      {/* View switcher */}
      <ViewSwitcher
        workspaceId={workspaceId}
        activeViewId={activeView.id}
        onViewChange={handleViewChange}
      />

      {/* Header with view controls */}
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Title order={3} className="text-text-primary">
            {activeView.name}
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

          {viewType === "KANBAN" && (
            <Select
              size="xs"
              value={groupBy}
              onChange={(value) => { if (value) setGroupBy(value as ViewGroupBy); }}
              data={GROUP_BY_OPTIONS}
              w={120}
              styles={{
                input: { backgroundColor: 'var(--surface-primary)' },
              }}
            />
          )}

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
              <Group gap="xs">
                {hasActiveFilters && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconDeviceFloppy size={14} />}
                    onClick={openSaveModal}
                  >
                    Save as View
                  </Button>
                )}
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
            </Group>

            <Group gap="md" wrap="wrap">
              <MultiSelect
                label="Projects"
                placeholder="All projects"
                data={projectOptions}
                value={localFilters.projectIds ?? []}
                onChange={(values) => handleArrayFilter("projectIds", values)}
                clearable
                searchable
                size="sm"
                w={200}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <MultiSelect
                label="Status"
                placeholder="All statuses"
                data={STATUS_OPTIONS}
                value={(localFilters.statuses as string[] | undefined) ?? []}
                onChange={(values) => handleArrayFilter("statuses", values)}
                clearable
                searchable
                size="sm"
                w={200}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <MultiSelect
                label="Priority"
                placeholder="All priorities"
                data={priorityOptions}
                value={localFilters.priorities ?? []}
                onChange={(values) => handleArrayFilter("priorities", values)}
                clearable
                searchable
                size="sm"
                w={200}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <MultiSelect
                label="Lists"
                placeholder="All lists"
                data={listOptions}
                value={localFilters.listIds ?? []}
                onChange={(values) => handleArrayFilter("listIds", values)}
                clearable
                searchable
                size="sm"
                w={200}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <MultiSelect
                label="Tags"
                placeholder="All tags"
                data={tagOptions}
                value={localFilters.tagIds ?? []}
                onChange={(values) => handleArrayFilter("tagIds", values)}
                clearable
                searchable
                size="sm"
                w={200}
                styles={{
                  input: { backgroundColor: 'var(--surface-primary)' },
                }}
              />

              <Checkbox
                label="Include completed"
                checked={localFilters.includeCompleted ?? false}
                onChange={(e) => updateFilter("includeCompleted", e.currentTarget.checked)}
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

      {/* Save as View modal */}
      <SaveViewModal
        opened={saveModalOpened}
        onClose={closeSaveModal}
        workspaceId={workspaceId}
        currentFilters={localFilters}
        currentViewType={viewType}
        currentGroupBy={groupBy}
        onSaved={handleViewSaved}
      />
    </Stack>
  );
}
