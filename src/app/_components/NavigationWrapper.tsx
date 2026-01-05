"use client";

import { PageHeader } from "./PageHeader";
import { TodayContent } from "./TodayContent";

interface NavigationWrapperProps {
  calendarConnected: boolean;
  todayExists: boolean;
  initialTab?: string;
}

export function NavigationWrapper({ calendarConnected, todayExists, initialTab }: NavigationWrapperProps) {
  return (
    <>
      {/* Page Header Navigation */}
      <PageHeader
        calendarConnected={calendarConnected}
        todayExists={todayExists}
      />

      {/* Main Tabbed Content */}
      <TodayContent calendarConnected={calendarConnected} initialTab={initialTab} />
    </>
  );
}