"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
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
        {projects.data?.map((project) => (
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
      </div>
      <br/>
      {/* <form
        onSubmit={(e) => {
          e.preventDefault();
          createProject.mutate({
            name,
            status,
            priority,
            progress,
            reviewDate: reviewDate ? new Date(reviewDate) : null,
            nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
          });
        }}
        className="flex flex-col gap-2"
      >
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        >
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ON_HOLD">On Hold</option>
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        >
          <option value="NONE">None</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <input
          type="date"
          placeholder="Review Date"
          value={reviewDate}
          onChange={(e) => setReviewDate(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        />
        <input
          type="date"
          placeholder="Next Action Date"
          value={nextActionDate}
          onChange={(e) => setNextActionDate(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        />
        <button
          type="submit"
          className="rounded-md bg-white/10 px-4 py-2 font-semibold hover:bg-white/20"
          disabled={createProject.isLoading}
        >
          {createProject.isLoading ? "Creating..." : "Create Project"}
        </button>
      </form> */}
      <CreateProjectModal />
    </div>
  );
} 