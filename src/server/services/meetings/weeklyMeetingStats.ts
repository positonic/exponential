import type { PrismaClient } from "@prisma/client";
import { buildTranscriptionAccessWhere } from "~/server/services/access";

/**
 * Deep server-side aggregation for the Meetings v2 header strip and right
 * rail. Pure module — no React, no tRPC types in the interface.
 *
 * Caller passes the user's `weekStart` as an absolute `Date`. Day buckets
 * are computed as offsets from that anchor, so the "week boundary" inherits
 * whatever timezone the caller used to compute the anchor. Callers that omit
 * `weekStart` get the current ISO week (Monday-anchored) in the server's
 * local timezone.
 */

export interface WeeklyMeetingStatsInput {
  userId: string;
  workspaceId?: string;
  /** Inclusive lower bound of the 7-day window. Defaults to current ISO week's Monday. */
  weekStart?: Date;
}

export interface WeeklyMeetingStatsPerDay {
  /** YYYY-MM-DD label for this day bucket, computed as a per-day offset from weekStart. */
  date: string;
  count: number;
}

export interface WeeklyMeetingStatsTopParticipant {
  /** Stable identity key — `u:<userId>` / `c:<contactId>` / `e:<email>`. */
  participantId: string;
  displayName: string;
  avatarUrl?: string;
  count: number;
}

export interface WeeklyMeetingStatsResult {
  perDayCounts: WeeklyMeetingStatsPerDay[];
  totalMeetings: number;
  totalDurationMinutes: number;
  totalActionsExtracted: number;
  topParticipants: WeeklyMeetingStatsTopParticipant[];
}

function startOfIsoWeekMonday(d: Date): Date {
  // toLocalDate(d) at 00:00 in server-local time
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // JS: getDay() returns 0 (Sun) .. 6 (Sat). ISO week starts Monday — shift so
  // Monday → 0, Sunday → 6.
  const day = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - day);
  return local;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function participantKey(p: {
  userId: string | null;
  contactId: string | null;
  email: string;
}): string {
  if (p.userId) return `u:${p.userId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return `e:${p.email.toLowerCase()}`;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function participantDisplayName(p: {
  name: string | null;
  email: string;
  user: { name: string | null } | null;
  contact: { firstName: string | null; lastName: string | null } | null;
}): string {
  if (p.user?.name && p.user.name.trim()) return p.user.name.trim();
  if (p.contact) {
    const full = `${p.contact.firstName ?? ""} ${p.contact.lastName ?? ""}`.trim();
    if (full) return full;
  }
  if (p.name && p.name.trim()) return p.name.trim();
  return emailLocalPart(p.email);
}

/**
 * Compute the weekly Meeting roll-up for the header strip and right rail.
 *
 * Behaviour:
 * - Only Meetings the caller can see (per the centralized
 *   `buildTranscriptionAccessWhere` rule) are counted — the rail numbers
 *   always match the Meetings list for the same user.
 * - Archived Meetings (`archivedAt != null`) are excluded from every metric.
 * - Workspace scoping is applied to both the Meeting itself and (via the
 *   Meeting's project) any project-scoped Meeting.
 * - `perDayCounts` always returns 7 entries — days with no Meetings get
 *   `count: 0`.
 * - `totalDurationMinutes` treats null `durationSeconds` as zero.
 * - `topParticipants` ranks by Meeting count, descending; ties resolve
 *   alphabetically by `displayName` for a stable order.
 */
export async function weeklyMeetingStats(
  db: PrismaClient,
  input: WeeklyMeetingStatsInput,
): Promise<WeeklyMeetingStatsResult> {
  const weekStart = input.weekStart
    ? new Date(
        input.weekStart.getFullYear(),
        input.weekStart.getMonth(),
        input.weekStart.getDate(),
      )
    : startOfIsoWeekMonday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Access control: never aggregate Meetings the caller couldn't open.
  const andFilters: Record<string, unknown>[] = [
    buildTranscriptionAccessWhere(input.userId),
  ];
  if (input.workspaceId) {
    andFilters.push({
      OR: [
        { workspaceId: input.workspaceId },
        { project: { workspaceId: input.workspaceId } },
      ],
    });
  }

  const where: Record<string, unknown> = {
    archivedAt: null,
    OR: [
      { meetingDate: { gte: weekStart, lt: weekEnd } },
      {
        AND: [
          { meetingDate: null },
          { createdAt: { gte: weekStart, lt: weekEnd } },
        ],
      },
    ],
    AND: andFilters,
  };

  const sessions = await db.transcriptionSession.findMany({
    where,
    select: {
      id: true,
      meetingDate: true,
      createdAt: true,
      durationSeconds: true,
      actions: {
        where: { status: { not: "DRAFT" } },
        select: { id: true },
      },
      participants: {
        select: {
          id: true,
          email: true,
          name: true,
          userId: true,
          contactId: true,
          user: { select: { name: true, image: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // Per-day buckets — always emit 7 entries, including zero-Meeting days.
  const perDayCounts: WeeklyMeetingStatsPerDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    return { date: formatLocalDate(day), count: 0 };
  });

  for (const session of sessions) {
    const ts = session.meetingDate ?? session.createdAt;
    const dayIndex = Math.floor(
      (new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime() -
        weekStart.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (dayIndex >= 0 && dayIndex < 7) {
      perDayCounts[dayIndex]!.count += 1;
    }
  }

  const totalMeetings = sessions.length;
  const totalDurationMinutes = sessions.reduce(
    (sum, s) => sum + Math.floor((s.durationSeconds ?? 0) / 60),
    0,
  );
  const totalActionsExtracted = sessions.reduce(
    (sum, s) => sum + s.actions.length,
    0,
  );

  // Top participants — rank by Meeting count across the window, tie-break by
  // displayName alphabetical.
  const byKey = new Map<
    string,
    {
      participantId: string;
      displayName: string;
      avatarUrl?: string;
      count: number;
    }
  >();
  for (const session of sessions) {
    for (const p of session.participants) {
      const key = participantKey(p);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const displayName = participantDisplayName(p);
        byKey.set(key, {
          participantId: key,
          displayName,
          avatarUrl: p.user?.image ?? undefined,
          count: 1,
        });
      }
    }
  }
  const topParticipants = Array.from(byKey.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.displayName.localeCompare(b.displayName);
  });

  return {
    perDayCounts,
    totalMeetings,
    totalDurationMinutes,
    totalActionsExtracted,
    topParticipants,
  };
}
