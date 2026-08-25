"use client";

import { useMemo } from "react";
import { Text, Tooltip } from "@mantine/core";
import {
  buildGridLayout,
  computeSpanState,
  type CellStatus,
  type SpanState,
} from "./availabilityGridModel";

/**
 * LettuceMeet-style availability grid (V3 scheduling, grid view).
 *
 * Viewer-local time axis over the scheduling window, one column per day,
 * cells bucketed from the server's instants (see availabilityGridModel).
 * Each cell is a candidate slot START for the chosen duration: shading
 * reflects how many attendees are free for the whole span, hover names
 * who's busy, and cells that fail anyone's work-hours/window constraint
 * render muted. Partial cells are selectable — the modal warns exactly who
 * they exclude.
 */

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
  const layout = useMemo(
    () => buildGridLayout(cellStartsAt, cellMinutes),
    [cellStartsAt, cellMinutes],
  );

  const spanCells = Math.max(1, Math.ceil(durationMinutes / cellMinutes));

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
            gridTemplateColumns: `3.5rem repeat(${layout.days.length}, minmax(5.5rem, 1fr))`,
          }}
        >
          <div />
          {layout.days.map((day) => (
            <Text key={day.key} size="xs" fw={600} ta="center" className="pb-1">
              {day.date.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </Text>
          ))}

          {layout.rowMinutes.map((minutes) => (
            <RowCells
              key={minutes}
              minutes={minutes}
              hourLabel={
                // Label the first row of each hour — rows can sit at :15/:45
                // in offset timezones, so exact :00 isn't guaranteed.
                minutes % 60 < cellMinutes ? hourLabel(minutes) : null
              }
              layout={layout}
              cellStartsAt={cellStartsAt}
              cellMinutes={cellMinutes}
              spanCells={spanCells}
              attendees={attendees}
              durationMinutes={durationMinutes}
              selectedSlot={selectedSlot}
              onSelectSlot={onSelectSlot}
              tooltipFor={tooltipFor}
              cellBackground={cellBackground}
            />
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

function RowCells({
  minutes,
  hourLabel,
  layout,
  cellStartsAt,
  cellMinutes,
  spanCells,
  attendees,
  durationMinutes,
  selectedSlot,
  onSelectSlot,
  tooltipFor,
  cellBackground,
}: {
  minutes: number;
  hourLabel: string | null;
  layout: ReturnType<typeof buildGridLayout>;
  cellStartsAt: Date[];
  cellMinutes: number;
  spanCells: number;
  attendees: { userId: string; statuses: CellStatus[] }[];
  durationMinutes: number;
  selectedSlot: GridSlot | null;
  onSelectSlot: (slot: GridSlot, busyUserIds: string[]) => void;
  tooltipFor: (state: SpanState) => string;
  cellBackground: (state: SpanState) => string;
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
      {layout.days.map((day) => {
        const index = layout.indexAt(day.key, minutes);
        const state = computeSpanState(index, cellStartsAt, cellMinutes, spanCells, attendees);
        const startsAt = index !== undefined ? cellStartsAt[index]! : null;
        const selected =
          startsAt !== null && selectedSlot?.startsAt.getTime() === startsAt.getTime();
        const clickable = state.kind === "open" && startsAt !== null;
        return (
          <Tooltip key={day.key} label={tooltipFor(state)} withinPortal>
            {/* aria-disabled (not disabled) so muted cells stay focusable and
                the tooltip explaining WHY still fires for them. */}
            <button
              type="button"
              aria-disabled={!clickable}
              aria-label={`${day.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} ${startsAt ? startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""} — ${tooltipFor(state)}`}
              onClick={() => {
                if (!clickable || startsAt === null) return;
                onSelectSlot(
                  {
                    startsAt,
                    endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000),
                  },
                  state.busyUserIds,
                );
              }}
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
    </>
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
