"use client";

import { useState, useMemo } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { Select, Card, Text, Group, Badge, Button, Stack, Alert, Modal, Avatar, Tooltip, Collapse } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useDisclosure } from "@mantine/hooks";
import { slugify } from "~/utils/slugify";
import { getAvatarColor, getInitial } from "~/utils/avatarColors";
import { IconEdit, IconTrash, IconBrandNotion, IconPlus, IconCircleDot, IconFlag, IconUser } from "@tabler/icons-react";
import Link from "next/link";
import { calculateProjectHealth, HealthRing, HealthIndicatorIcons } from "~/app/_components/home/ProjectHealth";
import { FilterBar } from "~/app/_components/filters";
import { ToolbarActions } from "~/app/_components/toolbar";
import { hasActiveFilters } from "~/types/filter";
import type { FilterBarConfig, FilterState, FilterMember } from "~/types/filter";
import { ProjectViewLayout } from "~/app/_components/ProjectViewLayout";

type Project = RouterOutputs["project"]["getAll"][0];

const PROJECT_FILTER_CONFIG: FilterBarConfig = {
  fields: [
    {
      key: "status",
      label: "Status",
      type: "multi-select",
      icon: IconCircleDot,
      badgeColor: "cyan",
      options: [
        { value: "ACTIVE", label: "Active" },
        { value: "ON_HOLD", label: "On Hold" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "multi-select",
      icon: IconFlag,
      badgeColor: "grape",
      options: [
        { value: "HIGH", label: "High" },
        { value: "MEDIUM", label: "Medium" },
        { value: "LOW", label: "Low" },
        { value: "NONE", label: "None" },
      ],
    },
    {
      key: "driId",
      label: "DRI",
      type: "user",
      icon: IconUser,
      badgeColor: "blue",
    },
  ],
};

function ProjectList({ projects, workspaceSlug }: { projects: Project[]; workspaceSlug?: string }) {
  const utils = api.useUtils();
  
  const deleteProject = api.project.delete.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
    },
  });

  const updateProject = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
    },
  });

  const handleDeleteProject = (project: Project) => {
    modals.openConfirmModal({
      title: 'Delete Project',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteProject.mutate({ id: project.id }),
    });
  };

  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "green";
      case "ON_HOLD":
        return "yellow";
      case "COMPLETED":
        return "blue";
      case "CANCELLED":
        return "gray";
      default:
        return "gray";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "red";
      case "MEDIUM":
        return "orange";
      case "LOW":
        return "blue";
      case "NONE":
      default:
        return "gray";
    }
  };

  const priorityOptions = [
    { value: "HIGH", label: "High" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
    { value: "NONE", label: "None" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Health</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Priority</th>
            <th className="px-4 py-2 text-left">DRI</th>
            <th className="px-4 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr 
              key={project.id} 
              className="border-b border-gray-700 hover:bg-white/5"
            >
              <td className="px-4 py-2">
                <Group gap="xs" wrap="nowrap">
                  <Link
                    href={workspaceSlug
                      ? `/w/${workspaceSlug}/projects/${slugify(project.name)}-${project.id}`
                      : `/projects/${slugify(project.name)}-${project.id}`}
                    className="text-text-primary hover:text-brand-primary hover:underline"
                  >
                    {project.name}
                  </Link>
                  {project.isPublic && (
                    <Badge variant="light" color="green" size="xs">Public</Badge>
                  )}
                </Group>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                {project.actions ? (() => {
                  const { score, indicators } = calculateProjectHealth(project);
                  return (
                    <div className="flex items-center gap-2">
                      <HealthRing score={score} size={28} />
                      <HealthIndicatorIcons indicators={indicators} />
                    </div>
                  );
                })() : (
                  <span className="text-text-muted">-</span>
                )}
              </td>
              <td className="px-4 py-2">
                <Select
                  value={project.status}
                  onChange={(newStatus) => {
                    if (newStatus) {
                      updateProject.mutate({
                        id: project.id,
                        name: project.name,
                        status: newStatus as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                        priority: project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                      });
                    }
                  }}
                  data={statusOptions}
                  variant="filled"
                  size="xs"
                  styles={{
                    input: {
                      backgroundColor: `var(--mantine-color-${getStatusColor(project.status)}-light)`,
                      color: `var(--mantine-color-${getStatusColor(project.status)}-filled)`,
                      fontWeight: 500,
                      border: 'none',
                    }
                  }}
                />
              </td>
              <td className="px-4 py-2">
                <Select
                  value={project.priority}
                  onChange={(newPriority) => {
                    if (newPriority) {
                      updateProject.mutate({
                        id: project.id,
                        name: project.name,
                        status: project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                        priority: newPriority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                      });
                    }
                  }}
                  data={priorityOptions}
                  variant="filled"
                  size="xs"
                  styles={{
                    input: {
                      backgroundColor: `var(--mantine-color-${getPriorityColor(project.priority)}-light)`,
                      color: project.priority === "NONE" ? 'var(--color-text-secondary)' : `var(--mantine-color-${getPriorityColor(project.priority)}-filled)`,
                      fontWeight: 500,
                      border: 'none',
                    }
                  }}
                />
              </td>
              <td className="px-4 py-2">
                {project.dri ? (
                  <Tooltip label={project.dri.name ?? project.dri.email ?? 'Unknown'} withArrow>
                    <Avatar
                      src={project.dri.image}
                      size="sm"
                      radius="xl"
                      color={getAvatarColor(project.dri.id)}
                    >
                      {getInitial(project.dri.name ?? project.dri.email)}
                    </Avatar>
                  </Tooltip>
                ) : (
                  <span className="text-text-muted">-</span>
                )}
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <CreateProjectModal project={project}>
                    <button
                      className="text-gray-400 hover:text-blue-500"
                      aria-label="Edit project"
                    >
                      <IconEdit className="h-5 w-5" />
                    </button>
                  </CreateProjectModal>
                  <div>
                    <button
                      onClick={() => handleDeleteProject(project)}
                      className="text-gray-400 hover:text-red-500"
                      aria-label="Delete project"
                    >
                      <IconTrash className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Component for displaying Notion project suggestions inside the tab
function NotionSuggestionsContent({
  unlinkedProjects,
  onProjectImported,
}: {
  unlinkedProjects: { notionId: string; title: string; url: string }[];
  onProjectImported: () => void;
}) {
  const [importingId, setImportingId] = useState<string | null>(null);

  if (unlinkedProjects.length === 0) {
    return (
      <Alert
        icon={<IconBrandNotion size={16} />}
        title="All Notion Projects Linked"
        color="green"
        variant="light"
      >
        All projects from your Notion workspace are already linked to local projects.
      </Alert>
    );
  }

  return (
    <div>
      <Text size="sm" c="dimmed" mb="md">
        These projects exist in your Notion workspace but are not linked to any local project.
        Import them to start syncing actions.
      </Text>

      <Stack gap="sm">
        {unlinkedProjects.map((notionProject) => (
          <Card key={notionProject.notionId} withBorder p="sm" radius="sm">
            <Group justify="space-between" wrap="nowrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} truncate>
                  {notionProject.title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {notionProject.url}
                </Text>
              </div>
              <CreateProjectModal
                prefillName={notionProject.title}
                prefillNotionProjectId={notionProject.notionId}
                onClose={() => {
                  setImportingId(null);
                  onProjectImported();
                }}
              >
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setImportingId(notionProject.notionId)}
                  loading={importingId === notionProject.notionId}
                >
                  Import
                </Button>
              </CreateProjectModal>
            </Group>
          </Card>
        ))}
      </Stack>
    </div>
  );
}

interface ProjectsProps {
  showAllWorkspaces?: boolean;
}

export function Projects({ showAllWorkspaces = false }: ProjectsProps) {
  const [projectName, setProjectName] = useState("");
  const [, setStatus] = useState("ACTIVE");
  const [, setPriority] = useState("NONE");
  const [, setProgress] = useState(0);
  const [, setSlug] = useState("");
  const [, setReviewDate] = useState("");
  const [, setNextActionDate] = useState("");
  const [notionModalOpened, { open: openNotionModal, close: closeNotionModal }] = useDisclosure(false);

  const { workspaceId, workspace } = useWorkspace();
  const utils = api.useUtils();

  // When showAllWorkspaces is true, don't filter by workspace
  const effectiveWorkspaceId = showAllWorkspaces ? undefined : (workspaceId ?? undefined);

  const projects = api.project.getAll.useQuery(
    { workspaceId: effectiveWorkspaceId, include: { actions: true } },
    { enabled: true }
  );

  // Get Notion workflows to find the first one for querying unlinked projects
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const notionWorkflows = workflows.filter(w => w.provider === 'notion');
  const firstNotionWorkflowId = notionWorkflows[0]?.id;

  // Query for unlinked Notion projects
  const { data: unlinkedProjectsData, refetch: refetchUnlinkedProjects } = api.workflow.getUnlinkedNotionProjects.useQuery(
    { workflowId: firstNotionWorkflowId ?? '', workspaceId: effectiveWorkspaceId },
    { enabled: !!firstNotionWorkflowId && (showAllWorkspaces || !!workspaceId) }
  );

  const [filters, setFilters] = useState<FilterState>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);

  const workspaceMembers: FilterMember[] = useMemo(() => {
    if (!workspace?.members) return [];
    return workspace.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
    }));
  }, [workspace?.members]);

  const filteredProjects = useMemo(() => {
    const allProjects = projects.data ?? [];
    return allProjects.filter((project) => {
      const statusFilter = filters.status as string[] | undefined;
      if (statusFilter && statusFilter.length > 0) {
        if (!statusFilter.includes(project.status)) return false;
      }

      const priorityFilter = filters.priority as string[] | undefined;
      if (priorityFilter && priorityFilter.length > 0) {
        if (!priorityFilter.includes(project.priority)) return false;
      }

      const driFilter = filters.driId as string[] | undefined;
      if (driFilter && driFilter.length > 0) {
        if (!project.driId || !driFilter.includes(project.driId)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!project.name.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [projects.data, filters, searchQuery]);

  api.project.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setStatus("ACTIVE");
      setPriority("NONE");
      setSlug(slugify(projectName));
      setProgress(0);
      setReviewDate("");
      setNextActionDate("");
      void utils.project.getAll.invalidate();
    },
  });

  const handleProjectImported = () => {
    void refetchUnlinkedProjects();
  };

  const unlinkedCount = unlinkedProjectsData?.unlinkedProjects.length ?? 0;

  return (
    <ProjectViewLayout
      activeView="table"
      title="Projects"
      tabsRightSection={
        <ToolbarActions
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search projects..."
          hasFilter
          hasActiveFilters={hasActiveFilters(PROJECT_FILTER_CONFIG, filters)}
          onToggleFilter={toggleFilterRow}
          extra={
            unlinkedCount > 0 ? (
              <Button
                variant="light"
                size="xs"
                leftSection={<IconBrandNotion size={16} />}
                rightSection={<Badge size="xs">{unlinkedCount}</Badge>}
                onClick={openNotionModal}
              >
                Notion Suggestions
              </Button>
            ) : undefined
          }
        />
      }
    >
      <Collapse in={filterRowOpen || hasActiveFilters(PROJECT_FILTER_CONFIG, filters)}>
        <div className="mb-3">
          <FilterBar
            config={PROJECT_FILTER_CONFIG}
            filters={filters}
            onFiltersChange={setFilters}
            members={workspaceMembers}
          />
        </div>
      </Collapse>

      <ProjectList projects={filteredProjects} workspaceSlug={showAllWorkspaces ? undefined : workspace?.slug} />
      <div className="mt-4">
        <CreateProjectModal>
          <Button variant="light">Create Project</Button>
        </CreateProjectModal>
      </div>

      <Modal
        opened={notionModalOpened}
        onClose={closeNotionModal}
        title="Notion Suggestions"
        size="lg"
      >
        <NotionSuggestionsContent
          unlinkedProjects={unlinkedProjectsData?.unlinkedProjects ?? []}
          onProjectImported={handleProjectImported}
        />
      </Modal>
    </ProjectViewLayout>
  );
} 