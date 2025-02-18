'use client';

import { api } from "~/trpc/react";

export function TodayCount() {
  const { data: actions } = api.action.getToday.useQuery();
  const activeTodayCount = actions?.length ?? 0;

  return (
    <span className="ml-auto text-gray-500">{activeTodayCount}</span>
  );
} 