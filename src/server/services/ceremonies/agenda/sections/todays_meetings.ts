/**
 * `todays_meetings`: each participant's calendar events on the occurrence's
 * local day (in the ceremony's timezone), time-ordered, all-day first — the
 * Daily summary's "Today's meetings" as agenda items. Calendar events have
 * no record in the app, so they are `text` items.
 */
import { eventsOnLocalDay, summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix, readCalendarSafely } from "./dailyBrief";

export const todaysMeetingsSection: SectionModule = {
  type: "todays_meetings",
  async run(ctx, section) {
    const tz = ctx.ceremony.timezone;
    const window = summaryWindow(ctx.occurrence.scheduledStart, tz);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const events = await readCalendarSafely(ctx, person.id, window.todayStart, window.tomorrowStart);
      eventsOnLocalDay(events, window.todayKey, tz).forEach((e, index) => {
        const id = `${section.key}:text:${person.id}:${index}`;
        items.push({
          id,
          sectionKey: section.key,
          title: `${prefix}${e.startLocal ? `${e.startLocal} ` : ""}${e.title}`,
          refType: "text",
          refId: id,
          order: items.length,
        });
      });
    }
    return items;
  },
};
