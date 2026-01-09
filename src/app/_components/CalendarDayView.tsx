"use client";

import { Text, Stack, Tooltip, Checkbox } from "@mantine/core";
import { format, parseISO, isToday, isSameDay } from "date-fns";
import { type CalendarEvent } from "~/server/services/GoogleCalendarService";
import { useMemo } from "react";
import { stripHtml } from "~/lib/utils";

// Type for scheduled actions
interface ScheduledAction {
  id: string;
  name: string;
  scheduledStart: Date;
  scheduledEnd?: Date | null;
  duration?: number | null;
  status: string;
  project?: { id: string; name: string } | null;
}

interface CalendarDayViewProps {
  events: CalendarEvent[];
  scheduledActions?: ScheduledAction[];
  selectedDate: Date;
  className?: string;
  onActionClick?: (actionId: string) => void;
  onActionStatusChange?: (actionId: string, completed: boolean) => void;
}

interface PositionedEvent extends CalendarEvent {
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

interface PositionedAction {
  action: ScheduledAction;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function CalendarDayView({
  events,
  scheduledActions = [],
  selectedDate,
  className = "",
  onActionClick,
  onActionStatusChange,
}: CalendarDayViewProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_HEIGHT = 60; // pixels per hour
  const MINUTES_PER_HOUR = 60;

  const positionedEvents = useMemo(() => {
    
    // Filter and process events for the selected date
    const dayEvents = events.filter(event => {
      if (event.start.date) {
        // All-day events
        return isSameDay(new Date(event.start.date), selectedDate);
      } else if (event.start.dateTime) {
        // Timed events
        return isSameDay(parseISO(event.start.dateTime), selectedDate);
      }
      return false;
    });

    // Convert events to positioned events
    const positioned: PositionedEvent[] = dayEvents.map(event => {
      let top = 0;
      let height = HOUR_HEIGHT; // Default 1 hour

      if (event.start.dateTime && event.end.dateTime) {
        const startTime = parseISO(event.start.dateTime);
        const endTime = parseISO(event.end.dateTime);
        
        // Calculate position from start of day
        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
        const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
        
        top = (startMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT;
        height = Math.max(((endMinutes - startMinutes) / MINUTES_PER_HOUR) * HOUR_HEIGHT, 20); // Min 20px height
      } else if (event.start.date) {
        // All-day events go at the top
        top = -40;
        height = 30;
      }

      return {
        ...event,
        top,
        height,
        left: 60, // Start after time labels
        width: 0, // Will be calculated after overlap detection
        zIndex: 1,
      };
    });

    // Handle overlapping events
    const sortedEvents = positioned.sort((a, b) => a.top - b.top);
    const columns: PositionedEvent[][] = [];

    sortedEvents.forEach(event => {
      // Find a column where this event doesn't overlap with the last event
      let placed = false;
      for (const column of columns) {
        const lastEvent = column[column.length - 1];
        
        if (!lastEvent || (event.top >= lastEvent.top + lastEvent.height)) {
          column.push(event);
          placed = true;
          break;
        }
      }
      
      if (!placed) {
        columns.push([event]);
      }
    });

    // Calculate widths and positions
    const containerWidth = 300; // Available width for events
    const numColumns = columns.length;
    const columnWidth = numColumns > 0 ? containerWidth / numColumns : containerWidth;

    columns.forEach((column, columnIndex) => {
      column.forEach(event => {
        event.left = 60 + (columnIndex * columnWidth);
        event.width = columnWidth - 2; // Small gap between columns
        event.zIndex = columnIndex + 1;
      });
    });

    return sortedEvents;
  }, [events, selectedDate]);

  // Calculate positioned scheduled actions
  const positionedActions = useMemo(() => {
    // Filter actions for the selected date
    const dayActions = scheduledActions.filter(action => {
      if (!action.scheduledStart) return false;
      const actionDate = new Date(action.scheduledStart);
      return isSameDay(actionDate, selectedDate);
    });

    // Convert actions to positioned actions
    const positioned: PositionedAction[] = dayActions.map(action => {
      const startTime = new Date(action.scheduledStart);
      const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();

      // Calculate end time based on duration or scheduledEnd
      let endMinutes = startMinutes + 30; // Default 30 minutes
      if (action.duration) {
        endMinutes = startMinutes + action.duration;
      } else if (action.scheduledEnd) {
        const endTime = new Date(action.scheduledEnd);
        endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
      }

      const top = (startMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT;
      const height = Math.max(((endMinutes - startMinutes) / MINUTES_PER_HOUR) * HOUR_HEIGHT, 25);

      return {
        action,
        top,
        height,
        left: 60,
        width: 0,
        zIndex: 10,
      };
    });

    // Simple positioning - place actions to the right of calendar events
    positioned.forEach(pos => {
      pos.left = 60;
      pos.width = 290;
    });

    return positioned;
  }, [scheduledActions, selectedDate, HOUR_HEIGHT, MINUTES_PER_HOUR]);

  const formatEventTime = (event: CalendarEvent) => {
    if (event.start.dateTime) {
      const startTime = parseISO(event.start.dateTime);
      const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;
      
      if (endTime) {
        return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
      } else {
        return format(startTime, 'h:mm a');
      }
    }
    return 'All day';
  };

  const getEventColor = (event: CalendarEvent) => {
    // Simple color assignment based on event status/type
    if (event.status === 'cancelled') return 'bg-red-900/40 border-red-700 text-red-100';
    if (event.status === 'tentative') return 'bg-yellow-900/40 border-yellow-700 text-yellow-100';
    
    // Default color variations with darker backgrounds
    const colors = [
      'bg-blue-900/40 border-blue-700 text-blue-100',
      'bg-green-900/40 border-green-700 text-green-100',
      'bg-purple-900/40 border-purple-700 text-purple-100',
      'bg-indigo-900/40 border-indigo-700 text-indigo-100',
    ];
    
    const colorIndex = event.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex] || colors[0];
  };

  return (
    <div className={`relative ${className} overflow-hidden`}>
      {/* Time grid */}
      <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
        {/* Hour lines and labels */}
        {hours.map(hour => (
            <div
              key={hour}
              className="absolute w-full border-t border-gray-700/50 flex items-start"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <Text
                size="xs"
                c="dimmed"
                className="w-12 pr-2 pt-1 text-right"
                style={{ fontSize: '10px' }}
              >
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </Text>
              
              {/* Current time indicator */}
              {isToday(selectedDate) && (
                (() => {
                  const now = new Date();
                  const currentHour = now.getHours();
                  const currentMinutes = now.getMinutes();
                  
                  if (hour <= currentHour && currentHour < hour + 1) {
                    return (
                      <div
                        className="absolute left-12 w-full border-t-2 border-red-500"
                        style={{ 
                          top: (currentMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT,
                          zIndex: 100 
                        }}
                      >
                        <div className="w-2 h-2 bg-red-500 rounded-full -mt-1 -ml-1"></div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          ))}

          {/* Events */}
          {positionedEvents.map(event => (
            <Tooltip
              key={event.id}
              label={
                <Stack gap={4}>
                  <Text size="sm" fw={600}>{event.summary}</Text>
                  <Text size="xs">{formatEventTime(event)}</Text>
                  {event.location && <Text size="xs">📍 {event.location}</Text>}
                  {event.description && (
                    <Text size="xs" className="max-w-xs">
                      {(() => {
                        const cleanDescription = stripHtml(event.description);
                        return cleanDescription.length > 100 
                          ? `${cleanDescription.substring(0, 100)}...`
                          : cleanDescription;
                      })()}
                    </Text>
                  )}
                </Stack>
              }
              multiline
              position="right"
              withArrow
            >
              <div
                className={`absolute cursor-pointer border transition-all hover:brightness-110 p-2 rounded-md ${getEventColor(event)}`}
                style={{
                  top: event.top,
                  left: event.left,
                  width: event.width,
                  height: event.height,
                  zIndex: event.zIndex,
                  minHeight: '20px',
                }}
                onClick={() => window.open(event.htmlLink, '_blank')}
              >
                <Stack gap={2}>
                  <Text
                    size="xs"
                    fw={600}
                    className="leading-tight"
                    style={{ 
                      fontSize: '11px',
                      lineHeight: '1.2',
                      display: '-webkit-box',
                      WebkitLineClamp: event.height < 40 ? 1 : 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {event.summary}
                  </Text>
                  
                  {event.height >= 35 && event.start.dateTime && (
                    <Text 
                      size="xs" 
                      c="dimmed" 
                      style={{ fontSize: '10px' }}
                    >
                      {format(parseISO(event.start.dateTime), 'h:mm a')}
                    </Text>
                  )}
                </Stack>
              </div>
            </Tooltip>
          ))}

          {/* Scheduled Actions */}
          {positionedActions.map(({ action, top, height, left, width, zIndex }) => (
            <Tooltip
              key={action.id}
              label={
                <Stack gap={4}>
                  <Text size="sm" fw={600}>{action.name}</Text>
                  <Text size="xs">
                    {format(new Date(action.scheduledStart), 'h:mm a')}
                    {action.duration && ` (${action.duration} min)`}
                  </Text>
                  {action.project && <Text size="xs">📁 {action.project.name}</Text>}
                </Stack>
              }
              multiline
              position="right"
              withArrow
            >
              <div
                className={`absolute cursor-pointer border transition-all hover:brightness-110 p-2 rounded-md ${
                  action.status === 'COMPLETED'
                    ? 'bg-green-900/40 border-green-700 text-green-100 line-through opacity-60'
                    : 'bg-brand-primary/20 border-brand-primary/50 text-text-primary'
                }`}
                style={{
                  top,
                  left,
                  width,
                  height,
                  zIndex,
                  minHeight: '25px',
                }}
                onClick={() => onActionClick?.(action.id)}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    size="xs"
                    radius="xl"
                    checked={action.status === 'COMPLETED'}
                    onChange={(e) => {
                      e.stopPropagation();
                      onActionStatusChange?.(action.id, e.currentTarget.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    styles={{
                      input: {
                        backgroundColor: 'transparent',
                        borderColor: 'var(--color-brand-primary)',
                      },
                    }}
                  />
                  <Stack gap={2} className="flex-1 min-w-0">
                    <Text
                      size="xs"
                      fw={600}
                      className="leading-tight"
                      style={{
                        fontSize: '11px',
                        lineHeight: '1.2',
                        display: '-webkit-box',
                        WebkitLineClamp: height < 40 ? 1 : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {action.name}
                    </Text>

                    {height >= 35 && (
                      <Text size="xs" c="dimmed" style={{ fontSize: '10px' }}>
                        {format(new Date(action.scheduledStart), 'h:mm a')}
                      </Text>
                    )}
                  </Stack>
                </div>
              </div>
            </Tooltip>
          ))}

          {/* All-day events area */}
          {positionedEvents.some(e => e.start.date) && (
            <div className="absolute top-0 left-12 right-0 bg-gray-800/30 border-b border-gray-700">
              <Text size="xs" c="dimmed" p="xs">All day</Text>
            </div>
          )}
        </div>
    </div>
  );
}