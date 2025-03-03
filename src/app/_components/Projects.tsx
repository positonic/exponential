"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";
import { Badge, Select } from "@mantine/core";
import { slugify } from "~/utils/slugify";

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
                        status: newStatus as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                      });
                    }
                  }}
                  data={statusOptions}
                  variant="filled"
                  size="xs"
                  styles={{
                    input: {
                      backgroundColor: `var(--mantine-color-${getStatusColor(project.status)}-light)`,
                      color: `var(--mantine-color-${getStatusColor(project.status)}-darker)`,
                      fontWeight: 500,
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
                      color: `var(--mantine-color-${getPriorityColor(project.priority)}-darker)`,
                      fontWeight: 500,
                    }
                  }}
                />
              </td>
              <td className="px-4 py-2">
                <button
                  onClick={() => deleteProject.mutate({ id: project.id })}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Delete project"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
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