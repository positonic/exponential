"use client";

import { Box, Paper, Text, Stack, ScrollArea, Tooltip } from "@mantine/core";
import { format, parseISO, startOfDay, isToday, isSameDay } from "date-fns";
import { CalendarEvent } from "~/server/services/GoogleCalendarService";
import { useMemo } from "react";

interface CalendarDayViewProps {
  events: CalendarEvent[];
  selectedDate: Date;
  className?: string;
}

interface PositionedEvent extends CalendarEvent {
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function CalendarDayView({ events, selectedDate, className = "" }: CalendarDayViewProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_HEIGHT = 60; // pixels per hour
  const MINUTES_PER_HOUR = 60;

  const positionedEvents = useMemo(() => {
    const dayStart = startOfDay(selectedDate);
    
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
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i]!;
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
    if (event.status === 'cancelled') return 'bg-red-500/20 border-red-500/50 text-red-200';
    if (event.status === 'tentative') return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200';
    
    // Default color variations
    const colors = [
      'bg-blue-500/20 border-blue-500/50 text-blue-200',
      'bg-green-500/20 border-green-500/50 text-green-200',
      'bg-purple-500/20 border-purple-500/50 text-purple-200',
      'bg-indigo-500/20 border-indigo-500/50 text-indigo-200',
    ];
    
    const colorIndex = event.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex] || colors[0];
  };

  return (
    <div className={`relative ${className}`}>
      <ScrollArea h={400} scrollbarSize={8}>
        {/* Time grid */}
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT + 40 }}>
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
                  const currentTimeInMinutes = currentHour * 60 + currentMinutes;
                  const currentTop = (currentTimeInMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT;
                  
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
                      {event.description.substring(0, 100)}
                      {event.description.length > 100 ? '...' : ''}
                    </Text>
                  )}
                </Stack>
              }
              multiline
              position="right"
              withArrow
            >
              <Paper
                className={`absolute cursor-pointer border transition-all hover:brightness-110 ${getEventColor(event)}`}
                style={{
                  top: event.top,
                  left: event.left,
                  width: event.width,
                  height: event.height,
                  zIndex: event.zIndex,
                  minHeight: '20px',
                }}
                p="xs"
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
              </Paper>
            </Tooltip>
          ))}

          {/* All-day events area */}
          {positionedEvents.some(e => e.start.date) && (
            <div className="absolute top-0 left-12 right-0 bg-gray-800/30 border-b border-gray-700">
              <Text size="xs" c="dimmed" p="xs">All day</Text>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}