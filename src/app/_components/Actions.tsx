"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export function Actions() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");

  const utils = api.useUtils();
  const actions = api.action.getAll.useQuery();
  
  const projects = api.project.getAll.useQuery();

  const createAction = api.action.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setProjectId("");
      void utils.action.getAll.invalidate();
    },
  });

  return (
    <div className="w-full max-w-2xl">
      <div className="mt-8">
        <h2 className="text-2xl font-bold">Actions</h2>
        {actions.data?.map((action) => (
          <div
            key={action.id}
            className="mt-4 rounded-md bg-white/10 p-4"
          >
            <h3 className="text-xl font-semibold">{action.name}</h3>
            <p className="mt-2 text-sm">{action.description}</p>
            <p className="mt-2 text-sm text-gray-400">
              Project: {action.project.name}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Status: {action.status}
            </p>
          </div>
        ))}
      </div>
      <br/>
      <br/>
      <h2>Create a new action</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createAction.mutate({
            name,
            description,
            projectId,
          });
        }}
        className="flex flex-col gap-2"
      >
        <input
          type="text"
          placeholder="Action name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-md px-4 py-2 text-black"
        >
          <option value="">Select a project</option>
          {projects.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-white/10 px-4 py-2 font-semibold hover:bg-white/20"
          disabled={createAction.isLoading}
        >
          {createAction.isLoading ? "Creating..." : "Create Action"}
        </button>
      </form>
    </div>
  );
} 