'use client';

import { api } from "~/trpc/react";

export function TodayCount() {
  const { data: actions } = api.action.getToday.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
  const activeTodayCount = actions?.length ?? 0;

  return (
    <span className="ml-auto text-gray-500">{activeTodayCount}</span>
  );
} 