"use client";

import Link from "next/link";
import { Badge, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconCalendarEvent, IconUsers } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { RouterOutputs } from "~/trpc/react";

type OccurrenceRow = RouterOutputs["ceremony"]["listOccurrencesForProject"][number];

/**
 * The scheduled half of a project's Meetings tab (ADR-0059 amendment,
 * 2026-10-07): the meetings booked for the project and the ceremonies that
 * review it, newest first, above the recordings. Each opens its agenda.
 * Occurrences a recording captured are not here — the recording is the row.
 */
function rowState(row: OccurrenceRow, now: number): { label: string; color: string } {
  if (row.status === "SKIPPED") return { label: "Cancelled", color: "gray" };
  if (new Date(row.scheduledStart).getTime() > now) return { label: "Upcoming", color: "blue" };
  return { label: "Not captured", color: "orange" };
}

const whenFmt: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

export function ProjectOccurrenceRows({ rows }: { rows: OccurrenceRow[] }) {
  if (rows.length === 0) return null;
  const now = Date.now();
  return (
    <Stack gap="xs" data-testid="project-occurrences">
      {rows.map((row) => {
        const state = rowState(row, now);
        return (
          <UnstyledButton key={row.occurrenceId} component={Link} href={row.href} className="block">
            <Paper withBorder radius="md" p="sm" className="hover:bg-surface-hover">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" align="flex-start" className="min-w-0">
                  <IconCalendarEvent size={18} className="mt-0.5 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <Text size="sm" fw={500} className="truncate">
                      {row.ceremonyName}
                    </Text>
                    {row.purpose && (
                      <div className="truncate text-sm text-text-secondary">
                        <MarkdownRenderer content={row.purpose} variant="inline" />
                      </div>
                    )}
                    <Group gap={6} mt={2}>
                      <Text size="xs" className="text-text-muted">
                        {new Date(row.scheduledStart).toLocaleString(undefined, whenFmt)}
                      </Text>
                      <Group gap={2}>
                        <IconUsers size={12} className="text-text-muted" />
                        <Text size="xs" className="text-text-muted">
                          {row.attendeeCount}
                        </Text>
                      </Group>
                    </Group>
                  </div>
                </Group>
                <Badge variant="light" color={state.color} size="sm" className="shrink-0">
                  {state.label}
                </Badge>
              </Group>
            </Paper>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
