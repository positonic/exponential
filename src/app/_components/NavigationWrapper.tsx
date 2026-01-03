"use client";

import { PageHeader } from "./PageHeader";
import { TodayContent } from "./TodayContent";
import Link from "next/link";
import { format } from "date-fns";

interface NavigationWrapperProps {
  calendarConnected: boolean;
  todayExists: boolean;
  todayRecord: any;
}

export function NavigationWrapper({ calendarConnected, todayExists, todayRecord }: NavigationWrapperProps) {
  return (
    <>
      {/* Page Header Navigation */}
      <PageHeader
        calendarConnected={calendarConnected}
        todayExists={todayExists}
      />

      {/* Main Tabbed Content */}
      <TodayContent calendarConnected={calendarConnected} />

      {/* Today record link */}
      {todayExists && todayRecord && todayRecord.date && (
        <div className="w-full max-w-3xl mx-auto mt-4">
          <Link href={`/days/${format(todayRecord.date, 'yyyy-MM-dd')}`} className="text-blue-500">
            Diverge, Converge, Synthesize
          </Link>
        </div>
      )}
    </>
  );
}