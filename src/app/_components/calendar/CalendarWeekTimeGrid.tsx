"use client";

import { useMemo } from "react";
import { Text, ScrollArea } from "@mantine/core";
import { format, parseISO, isSameDay, isToday, eachDayOfInterval } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import {
  HOUR_HEIGHT,
  VISIBLE_START_HOUR,
  VISIBLE_END_HOUR,
  TIME_LABEL_WIDTH,
} from "./types";
import { CalendarEventBlock, CalendarActionBlock } from "./CalendarEventBlock";

interface CalendarWeekTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  dateRange: { start: Date; end: Date };
  onActionStatusChange?: (actionId: string, completed: boolean) => void;
  onActionClick?: (actionId: string) => void;
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

  // Group and position events by day
  const positionedEventsByDay = useMemo(() => {
    const result = new Map<
      string,
      Array<{
        event: CalendarEvent;
        top: number;
        height: number;
        left: number;
        width: number;
      }>
    >();

    days.forEach((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const dayEvents = events.filter((event) => {
        if (event.start.date) {
          return isSameDay(new Date(event.start.date), day);
        } else if (event.start.dateTime) {
          return isSameDay(parseISO(event.start.dateTime), day);
        }
        return false;
      });

      const positioned = dayEvents.map((event) => {
        let top = 0;
        let height = HOUR_HEIGHT;

        if (event.start.dateTime && event.end.dateTime) {
          const startTime = parseISO(event.start.dateTime);
          const endTime = parseISO(event.end.dateTime);

          const startMinutes =
            startTime.getHours() * 60 + startTime.getMinutes();
          const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

          top = ((startMinutes - VISIBLE_START_HOUR * 60) / 60) * HOUR_HEIGHT;
          height = Math.max(
            ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
            20
          );
        }

        return {
          event,
          top,
          height,
          left: 0,
          width: 0,
        };
      });

      // Handle overlapping events within the day
      const sortedEvents = positioned.sort((a, b) => a.top - b.top);
      const columns: Array<Array<(typeof sortedEvents)[0]>> = [];

      sortedEvents.forEach((item) => {
        let placed = false;
        for (const column of columns) {
          const lastEvent = column[column.length - 1];
          if (!lastEvent || item.top >= lastEvent.top + lastEvent.height) {
            column.push(item);
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([item]);
        }
      });

      const numColumns = Math.max(columns.length, 1);
      columns.forEach((column, columnIndex) => {
        column.forEach((item) => {
          item.left = (columnIndex / numColumns) * 100;
          item.width = 100 / numColumns - 1;
        });
      });

      result.set(dayKey, sortedEvents);
    });

    return result;
  }, [events, days]);

  // Group and position actions by day
  const positionedActionsByDay = useMemo(() => {
    const result = new Map<
      string,
      Array<{
        action: ScheduledAction;
        top: number;
        height: number;
      }>
    >();

    days.forEach((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const dayActions = scheduledActions.filter((action) => {
        if (!action.scheduledStart) return false;
        return isSameDay(new Date(action.scheduledStart), day);
      });

      const positioned = dayActions.map((action) => {
        const startTime = new Date(action.scheduledStart);
        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();

        let endMinutes = startMinutes + 30;
        if (action.duration) {
          endMinutes = startMinutes + action.duration;
        } else if (action.scheduledEnd) {
          const endTime = new Date(action.scheduledEnd);
          endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
        }

        const top = ((startMinutes - VISIBLE_START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(
          ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
          25
        );

        return { action, top, height };
      });

      result.set(dayKey, positioned);
    });

    return result;
  }, [scheduledActions, days]);

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div
        className="flex border-b border-border-primary"
        style={{ paddingLeft: TIME_LABEL_WIDTH }}
      >
        {days.map((day) => {
          const isTodayDate = isToday(day);
          return (
            <div
              key={format(day, "yyyy-MM-dd")}
              className="flex-1 border-l border-border-primary/50 px-2 py-2 text-center first:border-l-0"
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
                className="absolute border-t border-border-primary/50"
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
            const dayEvents = positionedEventsByDay.get(dayKey) ?? [];
            const dayActions = positionedActionsByDay.get(dayKey) ?? [];
            const isTodayDate = isToday(day);

            return (
              <div
                key={dayKey}
                className={`relative flex-1 border-l border-border-primary/50 first:border-l-0 ${
                  isTodayDate ? "bg-brand-primary/5" : ""
                }`}
                style={{ minWidth: 100 }}
              >
                {/* Hour lines */}
                {hours.map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-border-primary/50"
                    style={{ top: index * HOUR_HEIGHT }}
                  />
                ))}

                {/* Current time indicator */}
                {isTodayDate && (
                  <CurrentTimeIndicator startHour={VISIBLE_START_HOUR} />
                )}

                {/* Events */}
                {dayEvents.map((item) => (
                  <CalendarEventBlock
                    key={item.event.id}
                    event={item.event}
                    style={{
                      top: item.top,
                      left: `${item.left}%`,
                      width: `${item.width}%`,
                      height: item.height,
                      zIndex: 5,
                    }}
                  />
                ))}

                {/* Actions */}
                {dayActions.map((item) => (
                  <CalendarActionBlock
                    key={item.action.id}
                    action={item.action}
                    style={{
                      top: item.top,
                      left: "2%",
                      width: "96%",
                      height: item.height,
                      zIndex: 10,
                    }}
                    onStatusChange={onActionStatusChange}
                    onClick={onActionClick}
                  />
                ))}
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
