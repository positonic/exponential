'use client';

import { api } from "~/trpc/react";

export function InboxCount() {
  const { data: actions } = api.action.getAll.useQuery();
  const activeInboxCount = actions?.filter(
    action => !action.projectId && action.status === "ACTIVE"
  ).length ?? 0;

  return (
    <span className="ml-auto text-gray-500">{activeInboxCount}</span>
  );
} 