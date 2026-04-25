'use client';

import { useState, useMemo } from 'react';
import { Container, Group, Button, Text, Skeleton, Switch, Stack } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconPlus } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { TableHeader } from './TableHeader';
import { ProjectRow } from './ProjectRow';
import { TaskRow } from './TaskRow';
import { NoProjectSection } from './NoProjectSection';
import { EditActionModal } from '../EditActionModal';
import { CreateActionModal } from '../CreateActionModal';
import { ProjectViewLayout } from '~/app/_components/ProjectViewLayout';
import { ToolbarActions, ProjectSortMenu, useProjectSort } from '~/app/_components/toolbar';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Assignee {
  user: User;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ActionTag {
  tag: Tag;
}

interface Project {
  id: string;
  name: string;
  workspaceId?: string | null;
}

interface ActionData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  completedAt: Date | null;
  duration: number | null;
  timeSpentMins: number;
  isRecurring: boolean;
  projectId: string | null;
  workspaceId?: string | null;
  project?: Project | null;
  assignees: Assignee[];
  tags: ActionTag[];
  [key: string]: unknown;
}

interface ProjectData {
  id: string;
  name: string;
  priority: string;
  actions: ActionData[];
  _count: { actions: number };
}

interface ProjectsTasksViewProps {
  workspaceId?: string;
  goalId?: number;
  standalone?: boolean;
}

export function ProjectsTasksView({ workspaceId, goalId, standalone }: ProjectsTasksViewProps) {
  // Track expanded projects - Set of project IDs
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  // Track if "No project" section is expanded
  const [noProjectExpanded, setNoProjectExpanded] = useState(true);
  // Track currently editing action (for modal)
  const [editingAction, setEditingAction] = useState<ActionData | null>(null);
  // Track if showing completed tasks
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { sortState, setSortField, clearSort, sortProjects } = useProjectSort();

  const utils = api.useUtils();

  // Fetch data
  const { data, isLoading, error } = api.project.getProjectsWithActions.useQuery({
    workspaceId,
    includeCompleted,
    ...(goalId !== undefined ? { goalId } : {}),
  });

  // Update action status mutation
  const updateStatusMutation = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.project.getProjectsWithActions.invalidate();
      await utils.action.getAll.invalidate();
    },
  });

  // Expand all projects
  const expandAll = () => {
    const allIds = data?.projects.map((p) => p.id) ?? [];
    setExpandedProjects(new Set(allIds));
    setNoProjectExpanded(true);
  };

  // Collapse all projects
  const collapseAll = () => {
    setExpandedProjects(new Set());
    setNoProjectExpanded(false);
  };

  // Toggle a specific project
  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Handle checkbox change for task completion
  const handleCheckboxChange = (actionId: string, checked: boolean) => {
    updateStatusMutation.mutate({
      id: actionId,
      status: checked ? 'COMPLETED' : 'ACTIVE',
    });
  };

  // Handle row click to edit action
  const handleRowClick = (action: ActionData) => {
    setEditingAction(action);
  };

  // Calculate totals
  const totalProjects = data?.projects.length ?? 0;
  const totalTasks = useMemo(() => {
    const projectTasks = data?.projects.reduce((acc, p) => acc + p.actions.length, 0) ?? 0;
    const noProjectTasks = data?.noProjectActions.length ?? 0;
    return projectTasks + noProjectTasks;
  }, [data]);

  const filteredProjects = useMemo(() => {
    const projects = searchQuery.trim()
      ? (data?.projects ?? []).filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.actions.some((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : data?.projects ?? [];
    return sortProjects(projects);
  }, [data?.projects, searchQuery, sortProjects]);

  const filteredNoProjectActions = useMemo(() => {
    if (!searchQuery.trim()) return data?.noProjectActions ?? [];
    const q = searchQuery.toLowerCase();
    return (data?.noProjectActions ?? []).filter((a) =>
      a.name.toLowerCase().includes(q)
    );
  }, [data?.noProjectActions, searchQuery]);

  if (error) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-red-500">Error loading data: {error.message}</Text>
      </Container>
    );
  }

  const innerContent = (
    <>
      {/* Header controls */}
      <Group justify="flex-end" mb="lg">
        <Group gap="sm">
          <Switch
            label="Show completed"
            checked={includeCompleted}
            onChange={(event) => setIncludeCompleted(event.currentTarget.checked)}
            size="sm"
          />
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconChevronDown size={14} />}
            onClick={expandAll}
          >
            Expand all
          </Button>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconChevronUp size={14} />}
            onClick={collapseAll}
          >
            Collapse all
          </Button>
          <CreateActionModal viewName="projects-tasks">
            <Button
              variant="filled"
              size="sm"
              leftSection={<IconPlus size={16} />}
            >
              Add task
            </Button>
          </CreateActionModal>
        </Group>
      </Group>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary">
        {/* Column headers */}
        <TableHeader />

        {/* Content */}
        {isLoading ? (
          <Stack gap={0}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-3 py-3 border-b border-border-primary">
                <Skeleton height={24} />
              </div>
            ))}
          </Stack>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-250px)]">
            {/* Projects */}
            {filteredProjects.map((project: ProjectData) => (
              <div key={project.id}>
                {/* Project row */}
                <ProjectRow
                  project={project}
                  taskCount={project.actions.length}
                  isExpanded={expandedProjects.has(project.id)}
                  onToggle={() => toggleProject(project.id)}
                  onAddTask={() => {
                    // Trigger is handled by CreateActionModal wrapper
                  }}
                />

                {/* Tasks under project (when expanded) */}
                {expandedProjects.has(project.id) &&
                  project.actions.map((action: ActionData, index: number) => (
                    <TaskRow
                      key={action.id}
                      action={action}
                      isLastChild={index === project.actions.length - 1}
                      onRowClick={() => handleRowClick(action)}
                      onCheckboxChange={(checked) => handleCheckboxChange(action.id, checked)}
                    />
                  ))}
              </div>
            ))}

            {/* No project section (hidden in goal-scoped mode) */}
            {!goalId && filteredNoProjectActions.length > 0 && (
              <div>
                <NoProjectSection
                  taskCount={filteredNoProjectActions.length}
                  isExpanded={noProjectExpanded}
                  onToggle={() => setNoProjectExpanded(!noProjectExpanded)}
                  onAddTask={() => {
                    // Trigger is handled by CreateActionModal wrapper
                  }}
                />

                {/* Tasks without project (when expanded) */}
                {noProjectExpanded &&
                  filteredNoProjectActions.map((action: ActionData, index: number) => (
                    <TaskRow
                      key={action.id}
                      action={{ ...action, project: null }}
                      isLastChild={index === filteredNoProjectActions.length - 1}
                      onRowClick={() => handleRowClick({ ...action, project: null })}
                      onCheckboxChange={(checked) => handleCheckboxChange(action.id, checked)}
                    />
                  ))}
              </div>
            )}

            {/* Empty state */}
            {data?.projects.length === 0 && (goalId ?? data?.noProjectActions.length === 0) && (
              <div className="px-6 py-12 text-center">
                <Text className="text-text-muted">No projects or tasks found</Text>
                <Text size="sm" className="text-text-muted mt-2">
                  Create a project or task to get started
                </Text>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Action Modal */}
      <EditActionModal
        action={editingAction}
        opened={!!editingAction}
        onClose={() => setEditingAction(null)}
        onSuccess={() => {
          void utils.project.getProjectsWithActions.invalidate();
        }}
      />
    </>
  );

  if (standalone) return innerContent;

  return (
    <ProjectViewLayout
      activeView="projects-tasks"
      title="Projects & Tasks"
      description={`${totalProjects} projects, ${totalTasks} tasks`}
      tabsRightSection={
        <ToolbarActions
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search projects & tasks..."
          extra={
            <ProjectSortMenu
              sortState={sortState}
              onSortChange={setSortField}
              onClearSort={clearSort}
            />
          }
        />
      }
    >
      {innerContent}
    </ProjectViewLayout>
  );
}
