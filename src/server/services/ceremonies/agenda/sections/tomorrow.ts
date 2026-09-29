/**
 * `tomorrow`: what the next local day already holds for each participant —
 * calendar events first, then the Actions that will be in tomorrow's
 * `/today` set (the shared partition run with tomorrow as "today", so the
 * shutdown and tomorrow's brief agree by construction). The place to pick
 * tomorrow's top three before closing the day.
 */
import { addHours } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { toPlainText } from "~/lib/content/plainText";
import { eventsOnLocalDay, summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import { partitionOwnedActions } from "~/server/services/notifications/emit/dailySummary/loaders";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix, readCalendarSafely } from "./dailyBrief";

export const tomorrowSection: SectionModule = {
  type: "tomorrow",
  async run(ctx, section) {
    const tz = ctx.ceremony.timezone;
    // The window of the day after the occurrence's local day.
    const window = summaryWindow(addHours(ctx.occurrence.scheduledStart, 24), tz);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const [events, partition] = await Promise.all([
        readCalendarSafely(ctx, person.id, window.todayStart, window.tomorrowStart),
        partitionOwnedActions(ctx.db, person.id, toZonedTime(window.todayStart, tz), tz),
      ]);
      eventsOnLocalDay(events, window.todayKey, tz).forEach((e, index) => {
        const id = `${section.key}:text:${person.id}:event:${index}`;
        items.push({
          id,
          sectionKey: section.key,
          title: `${prefix}${e.startLocal ? `${e.startLocal} ` : ""}${e.title}`,
          refType: "text",
          refId: id,
          order: items.length,
          detail: "meeting",
        });
      });
      for (const a of partition.todays) {
        items.push({
          id: `${section.key}:action:${a.id}`,
          sectionKey: section.key,
          title: `${prefix}${toPlainText(a.name) || a.name}`,
          refType: "action",
          refId: a.id,
          order: items.length,
          detail: a.scheduledStart ? "scheduled" : "due",
          href: `${ctx.workspacePath}/actions/${a.id}`,
        });
      }
    }
    return items;
  },
};
