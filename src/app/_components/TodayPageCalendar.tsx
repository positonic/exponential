"use client";

import { useState } from "react";
import { CalendarDrawer } from "./CalendarDrawer";
import { CalendarToggleButton } from "./CalendarToggleButton";
import { api } from "~/trpc/react";

interface TodayPageCalendarProps {
  isConnected: boolean;
}

export function TodayPageCalendar({ isConnected }: TodayPageCalendarProps) {
  const [drawerOpened, setDrawerOpened] = useState(false);
  const today = new Date();

  // Check if there are events today (for the indicator dot)
  const { data: todayEvents } = api.calendar.getTodayEvents.useQuery(undefined, {
    enabled: isConnected,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
  });

  const hasEvents = todayEvents && todayEvents.length > 0;

  console.log('TodayPageCalendar:', { isConnected, hasEvents, todayEvents });

  if (!isConnected) {
    console.log('Calendar not connected, returning null');
    return null;
  }

  return (
    <>
      <CalendarToggleButton
        onClick={() => setDrawerOpened(true)}
        isConnected={isConnected}
        hasEvents={hasEvents}
      />

      <CalendarDrawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        selectedDate={today}
      />
    </>
  );
}