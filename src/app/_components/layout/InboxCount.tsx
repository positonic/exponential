'use client';

import { api } from "~/trpc/react";

export function InboxCount() {
  const { data: actions, error } = api.action.getAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: false, // Don't retry on error
  });
  
  if (error) return null; // Don't show count if there's an error
  
  const activeInboxCount = actions?.filter(
    action => !action.projectId && action.status === "ACTIVE"
  ).length ?? 0;

  return (
    <span className="ml-auto text-gray-500">{activeInboxCount}</span>
  );
} 