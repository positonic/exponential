/**
 * `blockers`: participants' ACTIVE actions that are past due, plus actions
 * blocked by another still-active action (`ActionDependency`), in the ceremony's workspace
 * (narrowed to its project when set). Unassigned overdue actions in the
 * project count too — a standup is where they get an owner. Without a
 * project only actions assigned to a participant count: a workspace-wide
 * ceremony must never present someone's personal, unowned to-dos as the
 * team's blockers.
 *
 * Paused projects (On hold, Completed, Cancelled): with a project linked the
 * section is about that project's health, like its own page, so it lists
 * everything even when the project is paused. Without one it reads what is on
 * each participant's plate, so a paused project's actions are left out, as on
 * /today and in the standup summary's blockers step.
 */
import type { Prisma } from "@prisma/client";
import { notInPausedProjectWhere } from "~/server/services/actions/myActionsWhere";
import type { AgendaItem, SectionModule } from "../types";

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export const blockersSection: SectionModule = {
  type: "blockers",
  async run(ctx, section) {
    // Fail closed. With neither participants nor a project there is nothing
    // to narrow on, and the query would return 50 arbitrary overdue actions
    // from the whole workspace — which the narration then presents as this
    // team's blockers. A template-created ceremony with nobody added yet is
    // the default shape, so this is the first agenda a new user sees.
    if (ctx.participantUserIds.length === 0 && ctx.projectIds.length === 0) return [];

    // Narrowed to the participants when the ceremony has any. Inside a
    // project, actions a participant created and actions nobody owns count
    // too: the standup exists to give those an owner. Without a project both
    // branches would reach across the whole workspace and surface personal
    // to-dos ("pay 5 euro") nobody on this ceremony is responsible for, so
    // only actions assigned to a participant remain.
    const assignedToParticipant = { assignees: { some: { userId: { in: ctx.participantUserIds } } } };
    const participantOr = ctx.participantUserIds.length
      ? ctx.projectIds.length
        ? [assignedToParticipant, { createdById: { in: ctx.participantUserIds } }, { assignees: { none: {} } }]
        : [assignedToParticipant]
      : null;
    const and: Prisma.ActionWhereInput[] = [
      ...(participantOr ? [{ OR: participantOr }] : []),
      // No project linked: a plate view, so paused projects drop out.
      ...(ctx.projectIds.length ? [] : [notInPausedProjectWhere()]),
    ];
    const actions = await ctx.db.action.findMany({
      where: {
        status: "ACTIVE",
        workspaceId: ctx.workspaceId,
        ...(ctx.projectIds.length ? { projectId: { in: ctx.projectIds } } : {}),
        OR: [{ dueDate: { lt: ctx.now } }, { depsOut: { some: { dependsOn: { status: "ACTIVE" } } } }],
        ...(and.length ? { AND: and } : {}),
      },
      select: {
        id: true,
        name: true,
        dueDate: true,
        depsOut: { where: { dependsOn: { status: "ACTIVE" } }, select: { id: true } },
        projectId: true,
        // The action rolls up to its project's objective, when the project has one (goal chip).
        project: { select: { goals: { select: { id: true, title: true }, take: 1 } } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 50,
    });
    return actions.map<AgendaItem>((a, index) => {
      const reasons: string[] = [];
      if (a.dueDate && a.dueDate < ctx.now) reasons.push(`due ${a.dueDate.toLocaleDateString("en-GB", dateFmt)}`);
      if (a.depsOut.length > 0) reasons.push(`blocked by ${a.depsOut.length} action${a.depsOut.length === 1 ? "" : "s"}`);
      const owners = a.assignees.map((x) => x.user.name).filter((n): n is string => Boolean(n));
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
        detail: [reasons.join(", "), owners.length ? owners.join(", ") : "unassigned"].join(" · "),
        href: `${ctx.workspacePath}/actions/${a.id}`,
      };
    });
  },
};
