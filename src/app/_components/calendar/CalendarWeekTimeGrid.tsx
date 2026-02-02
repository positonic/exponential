"use client";

import { useMemo } from "react";
import { Text, ScrollArea } from "@mantine/core";
import { format, isToday, eachDayOfInterval } from "date-fns";
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
  type PositionedCalendarItem,
} from "./utils/overlapDetection";

interface CalendarWeekTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  dateRange: { start: Date; end: Date };
  onActionStatusChange?: (action: ScheduledAction, completed: boolean) => void;
  onActionClick?: (action: ScheduledAction) => void;
}

export function CalendarWeekTimeGrid({
  events,
  scheduledActions,
  dateRange,
  onActionStatusChange,
  onActionClick,
}: CalendarWeekTimeGridProps) {
  const hours = Array.from(
    { length: VISIBLE_END_HOUR - VISIBLE_START_HOUR },
    (_, i) => i + VISIBLE_START_HOUR
  );

  const days = eachDayOfInterval({
    start: dateRange.start,
    end: dateRange.end,
  });

  // Group and position items by day (unified events + actions with overlap detection)
  const positionedItemsByDay = useMemo(() => {
    const result = new Map<string, PositionedCalendarItem[]>();

    days.forEach((day) => {
      const dayKey = format(day, "yyyy-MM-dd");

      // Convert events to calendar items for this day
      const eventItems = events
        .map((event) => convertEventToCalendarItem(event, day))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Convert actions to calendar items for this day
      const actionItems = scheduledActions
        .map((action) => convertActionToCalendarItem(action, day))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Combine and calculate positions with overlap detection
      // Use percentage-based positioning for responsive layout
      const allItems = [...eventItems, ...actionItems];
      const positioned = calculateOverlappingPositions(allItems, 100, 0);

      result.set(dayKey, positioned);
    });

    return result;
  }, [events, scheduledActions, days]);

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div
        className="flex border-b border-border-secondary"
        style={{ paddingLeft: TIME_LABEL_WIDTH }}
      >
        {days.map((day) => {
          const isTodayDate = isToday(day);
          return (
            <div
              key={format(day, "yyyy-MM-dd")}
              className="flex-1 border-l border-border-secondary px-2 py-2 text-center first:border-l-0"
            >
              <Text size="xs" c="dimmed">
                {format(day, "EEE")}
              </Text>
              <Text
                size="lg"
                fw={isTodayDate ? 700 : 500}
                className={
                  isTodayDate
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-white mx-auto"
                    : "text-text-primary"
                }
              >
                {format(day, "d")}
              </Text>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <ScrollArea className="flex-1" scrollbarSize={8}>
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

          {/* Day columns */}
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayItems = positionedItemsByDay.get(dayKey) ?? [];
            const isTodayDate = isToday(day);

            return (
              <div
                key={dayKey}
                className={`relative flex-1 border-l border-border-secondary first:border-l-0 ${
                  isTodayDate ? "bg-blue-500/5" : ""
                }`}
                style={{ minWidth: 100 }}
              >
                {/* Hour lines */}
                {hours.map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-border-secondary"
                    style={{ top: index * HOUR_HEIGHT }}
                  />
                ))}

                {/* Current time indicator */}
                {isTodayDate && (
                  <CurrentTimeIndicator startHour={VISIBLE_START_HOUR} />
                )}

                {/* Events and Actions (unified with overlap detection) */}
                {dayItems.map((item) => {
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
            );
          })}
        </div>
      </ScrollArea>
    </div>
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
