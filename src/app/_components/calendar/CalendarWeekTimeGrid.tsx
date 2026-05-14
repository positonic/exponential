"use client";

import { useMemo, useState } from "react";
import { Text, ScrollArea } from "@mantine/core";
import { format, isToday, eachDayOfInterval } from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import {
  HOUR_HEIGHT,
  VISIBLE_START_HOUR,
  VISIBLE_END_HOUR,
  TIME_LABEL_WIDTH,
} from "./types";
import { CalendarEventBlock } from "./CalendarEventBlock";
import {
  DropSlot,
  DraggableActionBlock,
  DraggableTimeEntryBlock,
  ActionDragOverlay,
  TimeEntryDragOverlay,
  useDropSlots,
} from "./CalendarDndComponents";
import {
  calculateOverlappingPositions,
  convertEventToCalendarItem,
  convertActionToCalendarItem,
  convertTimeEntryToCalendarItem,
  type PositionedCalendarItem,
} from "./utils/overlapDetection";
import type { CalendarTimeEntry } from "./types";

interface CalendarWeekTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  timeEntries?: CalendarTimeEntry[];
  dateRange: { start: Date; end: Date };
  onActionClick?: (action: ScheduledAction) => void;
  onRescheduleAction?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
  onResizeAction?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
  onTimeEntryClick?: (entry: CalendarTimeEntry) => void;
  onMoveTimeEntry?: (entry: CalendarTimeEntry, newStart: Date, newEnd: Date) => void;
  onResizeTimeEntry?: (entry: CalendarTimeEntry, newStart: Date, newEnd: Date) => void;
}

export function CalendarWeekTimeGrid({
  events,
  scheduledActions,
  timeEntries = [],
  dateRange,
  onActionClick,
  onRescheduleAction,
  onResizeAction,
  onTimeEntryClick,
  onMoveTimeEntry,
  onResizeTimeEntry,
}: CalendarWeekTimeGridProps) {
  const [activeAction, setActiveAction] = useState<ScheduledAction | null>(null);
  const [activeTimeEntry, setActiveTimeEntry] = useState<CalendarTimeEntry | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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

      // Convert tracked time entries for this day
      const timeEntryItems = timeEntries
        .map((te) => convertTimeEntryToCalendarItem(te, day))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Combine and calculate positions with overlap detection
      // Use percentage-based positioning for responsive layout
      const allItems = [...eventItems, ...actionItems, ...timeEntryItems];
      const positioned = calculateOverlappingPositions(allItems, 100, 0);

      result.set(dayKey, positioned);
    });

    return result;
  }, [events, scheduledActions, timeEntries, days]);

  const dropSlots = useDropSlots();

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  const handleDragStart = (event: DragStartEvent) => {
    const action = event.active.data.current?.action as ScheduledAction | undefined;
    const timeEntry = event.active.data.current?.timeEntry as CalendarTimeEntry | undefined;
    setActiveAction(action ?? null);
    setActiveTimeEntry(timeEntry ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveAction(null);
      setActiveTimeEntry(null);
      return;
    }

    const slotId = over.id as string;
    // Parse week slot ID format: "week-slot-2026-02-26-14:30"
    const timeMatch = /week-slot-(\d{4}-\d{2}-\d{2})-(\d+):(\d+)/.exec(slotId);
    if (!timeMatch) {
      setActiveAction(null);
      setActiveTimeEntry(null);
      return;
    }

    const dateStr = timeMatch[1]!;
    const hour = parseInt(timeMatch[2]!);
    const minute = parseInt(timeMatch[3]!);
    const dateParts = dateStr.split("-").map(Number);

    const timeEntry = active.data.current?.timeEntry as CalendarTimeEntry | undefined;
    if (timeEntry) {
      const startedAt = new Date(timeEntry.startedAt);
      const endedAt = timeEntry.endedAt ? new Date(timeEntry.endedAt) : null;
      const durationMs = endedAt
        ? endedAt.getTime() - startedAt.getTime()
        : 30 * 60_000;
      const newStart = new Date(
        dateParts[0] ?? 0,
        (dateParts[1] ?? 1) - 1,
        dateParts[2] ?? 1,
        hour,
        minute,
        0,
        0,
      );
      const newEnd = new Date(newStart.getTime() + durationMs);
      onMoveTimeEntry?.(timeEntry, newStart, newEnd);
      setActiveAction(null);
      setActiveTimeEntry(null);
      return;
    }

    const action = active.data.current?.action as ScheduledAction | undefined;
    if (!action) {
      setActiveAction(null);
      setActiveTimeEntry(null);
      return;
    }
    const duration = action.duration ?? 30;

    const newStart = new Date(
      dateParts[0] ?? 0,
      (dateParts[1] ?? 1) - 1,
      dateParts[2] ?? 1,
      hour,
      minute,
      0,
      0,
    );
    const newEnd = new Date(newStart);
    newEnd.setMinutes(newEnd.getMinutes() + duration);

    onRescheduleAction?.(action, newStart, newEnd);
    setActiveAction(null);
    setActiveTimeEntry(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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

                  {/* Drop slots for this day column */}
                  {dropSlots.map(({ hour, minute }) => (
                    <DropSlot
                      key={`slot-${dayKey}-${hour}-${minute}`}
                      hour={hour}
                      minute={minute}
                      slotIdPrefix={`week-slot-${dayKey}`}
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
                        <DraggableActionBlock
                          key={item.id}
                          action={item.originalAction}
                          style={{
                            top: item.top,
                            left: `${item.left}%`,
                            width: `${item.width}%`,
                            height: item.height,
                            zIndex: item.column + 1,
                          }}
                          onClick={onActionClick}
                          onResize={onResizeAction}
                        />
                      );
                    } else if (item.type === "timeentry" && item.originalTimeEntry) {
                      return (
                        <DraggableTimeEntryBlock
                          key={item.id}
                          entry={item.originalTimeEntry}
                          style={{
                            top: item.top,
                            left: `${item.left}%`,
                            width: `${item.width}%`,
                            height: item.height,
                            zIndex: item.column + 1,
                          }}
                          onClick={onTimeEntryClick}
                          onResize={onResizeTimeEntry}
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

      <DragOverlay>
        {activeAction ? <ActionDragOverlay action={activeAction} /> : null}
        {activeTimeEntry ? <TimeEntryDragOverlay entry={activeTimeEntry} /> : null}
      </DragOverlay>
    </DndContext>
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
