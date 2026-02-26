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
  ActionDragOverlay,
  useDropSlots,
} from "./CalendarDndComponents";
import {
  calculateOverlappingPositions,
  convertEventToCalendarItem,
  convertActionToCalendarItem,
} from "./utils/overlapDetection";

interface CalendarDayTimeGridProps {
  events: CalendarEvent[];
  scheduledActions: ScheduledAction[];
  selectedDate: Date;
  onActionClick?: (action: ScheduledAction) => void;
  onRescheduleAction?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
}

export function CalendarDayTimeGrid({
  events,
  scheduledActions,
  selectedDate,
  onActionClick,
  onRescheduleAction,
}: CalendarDayTimeGridProps) {
  const [activeAction, setActiveAction] = useState<ScheduledAction | null>(null);

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

    const allItems = [...eventItems, ...actionItems];
    return calculateOverlappingPositions(allItems, 100, 0);
  }, [events, scheduledActions, selectedDate]);

  const dropSlots = useDropSlots();

  const gridHeight = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * HOUR_HEIGHT;

  const handleDragStart = (event: DragStartEvent) => {
    const action = event.active.data.current?.action as ScheduledAction | undefined;
    setActiveAction(action ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveAction(null);
      return;
    }

    const action = active.data.current?.action as ScheduledAction | undefined;
    const slotId = over.id as string;
    const timeMatch = /calendar-slot-(\d+):(\d+)/.exec(slotId);
    if (!timeMatch || !action) {
      setActiveAction(null);
      return;
    }

    const hour = parseInt(timeMatch[1]!);
    const minute = parseInt(timeMatch[2]!);
    const duration = action.duration ?? 30;

    const newStart = new Date(selectedDate);
    newStart.setHours(hour, minute, 0, 0);
    const newEnd = new Date(newStart);
    newEnd.setMinutes(newEnd.getMinutes() + duration);

    // Fire reschedule first (synchronous optimistic update) then clear overlay
    onRescheduleAction?.(action, newStart, newEnd);
    setActiveAction(null);
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
