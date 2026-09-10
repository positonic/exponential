/**
 * `blockers`: participants' ACTIVE actions that are past due, plus actions
 * carrying a blocked marker (`blockedByIds`), in the ceremony's workspace
 * (narrowed to its project when set). Unassigned overdue actions in the
 * project count too — a standup is where they get an owner.
 */
import type { AgendaItem, SectionModule } from "../types";

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export const blockersSection: SectionModule = {
  type: "blockers",
  async run(ctx, section) {
    const participantFilter = ctx.participantUserIds.length
      ? { OR: [{ assignees: { some: { userId: { in: ctx.participantUserIds } } } }, { createdById: { in: ctx.participantUserIds } }] }
      : {};
    const actions = await ctx.db.action.findMany({
      where: {
        status: "ACTIVE",
        workspaceId: ctx.workspaceId,
        ...(ctx.ceremony.projectId ? { projectId: ctx.ceremony.projectId } : {}),
        OR: [{ dueDate: { lt: ctx.now } }, { blockedByIds: { isEmpty: false } }],
        ...(participantFilter.OR ? { AND: [participantFilter] } : {}),
      },
      select: {
        id: true,
        name: true,
        dueDate: true,
        blockedByIds: true,
        projectId: true,
        assignees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 50,
    });
    return actions.map<AgendaItem>((a, index) => {
      const reasons: string[] = [];
      if (a.dueDate && a.dueDate < ctx.now) reasons.push(`due ${a.dueDate.toLocaleDateString("en-GB", dateFmt)}`);
      if (a.blockedByIds.length > 0) reasons.push(`blocked by ${a.blockedByIds.length} action${a.blockedByIds.length === 1 ? "" : "s"}`);
      const owners = a.assignees.map((x) => x.user.name).filter((n): n is string => Boolean(n));
      return {
        id: `${section.key}:action:${a.id}`,
        sectionKey: section.key,
        title: a.name,
        refType: "action",
        refId: a.id,
        order: index,
        detail: [reasons.join(", "), owners.length ? owners.join(", ") : "unassigned"].join(" · "),
        href: `${ctx.workspacePath}/actions/${a.id}`,
      };
    });
  },
};
