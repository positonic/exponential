'use client';

import Link from "next/link";
import { api } from "~/trpc/react";

export function ProjectList() {
  const { data: projects } = api.project.getAll.useQuery({
    include: {
      actions: true,
    },
  });

  if (!projects) return null;

  return (
    <div className="mt-1 space-y-1">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/projects/${project.slug}-${project.id}`}
          className="group flex items-center rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800"
        >
          <span className="mr-2 text-gray-500">#</span>
          <span>{project.name}</span>
          <span className="ml-auto text-gray-500">
            {
              project.actions.filter(
                (action) => action.status !== "COMPLETED",
              )?.length
            }
          </span>
          
        </Link>
      ))}
    </div>
  );
} 