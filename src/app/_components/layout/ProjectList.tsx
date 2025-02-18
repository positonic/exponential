'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "~/trpc/react";

export function ProjectList() {
  const pathname = usePathname();
  const { data: projects } = api.project.getAll.useQuery({
    include: {
      actions: true,
    },
  });

  if (!projects) return null;

  return (
    <div className="mt-1 space-y-1">
      {projects.map((project) => {
        const projectPath = `/projects/${project.slug}-${project.id}`;
        const isActive = pathname === projectPath;

        return (
          <Link
            key={project.id}
            href={projectPath}
            className={`group flex items-center rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 ${
              isActive ? 'bg-red-900/30' : ''
            }`}
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
        );
      })}
    </div>
  );
} 