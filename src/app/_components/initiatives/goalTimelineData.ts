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
  effectiveStatus,
  objectiveEffectiveConfidence,
  periodDateRange,
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
  /** Manual health override; wins over `health` per ADR-0004. */
  healthOverride?: string | null;
  /** The goal's key results, the fallback when no health is set. */
  keyResults?: { status: string; statusOverride?: string | null }[];
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
 * ADR-0004: effective status is `override ?? auto`, resolved through the one
 * shared helper the OKR card and drawer already use. Hand-rolling it here
 * would let the Goals timeline contradict the OKRs timeline one toggle away
 * — a goal a human marked "At risk" must not draw green.
 */
function goalStatus(goal: TimelineGoalInput): OkrStatus {
  return objectiveEffectiveConfidence(
    goal.healthOverride,
    goal.health,
    (goal.keyResults ?? []).map(
      (kr) => effectiveStatus(kr.statusOverride, kr.status) ?? "",
    ),
  );
}

/** Human-readable label for a resolved status, for the row's meta text. */
const STATUS_LABEL: Record<OkrStatus, string> = {
  ok: "On track",
  warn: "At risk",
  bad: "Off track",
  idle: "No update",
};

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
    // the earliest years so nothing is silently cut off the front. Anchor
    // before truncating — clamping the start first can leave a window
    // narrower than MAX_AXIS_YEARS and drop years that would have fit.
    if (thisYear >= minYear && thisYear <= maxYear) {
      minYear = Math.max(
        minYear,
        Math.min(thisYear - 1, maxYear - MAX_AXIS_YEARS + 1),
      );
    }
    maxYear = Math.min(maxYear, minYear + MAX_AXIS_YEARS - 1);
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
    // A goal outside the clamped axis window collapses to a zero-width bar.
    // Say so in the text rather than drawing a row with an invisible track.
    const isClipped =
      span.end.getTime() < range.start.getTime() ||
      span.start.getTime() > range.end.getTime();

    const status = goalStatus(goal);
    const target = goal.period
      ? goal.period
      : (() => {
          const due = toDate(goal.dueDate);
          return due ? `due ${format(due, "MMM d, yyyy")}` : "no target";
        })();
    const projectCount = goal.projects.length;
    // Health is also carried by the bar colour; repeating it as text keeps the
    // row readable for colour-blind and screen-reader users.
    const metaParts = [
      `${Math.round(goal.progress)}%`,
      STATUS_LABEL[status],
      target,
    ];
    if (projectCount > 0) {
      metaParts.push(`${projectCount} project${projectCount === 1 ? "" : "s"}`);
    }
    if (isClipped) metaParts.push("outside this view");

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
      status,
      startFrac,
      endFrac,
      meta: metaParts.join(" · "),
      krs,
    };
  });

  return { objectives, users, axis, range };
}
