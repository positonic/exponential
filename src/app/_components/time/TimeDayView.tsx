"use client";

import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { format } from "date-fns";

import { api } from "~/trpc/react";
import type { CalendarTimeEntry } from "~/app/_components/calendar/types";

export function formatMins(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface TimeDayViewProps {
  /** Local start of the day to show. */
  date: Date;
  workspaceId: string | null;
  onEntryClick: (entry: CalendarTimeEntry) => void;
}

/**
 * The Daily worklog's product screen: one day of the person's time from
 * `timeEntry.dayReport`. Leads with Attention hours (each covered minute
 * once) with Session hours beside them (the plain sum), and keeps Agent-run
 * time on its own line, never inside either.
 */
export function TimeDayView({ date, workspaceId }: TimeDayViewProps) {
  const { data: report, isLoading } = api.timeEntry.dayReport.useQuery({
    date,
    workspaceId: workspaceId ?? undefined,
  });

  return (
    <Stack gap="md" className="flex-1 overflow-y-auto">
      <Paper p="md" radius="md" className="border-border-primary bg-surface-secondary">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              {format(date, "EEEE, MMM d")}
            </Text>
            <Group gap="md" align="baseline">
              <Title order={2} className="text-text-primary" data-testid="attention-hours">
                {isLoading || !report ? "…" : formatMins(report.attentionMinutes)}
              </Title>
              <Text size="sm" c="dimmed">
                attention
              </Text>
              <Text size="sm" c="dimmed">
                · session{" "}
                <span className="font-mono text-text-primary" data-testid="session-hours">
                  {isLoading || !report ? "…" : formatMins(report.sessionMinutes)}
                </span>
              </Text>
            </Group>
          </div>
          {report && (
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                Agent-run{" "}
                <span className="font-mono text-text-primary">{formatMins(report.agentRunMinutes)}</span>
              </Text>
              <Text size="sm" c="dimmed">
                Proposed <span className="font-mono text-text-primary">{report.proposedCount}</span>
              </Text>
              <Text size="sm" c="dimmed">
                Unassigned{" "}
                <span className="font-mono text-text-primary">{report.unassignedCount}</span>
              </Text>
            </Group>
          )}
        </Group>
      </Paper>

      {report && report.entries.length === 0 && !isLoading && (
        <Paper p="md" radius="md" className="border-border-primary bg-surface-secondary">
          <Text c="dimmed">No time recorded on this day.</Text>
        </Paper>
      )}
    </Stack>
  );
}
