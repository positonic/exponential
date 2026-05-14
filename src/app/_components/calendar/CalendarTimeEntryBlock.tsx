import type { CSSProperties } from "react";
import { Stack, Text, Tooltip } from "@mantine/core";
import { format } from "date-fns";

import type { CalendarTimeEntry } from "./types";

interface TimeEntryBlockProps {
  entry: CalendarTimeEntry;
  style: CSSProperties;
  onClick?: (entry: CalendarTimeEntry) => void;
}

/**
 * Renders a TimeEntry block on the calendar. Filled brand-color (vs. the
 * left-border treatment used for scheduled actions) so the two are visually
 * distinct at a glance. A running entry (no `endedAt`) shows a pulsing dot.
 */
export function CalendarTimeEntryBlock({
  entry,
  style,
  onClick,
}: TimeEntryBlockProps) {
  const height = typeof style.height === "number" ? style.height : 60;
  const isRunning = entry.endedAt === null;

  const endLabel = entry.endedAt
    ? format(new Date(entry.endedAt), "h:mm a")
    : "now";

  return (
    <Tooltip
      label={
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {entry.action.name}
          </Text>
          <Text size="xs">
            {format(new Date(entry.startedAt), "h:mm a")} – {endLabel}
          </Text>
          <Text size="xs" c="dimmed">
            Tracked time
          </Text>
        </Stack>
      }
      multiline
      position="right"
      withArrow
    >
      <div
        className="absolute overflow-hidden rounded-sm bg-brand-primary p-1.5 text-text-inverse transition-all hover:brightness-110"
        style={{ ...style, cursor: onClick ? "pointer" : "default" }}
        onClick={() => onClick?.(entry)}
        role="button"
        aria-label={`Time entry: ${entry.action.name}`}
      >
        <div className="flex items-center gap-1.5">
          {isRunning && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-inverse"
              style={{ animation: "pulse 1.5s ease-in-out infinite" }}
              aria-hidden="true"
            />
          )}
          <Text
            size="xs"
            fw={600}
            component="div"
            className="text-text-inverse"
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
            {entry.action.name}
          </Text>
        </div>
        {height >= 35 && (
          <Text
            size="xs"
            className="text-text-inverse"
            style={{ fontSize: "10px", opacity: 0.85 }}
          >
            {format(new Date(entry.startedAt), "h:mm a")} – {endLabel}
          </Text>
        )}
      </div>
    </Tooltip>
  );
}
