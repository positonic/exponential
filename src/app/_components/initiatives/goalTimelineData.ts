/**
 * Build data + axis config for <OkrTimeline /> from the rows of the goals
 * table, so the Goals tab can be shown on the same gantt as the OKRs tab.
 *
 * A goal's bar spans its OKR period when it has one, otherwise runs up to its
 * due date; a project nested under a goal spans from the goal's start to the
 * project's end date.
 */

import { format } from "date-fns";
import type {
  OkrStatus,
  TimelineKr,
  TimelineObjective,
  TimelineUser,
} from "~/plugins/okr/client/components/OkrTimeline";
import {
  clamp01,
  periodDateRange,
  statusToConfidence,
} from "~/plugins/okr/client/utils/okrDashboardUtils";
import {
  computeTimelineAxisForRange,
  type TimelineAxis,
} from "~/plugins/okr/client/utils/okrTimelineData";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
} from "~/utils/avatarColors";

export interface TimelineProjectInput {
  id: string;
  name: string;
  /** 0–100 */
  progress: number;
  status: string;
  endDate: Date | string | null;
}

export interface TimelineGoalInput {
  id: number;
  title: string;
  period: string | null;
  dueDate: Date | string | null;
  health: string | null;
  /** Statuses of the goal's key results, the fallback when health is unset. */
  keyResultStatuses?: string[];
  /** 0–100 */
  progress: number;
  /** Nesting depth in the goals table; sub-goals get a "↳" marker. */
  depth: number;
  owner?: { id: string; name: string | null; image?: string | null } | null;
  projects: TimelineProjectInput[];
}

export interface GoalTimelineBundle {
  objectives: TimelineObjective[];
  users: Map<string, TimelineUser>;
  axis: TimelineAxis | null;
  range: { start: Date; end: Date };
}

/** The furthest a goal list can stretch the axis before it gets unreadable. */
const MAX_AXIS_YEARS = 3;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A goal's own health wins. Without one, roll up its key results the way the
 * OKR timeline does (worst KR wins) so a goal tracked purely through KRs
 * isn't drawn as "no update" while its OKR row is on track.
 */
function goalStatus(
  health: string | null,
  keyResultStatuses: string[] | undefined,
): OkrStatus {
  switch (health) {
    case "on-track":
      return "ok";
    case "at-risk":
      return "warn";
    case "off-track":
      return "bad";
  }
  if (!keyResultStatuses || keyResultStatuses.length === 0) return "idle";
  const confs = keyResultStatuses.map(statusToConfidence);
  if (confs.includes("bad")) return "bad";
  if (confs.includes("warn")) return "warn";
  if (confs.every((c) => c === "idle")) return "idle";
  return "ok";
}

function projectStatusToStatus(status: string): OkrStatus {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
      return "ok";
    case "ON_HOLD":
      return "warn";
    default:
      return "idle";
  }
}

function formatProjectStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The [start, end] a goal occupies, or null when it has neither period nor due date. */
function goalSpan(goal: TimelineGoalInput): { start: Date; end: Date } | null {
  if (goal.period) {
    const range = periodDateRange(goal.period);
    if (range) return range;
  }
  const due = toDate(goal.dueDate);
  if (due) return { start: new Date(due.getFullYear(), 0, 1), end: due };
  return null;
}

/**
 * Whole calendar years covering every dated goal, clamped so a stray far-off
 * target can't stretch the axis past MAX_AXIS_YEARS. With no dated goals the
 * axis is the current year.
 */
export function goalTimelineRange(
  goals: TimelineGoalInput[],
  now: Date = new Date(),
): { start: Date; end: Date } {
  const thisYear = now.getFullYear();
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const goal of goals) {
    const span = goalSpan(goal);
    if (!span) continue;
    minYear = Math.min(minYear, span.start.getFullYear());
    maxYear = Math.max(maxYear, span.end.getFullYear());
  }
  if (!Number.isFinite(minYear)) {
    minYear = thisYear;
    maxYear = thisYear;
  }
  if (maxYear - minYear + 1 > MAX_AXIS_YEARS) {
    // Prefer the window around today when today is in range; otherwise keep
    // the earliest years so nothing is silently cut off the front.
    if (thisYear >= minYear && thisYear <= maxYear) {
      minYear = Math.max(minYear, thisYear - 1);
      maxYear = Math.min(maxYear, minYear + MAX_AXIS_YEARS - 1);
    } else {
      maxYear = minYear + MAX_AXIS_YEARS - 1;
    }
  }
  return {
    start: new Date(minYear, 0, 1),
    end: new Date(maxYear, 11, 31),
  };
}

export function buildGoalTimelineData(
  goals: TimelineGoalInput[],
  now: Date = new Date(),
): GoalTimelineBundle {
  const range = goalTimelineRange(goals, now);
  const axis = computeTimelineAxisForRange(range.start, range.end, now);
  const totalMs = range.end.getTime() - range.start.getTime();
  const frac = (d: Date) =>
    totalMs > 0 ? clamp01((d.getTime() - range.start.getTime()) / totalMs) : 0;

  const users = new Map<string, TimelineUser>();
  const registerUser = (u: TimelineGoalInput["owner"]) => {
    if (!u || users.has(u.id)) return;
    const seed = getColorSeed(u.name, null);
    users.set(u.id, {
      id: u.id,
      name: u.name ?? "Unknown",
      initials: getInitial(u.name, null),
      color: getAvatarColor(seed),
    });
  };

  const objectives: TimelineObjective[] = goals.map((goal) => {
    registerUser(goal.owner);
    const span = goalSpan(goal) ?? range;
    const startFrac = frac(span.start);
    const endFrac = Math.max(startFrac, frac(span.end));

    const target = goal.period
      ? goal.period
      : (() => {
          const due = toDate(goal.dueDate);
          return due ? `due ${format(due, "MMM d, yyyy")}` : "no target";
        })();
    const projectCount = goal.projects.length;
    const metaParts = [`${Math.round(goal.progress)}%`, target];
    if (projectCount > 0) {
      metaParts.push(`${projectCount} project${projectCount === 1 ? "" : "s"}`);
    }

    const krs: TimelineKr[] = goal.projects.map((project) => {
      const end = toDate(project.endDate);
      return {
        id: `project-${project.id}`,
        title: project.name,
        progress: clamp01(project.progress / 100),
        currentLabel: `${Math.round(project.progress)}%`,
        targetLabel: "100%",
        meta: `${formatProjectStatus(project.status)} · ${Math.round(project.progress)}%`,
        due: end ? format(end, "MMM d") : undefined,
        startFrac,
        endFrac: end ? Math.max(startFrac, frac(end)) : endFrac,
        status: projectStatusToStatus(project.status),
      };
    });

    return {
      id: String(goal.id),
      code: goal.depth > 0 ? "↳" : "",
      title: goal.title,
      owner: goal.owner?.id ?? "unassigned",
      coOwners: [],
      progress: clamp01(goal.progress / 100),
      status: goalStatus(goal.health, goal.keyResultStatuses),
      startFrac,
      endFrac,
      meta: metaParts.join(" · "),
      krs,
    };
  });

  return { objectives, users, axis, range };
}
