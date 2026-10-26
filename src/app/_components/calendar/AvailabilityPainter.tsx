"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Group, Loader, Skeleton, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  applyPlan,
  planClear,
  planMark,
  type TimeRange,
} from "~/lib/availability/blockEdits";
import { buildGridLayout, type CellStatus } from "./availabilityGridModel";
import {
  addDays,
  blockAt,
  inSelection,
  selectionRanges,
  startOfWeek,
  type GridPosition,
} from "./availabilityPainterModel";

/**
 * LettuceMeet-style painter for a member's own availability. Drag across
 * the week to mark times unavailable; start a drag on marked time to clear
 * it instead. Each cell shows what a teammate scheduling a meeting will see
 * for it: marked by you, busy in a synced calendar, free in your work hours,
 * or outside them. Viewer-local time, like the schedule-meeting grid.
 */

type GridData = RouterOutputs["availability"]["myGrid"];
type Mode = "mark" | "clear";

interface Drag {
  mode: Mode;
  anchor: GridPosition;
  current: GridPosition;
}

const MARKED = "color-mix(in oklab, var(--color-brand-error) 45%, var(--color-bg-secondary))";
const CALENDAR_BUSY = "color-mix(in oklab, var(--color-brand-warning) 35%, var(--color-bg-secondary))";
const FREE = "color-mix(in oklab, var(--color-brand-success) 30%, var(--color-bg-secondary))";
// Outside cells stay paintable, so they must read as cells, not gaps.
const OUTSIDE = "var(--color-surface-tertiary)";

export function AvailabilityPainter() {
  const utils = api.useUtils();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const thisWeek = useMemo(() => startOfWeek(new Date()), []);
  const queryInput = useMemo(
    () => ({ rangeStart: weekStart, rangeEnd: addDays(weekStart, 7) }),
    [weekStart],
  );
  const { data, isLoading } = api.availability.myGrid.useQuery(queryInput);

  const [drag, setDrag] = useState<Drag | null>(null);

  const layout = useMemo(
    () => (data ? buildGridLayout(data.cellStartsAt, data.cellMinutes) : null),
    [data],
  );

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.availability.myGrid.invalidate(),
      utils.availability.listUpcoming.invalidate(),
    ]);
  }, [utils]);

  const onError = useCallback(
    (error: { message: string }) => {
      notifications.show({
        title: "Couldn't save your availability",
        message: error.message,
        color: "red",
      });
    },
    [],
  );
  const mark = api.availability.mark.useMutation({ onError, onSettled: invalidate });
  const clear = api.availability.clear.useMutation({ onError, onSettled: invalidate });

  /** Apply the edit to the cache first so painted cells never flicker back. */
  const commit = useCallback(
    (mode: Mode, ranges: TimeRange[]) => {
      if (ranges.length === 0) return;
      const planner = mode === "mark" ? planMark : planClear;
      void utils.availability.myGrid.cancel(queryInput);
      utils.availability.myGrid.setData(queryInput, (old: GridData | undefined) =>
        old
          ? {
              ...old,
              blocks: applyPlan(old.blocks, planner(old.blocks, ranges), (i) => `pending-${Date.now()}-${i}`),
            }
          : old,
      );
      (mode === "mark" ? mark : clear).mutate({ ranges });
    },
    [utils, queryInput, mark, clear],
  );

  // Finish the drag wherever the pointer is released, even off the grid.
  useEffect(() => {
    if (!drag || !data || !layout) return;
    const finish = () => {
      commit(
        drag.mode,
        selectionRanges(layout, data.cellStartsAt, data.cellMinutes, drag.anchor, drag.current),
      );
      setDrag(null);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [drag, data, layout, commit]);

  if (isLoading || !data || !layout) {
    return <Skeleton height={420} />;
  }

  const cellMs = data.cellMinutes * 60 * 1000;
  const saving = mark.isPending || clear.isPending;

  const hourLabel = (minutes: number) =>
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(undefined, {
      hour: "numeric",
    });

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            aria-label="Previous week"
            disabled={weekStart.getTime() <= thisWeek.getTime()}
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text size="sm" fw={500}>
            {weekLabel}
          </Text>
          <ActionIcon
            variant="subtle"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
          {saving && <Loader size="xs" />}
        </Group>
        {weekStart.getTime() !== thisWeek.getTime() && (
          <Button size="xs" variant="subtle" onClick={() => setWeekStart(thisWeek)}>
            This week
          </Button>
        )}
      </Group>

      <div className="overflow-x-auto">
        <div
          className="grid select-none gap-px"
          style={{
            gridTemplateColumns: `3.5rem repeat(${layout.days.length}, minmax(3rem, 1fr))`,
            touchAction: "none",
          }}
        >
          <div />
          {layout.days.map((day) => (
            <Text key={day.key} size="xs" fw={600} ta="center" className="pb-1">
              {day.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
            </Text>
          ))}

          {layout.rowMinutes.map((minutes, rowIndex) => (
            <PainterRow
              key={minutes}
              hourLabel={minutes % 60 < data.cellMinutes ? hourLabel(minutes) : null}
              cells={layout.days.map((day, dayIndex) => {
                const index = layout.indexAt(day.key, minutes);
                if (index === undefined) return null;
                const startsAt = data.cellStartsAt[index]!;
                const endsAt = new Date(startsAt.getTime() + cellMs);
                const block = blockAt(data.blocks, startsAt, endsAt);
                const position = { dayIndex, rowIndex };
                const previewing = drag !== null && inSelection(position, drag.anchor, drag.current);
                const marked = previewing ? drag.mode === "mark" : block !== undefined;
                return {
                  key: day.key,
                  position,
                  label: `${day.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} ${startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
                  status: data.statuses[index] ?? "free",
                  marked,
                  note: block?.note ?? null,
                  wasMarked: block !== undefined,
                  startsAt,
                  endsAt,
                };
              })}
              onStart={(position, wasMarked) =>
                setDrag({ mode: wasMarked ? "clear" : "mark", anchor: position, current: position })
              }
              onEnter={(position) => setDrag((d) => (d ? { ...d, current: position } : d))}
              onToggle={(cell) =>
                commit(cell.wasMarked ? "clear" : "mark", [
                  { startsAt: cell.startsAt, endsAt: cell.endsAt },
                ])
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendSwatch background={MARKED} label="Marked unavailable" />
        <LegendSwatch background={CALENDAR_BUSY} label="Busy in your calendar" />
        <LegendSwatch background={FREE} label="Free in your work hours" />
        <LegendSwatch background={OUTSIDE} label="Outside your work hours" />
      </div>
    </div>
  );
}

interface PainterCell {
  key: string;
  position: GridPosition;
  label: string;
  status: CellStatus;
  marked: boolean;
  note: string | null;
  wasMarked: boolean;
  startsAt: Date;
  endsAt: Date;
}

function describeCell(cell: PainterCell): string {
  if (cell.marked) return cell.note ? `Unavailable: ${cell.note}` : "Marked unavailable";
  if (cell.status === "busy") return "Busy in your calendar";
  if (cell.status === "outside") return "Outside your work hours";
  return "Free";
}

function PainterRow({
  hourLabel,
  cells,
  onStart,
  onEnter,
  onToggle,
}: {
  hourLabel: string | null;
  cells: (PainterCell | null)[];
  onStart: (position: GridPosition, wasMarked: boolean) => void;
  onEnter: (position: GridPosition) => void;
  onToggle: (cell: PainterCell) => void;
}) {
  return (
    <>
      <div className="pr-2 text-right">
        {hourLabel && (
          <Text size="xs" c="dimmed">
            {hourLabel}
          </Text>
        )}
      </div>
      {cells.map((cell, i) => {
        if (!cell) return <div key={i} />;
        const background = cell.marked
          ? MARKED
          : cell.status === "busy"
            ? CALENDAR_BUSY
            : cell.status === "outside"
              ? OUTSIDE
              : FREE;
        const text = describeCell(cell);
        return (
          <button
            key={cell.key}
            type="button"
            title={text}
            aria-label={`${cell.label} — ${text}`}
            aria-pressed={cell.marked}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              // Touch and pen pointers are captured by the first cell; release
              // so the cells under the finger get pointerenter as it moves.
              if (event.pointerType !== "mouse") {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              onStart(cell.position, cell.wasMarked);
            }}
            onPointerEnter={() => onEnter(cell.position)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onToggle(cell);
            }}
            className="h-5 w-full cursor-pointer border-0 p-0 transition-colors"
            style={{ backgroundColor: background }}
          />
        );
      })}
    </>
  );
}

function LegendSwatch({ background, label }: { background: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm border border-border-primary"
        style={{ backgroundColor: background }}
      />
      <Text size="xs" c="dimmed" component="span">
        {label}
      </Text>
    </span>
  );
}
