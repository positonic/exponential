import type { Prisma } from "@prisma/client";
import { buildTranscriptionAccessWhere } from "~/server/services/access";

/** A bare calendar date ("2026-09-15"), as agents often pass for a day. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Upper bound for a Meeting date range. A date-only `endDate` means "through
 * the end of that day": `new Date("2026-09-15")` is midnight at the START of
 * the day, which would make a `startDate`/`endDate` pair naming the same day
 * an empty window.
 */
export function meetingRangeEnd(endDate: string): Date {
  const end = new Date(endDate);
  if (DATE_ONLY.test(endDate.trim())) end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * WHERE clause for the Meetings an agent lists for a user
 * (`mastra.getMeetingTranscriptions`, behind zoe's get-meeting-transcriptions).
 *
 * - Access is `buildTranscriptionAccessWhere` — the set every Meetings surface
 *   and the Daily summary show — not only sessions the user owns. A Meeting
 *   imported by an agent (e.g. from Granola) belongs to the agent user, with
 *   the human as a Participant.
 * - The date range applies to when the meeting happened (`meetingDate`), not
 *   when the row was created: imports land hours or days after the meeting.
 *   Sessions with no `meetingDate` fall back to `createdAt`.
 *
 * Workspace/project access checks stay with the caller; this only scopes.
 */
export function buildMeetingTranscriptionsWhere(
  userId: string,
  filters: {
    workspaceId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
  },
): Prisma.TranscriptionSessionWhereInput {
  const and: Prisma.TranscriptionSessionWhereInput[] = [buildTranscriptionAccessWhere(userId)];

  if (filters.workspaceId) and.push({ workspaceId: filters.workspaceId });
  if (filters.projectId) and.push({ projectId: filters.projectId });

  if (filters.startDate || filters.endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.startDate) range.gte = new Date(filters.startDate);
    if (filters.endDate) range.lte = meetingRangeEnd(filters.endDate);
    and.push({
      OR: [{ meetingDate: range }, { meetingDate: null, createdAt: range }],
    });
  }

  return { AND: and };
}
