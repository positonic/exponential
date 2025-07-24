'use client';

import { api } from "~/trpc/react";

export function UpcomingCount() {
  const { data: actions } = api.action.getAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeUpcomingCount = actions?.filter(
    action => 
      action.status === "ACTIVE" && 
      action.dueDate && 
      action.dueDate > today
  ).length ?? 0;

  return (
    <span className="ml-auto text-gray-500">{activeUpcomingCount}</span>
  );
} 