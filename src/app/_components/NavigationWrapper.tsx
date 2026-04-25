"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();

  // Initialize focus from URL, then manage as client state
  const focusFromUrl = searchParams.get("focus");
  const initialFocusValue: FocusPeriod = isValidFocusPeriod(focusFromUrl)
    ? focusFromUrl
    : initialFocus ?? "today";

  const [focus, setFocus] = useState<FocusPeriod>(initialFocusValue);

  // Memoize date range to avoid recalculation and ensure stable reference
  const dateRange = useMemo(() => getDateRangeForFocus(focus), [focus]);

  const handleFocusChange = useCallback((newFocus: FocusPeriod) => {
    setFocus(newFocus);

    // Sync URL without triggering Next.js navigation
    const params = new URLSearchParams(window.location.search);

    if (newFocus === "today") {
      params.delete("focus");
    } else {
      params.set("focus", newFocus);
    }

    // Reset journal tab when changing focus away from today
    const currentTab = params.get("tab");
    if (newFocus !== "today" && currentTab === "journal") {
      params.delete("tab");
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, []);

  return (
    <>
      {/* Page Header Navigation */}
      <PageHeader
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
