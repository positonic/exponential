"use client";

import { useMemo, useState } from "react";
import { Text } from "@mantine/core";
import { isToday } from "date-fns";
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
import type { CalendarEventWithSource } from "~/server/services/GoogleCalendarService";
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
} from "./utils/overlapDetection";
import type { CalendarTimeEntry } from "./types";

interface CalendarDayTimeGridProps {
  events: CalendarEventWithSource[];
  scheduledActions: ScheduledAction[];
  timeEntries?: CalendarTimeEntry[];
  selectedDate: Date;
  onActionClick?: (action: ScheduledAction) => void;
  onRescheduleAction?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
  onResizeAction?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
  onTimeEntryClick?: (entry: CalendarTimeEntry) => void;
  onMoveTimeEntry?: (entry: CalendarTimeEntry, newStart: Date, newEnd: Date) => void;
  onResizeTimeEntry?: (entry: CalendarTimeEntry, newStart: Date, newEnd: Date) => void;
}

export function CalendarDayTimeGrid({
  events,
  scheduledActions,
  timeEntries = [],
  selectedDate,
  onActionClick,
  onRescheduleAction,
  onResizeAction,
  onTimeEntryClick,
  onMoveTimeEntry,
  onResizeTimeEntry,
}: CalendarDayTimeGridProps) {
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

  // Calculate positioned items (unified events + actions with overlap detection)
  const positionedItems = useMemo(() => {
    const eventItems = events
      .map((event) => convertEventToCalendarItem(event, selectedDate))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const actionItems = scheduledActions
      .map((action) => convertActionToCalendarItem(action, selectedDate))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const timeEntryItems = timeEntries
      .map((te) => convertTimeEntryToCalendarItem(te, selectedDate))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const allItems = [...eventItems, ...actionItems, ...timeEntryItems];
    return calculateOverlappingPositions(allItems, 100, 0);
  }, [events, scheduledActions, timeEntries, selectedDate]);

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
    const timeMatch = /calendar-slot-(\d+):(\d+)/.exec(slotId);
    if (!timeMatch) {
      setActiveAction(null);
      setActiveTimeEntry(null);
      return;
    }
    const hour = parseInt(timeMatch[1]!);
    const minute = parseInt(timeMatch[2]!);

    const timeEntry = active.data.current?.timeEntry as CalendarTimeEntry | undefined;
    if (timeEntry) {
      // Preserve duration: cap running entries to a 30-minute default for the move.
      const startedAt = new Date(timeEntry.startedAt);
      const endedAt = timeEntry.endedAt ? new Date(timeEntry.endedAt) : null;
      const durationMs = endedAt
        ? endedAt.getTime() - startedAt.getTime()
        : 30 * 60_000;
      const newStart = new Date(selectedDate);
      newStart.setHours(hour, minute, 0, 0);
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

    const newStart = new Date(selectedDate);
    newStart.setHours(hour, minute, 0, 0);
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
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 180px)" }}>
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

            {/* Drop slots (invisible 15-min intervals) */}
            {dropSlots.map(({ hour, minute }) => (
              <DropSlot key={`slot-${hour}-${minute}`} hour={hour} minute={minute} slotIdPrefix="calendar-slot" />
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
                      zIndex: 10 + item.column,
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
                      zIndex: 10 + item.column,
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
                      zIndex: 10 + item.column,
                    }}
                    onClick={onTimeEntryClick}
                    onResize={onResizeTimeEntry}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
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
      className="absolute left-0 right-0 border-t-2 border-event-rose"
      style={{ top, zIndex: 100 }}
    >
      <div className="-ml-1 -mt-1 h-2 w-2 rounded-full bg-event-rose" />
    </div>
  );
}
