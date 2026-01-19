import type { CalendarEvent } from "~/server/services/GoogleCalendarService";

export type CalendarView = "day" | "week";

export interface CalendarNavigation {
  view: CalendarView;
  selectedDate: Date;
  dateRange: { start: Date; end: Date };
}

export interface ScheduledAction {
  id: string;
  name: string;
  scheduledStart: Date;
  scheduledEnd?: Date | null;
  duration?: number | null;
  status: string;
  project?: { id: string; name: string } | null;
}

export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  column: number;
  totalColumns: number;
}

export interface PositionedAction {
  action: ScheduledAction;
  top: number;
  height: number;
  left: number;
  width: number;
  column: number;
  totalColumns: number;
}

// Constants for time grid rendering
export const HOUR_HEIGHT = 60; // pixels per hour
export const VISIBLE_START_HOUR = 7; // 7 AM
export const VISIBLE_END_HOUR = 21; // 9 PM
export const TIME_LABEL_WIDTH = 60; // pixels for time labels column
