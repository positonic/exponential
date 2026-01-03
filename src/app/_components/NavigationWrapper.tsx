"use client";

import { PageHeader } from "./PageHeader";
import { TodayContent } from "./TodayContent";

interface NavigationWrapperProps {
  calendarConnected: boolean;
  todayExists: boolean;
}

export function NavigationWrapper({ calendarConnected, todayExists }: NavigationWrapperProps) {
  return (
    <>
      {/* Page Header Navigation */}
      <PageHeader
        calendarConnected={calendarConnected}
        todayExists={todayExists}
      />

      {/* Main Tabbed Content */}
      <TodayContent calendarConnected={calendarConnected} />
    </>
  );
}