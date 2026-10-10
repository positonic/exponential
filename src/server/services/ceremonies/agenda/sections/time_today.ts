/**
 * `time_today`: each participant's attention hours for the occurrence's local
 * day, from the same day report the `/time` Day tab renders (ADR-0059: one
 * builder, two renderers) — a total line, the products the time went to,
 * Proposed entries still to confirm, and timers flagged as forgotten. Reads
 * across every workspace when the ceremony lives in a personal workspace,
 * else only its own. A failing report degrades to no items.
 */
import { summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, formatMinutes, personPrefix } from "./dailyBrief";

const PRODUCT_LIMIT = 5;

export const timeTodaySection: SectionModule = {
  type: "time_today",
  async run(ctx, section) {
    const window = summaryWindow(ctx.occurrence.scheduledStart, ctx.ceremony.timezone);
    const people = await briefPeople(ctx);
    const home = await ctx.db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { type: true } });
    const workspaceId = home?.type === "personal" ? null : ctx.workspaceId;
    // Lazy: the service pulls in activity recording, which must not load with the section registry.
    const { TimeEntryService } = await import("~/server/services/timeEntry/TimeEntryService");
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const text = (suffix: string, title: string, detail: string | null = null) => {
        const id = `${section.key}:text:${person.id}:${suffix}`;
        items.push({ id, sectionKey: section.key, title: `${prefix}${title}`, refType: "text", refId: id, order: items.length, detail, href: "/time" });
      };
      try {
        const report = await new TimeEntryService(ctx.db).dayReport({
          userId: person.id,
          dayStart: window.todayStart,
          dayEnd: window.tomorrowStart,
          workspaceId,
        });
        if (report.entries.length === 0) continue;
        text(
          "total",
          `${formatMinutes(report.attentionMinutes)} of attention`,
          report.agentRunMinutes > 0 ? `plus ${formatMinutes(report.agentRunMinutes)} of agent runs` : null,
        );
        for (const p of report.byProduct.filter((row) => row.minutes > 0).slice(0, PRODUCT_LIMIT)) {
          text(`product:${p.name}`, p.name, formatMinutes(p.minutes));
        }
        if (report.proposedCount > 0) {
          text("proposed", `${report.proposedCount} proposed ${report.proposedCount === 1 ? "entry" : "entries"} to confirm`);
        }
        for (const flag of report.flags) {
          const entry = report.entries.find((e) => e.id === flag.entryId);
          text(`flag:${flag.entryId}`, `Timer may still be running: ${entry?.action.name ?? "an entry"}`, "stop it or fix its end");
        }
      } catch (error) {
        const { reportHandledErrorServer } = await import("~/server/utils/reportHandledErrorServer");
        reportHandledErrorServer(error, { area: "shutdown-time", context: { userId: person.id } });
      }
    }
    return items;
  },
};
