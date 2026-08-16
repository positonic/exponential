"use client";

import { Fragment, useMemo } from "react";
import { Text, Tooltip } from "@mantine/core";

/**
 * LettuceMeet-style availability grid (V3 scheduling, grid view).
 *
 * Viewer-local time axis over the scheduling window (07:00–20:00), one
 * column per day, 30-min cells. Each cell is a candidate slot START for the
 * chosen duration: shading reflects how many attendees are free for the
 * whole span, hover names who's busy, and cells that fail anyone's
 * work-hours/window constraint render muted and unclickable. Partial cells
 * are selectable — the modal warns exactly who they exclude.
 */

type CellStatus = "free" | "busy" | "outside";

export interface GridSlot {
  startsAt: Date;
  endsAt: Date;
}

interface AvailabilityGridProps {
  cellStartsAt: Date[];
  cellMinutes: number;
  attendees: { userId: string; statuses: CellStatus[] }[];
  availabilityUnknownUserIds: string[];
  /** Display names for hover/legend copy. */
  memberNameById: Map<string, string>;
  durationMinutes: number;
  selectedSlot: GridSlot | null;
  /** busyUserIds is who the slot excludes; empty means everyone's free. */
  onSelectSlot: (slot: GridSlot, busyUserIds: string[]) => void;
}

/** The grid renders the scheduling window on the viewer's wall clock. */
const WINDOW_START_MINUTES = 7 * 60;
const WINDOW_END_MINUTES = 20 * 60;

interface SpanState {
  /** null → the span runs off the loaded range: not offerable. */
  kind: "unloaded" | "outside" | "open";
  busyUserIds: string[];
  freeCount: number;
}

export function AvailabilityGrid({
  cellStartsAt,
  cellMinutes,
  attendees,
  availabilityUnknownUserIds,
  memberNameById,
  durationMinutes,
  selectedSlot,
  onSelectSlot,
}: AvailabilityGridProps) {
  const cellMs = cellMinutes * 60 * 1000;

  const indexByMs = useMemo(
    () => new Map(cellStartsAt.map((date, index) => [date.getTime(), index])),
    [cellStartsAt],
  );

  // Viewer-local days spanned by the loaded cells.
  const days = useMemo(() => {
    const seen = new Map<string, Date>();
    for (const date of cellStartsAt) {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!seen.has(key)) {
        seen.set(key, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
      }
    }
    return [...seen.values()];
  }, [cellStartsAt]);

  // Row start times (minutes since viewer-local midnight) inside the window.
  const rowMinutes = useMemo(() => {
    const rows: number[] = [];
    for (
      let minutes = WINDOW_START_MINUTES;
      minutes + cellMinutes <= WINDOW_END_MINUTES;
      minutes += cellMinutes
    ) {
      rows.push(minutes);
    }
    return rows;
  }, [cellMinutes]);

  const spanCells = Math.max(1, Math.ceil(durationMinutes / cellMinutes));

  const spanState = (startMs: number): SpanState => {
    const busy = new Set<string>();
    let outside = false;
    for (let i = 0; i < spanCells; i += 1) {
      const index = indexByMs.get(startMs + i * cellMs);
      if (index === undefined) return { kind: "unloaded", busyUserIds: [], freeCount: 0 };
      for (const attendee of attendees) {
        const status = attendee.statuses[index];
        if (status === "outside") outside = true;
        if (status === "busy") busy.add(attendee.userId);
      }
    }
    if (outside) return { kind: "outside", busyUserIds: [], freeCount: 0 };
    const busyUserIds = [...busy];
    return { kind: "open", busyUserIds, freeCount: attendees.length - busyUserIds.length };
  };

  const nameOf = (userId: string) => memberNameById.get(userId) ?? "Unknown member";

  const unknownNames = availabilityUnknownUserIds.map(nameOf);

  const tooltipFor = (state: SpanState): string => {
    if (state.kind === "unloaded") return "Outside the loaded week";
    if (state.kind === "outside") return "Outside working hours / scheduling window";
    if (state.busyUserIds.length === 0) return "Everyone is free";
    return `Busy: ${state.busyUserIds.map(nameOf).join(", ")}`;
  };

  // Shading via color-mix of semantic tokens only — intensity tracks how
  // many attendees are free for the span. No hardcoded colors.
  const cellBackground = (state: SpanState): string => {
    if (state.kind !== "open" || attendees.length === 0) {
      return "var(--color-bg-secondary)";
    }
    const fraction = state.freeCount / attendees.length;
    const mixPercent = Math.round(fraction * 55);
    return `color-mix(in oklab, var(--color-brand-success) ${mixPercent}%, var(--color-bg-secondary))`;
  };

  const hourLabel = (minutes: number) =>
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: undefined,
    });

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(5.5rem, 1fr))`,
          }}
        >
          <div />
          {days.map((day) => (
            <Text key={day.getTime()} size="xs" fw={600} ta="center" className="pb-1">
              {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </Text>
          ))}

          {rowMinutes.map((minutes) => (
            <Fragment key={minutes}>
              <div className="pr-2 text-right">
                {minutes % 60 === 0 && (
                  <Text size="xs" c="dimmed">
                    {hourLabel(minutes)}
                  </Text>
                )}
              </div>
              {days.map((day) => {
                const startMs = new Date(
                  day.getFullYear(),
                  day.getMonth(),
                  day.getDate(),
                  Math.floor(minutes / 60),
                  minutes % 60,
                ).getTime();
                const state = spanState(startMs);
                const selected = selectedSlot?.startsAt.getTime() === startMs;
                const clickable = state.kind === "open";
                return (
                  <Tooltip key={`${day.getTime()}-${minutes}`} label={tooltipFor(state)} withinPortal>
                    <button
                      type="button"
                      disabled={!clickable}
                      aria-label={`${day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} ${hourLabel(minutes)} — ${tooltipFor(state)}`}
                      onClick={() =>
                        clickable &&
                        onSelectSlot(
                          {
                            startsAt: new Date(startMs),
                            endsAt: new Date(startMs + durationMinutes * 60 * 1000),
                          },
                          state.busyUserIds,
                        )
                      }
                      className={`h-5 w-full border-0 p-0 transition-colors ${
                        clickable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                      }`}
                      style={{
                        backgroundColor: cellBackground(state),
                        ...(selected
                          ? { boxShadow: "inset 0 0 0 2px var(--color-brand-primary)" }
                          : {}),
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendSwatch
          background="color-mix(in oklab, var(--color-brand-success) 55%, var(--color-bg-secondary))"
          label="Everyone free"
        />
        <LegendSwatch
          background="color-mix(in oklab, var(--color-brand-success) 25%, var(--color-bg-secondary))"
          label="Some busy (click to see who)"
        />
        <LegendSwatch background="var(--color-bg-secondary)" label="Outside hours / all busy" dimmed />
      </div>
      {unknownNames.length > 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          No calendar connected (assumed free): {unknownNames.join(", ")}
        </Text>
      )}
    </div>
  );
}

function LegendSwatch({
  background,
  label,
  dimmed,
}: {
  background: string;
  label: string;
  dimmed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block h-3 w-3 rounded-sm border border-border-primary ${dimmed ? "opacity-40" : ""}`}
        style={{ backgroundColor: background }}
      />
      <Text size="xs" c="dimmed" component="span">
        {label}
      </Text>
    </span>
  );
}
