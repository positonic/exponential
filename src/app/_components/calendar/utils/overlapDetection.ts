import { parseISO, isSameDay } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "../types";
import { HOUR_HEIGHT, VISIBLE_START_HOUR } from "../types";

/**
 * Unified calendar item type for overlap detection
 */
export interface CalendarItem {
  id: string;
  type: "event" | "action";
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  // Preserve original items for rendering
  originalEvent?: CalendarEvent;
  originalAction?: ScheduledAction;
}

/**
 * Calendar item with calculated position properties
 */
export interface PositionedCalendarItem extends CalendarItem {
  left: number;
  width: number;
  column: number;
  totalColumns: number;
}

/**
 * Check if two calendar items overlap in time
 */
export function itemsOverlap(a: CalendarItem, b: CalendarItem): boolean {
  const aEnd = a.top + a.height;
  const bEnd = b.top + b.height;
  // Items overlap if one starts before the other ends
  return a.top < bEnd && b.top < aEnd;
}

/**
 * Build clusters of items that transitively overlap with each other.
 * Items in the same cluster share column space, while separate clusters
 * are positioned independently.
 */
function buildOverlapClusters(
  items: PositionedCalendarItem[]
): PositionedCalendarItem[][] {
  if (items.length === 0) return [];

  // Sort by start time (top position)
  const sorted = [...items].sort((a, b) => a.top - b.top);

  const clusters: PositionedCalendarItem[][] = [];
  let currentCluster: PositionedCalendarItem[] = [sorted[0]!];
  let clusterEnd = sorted[0]!.top + sorted[0]!.height;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;

    // Check if this item overlaps with the current cluster
    // An item overlaps with a cluster if it starts before the cluster ends
    if (item.top < clusterEnd) {
      // Add to current cluster and extend cluster end if needed
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.top + item.height);
    } else {
      // No overlap - start a new cluster
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.top + item.height;
    }
  }

  // Don't forget the last cluster
  clusters.push(currentCluster);

  return clusters;
}

/**
 * Apply column-based layout to a single cluster of overlapping items.
 * Uses greedy algorithm to place items in columns.
 */
function layoutCluster(
  cluster: PositionedCalendarItem[],
  containerWidth: number,
  baseLeft: number
): void {
  if (cluster.length === 0) return;

  // Sort by start time, then by type (events first for consistency)
  cluster.sort((a, b) => {
    if (a.top !== b.top) return a.top - b.top;
    if (a.type !== b.type) return a.type === "event" ? -1 : 1;
    return 0;
  });

  // Group items into columns using greedy algorithm
  const columns: PositionedCalendarItem[][] = [];

  cluster.forEach((item) => {
    let placed = false;

    // Try to place in an existing column
    for (const column of columns) {
      const lastItemInColumn = column[column.length - 1];

      // Check if item starts after the last item in this column ends
      if (
        !lastItemInColumn ||
        item.top >= lastItemInColumn.top + lastItemInColumn.height
      ) {
        column.push(item);
        placed = true;
        break;
      }
    }

    // If item couldn't fit in any existing column, create a new one
    if (!placed) {
      columns.push([item]);
    }
  });

  // Calculate widths and positions based on column count within this cluster
  const numColumns = columns.length;
  const columnWidth =
    numColumns > 0 ? containerWidth / numColumns : containerWidth;

  columns.forEach((column, columnIndex) => {
    column.forEach((item) => {
      item.column = columnIndex;
      item.totalColumns = numColumns;
      item.left = baseLeft + columnIndex * columnWidth;
      item.width = columnWidth - 2; // 2px gap between columns for visual separation
    });
  });
}

/**
 * Calculate positions for overlapping calendar items using column-based layout.
 * Items are grouped into overlap clusters, and each cluster is laid out independently.
 * Items that don't overlap with anything get full width.
 *
 * @param items - Array of calendar items to position
 * @param containerWidth - Available width for positioning (pixels or percentage)
 * @param baseLeft - Starting left position offset (default 0)
 * @returns Array of positioned items with calculated left, width, and column properties
 */
export function calculateOverlappingPositions(
  items: CalendarItem[],
  containerWidth: number,
  baseLeft = 0
): PositionedCalendarItem[] {
  if (items.length === 0) return [];

  // Initialize all items as positioned items with default full width
  const positioned: PositionedCalendarItem[] = items.map((item) => ({
    ...item,
    left: baseLeft,
    width: containerWidth - 2,
    column: 0,
    totalColumns: 1,
  }));

  // Build clusters of overlapping items
  const clusters = buildOverlapClusters(positioned);

  // Layout each cluster independently
  clusters.forEach((cluster) => {
    layoutCluster(cluster, containerWidth, baseLeft);
  });

  // Return items sorted by start time for consistent rendering
  return positioned.sort((a, b) => {
    if (a.top !== b.top) return a.top - b.top;
    if (a.type !== b.type) return a.type === "event" ? -1 : 1;
    return 0;
  });
}

/**
 * Convert a CalendarEvent to a CalendarItem for overlap detection
 *
 * @param event - Google Calendar event
 * @param selectedDate - Date to filter events for
 * @returns CalendarItem or null if event doesn't match the selected date
 */
export function convertEventToCalendarItem(
  event: CalendarEvent,
  selectedDate: Date
): CalendarItem | null {
  // Check if event is on the selected date
  const isOnSelectedDate = (() => {
    if (event.start.date) {
      return isSameDay(new Date(event.start.date), selectedDate);
    } else if (event.start.dateTime) {
      return isSameDay(parseISO(event.start.dateTime), selectedDate);
    }
    return false;
  })();

  if (!isOnSelectedDate) return null;

  let top = 0;
  let height = HOUR_HEIGHT;
  let startMinutes = 0;
  let endMinutes = 60;

  // Calculate position for timed events
  if (event.start.dateTime && event.end.dateTime) {
    const startTime = parseISO(event.start.dateTime);
    const endTime = parseISO(event.end.dateTime);

    startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

    top = ((startMinutes - VISIBLE_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);
  }
  // Handle all-day events
  else if (event.start.date) {
    top = -40;
    height = 30;
  }

  return {
    id: event.id,
    type: "event",
    top,
    height,
    startMinutes,
    endMinutes,
    originalEvent: event,
  };
}

/**
 * Convert a ScheduledAction to a CalendarItem for overlap detection
 *
 * @param action - Scheduled action
 * @param selectedDate - Date to filter actions for
 * @returns CalendarItem or null if action doesn't match the selected date
 */
export function convertActionToCalendarItem(
  action: ScheduledAction,
  selectedDate: Date
): CalendarItem | null {
  if (!action.scheduledStart) return null;

  // Check if action is on the selected date
  const isOnSelectedDate = isSameDay(
    new Date(action.scheduledStart),
    selectedDate
  );

  if (!isOnSelectedDate) return null;

  const startTime = new Date(action.scheduledStart);
  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();

  // Calculate end time from duration or scheduledEnd
  let endMinutes = startMinutes + 30; // Default 30 minutes
  if (action.duration) {
    endMinutes = startMinutes + action.duration;
  } else if (action.scheduledEnd) {
    const endTime = new Date(action.scheduledEnd);
    endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
  }

  const top = ((startMinutes - VISIBLE_START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 25);

  return {
    id: action.id,
    type: "action",
    top,
    height,
    startMinutes,
    endMinutes,
    originalAction: action,
  };
}
