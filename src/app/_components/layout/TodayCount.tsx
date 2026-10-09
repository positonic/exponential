'use client';

import { useSidebarActionCounts } from "~/hooks/useSidebarActionCounts";

export function TodayCount() {
  const { todayCount } = useSidebarActionCounts();
  const activeTodayCount = todayCount ?? 0;

  if (activeTodayCount === 0) return null;

  return <>{activeTodayCount}</>;
}
