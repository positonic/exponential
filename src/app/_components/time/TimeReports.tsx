"use client";

import { useMemo } from "react";
import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, startOfDay } from "date-fns";

import type { CalendarTimeEntry } from "~/app/_components/calendar/types";

function entryMinutes(e: CalendarTimeEntry): number {
  const end = e.endedAt ?? new Date();
  const ms = new Date(end).getTime() - new Date(e.startedAt).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

function formatMins(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface TimeReportsProps {
  entries: CalendarTimeEntry[];
  /** Project name lookup by id (passed from page so we don't refetch). */
  projectNames?: Map<string, string>;
}

/**
 * Three on-page reports for the date range currently rendered on /time:
 *   1. Per-project totals (horizontal bar)
 *   2. Per-action totals (horizontal bar, top 10)
 *   3. Daily totals (vertical bar)
 *
 * All aggregations are computed from the same entries list the page already
 * has — no extra server queries.
 */
export function TimeReports({ entries, projectNames }: TimeReportsProps) {
  const { byProject, byAction, byDay } = useMemo(() => {
    const projMap = new Map<string, number>();
    const actMap = new Map<string, { name: string; mins: number }>();
    const dayMap = new Map<string, number>();

    for (const e of entries) {
      const mins = entryMinutes(e);
      if (mins <= 0) continue;

      const pid = e.action.projectId ?? "__none__";
      projMap.set(pid, (projMap.get(pid) ?? 0) + mins);

      const aid = e.action.id;
      const prev = actMap.get(aid);
      actMap.set(aid, {
        name: e.action.name || "Untitled",
        mins: (prev?.mins ?? 0) + mins,
      });

      const dayKey = startOfDay(new Date(e.startedAt)).toISOString();
      dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + mins);
    }

    const projectRows = [...projMap.entries()]
      .map(([id, mins]) => ({
        name:
          id === "__none__"
            ? "No project"
            : projectNames?.get(id) ?? "Project",
        mins,
        hours: +(mins / 60).toFixed(2),
      }))
      .sort((a, b) => b.mins - a.mins);

    const actionRows = [...actMap.values()]
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 10)
      .map((a) => ({ name: a.name, mins: a.mins, hours: +(a.mins / 60).toFixed(2) }));

    const dayRows = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, mins]) => ({
        date: format(new Date(key), "EEE M/d"),
        mins,
        hours: +(mins / 60).toFixed(2),
      }));

    return { byProject: projectRows, byAction: actionRows, byDay: dayRows };
  }, [entries, projectNames]);

  if (entries.length === 0) return null;

  return (
    <Stack gap="md">
      <Group gap="md" align="stretch" wrap="wrap">
        <ReportCard title="By project" empty={byProject.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(60, byProject.length * 28)}>
            <BarChart data={byProject} layout="vertical" margin={{ left: 4, right: 20 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
              <XAxis type="number" tickFormatter={(v) => `${v}h`} stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="var(--color-text-muted)" fontSize={11} width={120} />
              <Tooltip
                formatter={(value) => formatMins(Math.round(+value * 60))}
                contentStyle={{
                  background: "var(--color-background-primary)",
                  border: "1px solid var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                }}
              />
              <Bar dataKey="hours" fill="var(--color-brand-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
        <ReportCard title="By action (top 10)" empty={byAction.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(60, byAction.length * 28)}>
            <BarChart data={byAction} layout="vertical" margin={{ left: 4, right: 20 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
              <XAxis type="number" tickFormatter={(v) => `${v}h`} stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="var(--color-text-muted)" fontSize={11} width={160} />
              <Tooltip
                formatter={(value) => formatMins(Math.round(+value * 60))}
                contentStyle={{
                  background: "var(--color-background-primary)",
                  border: "1px solid var(--color-border-primary)",
                  color: "var(--color-text-primary)",
                }}
              />
              <Bar dataKey="hours" fill="var(--color-brand-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
      </Group>

      <ReportCard title="Daily totals" empty={byDay.length === 0}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byDay}>
            <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
            <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
            <YAxis tickFormatter={(v) => `${v}h`} stroke="var(--color-text-muted)" fontSize={11} />
            <Tooltip
              formatter={(value) => formatMins(Math.round(+value * 60))}
              contentStyle={{
                background: "var(--color-background-primary)",
                border: "1px solid var(--color-border-primary)",
                color: "var(--color-text-primary)",
              }}
            />
            <Bar dataKey="hours" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ReportCard>
    </Stack>
  );
}

function ReportCard({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <Paper
      p="md"
      radius="md"
      className="min-w-[320px] flex-1 border-border-primary bg-surface-secondary"
    >
      <Title order={5} className="text-text-primary" mb="sm">
        {title}
      </Title>
      {empty ? (
        <Text c="dimmed" size="sm">
          Nothing to show.
        </Text>
      ) : (
        children
      )}
    </Paper>
  );
}
