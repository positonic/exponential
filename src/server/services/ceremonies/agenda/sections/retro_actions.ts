/**
 * `retro_actions`: the Actions extracted from the recordings attached to the
 * workspace's previous retrospective occurrence (any RETROSPECTIVE ceremony,
 * the latest one before now), with their status — did last retro's
 * improvements happen?
 */
import type { AgendaItem, SectionModule } from "../types";

export const retroActionsSection: SectionModule = {
  type: "retro_actions",
  async run(ctx, section) {
    const lastRetro = await ctx.db.ceremonyOccurrence.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        scheduledStart: { lt: ctx.now },
        ceremony: { kind: "RETROSPECTIVE" },
        // The retro being prepared is not its own previous retro.
        id: { not: ctx.occurrence.id },
      },
      orderBy: { scheduledStart: "desc" },
      select: { id: true, scheduledStart: true },
    });
    if (!lastRetro) return [];
    const actions = await ctx.db.action.findMany({
      where: { transcriptionSession: { occurrenceId: lastRetro.id }, status: { not: "DRAFT" } },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        completedAt: true,
        assignees: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const when = lastRetro.scheduledStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return actions.map<AgendaItem>((a, index) => {
      const owners = a.assignees.map((x) => x.user.name).filter((n): n is string => Boolean(n));
      const state = a.completedAt || a.status === "COMPLETED" ? "done" : a.status.toLowerCase();
      return {
        id: `${section.key}:action:${a.id}`,
        sectionKey: section.key,
        title: a.name,
        refType: "action",
        refId: a.id,
        order: index,
        resolvedAt: a.completedAt ? a.completedAt.toISOString() : null,
        detail: [`from the retro on ${when}`, state, owners.length ? owners.join(", ") : "unassigned"].join(" · "),
        href: `${ctx.workspacePath}/actions/${a.id}`,
      };
    });
  },
};
