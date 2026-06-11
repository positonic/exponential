"use client";

import { Text, Stack, Tooltip } from "@mantine/core";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { ScheduledAction } from "./types";
import { stripHtml } from "~/lib/utils";
import { HTMLContent } from "~/app/_components/HTMLContent";
import {
  getEventHue,
  eventChipClasses,
  EVENT_HUE_CLASSES,
} from "./eventHue";

interface EventBlockProps {
  // Base CalendarEvent at the type level; getEventHue reads calendarId
  // structurally (it's present at runtime on the multi-calendar payload)
  // to keep the hue stable per source calendar.
  event: CalendarEvent;
  style: React.CSSProperties;
}

interface ActionBlockProps {
  action: ScheduledAction;
  style: React.CSSProperties;
  onClick?: (action: ScheduledAction) => void;
}

function isEventPast(event: CalendarEvent): boolean {
  const endIso = event.end.dateTime ?? event.end.date;
  if (!endIso) return false;
  return new Date(endIso).getTime() < Date.now();
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
  const hue = getEventHue(event);
  const isPast = isEventPast(event);
  const hueClasses = EVENT_HUE_CLASSES[hue];

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
        className={`absolute cursor-pointer overflow-hidden rounded-sm p-1.5 transition-all ${eventChipClasses(hue, { isPast })}`}
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
            wordBreak: "break-word",
          }}
        >
          {event.summary}
        </Text>

        {height >= 35 && event.start.dateTime && (
          <Text
            size="xs"
            className={isPast ? hueClasses.labelPast : hueClasses.sub}
            style={{ fontSize: "10px" }}
          >
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
  onClick,
}: ActionBlockProps) {
  const height = typeof style.height === "number" ? style.height : 60;
  const isCompleted = action.status === "COMPLETED";
  // Active scheduled tasks read as default-work indigo; completed ones fade
  // to low-signal slate with a strike-through.
  const actionSubClass = isCompleted
    ? EVENT_HUE_CLASSES.slate.labelPast
    : EVENT_HUE_CLASSES.indigo.sub;

  return (
    <Tooltip
      label={
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {stripHtml(action.name)}
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
        className={`absolute cursor-pointer overflow-hidden rounded-sm p-1.5 transition-all ${
          isCompleted
            ? `${eventChipClasses("slate", { isPast: true })} line-through opacity-60`
            : eventChipClasses("indigo")
        }`}
        style={style}
        onClick={() => onClick?.(action)}
      >
        <Text
          size="xs"
          fw={600}
          className="leading-tight"
          component="div"
          style={{
            fontSize: "11px",
            lineHeight: "1.2",
            display: "-webkit-box",
            WebkitLineClamp: height < 40 ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          <HTMLContent html={action.name} compactUrls />
        </Text>

        {height >= 35 && (
          <Text
            size="xs"
            className={actionSubClass}
            style={{ fontSize: "10px" }}
          >
            {format(new Date(action.scheduledStart), "h:mm a")}
          </Text>
        )}
      </div>
    </Tooltip>
  );
}
