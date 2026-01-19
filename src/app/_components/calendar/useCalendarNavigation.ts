"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  subDays,
  subWeeks,
  parseISO,
  format,
} from "date-fns";
import type { CalendarView, CalendarNavigation } from "./types";

function isValidView(view: string | null): view is CalendarView {
  return view === "day" || view === "week";
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  try {
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useCalendarNavigation(): CalendarNavigation & {
  setView: (view: CalendarView) => void;
  setDate: (date: Date) => void;
  goToToday: () => void;
  goNext: () => void;
  goPrevious: () => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL state
  const viewFromUrl = searchParams.get("view");
  const dateFromUrl = searchParams.get("date");

  const view: CalendarView = isValidView(viewFromUrl) ? viewFromUrl : "week";
  const parsedDate = parseDate(dateFromUrl);

  // Wrap selectedDate in useMemo to prevent unnecessary re-renders
  const selectedDate = useMemo(() => {
    return parsedDate ?? new Date();
  }, [parsedDate]);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "day") {
      return {
        start: startOfDay(selectedDate),
        end: endOfDay(selectedDate),
      };
    }
    // Week view - Sunday to Saturday
    return {
      start: startOfWeek(selectedDate, { weekStartsOn: 0 }),
      end: endOfWeek(selectedDate, { weekStartsOn: 0 }),
    };
  }, [view, selectedDate]);

  // Helper to update URL params
  const updateParams = useCallback(
    (updates: { view?: CalendarView; date?: Date }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.view !== undefined) {
        if (updates.view === "week") {
          params.delete("view"); // week is default
        } else {
          params.set("view", updates.view);
        }
      }

      if (updates.date !== undefined) {
        const today = startOfDay(new Date());
        const newDate = startOfDay(updates.date);
        if (newDate.getTime() === today.getTime()) {
          params.delete("date"); // today is default
        } else {
          params.set("date", format(updates.date, "yyyy-MM-dd"));
        }
      }

      const newUrl = params.toString()
        ? `/calendar?${params.toString()}`
        : "/calendar";
      router.push(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  const setView = useCallback(
    (newView: CalendarView) => {
      updateParams({ view: newView });
    },
    [updateParams]
  );

  const setDate = useCallback(
    (newDate: Date) => {
      updateParams({ date: newDate });
    },
    [updateParams]
  );

  const goToToday = useCallback(() => {
    updateParams({ date: new Date() });
  }, [updateParams]);

  const goNext = useCallback(() => {
    const newDate = view === "day" ? addDays(selectedDate, 1) : addWeeks(selectedDate, 1);
    updateParams({ date: newDate });
  }, [view, selectedDate, updateParams]);

  const goPrevious = useCallback(() => {
    const newDate = view === "day" ? subDays(selectedDate, 1) : subWeeks(selectedDate, 1);
    updateParams({ date: newDate });
  }, [view, selectedDate, updateParams]);

  return {
    view,
    selectedDate,
    dateRange,
    setView,
    setDate,
    goToToday,
    goNext,
    goPrevious,
  };
}
