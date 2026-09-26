/**
 * Shared plumbing for the daily-brief sections (`yesterday`,
 * `todays_meetings`, `todays_actions`, `up_next`, `dri_projects`). A daily
 * brief is a ceremony a person holds with themselves, so every one of these
 * sections is scoped to the participants — falling back to the owner when a
 * template-created ceremony has nobody added yet, which is the default shape
 * (the blockers section fails closed instead; a brief for nobody is useless
 * rather than dangerous).
 *
 * Each section reads the same data the Daily summary notification is built
 * from (ADR-0059 daily summary): one loader, two renderings.
 */
import type { CalendarEventLike, CalendarReader } from "~/server/services/notifications/emit/dailySummary/calendar";
import type { SectionContext } from "../types";

export interface BriefPerson {
  id: string;
  name: string | null;
}

/** Participants (owner when there are none), with names for the multi-person detail prefix. */
export async function briefPeople(ctx: SectionContext): Promise<BriefPerson[]> {
  const ids = ctx.participantUserIds.length > 0 ? ctx.participantUserIds : [ctx.ceremony.ownerId];
  const users = await ctx.db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const byId = new Map((users ?? []).map((u) => [u.id, u.name]));
  return ids.map((id) => ({ id, name: byId.get(id) ?? null }));
}

/** "Andi · " when the brief has several people, nothing when it is one person's. */
export function personPrefix(people: BriefPerson[], person: BriefPerson): string {
  if (people.length < 2) return "";
  return `${person.name ?? "Someone"} · `;
}

/**
 * Production calendar reader, imported lazily so the section registry does
 * not load the Google/Microsoft clients at module load (same reason the
 * digest builder defers it).
 */
export const defaultCalendarReader: CalendarReader = async (userId, timeMin, timeMax) => {
  const { getEventsMultiCalendar } = await import("~/server/services");
  return getEventsMultiCalendar(userId, timeMin.toISOString(), timeMax.toISOString());
};

/**
 * A person's calendar read, in the window, degraded to no events on failure
 * (expired token, provider outage) so the brief still generates. The error
 * reporter is imported lazily: it pulls in the Prisma singleton, which must
 * not load with the section registry.
 */
export async function readCalendarSafely(
  ctx: SectionContext,
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEventLike[]> {
  const read = ctx.readCalendar ?? defaultCalendarReader;
  try {
    return await read(userId, timeMin, timeMax);
  } catch (error) {
    const { reportHandledErrorServer } = await import("~/server/utils/reportHandledErrorServer");
    reportHandledErrorServer(error, { area: "daily-brief-calendar", context: { userId, tz: ctx.ceremony.timezone } });
    return [];
  }
}
