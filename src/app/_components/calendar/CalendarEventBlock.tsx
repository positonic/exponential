"use client";

import { Text, Stack, Tooltip, Checkbox } from "@mantine/core";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import { stripHtml } from "~/lib/utils";

interface EventBlockProps {
  event: CalendarEvent;
  style: React.CSSProperties;
}

interface ActionBlockProps {
  action: ScheduledAction;
  style: React.CSSProperties;
  onStatusChange?: (actionId: string, completed: boolean) => void;
  onClick?: (actionId: string) => void;
}

function getEventColor(event: CalendarEvent): string {
  if (event.status === "cancelled")
    return "bg-red-500/20 border-l-4 border-l-red-500 border-y-0 border-r-0 text-red-200";
  if (event.status === "tentative")
    return "bg-yellow-500/20 border-l-4 border-l-yellow-500 border-y-0 border-r-0 text-yellow-200";

  // Colors matching Reclaim.ai/screenshot style - solid left border with transparent fill
  const colors: string[] = [
    "bg-blue-500/20 border-l-4 border-l-blue-500 border-y-0 border-r-0 text-blue-100", // Blue
    "bg-teal-500/20 border-l-4 border-l-teal-500 border-y-0 border-r-0 text-teal-100", // Teal
    "bg-rose-500/20 border-l-4 border-l-rose-500 border-y-0 border-r-0 text-rose-100", // Coral/Rose
    "bg-violet-500/20 border-l-4 border-l-violet-500 border-y-0 border-r-0 text-violet-100", // Purple
    "bg-amber-500/20 border-l-4 border-l-amber-500 border-y-0 border-r-0 text-amber-100", // Amber
    "bg-cyan-500/20 border-l-4 border-l-cyan-500 border-y-0 border-r-0 text-cyan-100", // Cyan
  ];

  const colorIndex =
    event.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;
  // Safe to assert non-null since colorIndex is always within bounds (modulo operation)
  return colors[colorIndex]!;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.start.dateTime) {
    const startTime = parseISO(event.start.dateTime);
    const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;

    if (endTime) {
      return `${format(startTime, "h:mm a")} - ${format(endTime, "h:mm a")}`;
    }
    return format(startTime, "h:mm a");
  }
  return "All day";
}

export function CalendarEventBlock({ event, style }: EventBlockProps) {
  const height = typeof style.height === "number" ? style.height : 60;

  return (
    <Tooltip
      label={
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {event.summary}
          </Text>
          <Text size="xs">{formatEventTime(event)}</Text>
          {event.location && <Text size="xs">{event.location}</Text>}
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
        className={`absolute cursor-pointer rounded-sm p-1.5 transition-all hover:brightness-110 ${getEventColor(event)}`}
        style={style}
        onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
      >
        <Text
          size="xs"
          fw={600}
          className="leading-tight"
          style={{
            fontSize: "11px",
            lineHeight: "1.2",
            display: "-webkit-box",
            WebkitLineClamp: height < 40 ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {event.summary}
        </Text>

        {height >= 35 && event.start.dateTime && (
          <Text size="xs" c="dimmed" style={{ fontSize: "10px" }}>
            {format(parseISO(event.start.dateTime), "h:mm a")}
          </Text>
        )}
      </div>
    </Tooltip>
  );
}

export function CalendarActionBlock({
  action,
  style,
  onStatusChange,
  onClick,
}: ActionBlockProps) {
  const height = typeof style.height === "number" ? style.height : 60;
  const isCompleted = action.status === "COMPLETED";

  return (
    <Tooltip
      label={
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {action.name}
          </Text>
          <Text size="xs">
            {format(new Date(action.scheduledStart), "h:mm a")}
            {action.duration && ` (${action.duration} min)`}
          </Text>
          {action.project && <Text size="xs">{action.project.name}</Text>}
        </Stack>
      }
      multiline
      position="right"
      withArrow
    >
      <div
        className={`absolute cursor-pointer rounded-sm p-1.5 transition-all hover:brightness-110 ${
          isCompleted
            ? "bg-green-500/20 border-l-4 border-l-green-500 border-y-0 border-r-0 text-green-100 line-through opacity-60"
            : "bg-brand-primary/20 border-l-4 border-l-brand-primary border-y-0 border-r-0 text-text-primary"
        }`}
        style={style}
        onClick={() => onClick?.(action.id)}
      >
        <div className="flex items-start gap-1.5">
          <Checkbox
            size="xs"
            radius="xl"
            checked={isCompleted}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange?.(action.id, e.currentTarget.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            styles={{
              input: {
                backgroundColor: "transparent",
                borderColor: "var(--color-brand-primary)",
              },
            }}
          />
          <Stack gap={0} className="min-w-0 flex-1">
            <Text
              size="xs"
              fw={600}
              className="leading-tight"
              style={{
                fontSize: "11px",
                lineHeight: "1.2",
                display: "-webkit-box",
                WebkitLineClamp: height < 40 ? 1 : 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {action.name}
            </Text>

            {height >= 35 && (
              <Text size="xs" c="dimmed" style={{ fontSize: "10px" }}>
                {format(new Date(action.scheduledStart), "h:mm a")}
              </Text>
            )}
          </Stack>
        </div>
      </div>
    </Tooltip>
  );
}
