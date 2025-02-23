'use client';

import { api } from "~/trpc/react";

export function VideoCount() {
  const { data: videoCount } = api.video.getCount.useQuery();

  if (!videoCount) return null;

  return (
    <span className="ml-auto text-gray-500">
      {videoCount}
    </span>
  );
} 