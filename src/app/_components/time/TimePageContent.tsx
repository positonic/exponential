"use client";

import { useMemo, useState } from "react";
import { Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";

import { api } from "~/trpc/react";
import { TimeEntryModal } from "~/app/_components/TimeEntryModal";
import { TimeReports } from "./TimeReports";
import type { CalendarTimeEntry } from "~/app/_components/calendar/types";

// Stable reference so the `entries` memo doesn't re-run on every render when
// the query is undefined (a fresh `[]` literal would change identity).
const EMPTY_ENTRIES: CalendarTimeEntry[] = [];

function formatMins(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function entryMinutes(entry: { startedAt: Date; endedAt: Date | null }): number {
  const end = entry.endedAt ?? new Date();
  const ms = end.getTime() - new Date(entry.startedAt).getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 60_000);
}

/**
 * User-global `/time` page. Lists TimeEntries grouped by day with Today + Week
 * totals at the top. Workspace filter (default: all). Date range defaults to
 * the current week (Mon → Sun); range and workspace are URL-free local state.
 * Click a row → TimeEntryModal (slice #11).
 */
export function TimePageContent() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [range, setRange] = useState<[Date | null, Date | null]>(() => {
    const now = new Date();
    return [
      startOfWeek(now, { weekStartsOn: 1 }),
      endOfWeek(now, { weekStartsOn: 1 }),
    ];
  });

  const [selectedEntry, setSelectedEntry] = useState<CalendarTimeEntry | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  const startDate = range[0] ?? startOfWeek(new Date(), { weekStartsOn: 1 });
  const endDate = endOfDay(range[1] ?? endOfWeek(new Date(), { weekStartsOn: 1 }));

  const { data: workspaces } = api.workspace.list.useQuery();
  const { data: projects } = api.project.getAll.useQuery(
    workspaceId ? { workspaceId } : undefined,
  );

  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects ?? []) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const { data: entriesData, isLoading } = api.timeEntry.listByDateRange.useQuery({
    startDate,
    endDate,
    workspaceId: workspaceId ?? undefined,
  });
  const entries: CalendarTimeEntry[] = entriesData ?? EMPTY_ENTRIES;

  const { todayMins, weekMins, groups } = useMemo(() => {
    let today = 0;
    let week = 0;
    const now = new Date();
    const byDay = new Map<string, CalendarTimeEntry[]>();
    for (const e of entries) {
      const mins = entryMinutes({
        startedAt: new Date(e.startedAt),
        endedAt: e.endedAt ? new Date(e.endedAt) : null,
      });
      week += mins;
      if (isSameDay(new Date(e.startedAt), now)) today += mins;
      const key = startOfDay(new Date(e.startedAt)).toISOString();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(e);
    }
    // Sort each day's entries oldest-first chronologically
    for (const arr of byDay.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );
    }
    // Days descending (most recent first)
    const sortedKeys = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
    return {
      todayMins: today,
      weekMins: week,
      groups: sortedKeys.map((k) => ({ date: new Date(k), entries: byDay.get(k)! })),
    };
  }, [entries]);

  const workspaceOptions = useMemo(
    () => [
      { value: "", label: "All workspaces" },
      ...(workspaces ?? []).map((w) => ({ value: w.id, label: w.name })),
    ],
    [workspaces],
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} className="text-text-primary">
            Time
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Today: <span className="font-mono">{formatMins(todayMins)}</span>
            <span className="mx-2">·</span>
            Week: <span className="font-mono">{formatMins(weekMins)}</span>
          </Text>
        </div>
        <Group gap="sm">
          <Select
            placeholder="All workspaces"
            value={workspaceId ?? ""}
            onChange={(v) => setWorkspaceId(v ? v : null)}
            data={workspaceOptions}
            allowDeselect={false}
            w={220}
          />
          <DatePickerInput
            type="range"
            value={range}
            onChange={(v) =>
              setRange([v[0] ? new Date(v[0]) : null, v[1] ? new Date(v[1]) : null])
            }
            valueFormat="MMM D"
            w={260}
          />
        </Group>
      </Group>

      <Paper
        p="md"
        radius="md"
        className="flex-1 overflow-y-auto border-border-primary bg-surface-secondary"
      >
        {isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : groups.length === 0 ? (
          <Stack align="center" py="xl">
            <Text c="dimmed">No time entries in this range.</Text>
          </Stack>
        ) : (
          <Stack gap="lg">
            {groups.map((group) => {
              const dayTotal = group.entries.reduce(
                (acc, e) =>
                  acc +
                  entryMinutes({
                    startedAt: new Date(e.startedAt),
                    endedAt: e.endedAt ? new Date(e.endedAt) : null,
                  }),
                0,
              );
              return (
                <div key={group.date.toISOString()}>
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="sm">
                      {format(group.date, "EEEE, MMM d")}
                    </Text>
                    <Text size="xs" c="dimmed" className="font-mono">
                      {formatMins(dayTotal)}
                    </Text>
                  </Group>
                  <Stack gap={6}>
                    {group.entries.map((e) => {
                      const mins = entryMinutes({
                        startedAt: new Date(e.startedAt),
                        endedAt: e.endedAt ? new Date(e.endedAt) : null,
                      });
                      const isRunning = e.endedAt === null;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded border border-border-primary bg-background-primary px-3 py-2 text-left hover:bg-surface-hover"
                          onClick={() => {
                            setSelectedEntry(e);
                            setModalOpened(true);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <Text
                              size="sm"
                              className="truncate text-text-primary"
                              fw={500}
                            >
                              {e.action?.name ?? "Untitled"}
                              {isRunning && (
                                <span className="ml-2 text-xs text-brand-primary">
                                  · running
                                </span>
                              )}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {format(new Date(e.startedAt), "h:mm a")} –{" "}
                              {e.endedAt
                                ? format(new Date(e.endedAt), "h:mm a")
                                : "now"}
                            </Text>
                          </div>
                          <Text size="sm" className="font-mono" c="dimmed">
                            {formatMins(mins)}
                          </Text>
                        </button>
                      );
                    })}
                  </Stack>
                </div>
              );
            })}
          </Stack>
        )}
      </Paper>

      <TimeReports entries={entries} projectNames={projectNames} />

      <TimeEntryModal
        entry={selectedEntry}
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setSelectedEntry(null);
        }}
      />
    </div>
  );
}
