'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "~/trpc/react";
import { NavLink } from "./NavLinks";
type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

const priorityOrder: Record<Priority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  NONE: 3,
};

export function ProjectList() {
  const pathname = usePathname();
  const { data: projects } = api.project.getAll.useQuery({
    include: {
      actions: true,
    },
  });

  if (!projects) return null;

  const sortedProjects = [...projects].sort((a, b) => {
    return (priorityOrder[a.priority as Priority ?? 'NONE'] ?? 4) - (priorityOrder[b.priority as Priority ?? 'NONE'] ?? 4);
  });

  return (
    <div className="mt-1 space-y-1">
      {sortedProjects.filter((project) => project.status === "ACTIVE").map((project) => {
        const projectPath = `/projects/${project.slug}-${project.id}`;
        const isActive = pathname === projectPath;

        return (
          <NavLink
            key={project.id}
            href={projectPath}
            
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
          </NavLink>
        );
      })}
    </div>
  );
} 