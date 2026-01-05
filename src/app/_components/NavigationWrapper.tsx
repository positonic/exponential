"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "./PageHeader";
import { TodayContent } from "./TodayContent";
import type { FocusPeriod } from "~/types/focus";
import { isValidFocusPeriod } from "~/types/focus";
import { getDateRangeForFocus } from "~/lib/dateUtils";

interface NavigationWrapperProps {
  calendarConnected: boolean;
  todayExists: boolean;
  initialTab?: string;
  initialFocus?: FocusPeriod;
  workspaceId?: string;
  workspaceName?: string;
}

export function NavigationWrapper({
  calendarConnected,
  todayExists,
  initialTab,
  initialFocus,
  workspaceId,
  workspaceName,
}: NavigationWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read focus from URL, fall back to initial or default to 'today'
  const focusFromUrl = searchParams.get("focus");
  const focus: FocusPeriod = isValidFocusPeriod(focusFromUrl)
    ? focusFromUrl
    : initialFocus ?? "today";

  // Calculate date range based on focus
  const dateRange = getDateRangeForFocus(focus);

  const handleFocusChange = useCallback(
    (newFocus: FocusPeriod) => {
      const params = new URLSearchParams(searchParams.toString());

      // Update focus param
      if (newFocus === "today") {
        params.delete("focus");
      } else {
        params.set("focus", newFocus);
      }

      // Reset to overview tab when changing focus to avoid showing Journal for week/month
      const currentTab = params.get("tab");
      if (newFocus !== "today" && currentTab === "journal") {
        params.delete("tab");
      }

      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <>
      {/* Page Header Navigation */}
      <PageHeader
        calendarConnected={calendarConnected}
        todayExists={todayExists}
        focus={focus}
        onFocusChange={handleFocusChange}
        workspaceName={workspaceName}
      />

      {/* Main Tabbed Content */}
      <TodayContent
        calendarConnected={calendarConnected}
        initialTab={initialTab}
        focus={focus}
        dateRange={dateRange}
        workspaceId={workspaceId}
      />
    </>
  );
}
