"use client";

import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

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

      {report && report.entries.length > 0 && (
        <Group gap="md" align="stretch" wrap="wrap">
          <RollupCard
            title="By product"
            rows={report.byProduct.map((r) => ({ name: r.name, mins: r.minutes }))}
            width={120}
          />
          <RollupCard
            title="By action"
            rows={report.byAction
              .filter((r) => r.minutes > 0)
              .slice(0, 10)
              .map((r) => ({ name: r.name, mins: r.minutes }))}
            width={160}
          />
        </Group>
      )}
    </Stack>
  );
}

/**
 * Overlap-split minutes per Product or Action (Recharts, as in TimeReports).
 * Overlapping minutes are credited 1/n to each entry covering them, so the
 * bars add up to attention hours rather than double-counting parallel threads.
 */
function RollupCard({
  title,
  rows,
  width,
}: {
  title: string;
  rows: Array<{ name: string; mins: number }>;
  width: number;
}) {
  const data = rows.map((r) => ({ ...r, hours: +(r.mins / 60).toFixed(2) }));
  return (
    <Paper
      p="md"
      radius="md"
      className="min-w-[300px] flex-1 border-border-primary bg-surface-secondary"
    >
      <Group justify="space-between" mb="sm">
        <Title order={5} className="text-text-primary">
          {title}
        </Title>
        <Text size="xs" c="dimmed" className="font-mono">
          {formatMins(rows.reduce((s, r) => s + r.mins, 0))}
        </Text>
      </Group>
      {data.length === 0 ? (
        <Text c="dimmed" size="sm">
          Nothing to show.
        </Text>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(60, data.length * 28)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
            <XAxis type="number" tickFormatter={(v) => `${v}h`} stroke="var(--color-text-muted)" fontSize={11} />
            <YAxis dataKey="name" type="category" stroke="var(--color-text-muted)" fontSize={11} width={width} />
            <ChartTooltip
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
      )}
    </Paper>
  );
}
