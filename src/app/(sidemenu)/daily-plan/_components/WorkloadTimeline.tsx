"use client";

import { Paper, Text, Group, Stack, Tooltip } from "@mantine/core";
import { IconClock, IconAlertCircle } from "@tabler/icons-react";
import { addMinutes, format, differenceInMinutes } from "date-fns";

interface WorkloadTimelineProps {
  totalPlannedMinutes: number;
  workStartTime: string; // "09:00" format
  preferredShutdownTime: string; // "17:00" format
  planDate: Date;
}

function parseTimeToDate(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  return date;
}

function formatTimeFromDate(date: Date): string {
  return format(date, "h:mm a");
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export function WorkloadTimeline({
  totalPlannedMinutes,
  workStartTime,
  preferredShutdownTime,
  planDate,
}: WorkloadTimelineProps) {
  // Calculate times
  const workStart = parseTimeToDate(workStartTime, planDate);
  const preferredEnd = parseTimeToDate(preferredShutdownTime, planDate);
  const totalWorkMinutes = differenceInMinutes(preferredEnd, workStart);

  // Calculate earliest shutdown based on current time for today, or work start for tomorrow
  const now = new Date();
  const isToday = planDate.toDateString() === now.toDateString();
  const effectiveStart = isToday && now > workStart ? now : workStart;

  const earliestShutdown = addMinutes(effectiveStart, totalPlannedMinutes);

  // Calculate percentages for the progress bar
  const plannedPercent = Math.min(100, (totalPlannedMinutes / totalWorkMinutes) * 100);
  const isOverPlanned = totalPlannedMinutes > totalWorkMinutes;
  const overflowMinutes = isOverPlanned ? totalPlannedMinutes - totalWorkMinutes : 0;

  // Gap between earliest shutdown and preferred shutdown
  const gapMinutes = Math.max(0, differenceInMinutes(preferredEnd, earliestShutdown));
  const willFinishOnTime = earliestShutdown <= preferredEnd;

  return (
    <Paper p="md" className="bg-surface-secondary border border-border-primary">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconClock size={16} className="text-text-muted" />
          <Text fw={600} size="sm" className="text-text-primary">
            Workload Timeline
          </Text>
        </Group>
        {!willFinishOnTime && (
          <Tooltip label={`You're ${formatDuration(overflowMinutes)} over your preferred shutdown time`}>
            <Group gap={4} className="text-orange-500">
              <IconAlertCircle size={14} />
              <Text size="xs" fw={500}>Over capacity</Text>
            </Group>
          </Tooltip>
        )}
      </Group>

      <Stack gap="xs">
        {/* Time labels */}
        <Group justify="space-between">
          <Text size="xs" className="text-text-muted">
            {isToday ? "Now" : formatTimeFromDate(workStart)}
          </Text>
          <Text size="xs" className="text-text-muted">
            {formatTimeFromDate(preferredEnd)}
          </Text>
        </Group>

        {/* Progress bar */}
        <div className="relative h-8 rounded-md bg-surface-tertiary overflow-hidden">
          {/* Planned work */}
          <div
            className={`absolute h-full transition-all duration-300 ${
              isOverPlanned ? "bg-orange-500/80" : "bg-brand-primary/80"
            }`}
            style={{ width: `${plannedPercent}%` }}
          />

          {/* Earliest shutdown marker */}
          {!isOverPlanned && plannedPercent > 0 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-brand-primary"
              style={{ left: `${plannedPercent}%` }}
            />
          )}

          {/* Labels on the bar */}
          <div className="absolute inset-0 flex items-center justify-between px-3">
            <Text size="xs" fw={500} className="text-white drop-shadow-sm">
              {formatDuration(totalPlannedMinutes)} planned
            </Text>
            {gapMinutes > 0 && (
              <Text size="xs" className="text-text-muted">
                {formatDuration(gapMinutes)} free
              </Text>
            )}
          </div>
        </div>

        {/* Shutdown prediction */}
        <Group justify="space-between" mt="xs">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Earliest shutdown
            </Text>
            <Text size="sm" fw={600} className={willFinishOnTime ? "text-brand-primary" : "text-orange-500"}>
              {formatTimeFromDate(earliestShutdown)}
            </Text>
          </Stack>

          <Stack gap={2} align="flex-end">
            <Text size="xs" c="dimmed">
              Preferred shutdown
            </Text>
            <Text size="sm" fw={500} className="text-text-primary">
              {formatTimeFromDate(preferredEnd)}
            </Text>
          </Stack>
        </Group>

        {/* Status message */}
        {willFinishOnTime ? (
          <Text size="xs" c="dimmed" mt="xs">
            You have {formatDuration(gapMinutes)} of buffer time before your preferred shutdown.
          </Text>
        ) : (
          <Text size="xs" className="text-orange-500" mt="xs">
            Consider deferring {formatDuration(overflowMinutes)} of work to finish on time.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
