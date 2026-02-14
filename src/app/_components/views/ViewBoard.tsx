"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  SimpleGrid,
  Collapse,
  Loader,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconLayoutKanban,
  IconList,
  IconFilter,
  IconX,
  IconDeviceFloppy,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { WorkspaceKanbanBoard } from "./WorkspaceKanbanBoard";
import { ActionList } from "../ActionList";
import { EditActionModal } from "../EditActionModal";
import { ViewSwitcher } from "./ViewSwitcher";
import { SaveViewModal } from "./SaveViewModal";
import { CreateListModal } from "./CreateListModal";
import { ActiveFilters } from "./ActiveFilters";
import { useViewSearchParams } from "./useViewSearchParams";
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
  // Deep linking props
  deepLinkActionId?: string | null;
  onActionOpen?: (id: string) => void;
  onActionClose?: () => void;
}

export function ViewBoard({ workspaceId, viewConfig, deepLinkActionId, onActionOpen, onActionClose }: ViewBoardProps) {
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
  const [createListOpened, { open: openCreateList, close: closeCreateList }] = useDisclosure(false);
  const [kanbanDeepLinkOpen, setKanbanDeepLinkOpen] = useState(false);
  const kanbanDeepLinkHandled = useRef(false);
  const utils = api.useUtils();

  // URL sync for linkable views
  const { viewSlugFromUrl, setViewSlug } = useViewSearchParams();
  const hasInitializedFromUrl = useRef(false);

  // Fetch view from URL slug on initial load
  const {
    data: urlView,
    isLoading: urlViewLoading,
    isError: urlViewError,
  } = api.view.getBySlug.useQuery(
    { workspaceId, slug: viewSlugFromUrl! },
    { enabled: !!viewSlugFromUrl && !hasInitializedFromUrl.current, retry: false },
  );

  // Sync URL view into state on first load
  useEffect(() => {
    if (hasInitializedFromUrl.current) return;
    if (!viewSlugFromUrl) {
      hasInitializedFromUrl.current = true;
      return;
    }
    if (urlViewLoading) return;

    if (urlViewError || !urlView) {
      setViewSlug(null);
      hasInitializedFromUrl.current = true;
      return;
    }

    setActiveView({
      id: urlView.id,
      name: urlView.name,
      slug: urlView.slug,
      viewType: urlView.viewType as ViewType,
      groupBy: urlView.groupBy as ViewGroupBy,
      filters: (urlView.filters as ViewFilters) ?? {},
      isVirtual: false,
    });
    setLocalFilters((urlView.filters as ViewFilters) ?? {});
    setViewType(urlView.viewType as ViewType);
    setGroupBy(urlView.groupBy as ViewGroupBy);
    hasInitializedFromUrl.current = true;
  }, [urlView, urlViewLoading, urlViewError, viewSlugFromUrl, setViewSlug]);

  // Deep link: fetch action by ID for kanban view (list view handles it internally)
  const { data: kanbanDeepLinkedAction } = api.action.getById.useQuery(
    { id: deepLinkActionId! },
    { enabled: !!deepLinkActionId && viewType === "KANBAN" && !kanbanDeepLinkHandled.current },
  );

  // Auto-open modal in kanban view when deep link action is fetched
  useEffect(() => {
    if (!deepLinkActionId || viewType !== "KANBAN" || kanbanDeepLinkHandled.current) return;
    if (kanbanDeepLinkedAction) {
      setKanbanDeepLinkOpen(true);
      kanbanDeepLinkHandled.current = true;
    }
  }, [deepLinkActionId, viewType, kanbanDeepLinkedAction]);

  // Reset kanban deep link tracking when action ID changes
  useEffect(() => {
    kanbanDeepLinkHandled.current = false;
    setKanbanDeepLinkOpen(false);
  }, [deepLinkActionId]);

  // Fetch projects for filter dropdown
  const { data: projects, isLoading: projectsLoading } = api.project.getAll.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch lists for filter dropdown
  const { data: lists, isLoading: listsLoading } = api.list.list.useQuery(
    { workspaceId },
    { enabled: showFilters }
  );

  // Fetch tags for filter dropdown
  const { data: tags, isLoading: tagsLoading } = api.tag.list.useQuery(
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

  const removeFilter = useCallback((filterType: string, value?: string) => {
    setLocalFilters(prev => {
      const newFilters = { ...prev };
      
      if (filterType === "includeCompleted") {
        delete newFilters.includeCompleted;
      } else if (value) {
        const arrayKey = filterType as keyof Pick<ViewFilters, "projectIds" | "statuses" | "priorities" | "listIds" | "tagIds">;
        const currentValues = (newFilters[arrayKey] as string[]) ?? [];
        const updatedValues = currentValues.filter(v => v !== value);
        Object.assign(newFilters, { [arrayKey]: updatedValues.length > 0 ? updatedValues : undefined });
      }
      
      return newFilters;
    });
  }, []);

  const clearFilters = () => {
    setLocalFilters({});
  };

  const handleViewChange = useCallback((view: ViewConfig) => {
    setActiveView(view);
    setLocalFilters(view.filters);
    setViewType(view.viewType);
    setGroupBy(view.groupBy);
    setViewSlug(view.isVirtual ? null : (view.slug ?? null));
  }, [setViewSlug]);

  const handleViewSaved = useCallback((savedView: { id: string; name: string; slug: string; viewType: string; groupBy: string; filters: unknown }) => {
    void utils.view.list.invalidate();
    setActiveView({
      id: savedView.id,
      name: savedView.name,
      slug: savedView.slug,
      viewType: savedView.viewType as ViewType,
      groupBy: savedView.groupBy as ViewGroupBy,
      filters: (savedView.filters as ViewFilters) ?? {},
      isVirtual: false,
    });
    setViewSlug(savedView.slug);
  }, [utils.view.list, setViewSlug]);

  const hasActiveFilters =
    (localFilters.projectIds?.length ?? 0) > 0 ||
    (localFilters.statuses?.length ?? 0) > 0 ||
    (localFilters.priorities?.length ?? 0) > 0 ||
    (localFilters.listIds?.length ?? 0) > 0 ||
    (localFilters.tagIds?.length ?? 0) > 0 ||
    localFilters.includeCompleted;

  const filtersLoading = projectsLoading || listsLoading || tagsLoading;

  if (isLoading || (viewSlugFromUrl && urlViewLoading)) {
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
              aria-label={showFilters ? "Hide filters" : "Show filters"}
              aria-expanded={showFilters}
              aria-controls="filter-panel"
              className="focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
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
              classNames={{
                input: "bg-surface-primary",
              }}
              aria-label="Group by"
            />
          )}

          <SegmentedControl
            size="xs"
            value={viewType}
            onChange={(value) => setViewType(value as ViewType)}
            aria-label="View type"
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

      {/* Filter panel with smooth transition */}
      <Collapse in={showFilters} transitionDuration={200} transitionTimingFunction="ease">
        <Paper 
          p="md" 
          className="bg-surface-secondary border border-border-primary"
          id="filter-panel"
          role="region"
          aria-label="Filters"
        >
          <Stack gap="md">
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
                    disabled={!hasActiveFilters}
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
                    aria-label="Clear all filters"
                    className="focus:outline-2 focus:outline-offset-2 focus:outline-gray-500"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Group>

            {/* Grid layout for filters */}
            <SimpleGrid 
              cols={{ base: 1, sm: 2, md: 3, lg: 4 }}
              spacing="md"
            >
              {/* Projects filter */}
              <Stack gap={4}>
                <Text size="sm" fw={500} className="text-text-primary" component="label" htmlFor="filter-projects">
                  Projects
                </Text>
                <MultiSelect
                  id="filter-projects"
                  placeholder="All projects"
                  data={projectOptions}
                  value={localFilters.projectIds ?? []}
                  onChange={(values) => handleArrayFilter("projectIds", values)}
                  clearable
                  searchable
                  size="sm"
                  classNames={{
                    input: "bg-surface-primary",
                  }}
                  disabled={filtersLoading}
                  rightSection={filtersLoading ? <Loader size="xs" /> : undefined}
                  aria-label="Filter by projects"
                />
              </Stack>

              {/* Status filter */}
              <Stack gap={4}>
                <Text size="sm" fw={500} className="text-text-primary" component="label" htmlFor="filter-status">
                  Status
                </Text>
                <MultiSelect
                  id="filter-status"
                  placeholder="All statuses"
                  data={STATUS_OPTIONS}
                  value={(localFilters.statuses as string[] | undefined) ?? []}
                  onChange={(values) => handleArrayFilter("statuses", values)}
                  clearable
                  searchable
                  size="sm"
                  classNames={{
                    input: "bg-surface-primary",
                  }}
                  aria-label="Filter by status"
                />
              </Stack>

              {/* Priority filter */}
              <Stack gap={4}>
                <Text size="sm" fw={500} className="text-text-primary" component="label" htmlFor="filter-priority">
                  Priority
                </Text>
                <MultiSelect
                  id="filter-priority"
                  placeholder="All priorities"
                  data={priorityOptions}
                  value={localFilters.priorities ?? []}
                  onChange={(values) => handleArrayFilter("priorities", values)}
                  clearable
                  searchable
                  size="sm"
                  classNames={{
                    input: "bg-surface-primary",
                  }}
                  aria-label="Filter by priority"
                />
              </Stack>

              {/* Lists filter */}
              <Stack gap={4}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={500} className="text-text-primary" component="label" htmlFor="filter-lists">
                    Lists
                  </Text>
                  <Tooltip label="Create list">
                    <ActionIcon
                      variant="light"
                      size="sm"
                      onClick={openCreateList}
                      aria-label="Create new list"
                      className="focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <MultiSelect
                  id="filter-lists"
                  placeholder="All lists"
                  data={listOptions}
                  value={localFilters.listIds ?? []}
                  onChange={(values) => handleArrayFilter("listIds", values)}
                  clearable
                  searchable
                  size="sm"
                  classNames={{
                    input: "bg-surface-primary",
                  }}
                  disabled={filtersLoading}
                  rightSection={filtersLoading ? <Loader size="xs" /> : undefined}
                  aria-label="Filter by lists"
                />
              </Stack>

              {/* Tags filter */}
              <Stack gap={4}>
                <Text size="sm" fw={500} className="text-text-primary" component="label" htmlFor="filter-tags">
                  Tags
                </Text>
                <MultiSelect
                  id="filter-tags"
                  placeholder="All tags"
                  data={tagOptions}
                  value={localFilters.tagIds ?? []}
                  onChange={(values) => handleArrayFilter("tagIds", values)}
                  clearable
                  searchable
                  size="sm"
                  classNames={{
                    input: "bg-surface-primary",
                  }}
                  disabled={filtersLoading}
                  rightSection={filtersLoading ? <Loader size="xs" /> : undefined}
                  aria-label="Filter by tags"
                />
              </Stack>

              {/* Include completed checkbox */}
              <Stack gap={4} justify="flex-end">
                <Checkbox
                  id="filter-completed"
                  label="Include completed"
                  checked={localFilters.includeCompleted ?? false}
                  onChange={(e) => updateFilter("includeCompleted", e.currentTarget.checked)}
                  size="sm"
                  aria-label="Include completed actions"
                />
              </Stack>
            </SimpleGrid>

            {/* Active filters display */}
            <ActiveFilters
              filters={localFilters}
              projects={projects ?? []}
              lists={lists ?? []}
              tags={tags?.allTags ?? []}
              onRemoveFilter={removeFilter}
            />
          </Stack>
        </Paper>
      </Collapse>

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
          deepLinkActionId={deepLinkActionId}
          onActionOpen={onActionOpen}
          onActionClose={onActionClose}
        />
      )}

      {/* Create List modal */}
      <CreateListModal
        opened={createListOpened}
        onClose={closeCreateList}
        workspaceId={workspaceId}
        onCreated={() => void utils.list.list.invalidate()}
      />

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

      {/* Deep link modal for kanban view */}
      {viewType === "KANBAN" && kanbanDeepLinkedAction && (
        <EditActionModal
          action={kanbanDeepLinkedAction}
          opened={kanbanDeepLinkOpen}
          onClose={() => {
            setKanbanDeepLinkOpen(false);
            onActionClose?.();
          }}
        />
      )}
    </Stack>
  );
}
