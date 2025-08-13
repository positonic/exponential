"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";
import { Select } from "@mantine/core";
import { slugify } from "~/utils/slugify";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { OutcomeMultiSelect } from "./OutcomeMultiSelect";

type Project = RouterOutputs["project"]["getAll"][0];

function ProjectList({ projects }: { projects: Project[] }) {
  const [outcomeSearchValues, setOutcomeSearchValues] = useState<Record<string, string>>({});
  const utils = api.useUtils();
  
  // Fetch all outcomes for the dropdown
  const { data: allOutcomes } = api.outcome.getMyOutcomes.useQuery();
  
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
            <th className="px-4 py-2 text-left">Outcomes</th>
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
                <OutcomeMultiSelect
                  projectId={project.id}
                  projectName={project.name}
                  projectStatus={project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED"}
                  projectPriority={project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE"}
                  currentOutcomes={project.outcomes?.map(outcome => ({ ...outcome, goals: [], projects: [] })) || []}
                  searchValue={outcomeSearchValues[project.id] || ''}
                  onSearchChange={(value) => {
                    setOutcomeSearchValues(prev => ({
                      ...prev,
                      [project.id]: value
                    }));
                  }}
                  allOutcomes={allOutcomes}
                  size="xs"
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

export function Projects() {
  const [projectName, setProjectName] = useState("");
  const [, setStatus] = useState("ACTIVE");
  const [, setPriority] = useState("NONE");
  const [, setProgress] = useState(0);
  const [, setSlug] = useState("");
  const [, setReviewDate] = useState("");
  const [, setNextActionDate] = useState("");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

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

  return (
    <div className="w-full max-w-2xl">
      <div className="mt-8">
        <h2 className="text-2xl font-bold">Projects</h2>
        <ProjectList projects={projects.data ?? []} />
      </div>
      <br/>
      <CreateProjectModal>
        <div>Create Project</div>
      </CreateProjectModal>
    </div>
  );
} 