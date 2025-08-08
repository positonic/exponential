'use client';

// import Link from "next/link";
// import { usePathname } from "next/navigation";
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
  // const pathname = usePathname();
  const { data: projects } = api.project.getAll.useQuery({
    include: {
      actions: true,
    },
  }, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  if (!projects) return null;

  const sortedProjects = [...projects].sort((a, b) => {
    return (priorityOrder[a.priority as Priority ?? 'NONE'] ?? 4) - (priorityOrder[b.priority as Priority ?? 'NONE'] ?? 4);
  });

  return (
    <div className="mt-2 space-y-1">
      {sortedProjects.filter((project) => project.status === "ACTIVE").map((project) => {
        const projectPath = `/projects/${project.slug}-${project.id}`;
        const activeActionsCount = project.actions.filter(
          (action) => action.status !== "COMPLETED",
        )?.length || 0;

        return (
          <NavLink
            key={project.id}
            href={projectPath}
            count={activeActionsCount > 0 ? activeActionsCount : undefined}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-500">#</span>
              <span className="truncate">{project.name}</span>
            </div>
          </NavLink>
        );
      })}
      
      {sortedProjects.filter((project) => project.status === "ACTIVE").length === 0 && (
        <div className="text-center py-4 px-3">
          <div className="text-xs text-gray-500">No active projects</div>
        </div>
      )}
    </div>
  );
}