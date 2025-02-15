"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { type RouterOutputs } from "~/trpc/react";

type Project = RouterOutputs["project"]["getAll"][0];

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <>
    {projects.map((project) => (
          <div
            key={project.id}
            className="mt-4 rounded-md bg-white/10 p-4"
          >
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
  )
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