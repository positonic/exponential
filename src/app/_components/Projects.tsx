"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";

type Project = RouterOutputs["project"]["getAll"][0];

function ProjectList({ projects }: { projects: Project[] }) {
  const utils = api.useUtils();
  const deleteProject = api.project.delete.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
    },
  });

  return (
    <>
      {projects.map((project) => (
        <div
          key={project.id}
          className="mt-4 rounded-md bg-white/10 p-4 relative"
        >
          <button
            onClick={() => deleteProject.mutate({ id: project.id })}
            className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
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
          <h3 className="text-xl font-semibold">{project.name}</h3>
          <p className="mt-2 text-sm">Status: {project.status}</p>
          <p className="mt-1 text-sm text-gray-400">Priority: {project.priority}</p>
          {project.reviewDate && (
            <p className="mt-1 text-sm text-gray-400">
              Review Date: {new Date(project.reviewDate).toLocaleDateString()}
            </p>
          )}
          {project.nextActionDate && (
            <p className="mt-1 text-sm text-gray-400">
              Next Action: {new Date(project.nextActionDate).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

export function     Projects() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [priority, setPriority] = useState("NONE");
  const [progress, setProgress] = useState(0);
  const [reviewDate, setReviewDate] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

  const createProject = api.project.create.useMutation({
    onSuccess: () => {
      setName("");
      setStatus("ACTIVE");
      setPriority("NONE");
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
      <CreateProjectModal />
    </div>
  );
} 