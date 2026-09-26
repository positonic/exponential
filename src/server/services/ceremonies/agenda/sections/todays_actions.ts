/**
 * `todays_actions`: each participant's Today's actions — exactly the `todays`
 * bucket of the shared `partitionActions` (ADR-0034) over the same ownership
 * set as `/today`, cross-workspace — followed by their overdue bucket, in
 * its order, marked "overdue". The Daily summary prints only the overdue
 * count; the brief you hold with yourself is where you reschedule them, so
 * the agenda lists them (bounded).
 */
import { toZonedTime } from "date-fns-tz";
import { toPlainText } from "~/lib/content/plainText";
import { partitionOwnedActions } from "~/server/services/notifications/emit/dailySummary/loaders";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix } from "./dailyBrief";

const OVERDUE_LIMIT = 20;
const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export const todaysActionsSection: SectionModule = {
  type: "todays_actions",
  async run(ctx, section) {
    const tz = ctx.ceremony.timezone;
    const localNow = toZonedTime(ctx.occurrence.scheduledStart, tz);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const partition = await partitionOwnedActions(ctx.db, person.id, localNow, tz);
      const push = (a: { id: string; name: string; dueDate: Date | null }, detail: string | null) => {
        items.push({
          id: `${section.key}:action:${a.id}`,
          sectionKey: section.key,
          // Legacy action names can carry editor HTML; an agenda title is plain text.
          title: `${prefix}${toPlainText(a.name) || a.name}`,
          refType: "action",
          refId: a.id,
          order: items.length,
          detail,
          href: `${ctx.workspacePath}/actions/${a.id}`,
        });
      };
      for (const a of partition.todays) push(a, null);
      for (const a of partition.overdue.slice(0, OVERDUE_LIMIT)) {
        push(a, a.dueDate ? `overdue · due ${a.dueDate.toLocaleDateString("en-GB", dateFmt)}` : "overdue");
      }
      const hidden = partition.overdue.length - OVERDUE_LIMIT;
      if (hidden > 0) {
        const id = `${section.key}:text:${person.id}:more-overdue`;
        items.push({
          id,
          sectionKey: section.key,
          title: `${prefix}${hidden} more overdue`,
          refType: "text",
          refId: id,
          order: items.length,
          href: "/today",
        });
      }
    }
    return items;
  },
};
