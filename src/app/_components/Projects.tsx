"use client";

import { useState, useMemo } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { Select, Card, Text, Group, Badge, Button, Stack, Alert, Tabs, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { slugify } from "~/utils/slugify";
import { IconEdit, IconTrash, IconBrandNotion, IconPlus } from "@tabler/icons-react";

type Project = RouterOutputs["project"]["getAll"][0];

function ProjectList({ projects }: { projects: Project[] }) {
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
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Priority</th>
            <th className="px-4 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr 
              key={project.id} 
              className="border-b border-gray-700 hover:bg-white/5"
            >
              <td className="px-4 py-2">{project.name}</td>
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
                <div className="flex gap-2">
                  <CreateProjectModal project={project}>
                    <button
                      className="text-gray-400 hover:text-blue-500"
                      aria-label="Edit project"
                    >
                      <IconEdit className="h-5 w-5" />
                    </button>
                  </CreateProjectModal>
                  <button
                    onClick={() => deleteProject.mutate({ id: project.id })}
                    className="text-gray-400 hover:text-red-500"
                    aria-label="Delete project"
                  >
                    <IconTrash className="h-5 w-5" />
                  </button>
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

export function Projects() {
  const [projectName, setProjectName] = useState("");
  const [, setStatus] = useState("ACTIVE");
  const [, setPriority] = useState("NONE");
  const [, setProgress] = useState(0);
  const [, setSlug] = useState("");
  const [, setReviewDate] = useState("");
  const [, setNextActionDate] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [notionModalOpened, { open: openNotionModal, close: closeNotionModal }] = useDisclosure(false);

  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: true }
  );
  const { data: lifeDomains = [] } = api.lifeDomain.getAllLifeDomains.useQuery();

  // Get Notion workflows to find the first one for querying unlinked projects
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const notionWorkflows = workflows.filter(w => w.provider === 'notion');
  const firstNotionWorkflowId = notionWorkflows[0]?.id;

  // Query for unlinked Notion projects (filtered by current workspace)
  const { data: unlinkedProjectsData, refetch: refetchUnlinkedProjects } = api.workflow.getUnlinkedNotionProjects.useQuery(
    { workflowId: firstNotionWorkflowId ?? '', workspaceId: workspaceId ?? undefined },
    { enabled: !!firstNotionWorkflowId && !!workspaceId }
  );

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

  const filteredProjects = useMemo(() => {
    if (!projects.data) return [];
    if (selectedDomain === "all") return projects.data;

    const domainId = parseInt(selectedDomain);
    return projects.data.filter(project =>
      project.lifeDomains?.some(d => d.id === domainId)
    );
  }, [projects.data, selectedDomain]);

  return (
    <div className="w-full max-w-2xl">
      <Group justify="space-between" align="center" mb="md">
        <h2 className="text-2xl font-bold">Projects</h2>
        {unlinkedCount > 0 && (
          <Button
            variant="light"
            leftSection={<IconBrandNotion size={16} />}
            rightSection={<Badge size="xs">{unlinkedCount}</Badge>}
            onClick={openNotionModal}
          >
            Notion Suggestions
          </Button>
        )}
      </Group>

      <Tabs value={selectedDomain} onChange={(v) => setSelectedDomain(v ?? "all")}>
        <Tabs.List>
          <Tabs.Tab value="all">All</Tabs.Tab>
          {lifeDomains.map((domain) => (
            <Tabs.Tab key={domain.id} value={domain.id.toString()}>
              {domain.title}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value={selectedDomain} pt="md">
          <ProjectList projects={filteredProjects} />
          <div className="mt-4">
            <CreateProjectModal>
              <Button variant="light">Create Project</Button>
            </CreateProjectModal>
          </div>
        </Tabs.Panel>
      </Tabs>

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
    </div>
  );
} 