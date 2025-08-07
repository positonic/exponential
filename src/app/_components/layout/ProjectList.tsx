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

const getPriorityDot = (priority: Priority) => {
  switch (priority) {
    case 'HIGH':
      return 'bg-red-500';
    case 'MEDIUM':
      return 'bg-yellow-500';
    case 'LOW':
      return 'bg-green-500';
    default:
      return 'bg-gray-400';
  }
};

const getPriorityColor = (priority: Priority) => {
  switch (priority) {
    case 'HIGH':
      return 'from-red-400 to-red-600';
    case 'MEDIUM':
      return 'from-yellow-400 to-yellow-600';
    case 'LOW':
      return 'from-green-400 to-green-600';
    default:
      return 'from-gray-300 to-gray-500';
  }
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
    <div className="mt-3 space-y-2 px-2">
      {sortedProjects.filter((project) => project.status === "ACTIVE").map((project) => {
        const projectPath = `/projects/${project.slug}-${project.id}`;
        const activeActionsCount = project.actions.filter(
          (action) => action.status !== "COMPLETED",
        )?.length || 0;
        const priority = project.priority as Priority || 'NONE';

        return (
          <div key={project.id} className="group relative">
            <NavLink
              href={projectPath}
              count={activeActionsCount > 0 ? activeActionsCount : undefined}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="relative flex items-center">
                  <div className={`w-2 h-2 rounded-full ${getPriorityDot(priority)} shadow-sm`} />
                  <div className={`absolute inset-0 w-2 h-2 rounded-full bg-gradient-to-r ${getPriorityColor(priority)} opacity-20 blur-sm`} />
                </div>
                <span className="font-medium truncate">{project.name}</span>
              </div>
            </NavLink>
          </div>
        );
      })}
      
      {sortedProjects.filter((project) => project.status === "ACTIVE").length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <div className="text-sm">No active projects</div>
          <div className="text-xs mt-1 opacity-75">Create your first project to get started</div>
        </div>
      )}
    </div>
  );
} 