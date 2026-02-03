"use client";

import { useMemo } from "react";
import { Text, ScrollArea } from "@mantine/core";
import { isToday } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import {
  HOUR_HEIGHT,
  VISIBLE_START_HOUR,
  VISIBLE_END_HOUR,
  TIME_LABEL_WIDTH,
} from "./types";
import { CalendarEventBlock, CalendarActionBlock } from "./CalendarEventBlock";
import {
  calculateOverlappingPositions,
  convertEventToCalendarItem,
  convertActionToCalendarItem,
} from "./utils/overlapDetection";

interface CalendarDayTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  selectedDate: Date;
  onActionStatusChange?: (action: ScheduledAction, completed: boolean) => void;
  onActionClick?: (action: ScheduledAction) => void;
}

export function CalendarDayTimeGrid({
  events,
  scheduledActions,
  selectedDate,
  onActionStatusChange,
  onActionClick,
}: CalendarDayTimeGridProps) {
  const hours = Array.from(
    { length: VISIBLE_END_HOUR - VISIBLE_START_HOUR },
    (_, i) => i + VISIBLE_START_HOUR
  );

  // Calculate positioned items (unified events + actions with overlap detection)
  const positionedItems = useMemo(() => {
    // Convert events to calendar items
    const eventItems = events
      .map((event) => convertEventToCalendarItem(event, selectedDate))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Convert actions to calendar items
    const actionItems = scheduledActions
      .map((action) => convertActionToCalendarItem(action, selectedDate))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Combine and calculate positions with overlap detection
    // Use percentage-based positioning (100%) for responsive layout
    const allItems = [...eventItems, ...actionItems];
    return calculateOverlappingPositions(allItems, 100, 0);
  }, [events, scheduledActions, selectedDate]);

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  return (
    <ScrollArea h="calc(100vh - 180px)" scrollbarSize={8}>
      <div className="relative flex" style={{ height: gridHeight }}>
        {/* Time labels column */}
        <div
          className="sticky left-0 z-20 bg-background-primary"
          style={{ width: TIME_LABEL_WIDTH }}
        >
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="absolute border-t border-border-secondary"
              style={{ top: index * HOUR_HEIGHT, width: TIME_LABEL_WIDTH }}
            >
              <Text
                size="xs"
                c="dimmed"
                className="pr-2 pt-1 text-right"
                style={{ fontSize: "10px" }}
              >
                {hour === 0
                  ? "12 AM"
                  : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`}
              </Text>
            </div>
          ))}
        </div>

        {/* Event content area */}
        <div className="relative flex-1" style={{ minWidth: 300 }}>
          {/* Hour lines */}
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="absolute w-full border-t border-border-secondary"
              style={{ top: index * HOUR_HEIGHT }}
            />
          ))}

          {/* Current time indicator */}
          {isToday(selectedDate) && (
            <CurrentTimeIndicator startHour={VISIBLE_START_HOUR} />
          )}

          {/* Events and Actions (unified with overlap detection) */}
          {positionedItems.map((item) => {
            if (item.type === "event" && item.originalEvent) {
              return (
                <CalendarEventBlock
                  key={item.id}
                  event={item.originalEvent}
                  style={{
                    top: item.top,
                    left: `${item.left}%`,
                    width: `${item.width}%`,
                    height: item.height,
                    zIndex: item.column + 1,
                  }}
                />
              );
            } else if (item.type === "action" && item.originalAction) {
              return (
                <CalendarActionBlock
                  key={item.id}
                  action={item.originalAction}
                  style={{
                    top: item.top,
                    left: `${item.left}%`,
                    width: `${item.width}%`,
                    height: item.height,
                    zIndex: item.column + 1,
                  }}
                  onStatusChange={onActionStatusChange}
                  onClick={onActionClick}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

function CurrentTimeIndicator({ startHour }: { startHour: number }) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const top = ((currentMinutes - startHour * 60) / 60) * HOUR_HEIGHT;

  if (top < 0 || top > (VISIBLE_END_HOUR - startHour) * HOUR_HEIGHT) {
    return null;
  }

  return (
    <div
      className="absolute left-0 right-0 border-t-2 border-red-500"
      style={{ top, zIndex: 100 }}
    >
      <div className="-ml-1 -mt-1 h-2 w-2 rounded-full bg-red-500" />
    </div>
  );
}
