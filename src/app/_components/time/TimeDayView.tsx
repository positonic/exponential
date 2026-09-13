"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Popover,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
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
  const utils = api.useUtils();
  const { data: report, isLoading } = api.timeEntry.dayReport.useQuery({
    date,
    workspaceId: workspaceId ?? undefined,
  });
  const confirmDay = api.timeEntry.confirmDay.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.timeEntry.dayReport.invalidate(),
        utils.timeEntry.listByDateRange.invalidate(),
      ]);
      notifications.show({
        title: "Day confirmed",
        message:
          result.confirmed === 0
            ? "Nothing was proposed on this day."
            : `${result.confirmed} ${result.confirmed === 1 ? "entry" : "entries"} confirmed.`,
        color: "green",
      });
    },
    onError: (err) => {
      notifications.show({ title: "Could not confirm", message: err.message, color: "red" });
    },
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
              <Button
                size="xs"
                variant={report.proposedCount > 0 ? "filled" : "default"}
                disabled={report.proposedCount === 0}
                loading={confirmDay.isPending}
                onClick={() =>
                  confirmDay.mutate({ date, workspaceId: workspaceId ?? undefined })
                }
                data-testid="confirm-day"
              >
                Confirm day
              </Button>
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

      {report && report.byAction.length > 0 && (
        <ActionTicketTable
          rows={report.byAction}
          onAssigned={async () => {
            await Promise.all([
              utils.timeEntry.dayReport.invalidate(),
              utils.timeEntry.listByDateRange.invalidate(),
            ]);
          }}
        />
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

/** One line, theme tokens only: "Exponential · 32m". Shared with TimeReports. */
export function RollupTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; mins: number } }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded border border-border-primary bg-background-primary px-2 py-1 text-xs text-text-primary shadow-sm">
      {row.name} · {formatMins(row.mins)}
    </div>
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
      // overflow-hidden: the tooltip is absolutely positioned inside the
      // chart; letting it spill out of the card would grow the page's scroll
      // area on hover and shift the layout.
      className="min-w-[300px] flex-1 overflow-hidden border-border-primary bg-surface-secondary"
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
        <ResponsiveContainer width="100%" height={Math.max(88, data.length * 28 + 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
            <XAxis type="number" tickFormatter={(v) => `${v}h`} stroke="var(--color-text-muted)" fontSize={11} />
            <YAxis
              dataKey="name"
              type="category"
              stroke="var(--color-text-muted)"
              fontSize={11}
              width={width}
              interval={0}
            />
            <ChartTooltip
              // Recharts' default cursor is a light grey block and its default
              // tooltip is two lines ("hours : 32m") that outgrow a short chart.
              cursor={{ fill: "var(--color-surface-hover)" }}
              content={<RollupTooltip />}
              allowEscapeViewBox={{ x: false, y: false }}
            />
            <Bar dataKey="hours" name="Attention" fill="var(--color-brand-primary)" radius={[0, 4, 4, 0]} />
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

/**
 * Each Action of the day joined to its Ticket — the "was this work tracked?"
 * table. An Action with neither Ticket nor Project is marked Unassigned, the
 * signal V4's picker acts on; the marker is a count in the header too.
 */
interface ActionRow {
  actionId: string;
  name: string;
  workspaceId: string | null;
  minutes: number;
  agentRunMinutes: number;
  productName: string | null;
  projectName: string | null;
  projectId: string | null;
  ticket: { id: string; number: number; shortId: string | null; title: string } | null;
  proposedCount: number;
}

function ActionTicketTable({
  rows,
  onAssigned,
}: {
  rows: ActionRow[];
  onAssigned: () => Promise<void>;
}) {
  return (
    <Paper p="md" radius="md" className="border-border-primary bg-surface-secondary">
      <Title order={5} className="text-text-primary" mb="sm">
        Actions and tickets
      </Title>
      <div className="overflow-x-auto">
        <Table verticalSpacing="xs" className="min-w-[560px]">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Action</Table.Th>
              <Table.Th>Ticket</Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th ta="right">Attention</Table.Th>
              <Table.Th ta="right">Agent-run</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.actionId} data-unassigned={!r.ticket && !r.projectId}>
                <Table.Td>
                  <Text size="sm" className="text-text-primary">
                    {r.name}
                    {r.proposedCount > 0 && (
                      <Badge size="xs" variant="outline" color="yellow" ml={6} className="align-middle">
                        {r.proposedCount} proposed
                      </Badge>
                    )}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {r.ticket ? (
                    <Text size="sm" className="text-text-primary">
                      <span className="font-mono">{r.ticket.shortId ?? `#${r.ticket.number}`}</span>{" "}
                      <span className="text-text-secondary">{r.ticket.title}</span>
                    </Text>
                  ) : r.projectId ? (
                    <Text size="sm" c="dimmed">
                      no ticket · {r.projectName}
                    </Text>
                  ) : (
                    <Group gap="xs">
                      <Badge size="xs" variant="light" color="orange">
                        Unassigned
                      </Badge>
                      <AssignPicker row={r} onAssigned={onAssigned} />
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {r.productName ?? "—"}
                  </Text>
                </Table.Td>
                <Table.Td ta="right" className="font-mono">
                  {formatMins(r.minutes)}
                </Table.Td>
                <Table.Td ta="right" className="font-mono">
                  {r.agentRunMinutes > 0 ? formatMins(r.agentRunMinutes) : "—"}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Paper>
  );
}

/**
 * One interaction from Unassigned to placed: a Project or a Ticket of the
 * Action's workspace, searched in one box, written with `action.update`.
 * The picker never guesses (CONTEXT.md "Unassigned time" is a signal, not an
 * error) — it just makes the person's own choice one click.
 */
function AssignPicker({ row, onAssigned }: { row: ActionRow; onAssigned: () => Promise<void> }) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [remember, setRemember] = useState(true);
  const workspaceId = row.workspaceId ?? undefined;
  const rememberResolution = api.timeEntry.rememberResolution.useMutation();

  const { data: projects = [] } = api.project.getAll.useQuery(
    { workspaceId },
    { enabled: opened && !!workspaceId },
  );
  const { data: products = [] } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: opened && !!workspaceId },
  );
  const ticketQueries = api.useQueries((t) =>
    products.map((p) =>
      t.product.ticket.search(
        { productId: p.id, query: query.trim() || undefined, limit: 6 },
        { enabled: opened && query.trim().length > 0 },
      ),
    ),
  );

  const update = api.action.update.useMutation({
    onSuccess: async (_data, vars) => {
      setOpened(false);
      setQuery("");
      // Remembering is best-effort and separate from the assignment itself:
      // the row is placed either way, and a failed rule save only means the
      // next conversation with this title asks again.
      if (remember && (vars.projectId || vars.ticketId)) {
        await rememberResolution
          .mutateAsync({ titlePattern: row.name, projectId: vars.projectId, ticketId: vars.ticketId })
          .catch((err: Error) => {
            notifications.show({ title: "Placed, but not remembered", message: err.message, color: "yellow" });
          });
      }
      await onAssigned();
      notifications.show({
        title: "Assigned",
        message: remember ? `${row.name} is placed; the same title will land here next time.` : `${row.name} is placed.`,
        color: "green",
      });
    },
    onError: (err) => {
      notifications.show({ title: "Could not assign", message: err.message, color: "red" });
    },
  });

  const q = query.trim().toLowerCase();
  const projectHits = projects
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .slice(0, 6);
  const ticketHits = ticketQueries.flatMap((tq, i) =>
    (tq.data ?? []).map((t) => ({ ...t, productName: products[i]?.name ?? "" })),
  );
  const searching = ticketQueries.some((tq) => tq.isFetching);

  return (
    <Popover opened={opened} onChange={setOpened} width={320} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <Button size="compact-xs" variant="subtle" onClick={() => setOpened((o) => !o)} data-testid="assign">
          Assign
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            size="xs"
            placeholder="Search projects and tickets…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            autoFocus
            rightSection={searching ? <Loader size={12} /> : null}
          />
          <Checkbox
            size="xs"
            label="Remember for conversations with this title"
            checked={remember}
            onChange={(e) => setRemember(e.currentTarget.checked)}
          />
          {!workspaceId && (
            <Text size="xs" c="dimmed">
              This Action has no workspace, so there is nothing to pick from.
            </Text>
          )}
          {projectHits.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" mb={2}>
                Projects
              </Text>
              {projectHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm text-text-primary hover:bg-surface-hover"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: row.actionId, projectId: p.id })}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {ticketHits.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" mb={2}>
                Tickets
              </Text>
              {ticketHits.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm text-text-primary hover:bg-surface-hover"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: row.actionId, ticketId: t.id })}
                >
                  <span className="font-mono text-text-secondary">{t.shortId ?? `#${t.number}`}</span> {t.title}
                  <span className="ml-1 text-text-muted">· {t.productName}</span>
                </button>
              ))}
            </div>
          )}
          {workspaceId && q.length > 0 && projectHits.length === 0 && ticketHits.length === 0 && !searching && (
            <Text size="xs" c="dimmed">
              Nothing matches.
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
