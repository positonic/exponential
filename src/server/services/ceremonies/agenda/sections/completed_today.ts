/**
 * `completed_today`: the Actions each participant finished on the
 * occurrence's local day, oldest first, across the workspaces the brief may
 * read (`briefWorkspaceIds`). Same ownership set as `/today`. The shutdown
 * routine's "Done today".
 */
import { formatInTimeZone } from "date-fns-tz";
import { toPlainText } from "~/lib/content/plainText";
import { summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, briefWorkspaceIds, ownedActionsWhere, personPrefix } from "./dailyBrief";

const LIMIT = 50;

export const completedTodaySection: SectionModule = {
  type: "completed_today",
  async run(ctx, section) {
    const tz = ctx.ceremony.timezone;
    const window = summaryWindow(ctx.occurrence.scheduledStart, tz);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const workspaceIds = await briefWorkspaceIds(ctx, person.id);
      const rows = await ctx.db.action.findMany({
        where: {
          AND: [
            ownedActionsWhere(person.id),
            { status: "COMPLETED" },
            { completedAt: { gte: window.todayStart, lt: window.tomorrowStart } },
            { workspaceId: { in: workspaceIds } },
          ],
        },
        select: { id: true, name: true, completedAt: true, workspace: { select: { slug: true, name: true } } },
        orderBy: { completedAt: "asc" },
        take: LIMIT,
      });
      const manyWorkspaces = new Set((rows ?? []).map((r) => r.workspace?.slug)).size > 1;
      for (const a of rows ?? []) {
        const when = a.completedAt ? formatInTimeZone(a.completedAt, tz, "HH:mm") : null;
        const where = manyWorkspaces ? (a.workspace?.name ?? null) : null;
        items.push({
          id: `${section.key}:action:${a.id}`,
          sectionKey: section.key,
          title: `${prefix}${toPlainText(a.name) || a.name}`,
          refType: "action",
          refId: a.id,
          order: items.length,
          detail: [where, when ? `done ${when}` : null].filter(Boolean).join(" · ") || null,
          href: a.workspace?.slug ? `/w/${a.workspace.slug}/actions/${a.id}` : `${ctx.workspacePath}/actions/${a.id}`,
        });
      }
    }
    return items;
  },
};
