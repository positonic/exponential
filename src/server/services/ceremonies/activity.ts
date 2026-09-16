/**
 * Activity events for ceremony occurrences (ADR-0059). Both helpers go
 * through `recordActivity`, which never throws, so instrumentation can
 * never fail a mutation or a cron sweep.
 */
import type { Ceremony, PrismaClient } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";

const whenFmt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

export function formatOccurrenceLabel(ceremonyName: string, scheduledStart: Date, timezone?: string): string {
  let when: string;
  try {
    when = scheduledStart.toLocaleString("en-GB", { ...whenFmt, timeZone: timezone });
  } catch {
    when = scheduledStart.toISOString();
  }
  return `${ceremonyName} · ${when}`;
}

/**
 * One `created` event per expansion that inserted rows. The entity is the
 * ceremony's next upcoming occurrence (the row a reader would click into);
 * the metadata name summarises the batch.
 */
export async function recordOccurrencesScheduled(
  db: PrismaClient,
  ceremony: Ceremony,
  inserted: number,
  actorUserId: string | null,
  now = new Date(),
): Promise<void> {
  if (inserted <= 0) return;
  const next = await db.ceremonyOccurrence.findFirst({
    where: { ceremonyId: ceremony.id, scheduledStart: { gte: now } },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, scheduledStart: true },
  });
  if (!next) return;
  const name =
    inserted === 1
      ? formatOccurrenceLabel(ceremony.name, next.scheduledStart, ceremony.timezone)
      : `${inserted} occurrences of ${ceremony.name}`;
  await recordActivity(db, {
    workspaceId: ceremony.workspaceId,
    userId: actorUserId,
    entityType: "ceremony_occurrence",
    entityId: next.id,
    action: "created",
    metadata: { name, ceremonyId: ceremony.id, count: inserted },
  });
}

export async function recordOccurrenceCaptured(
  db: PrismaClient,
  input: {
    workspaceId: string;
    occurrenceId: string;
    ceremonyName: string;
    scheduledStart: Date;
    timezone?: string;
    meetingId: string;
    meetingTitle: string | null;
    actorUserId: string | null;
    /** "manual" | "ingestion" | "backfill" — how the link was made. */
    via: string;
  },
): Promise<void> {
  await recordActivity(db, {
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    entityType: "ceremony_occurrence",
    entityId: input.occurrenceId,
    action: "captured",
    metadata: {
      name: formatOccurrenceLabel(input.ceremonyName, input.scheduledStart, input.timezone),
      meetingId: input.meetingId,
      meetingTitle: input.meetingTitle,
      via: input.via,
    },
  });
}
