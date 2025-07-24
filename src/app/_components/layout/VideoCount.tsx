'use client';

import { api } from "~/trpc/react";

export function VideoCount() {
  const { data: videoCount } = api.video.getCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  if (!videoCount) return null;

  return (
    <span className="ml-auto text-gray-500">
      {videoCount}
    </span>
  );
} 