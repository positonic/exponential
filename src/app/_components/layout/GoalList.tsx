'use client';

// import Link from "next/link";
// import { usePathname } from "next/navigation";
import { api } from "~/trpc/react";
import { NavLink } from "./NavLinks";
import { IconTarget, IconNumber } from "@tabler/icons-react";
export function GoalList() {
  // const pathname = usePathname();
  const { data: goals } = api.goal.getAllMyGoals.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  if (!goals) return null;
  
  return (
    <div className="mt-1 space-y-1">
      <NavLink href="/goals" icon={IconTarget}>Goals</NavLink>
      <NavLink href="/outcomes" icon={IconNumber}>Outcomes</NavLink>
          
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