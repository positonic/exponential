/**
 * `yesterday`: each participant's calendar events on the previous local day
 * (in the ceremony's timezone), matched to the recorded Meetings in the
 * workspace by time overlap exactly as the Daily summary does; recordings no
 * event claims are appended as "recorded" lines. Calendar rows are `text`
 * items (a calendar event has no record here); matched or unmatched
 * recordings link to `/recording/<id>`.
 */
import { formatInTimeZone } from "date-fns-tz";
import { buildTranscriptionAccessWhere } from "~/server/services/access";
import { eventsOnLocalDay, summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import { matchRecordingsToEvents } from "~/server/services/notifications/emit/dailySummary/matcher";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix, readCalendarSafely } from "./dailyBrief";

export const yesterdaySection: SectionModule = {
  type: "yesterday",
  async run(ctx, section) {
    const tz = ctx.ceremony.timezone;
    const window = summaryWindow(ctx.occurrence.scheduledStart, tz);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const [events, recordings] = await Promise.all([
        readCalendarSafely(ctx, person.id, window.yesterdayStart, window.todayStart),
        ctx.db.transcriptionSession.findMany({
          where: {
            AND: [
              buildTranscriptionAccessWhere(person.id),
              { workspaceId: ctx.workspaceId },
              { meetingDate: { gte: window.yesterdayStart, lt: window.todayStart } },
            ],
          },
          select: { id: true, title: true, meetingDate: true },
          orderBy: { meetingDate: "asc" },
        }),
      ]);
      const dated = (recordings ?? []).flatMap((r) =>
        r.meetingDate ? [{ id: r.id, title: r.title, meetingDate: r.meetingDate }] : [],
      );
      const dayEvents = eventsOnLocalDay(events, window.yesterdayKey, tz);
      const { byEvent, unmatched } = matchRecordingsToEvents(dayEvents, dated);

      dayEvents.forEach((e, index) => {
        const rec = byEvent.get(e);
        const id = rec ? `${section.key}:meeting:${rec.id}` : `${section.key}:text:${person.id}:${index}`;
        items.push({
          id,
          sectionKey: section.key,
          title: `${prefix}${e.startLocal ? `${e.startLocal} ` : ""}${e.title}`,
          refType: rec ? "meeting" : "text",
          refId: rec ? rec.id : id,
          order: items.length,
          detail: rec ? "recorded" : null,
          href: rec ? `/recording/${rec.id}` : null,
        });
      });
      for (const r of unmatched) {
        items.push({
          id: `${section.key}:meeting:${r.id}`,
          sectionKey: section.key,
          title: `${prefix}${formatInTimeZone(r.meetingDate, tz, "HH:mm")} ${r.title?.trim() ? r.title.trim() : "Untitled meeting"}`,
          refType: "meeting",
          refId: r.id,
          order: items.length,
          detail: "recorded",
          href: `/recording/${r.id}`,
        });
      }
    }
    return items;
  },
};
