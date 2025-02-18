'use client';

import { api } from "~/trpc/react";

export function UpcomingCount() {
  const { data: actions } = api.action.getAll.useQuery();
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