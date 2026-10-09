import type { Prisma } from "@prisma/client";
import { buildTranscriptionAccessWhere } from "~/server/services/access";

/** A bare calendar date ("2026-09-15", or unpadded "2026-9-5"), as agents often pass for a day. */
const DATE_ONLY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * A date-only string as UTC midnight at the start of that day. `new Date()`
 * reads a padded "2026-09-15" as UTC but an unpadded "2026-9-5" as server-local
 * time, so both are parsed explicitly.
 */
function parseMeetingDate(value: string): { date: Date; dateOnly: boolean } {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return { date: new Date(value), dateOnly: false };
  const [, y, m, d] = match;
  return { date: new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))), dateOnly: true };
}

/** Lower bound for a Meeting date range: a date-only start is that day's UTC midnight. */
export function meetingRangeStart(startDate: string): Date {
  return parseMeetingDate(startDate).date;
}

/**
 * Upper bound for a Meeting date range. A date-only `endDate` means "through
 * the end of that day": midnight at the START of the day would make a
 * `startDate`/`endDate` pair naming the same day an empty window.
 */
export function meetingRangeEnd(endDate: string): Date {
  const { date, dateOnly } = parseMeetingDate(endDate);
  if (dateOnly) date.setUTCHours(23, 59, 59, 999);
  return date;
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
    if (filters.startDate) range.gte = meetingRangeStart(filters.startDate);
    if (filters.endDate) range.lte = meetingRangeEnd(filters.endDate);
    and.push({
      OR: [{ meetingDate: range }, { meetingDate: null, createdAt: range }],
    });
  }

  return { AND: and };
}
