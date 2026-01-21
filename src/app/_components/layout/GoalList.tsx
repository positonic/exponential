'use client';

import { api } from "~/trpc/react";
import { NavLink } from "./NavLinks";
import { IconTarget, IconNumber, IconFlame } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function GoalList() {
  const { workspaceSlug, workspaceId } = useWorkspace();

  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    {
      enabled: workspaceId !== null,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000, // Consider data stale after 30 seconds
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    }
  );

  if (!goals) return null;

  // Use workspace-aware paths when in a workspace context
  const goalsPath = workspaceSlug ? `/w/${workspaceSlug}/goals` : '/goals';
  const outcomesPath = workspaceSlug ? `/w/${workspaceSlug}/outcomes` : '/outcomes';

  return (
    <div className="mt-1 space-y-1">
      <NavLink href={goalsPath} icon={IconTarget}>Objectives</NavLink>
      <NavLink href="/habits" icon={IconFlame}>Habits</NavLink>
      <NavLink href={outcomesPath} icon={IconNumber}>Outcomes</NavLink>
          
      {/* {goals.map((goal) => {
        const goalPath = `/goals/${slugify(goal.title)}-${goal.id}`;
        const isActive = pathname === goalPath;

        return (
          <Link
            key={goal.id}
            href={goalPath}
            className={`group flex items-center rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 ${
              isActive ? 'bg-red-900/30' : ''
            }`}
          >
            <span className="mr-2 text-gray-500">#</span>
            <span>{goal.title}</span>
            <span className="ml-auto text-gray-500">
              {/ * {
                goal.actions.filter(
                  (action) => action.status !== "COMPLETED",
                )?.length
              } * /}
            </span>
          </Link>
        );
      })} */}
    </div>
  );
} 