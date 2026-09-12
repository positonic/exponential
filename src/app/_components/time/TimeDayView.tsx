"use client";

import { Badge, Group, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
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
import type { DayReportEntry } from "~/server/services/timeEntry/dayReport";

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
export function TimeDayView({ date, workspaceId, onEntryClick }: TimeDayViewProps) {
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
        <LaneTimeline report={report} onEntryClick={onEntryClick} />
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

/** A `dayReport` entry in the shape TimeEntryModal edits. */
function toCalendarEntry(e: DayReportEntry, userId: string): CalendarTimeEntry {
  return {
    id: e.id,
    userId,
    actionId: e.actionId,
    workspaceId: e.workspaceId,
    startedAt: new Date(e.startedAt),
    endedAt: e.endedAt ? new Date(e.endedAt) : null,
    source: e.source,
    status: e.status,
    note: e.note,
    action: {
      id: e.action.id,
      name: e.action.name,
      projectId: e.action.projectId,
      workspaceId: e.workspaceId,
    },
  };
}

const HOURS = Array.from({ length: 25 }, (_, h) => h);

/**
 * One lane per Product (plus Unassigned when present) and, always last, an
 * Agent-run lane — the unattended work stays visibly apart from the
 * person's attention. Blocks are positioned by minute-of-day; proposed
 * entries are dashed with a "proposed" chip; hover shows note and times.
 * The lane grid scrolls inside its own container so a phone never scrolls
 * the page sideways.
 */
function LaneTimeline({
  report,
  onEntryClick,
}: {
  report: {
    dayStart: Date;
    entries: DayReportEntry[];
    flags: Array<{ entryId: string; flag: string }>;
  };
  onEntryClick: (entry: CalendarTimeEntry) => void;
}) {
  const dayStartMs = new Date(report.dayStart).getTime();
  const minuteOf = (d: Date | string) =>
    Math.max(0, Math.min(1440, (new Date(d).getTime() - dayStartMs) / 60_000));

  const lanes = new Map<string, { label: string; entries: DayReportEntry[] }>();
  for (const e of report.entries) {
    const key = e.isAgentRun ? "__agent" : (e.productId ?? "__unassigned");
    const label = e.isAgentRun ? "Agent-run" : (e.productName ?? "Unassigned");
    const lane = lanes.get(key) ?? { label, entries: [] };
    lane.entries.push(e);
    lanes.set(key, lane);
  }
  const ordered = [...lanes.entries()].sort(([a], [b]) => {
    if (a === "__agent") return 1;
    if (b === "__agent") return -1;
    if (a === "__unassigned") return 1;
    if (b === "__unassigned") return -1;
    return 0;
  });
  const userId = report.entries[0]?.id ? "" : "";

  return (
    <Paper p="md" radius="md" className="border-border-primary bg-surface-secondary">
      <Title order={5} className="text-text-primary" mb="sm">
        Timeline
      </Title>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="relative ml-28 h-4">
            {HOURS.filter((h) => h % 3 === 0).map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 text-[10px] text-text-muted"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {h === 24 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {ordered.map(([key, lane]) => (
            <div key={key} className="flex items-center gap-2 py-1" data-lane={key}>
              <Text size="xs" c="dimmed" className="w-26 shrink-0 truncate" w={104}>
                {lane.label}
              </Text>
              <div className="relative h-7 flex-1 rounded border border-border-primary bg-background-primary">
                {lane.entries.map((e) => {
                  const start = minuteOf(e.startedAt);
                  const end = e.endedAt ? minuteOf(e.endedAt) : minuteOf(new Date());
                  const isProposed = e.status === "PROPOSED";
                  const label = `${format(new Date(e.startedAt), "h:mm a")} – ${
                    e.endedAt ? format(new Date(e.endedAt), "h:mm a") : "now"
                  } · ${e.action.name}${e.note ? ` · ${e.note}` : ""}`;
                  return (
                    <Tooltip key={e.id} label={label} withArrow>
                      <button
                        type="button"
                        data-status={e.status}
                        aria-label={label}
                        onClick={() => onEntryClick(toCalendarEntry(e, userId))}
                        className={`absolute top-0.5 h-6 overflow-hidden rounded border px-1 text-left text-[10px] leading-6 text-text-primary ${
                          e.isAgentRun
                            ? "border-border-secondary bg-surface-hover"
                            : "border-brand-primary bg-brand-primary/20"
                        } ${isProposed ? "border-dashed" : ""}`}
                        style={{
                          left: `${(start / 1440) * 100}%`,
                          width: `${Math.max(0.4, ((end - start) / 1440) * 100)}%`,
                        }}
                      >
                        <span className="truncate">{e.action.name}</span>
                        {isProposed && (
                          <Badge size="xs" variant="outline" color="yellow" ml={4} className="align-middle">
                            proposed
                          </Badge>
                        )}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Paper>
  );
}
