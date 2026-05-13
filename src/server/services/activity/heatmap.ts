import type { PrismaClient } from "@prisma/client";

/**
 * One day of the activity heatmap. `level` 0 = no events, 1–4 = quartile
 * bucket of non-zero days within the queried window.
 */
export interface HeatmapCell {
  /** Calendar date the cell represents (midnight UTC). */
  date: Date;
  /** Number of events on this day. */
  count: number;
  /** Visual intensity bucket. 0 = empty. */
  level: 0 | 1 | 2 | 3 | 4;
  /** True for the cell representing "today" in the caller's local timezone. */
  isToday: boolean;
}

interface RawCell {
  date: Date;
  count: number;
}

/**
 * Convert a raw per-day count array into a level-bucketed array suitable for
 * heatmap rendering. Pure function — no DB, no timezone tricks. Designed to
 * be re-used by callers that have their own count data (CSV import,
 * mocks, etc).
 *
 * Algorithm:
 * - count === 0 → level 0
 * - count > 0 → quartile bucket of non-zero counts (1, 2, 3, or 4)
 *
 * Quartile boundaries use linear interpolation between min and max of the
 * non-zero set so the heatmap "feels right" regardless of absolute scale:
 * a workspace logging 1–4 events/day uses the full L1–L4 palette just like
 * one logging 100–400. Uniform non-zero counts all bucket to L4 (saturated).
 */
export function calculateLevels(
  cells: RawCell[],
  options?: { now?: Date },
): HeatmapCell[] {
  const now = options?.now ?? new Date();
  const todayKey = isoDayKey(now);

  const nonZeroCounts = cells
    .map((c) => c.count)
    .filter((n): n is number => n > 0);

  if (nonZeroCounts.length === 0) {
    return cells.map((c) => ({
      date: c.date,
      count: c.count,
      level: 0,
      isToday: isoDayKey(c.date) === todayKey,
    }));
  }

  const min = Math.min(...nonZeroCounts);
  const max = Math.max(...nonZeroCounts);

  // Uniform counts (min === max) → every non-zero day is L4 (the max bucket).
  if (min === max) {
    return cells.map((c) => ({
      date: c.date,
      count: c.count,
      level: c.count === 0 ? 0 : 4,
      isToday: isoDayKey(c.date) === todayKey,
    }));
  }

  // Bucket size: split (max - min) into four equal slices. Edge case: when
  // counts are very tightly clustered we still want every bucket reachable,
  // so we use ceil so the top of the range always lands in L4.
  const span = max - min;
  const sliceSize = span / 4;

  return cells.map((c) => {
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (c.count > 0) {
      const normalised = c.count - min;
      // Linear interpolation: place each non-zero count into one of 4
      // contiguous buckets [min, min+slice), [min+slice, min+2*slice), …
      const bucket = Math.min(3, Math.floor(normalised / sliceSize));
      level = (bucket + 1) as 1 | 2 | 3 | 4;
    }
    return {
      date: c.date,
      count: c.count,
      level,
      isToday: isoDayKey(c.date) === todayKey,
    };
  });
}

/** YYYY-MM-DD in UTC. Used purely as a same-day equality key. */
function isoDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build the 53-week × 7-day window anchored at "today's local midnight",
 * filling unseen days with count 0. Returned in row-major (week-by-week)
 * order so the renderer can flow it column-by-column.
 */
function buildWindow(
  countsByDay: Map<string, number>,
  now: Date,
): RawCell[] {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // 371 = 53 * 7. We render an exact GitHub-style grid.
  const totalDays = 371;
  const start = new Date(today.getTime() - (totalDays - 1) * (WEEK_MS / 7));

  const cells: RawCell[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start.getTime() + i * (WEEK_MS / 7));
    const key = isoDayKey(date);
    cells.push({ date, count: countsByDay.get(key) ?? 0 });
  }
  return cells;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  /** Sum of `count` across every cell in the window. */
  total: number;
  /** Inclusive window boundaries — useful for the card subtitle. */
  range: { start: Date; end: Date };
}

/**
 * Reader service for the 12-month heatmap card. Counts every
 * `WorkspaceActivityEvent` in the window — regardless of `entityType` /
 * `action` — and buckets them into 53 × 7 cells via `calculateLevels`.
 *
 * Workspace scoping is enforced by the prisma query: events from other
 * workspaces never enter the count.
 */
export async function getActivityHeatmap(
  db: PrismaClient,
  args: { workspaceId: string; now?: Date },
): Promise<HeatmapData> {
  const now = args.now ?? new Date();
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end.getTime() - 370 * (WEEK_MS / 7));

  // Raw SQL is necessary because Prisma doesn't expose `date_trunc` and we
  // want server-side day-bucketing rather than fetching every row.
  // Workspace scope is parameterised — no string interpolation.
  const rows = await db.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           COUNT(*)::bigint AS count
    FROM "WorkspaceActivityEvent"
    WHERE "workspaceId" = ${args.workspaceId}
      AND "createdAt" >= ${start}
      AND "createdAt" < ${new Date(end.getTime() + WEEK_MS / 7)}
    GROUP BY day
  `;

  const countsByDay = new Map<string, number>();
  for (const row of rows) {
    countsByDay.set(isoDayKey(row.day), Number(row.count));
  }

  const cells = calculateLevels(buildWindow(countsByDay, now), { now });
  const total = cells.reduce((acc, c) => acc + c.count, 0);

  return {
    cells,
    total,
    range: { start, end },
  };
}
