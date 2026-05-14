"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { format } from "date-fns";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import type { ScheduledAction, CalendarTimeEntry } from "./types";
import { HOUR_HEIGHT, VISIBLE_START_HOUR, VISIBLE_END_HOUR } from "./types";
import { CalendarActionBlock } from "./CalendarEventBlock";
import { CalendarTimeEntryBlock } from "./CalendarTimeEntryBlock";
import { ResizableBlock } from "./ResizableBlock";
import { HTMLContent } from "~/app/_components/HTMLContent";

// Constants for drop slot sizing
export const SLOT_MINUTES = 15;
export const SLOT_HEIGHT = (HOUR_HEIGHT / 60) * SLOT_MINUTES;
export const TOTAL_SLOTS =
  ((VISIBLE_END_HOUR - VISIBLE_START_HOUR) * 60) / SLOT_MINUTES;

/**
 * Invisible 15-minute drop zone for drag-and-drop scheduling.
 * slotIdPrefix determines the ID format:
 *   Day view:  "calendar-slot-14:30"
 *   Week view: "week-slot-2026-02-26-14:30"
 */
export function DropSlot({
  hour,
  minute,
  slotIdPrefix,
}: {
  hour: number;
  minute: number;
  slotIdPrefix: string;
}) {
  const slotId = `${slotIdPrefix}-${hour}:${minute.toString().padStart(2, "0")}`;
  const { setNodeRef, isOver } = useDroppable({ id: slotId });
  const top = (((hour - VISIBLE_START_HOUR) * 60 + minute) / 60) * HOUR_HEIGHT;

  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 transition-colors ${isOver ? "z-50 bg-brand-primary/15" : ""}`}
      style={{ top, height: SLOT_HEIGHT }}
    />
  );
}

/** Draggable wrapper around CalendarActionBlock */
export function DraggableActionBlock({
  action,
  style,
  onClick,
  onResize,
}: {
  action: ScheduledAction;
  style: React.CSSProperties;
  onClick?: (action: ScheduledAction) => void;
  onResize?: (action: ScheduledAction, newStart: Date, newEnd: Date) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${action.id}`,
    data: { action },
  });

  const start = action.scheduledStart ? new Date(action.scheduledStart) : null;
  const end = action.scheduledEnd
    ? new Date(action.scheduledEnd)
    : start && action.duration
      ? new Date(start.getTime() + action.duration * 60_000)
      : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute"
      style={{
        ...style,
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      {start && end && onResize ? (
        <ResizableBlock
          startedAt={start}
          endedAt={end}
          onCommit={(s, e) => onResize(action, s, e)}
        >
          <CalendarActionBlock
            action={action}
            style={{ position: "relative", width: "100%", height: "100%" }}
            onClick={onClick}
          />
        </ResizableBlock>
      ) : (
        <CalendarActionBlock
          action={action}
          style={{ position: "relative", width: "100%", height: "100%" }}
          onClick={onClick}
        />
      )}
    </div>
  );
}

/** Draggable wrapper around CalendarTimeEntryBlock with resize handles. */
export function DraggableTimeEntryBlock({
  entry,
  style,
  onClick,
  onResize,
}: {
  entry: CalendarTimeEntry;
  style: React.CSSProperties;
  onClick?: (entry: CalendarTimeEntry) => void;
  onResize?: (entry: CalendarTimeEntry, newStart: Date, newEnd: Date) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-te-${entry.id}`,
    data: { timeEntry: entry },
  });

  const start = new Date(entry.startedAt);
  const end = entry.endedAt ? new Date(entry.endedAt) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute"
      style={{
        ...style,
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      {onResize ? (
        <ResizableBlock
          startedAt={start}
          endedAt={end}
          onCommit={(s, e) => onResize(entry, s, e)}
        >
          <CalendarTimeEntryBlock
            entry={entry}
            style={{ position: "relative", width: "100%", height: "100%" }}
            onClick={onClick}
          />
        </ResizableBlock>
      ) : (
        <CalendarTimeEntryBlock
          entry={entry}
          style={{ position: "relative", width: "100%", height: "100%" }}
          onClick={onClick}
        />
      )}
    </div>
  );
}

/** Floating preview shown during TimeEntry drag */
export function TimeEntryDragOverlay({ entry }: { entry: CalendarTimeEntry }) {
  return (
    <div
      className="overflow-hidden rounded-sm bg-brand-primary p-1.5 text-text-inverse shadow-lg"
      style={{ width: 200, pointerEvents: "none" }}
    >
      <Text
        size="xs"
        fw={600}
        lineClamp={1}
        className="text-text-inverse"
        style={{ fontSize: "11px" }}
      >
        {entry.action.name}
      </Text>
      <Text size="xs" className="text-text-inverse" style={{ fontSize: "10px", opacity: 0.85 }}>
        {format(new Date(entry.startedAt), "h:mm a")}
      </Text>
    </div>
  );
}

/** Floating preview shown during drag */
export function ActionDragOverlay({
  action,
}: {
  action: ScheduledAction;
}) {
  return (
    <div
      className="overflow-hidden rounded-sm border-l-4 border-l-brand-primary bg-brand-primary/30 p-1.5 shadow-lg"
      style={{ width: 200, pointerEvents: "none" }}
    >
      <Text
        size="xs"
        fw={600}
        lineClamp={1}
        component="div"
        style={{ fontSize: "11px" }}
      >
        <HTMLContent html={action.name} compactUrls />
      </Text>
      <Text size="xs" c="dimmed" style={{ fontSize: "10px" }}>
        {format(new Date(action.scheduledStart), "h:mm a")}
        {action.duration ? ` · ${action.duration} min` : ""}
      </Text>
    </div>
  );
}

/** Generate the array of drop slot positions (reusable across views) */
export function useDropSlots() {
  return useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, i) => {
      const totalMinutes = VISIBLE_START_HOUR * 60 + i * SLOT_MINUTES;
      return {
        hour: Math.floor(totalMinutes / 60),
        minute: totalMinutes % 60,
      };
    });
  }, []);
}
