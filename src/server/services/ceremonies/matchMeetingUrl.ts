/**
 * Which ceremony a video room belongs to (`Ceremony.meetingUrl`), so a
 * recorder in that room can file the meeting without anyone choosing. The
 * Syntrofi Talk notetaker and its "File in Exponential" chip call this
 * through `ceremony.matchMeetingUrl`.
 *
 * Rules:
 *  1. Only active ceremonies in workspaces the caller belongs to (directly or
 *     through a team) are candidates, and only when their link has the same
 *     `meetingUrlKey` as the room.
 *  2. An occurrence is "on" when `at` falls between its scheduled start and
 *     end, widened by 30 minutes either side; skipped ones never are. Among
 *     all candidates' on occurrences, the start nearest `at` wins. This is
 *     how one room shared by several ceremonies resolves.
 *  3. No occurrence on, and exactly one candidate: that ceremony, without an
 *     occurrence (an off-schedule meeting in its usual room).
 *  4. No occurrence on and several candidates: ambiguous, so null.
 *
 * The project is filled in only when the ceremony reviews exactly one
 * project and the caller can see it.
 */
import type { PrismaClient } from "@prisma/client";
import { meetingUrlKey } from "~/lib/ceremonies/meetingUrl";
import { getProjectAccess, hasProjectAccess } from "~/server/services/access";
import { buildWorkspaceAccessWhere } from "~/server/services/access/resolvers/workspaceResolver";

/** Slack either side of an occurrence's scheduled time (30 minutes), as in `matchOccurrence`. */
export const MEETING_URL_SLACK_MS = 30 * 60_000;

export interface MeetingUrlCandidate {
  id: string;
  occurrences: ReadonlyArray<{ id: string; scheduledStart: Date }>;
}

export interface MeetingUrlPick {
  ceremonyId: string;
  occurrenceId: string | null;
}

/** Rules 2–4 over candidates whose occurrences are already limited to the "on" window. */
export function pickMeetingUrlMatch(candidates: readonly MeetingUrlCandidate[], at: Date): MeetingUrlPick | null {
  let best: { ceremonyId: string; occurrenceId: string; distance: number } | null = null;
  for (const candidate of candidates) {
    for (const occurrence of candidate.occurrences) {
      const distance = Math.abs(occurrence.scheduledStart.getTime() - at.getTime());
      if (!best || distance < best.distance) best = { ceremonyId: candidate.id, occurrenceId: occurrence.id, distance };
    }
  }
  if (best) return { ceremonyId: best.ceremonyId, occurrenceId: best.occurrenceId };
  if (candidates.length === 1) return { ceremonyId: candidates[0]!.id, occurrenceId: null };
  return null;
}

export interface MeetingUrlMatch {
  workspace: { id: string; name: string };
  ceremony: { id: string; name: string };
  project: { id: string; name: string } | null;
  occurrence: { id: string; scheduledStart: Date; scheduledEnd: Date } | null;
}

export async function findCeremonyForMeetingUrl(
  db: PrismaClient,
  input: { userId: string; url: string; at: Date; workspaceId?: string },
): Promise<MeetingUrlMatch | null> {
  const key = meetingUrlKey(input.url);
  if (!key) return null;

  const at = input.at.getTime();
  const rows = await db.ceremony.findMany({
    where: {
      isActive: true,
      meetingUrl: { not: null },
      workspace: buildWorkspaceAccessWhere(input.userId),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: {
      id: true,
      name: true,
      meetingUrl: true,
      workspace: { select: { id: true, name: true } },
      projects: { select: { project: { select: { id: true, name: true } } } },
      occurrences: {
        where: {
          status: { not: "SKIPPED" },
          scheduledStart: { lte: new Date(at + MEETING_URL_SLACK_MS) },
          scheduledEnd: { gte: new Date(at - MEETING_URL_SLACK_MS) },
        },
        select: { id: true, scheduledStart: true, scheduledEnd: true },
      },
    },
  });
  const candidates = rows.filter((c) => c.meetingUrl !== null && meetingUrlKey(c.meetingUrl) === key);

  const pick = pickMeetingUrlMatch(candidates, input.at);
  if (!pick) return null;
  const ceremony = candidates.find((c) => c.id === pick.ceremonyId)!;
  const occurrence = ceremony.occurrences.find((o) => o.id === pick.occurrenceId) ?? null;

  let project: MeetingUrlMatch["project"] = null;
  const only = ceremony.projects.length === 1 ? ceremony.projects[0]!.project : null;
  if (only && hasProjectAccess(await getProjectAccess(db, input.userId, only.id))) project = only;

  return {
    workspace: ceremony.workspace,
    ceremony: { id: ceremony.id, name: ceremony.name },
    project,
    occurrence,
  };
}
