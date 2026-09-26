'use client';

import { useSidebarActionCounts } from "~/hooks/useSidebarActionCounts";

export function InboxCount() {
  const { inboxCount, isError } = useSidebarActionCounts();

  if (isError) return null; // Don't show count if there's an error

  return (
    <span className="ml-auto text-gray-500">{inboxCount ?? 0}</span>
  );
}
