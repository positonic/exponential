/**
 * `retro_actions`: the Actions extracted from the recordings attached to the
 * previous retrospective occurrence in this ceremony's own scope — its team,
 * else its project or product, else the workspace — with their status: did
 * last retro's improvements happen?
 *
 * The scope matters. A workspace running a retro per team would otherwise
 * put one team's improvement actions on another team's agenda, attributed
 * to a meeting its attendees were never in.
 */
import type { AgendaItem, SectionModule } from "../types";

export const retroActionsSection: SectionModule = {
  type: "retro_actions",
  async run(ctx, section) {
    const lastRetro = await ctx.db.ceremonyOccurrence.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        scheduledStart: { lt: ctx.now },
        ceremony: {
          kind: "RETROSPECTIVE",
          // Mirror the scoping every sibling section applies. A ceremony with
          // no team, project or product keeps the workspace-wide behaviour.
          ...(ctx.ceremony.teamId ? { teamId: ctx.ceremony.teamId } : {}),
          ...(ctx.ceremony.projectId
            ? { projectId: ctx.ceremony.projectId }
            : ctx.ceremony.productId
              ? { productId: ctx.ceremony.productId }
              : {}),
        },
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
        project: { select: { goals: { select: { id: true, title: true }, take: 1 } } },
        assignees: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const when = lastRetro.scheduledStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return actions.map<AgendaItem>((a, index) => {
      const owners = a.assignees.map((x) => x.user.name).filter((n): n is string => Boolean(n));
      const state = a.completedAt || a.status === "COMPLETED" ? "done" : a.status.toLowerCase();
      const goal = a.project?.goals[0] ?? null;
      return {
        id: `${section.key}:action:${a.id}`,
        sectionKey: section.key,
        title: a.name,
        refType: "action",
        refId: a.id,
        goalId: goal?.id ?? null,
        goalTitle: goal?.title ?? null,
        order: index,
        resolvedAt: a.completedAt ? a.completedAt.toISOString() : null,
        detail: [`from the retro on ${when}`, state, owners.length ? owners.join(", ") : "unassigned"].join(" · "),
        href: `${ctx.workspacePath}/actions/${a.id}`,
      };
    });
  },
};
