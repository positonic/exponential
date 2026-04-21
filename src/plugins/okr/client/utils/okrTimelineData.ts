/**
 * Build data + axis config for <OkrTimeline /> from the ObjectiveCardObjective
 * shape used by the OKR dashboard.
 */

import { format } from "date-fns";
import type {
  OkrStatus,
  TimelineKr,
  TimelineObjective,
  TimelineUser,
} from "../components/OkrTimeline";
import type {
  ObjectiveCardKeyResult,
  ObjectiveCardObjective,
} from "../components/ObjectiveCardV2";
import {
  clamp01,
  krProgress,
  periodDateRange,
  statusToConfidence,
} from "./okrDashboardUtils";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
} from "~/utils/avatarColors";

export interface TimelineAxis {
  weekCount: number;
  weekLabels: string[];
  monthStarts: number[];
  monthLabels: string[];
  todayFrac: number;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

/**
 * Given a period like "Q2-2026" or "Annual-2026", produce the axis config
 * the gantt component needs.
 */
export function computeTimelineAxis(
  period: string,
  now: Date = new Date(),
): TimelineAxis | null {
  const range = periodDateRange(period);
  if (!range) return null;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalMs = range.end.getTime() - range.start.getTime();
  if (totalMs <= 0) return null;

  const weekCount = Math.max(1, Math.ceil(totalMs / msPerWeek));

  const weekLabels: string[] = [];
  const monthStarts: number[] = [];
  const monthLabels: string[] = [];

  let lastMonth = -1;
  for (let i = 0; i < weekCount; i++) {
    const wkStart = new Date(range.start.getTime() + i * msPerWeek);
    weekLabels.push(`W${getISOWeek(wkStart)}`);
    if (wkStart.getMonth() !== lastMonth) {
      lastMonth = wkStart.getMonth();
      monthStarts.push(i);
      monthLabels.push(wkStart.toLocaleString("en-US", { month: "short" }));
    }
  }

  const todayFrac = clamp01(
    (now.getTime() - range.start.getTime()) / totalMs,
  );

  return { weekCount, weekLabels, monthStarts, monthLabels, todayFrac };
}

function formatKrCurrent(kr: ObjectiveCardKeyResult): string {
  if (kr.unit === "percent") return `${Math.round(kr.currentValue)}%`;
  if (kr.unit === "currency")
    return `$${kr.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kr.unit === "hours") return `${kr.currentValue.toLocaleString()}h`;
  return kr.currentValue.toLocaleString();
}

function formatKrTarget(kr: ObjectiveCardKeyResult): string {
  if (kr.unit === "percent") return `${Math.round(kr.targetValue)}%`;
  if (kr.unit === "currency")
    return `$${kr.targetValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kr.unit === "hours") return `${kr.targetValue.toLocaleString()}h`;
  if (kr.unit === "custom" && kr.unitLabel)
    return `${kr.targetValue.toLocaleString()} ${kr.unitLabel}`;
  return kr.targetValue.toLocaleString();
}

function rollupObjectiveStatus(
  krs: ObjectiveCardKeyResult[],
): OkrStatus {
  if (krs.length === 0) return "idle";
  const confs = krs.map((k) => statusToConfidence(k.status));
  if (confs.includes("bad")) return "bad";
  if (confs.includes("warn")) return "warn";
  if (confs.every((c) => c === "idle")) return "idle";
  return "ok";
}

interface AnyUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

function userToTimelineUser(user: AnyUser): TimelineUser {
  const seed = getColorSeed(user.name, user.email);
  return {
    id: user.id,
    name: user.name ?? user.email ?? "Unknown",
    initials: getInitial(user.name, user.email),
    color: getAvatarColor(seed),
  };
}

export interface TimelineDataBundle {
  objectives: TimelineObjective[];
  users: Map<string, TimelineUser>;
}

/**
 * Map ObjectiveCardObjective[] → the shape <OkrTimeline /> expects.
 * Returns both the transformed objectives and a lookup map of users found
 * among owners / DRIs / KR owners.
 */
export function buildTimelineData(
  objectives: ObjectiveCardObjective[],
  period: string,
): TimelineDataBundle {
  const users = new Map<string, TimelineUser>();
  const registerUser = (u: AnyUser | null | undefined) => {
    if (!u) return;
    if (!users.has(u.id)) users.set(u.id, userToTimelineUser(u));
  };

  const range = periodDateRange(period);
  const periodEndLabel = range ? format(range.end, "MMM d") : "—";

  const timelineObjectives: TimelineObjective[] = objectives.map((obj, idx) => {
    const objOwner = obj.driUser ?? obj.user ?? null;
    registerUser(objOwner);

    const rolledStatus = rollupObjectiveStatus(obj.keyResults);
    const objProgress = clamp01((obj.progress ?? 0) / 100);

    const krs: TimelineKr[] = obj.keyResults.map((kr) => {
      const krOwner = kr.driUser ?? kr.user ?? null;
      registerUser(krOwner);

      const dueLabel = obj.dueDate
        ? format(new Date(obj.dueDate), "MMM d")
        : periodEndLabel;

      return {
        id: kr.id,
        title: kr.title,
        owner: krOwner?.id ?? "unassigned",
        progress: krProgress(kr),
        currentLabel: formatKrCurrent(kr),
        targetLabel: formatKrTarget(kr),
        due: dueLabel,
        endFrac: 1.0,
        status: statusToConfidence(kr.status),
      };
    });

    return {
      id: String(obj.id),
      code: `O${idx + 1}`,
      title: obj.title,
      owner: objOwner?.id ?? "unassigned",
      coOwners: [],
      progress: objProgress,
      status: rolledStatus,
      krs,
    };
  });

  return { objectives: timelineObjectives, users };
}
