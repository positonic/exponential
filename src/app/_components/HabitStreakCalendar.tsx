"use client";

import { Tooltip } from "@mantine/core";
import { format, startOfDay, subDays, eachDayOfInterval } from "date-fns";
import { useMemo } from "react";

interface HabitCompletion {
  id: string;
  completedDate: Date;
  notes: string | null;
  duration: number | null;
  rating: number | null;
}

interface HabitStreakCalendarProps {
  completions: HabitCompletion[];
  days?: number;
  cellSize?: number;
  gap?: number;
}

export function HabitStreakCalendar({
  completions,
  days = 90,
  cellSize = 12,
  gap = 2,
}: HabitStreakCalendarProps) {
  const calendarData = useMemo(() => {
    const today = startOfDay(new Date());
    const startDate = subDays(today, days - 1);

    // Create a map of completed dates
    const completionMap = new Map<string, HabitCompletion>();
    completions.forEach((c) => {
      const dateKey = format(startOfDay(c.completedDate), "yyyy-MM-dd");
      completionMap.set(dateKey, c);
    });

    // Generate all days in the range
    const allDays = eachDayOfInterval({ start: startDate, end: today });

    return allDays.map((date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      const completion = completionMap.get(dateKey);
      return {
        date,
        dateKey,
        completed: !!completion,
        completion,
      };
    });
  }, [completions, days]);

  // Calculate grid dimensions
  const weeks = Math.ceil(calendarData.length / 7);

  return (
    <div
      className="inline-grid"
      style={{
        gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`,
        gridTemplateRows: `repeat(7, ${cellSize}px)`,
        gap: `${gap}px`,
        gridAutoFlow: "column",
      }}
    >
      {calendarData.map(({ date, dateKey, completed, completion }) => (
        <Tooltip
          key={dateKey}
          label={
            <div className="text-center">
              <div className="font-medium">{format(date, "MMM d, yyyy")}</div>
              {completed ? (
                <>
                  <div className="text-xs text-green-400">Completed</div>
                  {completion?.notes && (
                    <div className="text-xs mt-1">{completion.notes}</div>
                  )}
                  {completion?.duration && (
                    <div className="text-xs">{completion.duration} min</div>
                  )}
                  {completion?.rating && (
                    <div className="text-xs">Rating: {completion.rating}/5</div>
                  )}
                </>
              ) : (
                <div className="text-xs text-text-muted">Not completed</div>
              )}
            </div>
          }
          withArrow
          position="top"
        >
          <div
            className={`rounded-sm cursor-pointer transition-colors ${
              completed
                ? "bg-brand-primary hover:opacity-80"
                : "bg-surface-secondary hover:bg-surface-hover"
            }`}
            style={{
              width: cellSize,
              height: cellSize,
            }}
          />
        </Tooltip>
      ))}
    </div>
  );
}

// Mini version for habit cards
export function MiniStreakCalendar({
  completions,
}: {
  completions: HabitCompletion[];
}) {
  return (
    <HabitStreakCalendar completions={completions} days={30} cellSize={8} gap={1} />
  );
}
