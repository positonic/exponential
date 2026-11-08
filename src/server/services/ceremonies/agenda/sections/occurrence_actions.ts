/**
 * `occurrence_actions` (V10): status on last time's action points. The
 * Actions created from the previous occurrence's agenda (`Action.occurrenceId`,
 * V9), plus, inside the ceremony's projects, Actions assigned to a participant
 * and due since the previous occurrence, each with owner, due date and status.
 * Resolution is a query fact (`completedAt`), as in `retro_actions`, so an
 * Action completed between two generations is never shown as outstanding.
 *
 * The participant branch needs a project to scope by. Without one it would
 * reach every participant's personal actions across the workspace, the
 * noise V8 took out of `blockers`; such a ceremony lists only its own
 * occurrence's actions.
 */
import type { Prisma } from "@prisma/client";
import type { AgendaItem, SectionModule } from "../types";

const dueFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export const occurrenceActionsSection: SectionModule = {
  type: "occurrence_actions",
  emptyReason: "No action points from the last occurrence.",
  async run(ctx, section) {
    const previous = ctx.previousOccurrence;
    if (!previous) return [];
    const branches: Prisma.ActionWhereInput[] = [{ occurrenceId: previous.id }];
    if (ctx.projectIds.length && ctx.participantUserIds.length) {
      branches.push({
        projectId: { in: ctx.projectIds },
        assignees: { some: { userId: { in: ctx.participantUserIds } } },
        dueDate: { gte: previous.scheduledStart },
      });
    }
    const actions = await ctx.db.action.findMany({
      where: { workspaceId: ctx.workspaceId, status: { notIn: ["DRAFT", "DELETED"] }, OR: branches },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        completedAt: true,
        project: { select: { goals: { select: { id: true, title: true }, take: 1 } } },
        assignees: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 50,
    });
    return actions.map<AgendaItem>((a, index) => {
      const owners = a.assignees.map((x) => x.user.name).filter((n): n is string => Boolean(n));
      const done = Boolean(a.completedAt) || a.status === "COMPLETED";
      const state = done ? "done" : a.dueDate && a.dueDate < ctx.now ? "overdue" : "open";
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
        detail: [
          owners.length ? owners.join(", ") : "unassigned",
          a.dueDate ? `due ${a.dueDate.toLocaleDateString("en-GB", dueFmt)}` : null,
          state,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `${ctx.workspacePath}/actions/${a.id}`,
      };
    });
  },
};
