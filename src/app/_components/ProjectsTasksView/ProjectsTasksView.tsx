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
  project: Project | null;
  assignees: Assignee[];
  tags: ActionTag[];
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
}

export function ProjectsTasksView({ workspaceId }: ProjectsTasksViewProps) {
  // Track expanded projects - Set of project IDs
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  // Track if "No project" section is expanded
  const [noProjectExpanded, setNoProjectExpanded] = useState(true);
  // Track currently editing action (for modal)
  const [editingAction, setEditingAction] = useState<ActionData | null>(null);
  // Track if showing completed tasks
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const utils = api.useUtils();

  // Fetch data
  const { data, isLoading, error } = api.project.getProjectsWithActions.useQuery({
    workspaceId,
    includeCompleted,
  });

  // Update action status mutation
  const updateStatusMutation = api.action.updateStatus.useMutation({
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

  if (error) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-red-500">Error loading data: {error.message}</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-6">
      {/* Header */}
      <Group justify="space-between" mb="lg">
        <div>
          <Text size="xl" fw={600} className="text-text-primary">
            Projects & Tasks
          </Text>
          <Text size="sm" className="text-text-secondary">
            {totalProjects} projects, {totalTasks} tasks
          </Text>
        </div>
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
            {data?.projects.map((project: ProjectData) => (
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

            {/* No project section */}
            {data?.noProjectActions && data.noProjectActions.length > 0 && (
              <div>
                <NoProjectSection
                  taskCount={data.noProjectActions.length}
                  isExpanded={noProjectExpanded}
                  onToggle={() => setNoProjectExpanded(!noProjectExpanded)}
                  onAddTask={() => {
                    // Trigger is handled by CreateActionModal wrapper
                  }}
                />

                {/* Tasks without project (when expanded) */}
                {noProjectExpanded &&
                  data.noProjectActions.map((action: ActionData, index: number) => (
                    <TaskRow
                      key={action.id}
                      action={{ ...action, project: null }}
                      isLastChild={index === data.noProjectActions.length - 1}
                      onRowClick={() => handleRowClick({ ...action, project: null })}
                      onCheckboxChange={(checked) => handleCheckboxChange(action.id, checked)}
                    />
                  ))}
              </div>
            )}

            {/* Empty state */}
            {data?.projects.length === 0 && data?.noProjectActions.length === 0 && (
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
    </Container>
  );
}
