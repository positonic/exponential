"use client";

import { useMemo } from "react";
import { Text, ScrollArea } from "@mantine/core";
import { parseISO, isSameDay, isToday } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import {
  HOUR_HEIGHT,
  VISIBLE_START_HOUR,
  VISIBLE_END_HOUR,
  TIME_LABEL_WIDTH,
} from "./types";
import { CalendarEventBlock, CalendarActionBlock } from "./CalendarEventBlock";

interface CalendarDayTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  selectedDate: Date;
  onActionStatusChange?: (actionId: string, completed: boolean) => void;
  onActionClick?: (actionId: string) => void;
}

interface PositionedItem {
  top: number;
  height: number;
  left: number;
  width: number;
  column: number;
  totalColumns: number;
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

  // Calculate positioned events
  const positionedEvents = useMemo(() => {
    // Filter events for the selected date
    const dayEvents = events.filter((event) => {
      if (event.start.date) {
        return isSameDay(new Date(event.start.date), selectedDate);
      } else if (event.start.dateTime) {
        return isSameDay(parseISO(event.start.dateTime), selectedDate);
      }
      return false;
    });

    // Convert events to positioned events
    const positioned: Array<{ event: CalendarEvent } & PositionedItem> =
      dayEvents.map((event) => {
        let top = 0;
        let height = HOUR_HEIGHT;

        if (event.start.dateTime && event.end.dateTime) {
          const startTime = parseISO(event.start.dateTime);
          const endTime = parseISO(event.end.dateTime);

          const startMinutes =
            startTime.getHours() * 60 + startTime.getMinutes();
          const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

          top = ((startMinutes - VISIBLE_START_HOUR * 60) / 60) * HOUR_HEIGHT;
          height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);
        } else if (event.start.date) {
          top = -40;
          height = 30;
        }

        return {
          event,
          top,
          height,
          left: TIME_LABEL_WIDTH,
          width: 0,
          column: 0,
          totalColumns: 1,
        };
      });

    // Handle overlapping events
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

    // Calculate widths and positions
    const containerWidth = 300;
    const numColumns = columns.length;
    const columnWidth =
      numColumns > 0 ? containerWidth / numColumns : containerWidth;

    columns.forEach((column, columnIndex) => {
      column.forEach((item) => {
        item.left = TIME_LABEL_WIDTH + columnIndex * columnWidth;
        item.width = columnWidth - 2;
        item.column = columnIndex;
        item.totalColumns = numColumns;
      });
    });

    return sortedEvents;
  }, [events, selectedDate]);

  // Calculate positioned actions
  const positionedActions = useMemo(() => {
    const dayActions = scheduledActions.filter((action) => {
      if (!action.scheduledStart) return false;
      return isSameDay(new Date(action.scheduledStart), selectedDate);
    });

    return dayActions.map((action) => {
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
      const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 25);

      return {
        action,
        top,
        height,
        left: TIME_LABEL_WIDTH + 310,
        width: 200,
      };
    });
  }, [scheduledActions, selectedDate]);

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  return (
    <ScrollArea h="calc(100vh - 180px)" scrollbarSize={8}>
      <div className="relative" style={{ height: gridHeight, minWidth: 600 }}>
        {/* Hour lines and labels */}
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute flex w-full items-start border-t border-border-secondary"
            style={{ top: index * HOUR_HEIGHT }}
          >
            <Text
              size="xs"
              c="dimmed"
              className="w-14 pr-2 pt-1 text-right"
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

        {/* Current time indicator */}
        {isToday(selectedDate) && (
          <CurrentTimeIndicator startHour={VISIBLE_START_HOUR} />
        )}

        {/* Events */}
        {positionedEvents.map((item) => (
          <CalendarEventBlock
            key={item.event.id}
            event={item.event}
            style={{
              top: item.top,
              left: item.left,
              width: item.width,
              height: item.height,
              zIndex: item.column + 1,
            }}
          />
        ))}

        {/* Scheduled Actions */}
        {positionedActions.map((item) => (
          <CalendarActionBlock
            key={item.action.id}
            action={item.action}
            style={{
              top: item.top,
              left: item.left,
              width: item.width,
              height: item.height,
              zIndex: 10,
            }}
            onStatusChange={onActionStatusChange}
            onClick={onActionClick}
          />
        ))}
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
      className="absolute left-14 right-0 border-t-2 border-red-500"
      style={{ top, zIndex: 100 }}
    >
      <div className="-ml-1 -mt-1 h-2 w-2 rounded-full bg-red-500" />
    </div>
  );
}
