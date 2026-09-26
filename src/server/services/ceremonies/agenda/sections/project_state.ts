/**
 * `project_state`: where the ceremony's project stands, so the agenda opens
 * with the state of play rather than assuming everyone has it in their head.
 *
 * Three kinds of item, all deterministic (ADR-0059: the LLM only narrates):
 *   1. one status line — status, priority, progress, end date;
 *   2. movement since the previous occurrence — actions completed, actions
 *      that fell overdue, what else shifted (the project activity log: status
 *      moves, reschedules, creations, deletions; assignee changes are left out
 *      as the noisiest kind), goals not on track;
 *   3. dates landing before the next occurrence — review date, next action date.
 *
 * Fails closed: a ceremony with no project has no state to report, and
 * falling back to "the whole workspace" would present someone else's project
 * as this room's. Same rule as `blockers`.
 */
import type { AgendaItem, SectionModule } from "../types";

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const fmt = (d: Date) => d.toLocaleDateString("en-GB", dateFmt);

/** Window for "since last time" when the ceremony has no previous occurrence. */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const HEALTH_LABEL: Record<string, string> = {
  "on-track": "on track",
  "at-risk": "at risk",
  "off-track": "off track",
  "no-update": "no update",
};

/** Activity types worth a line each. ASSIGNEE_CHANGED is deliberately absent. */
const SHIFT_TYPES = ["STATUS_CHANGED", "DUE_DATE_CHANGED", "ACTION_CREATED", "ACTION_DELETED"] as const;
const MAX_SHIFTS = 10;

interface ShiftRow {
  type: string;
  fromValue: string | null;
  toValue: string | null;
  action: { name: string } | null;
}

/** Mirrors `describeActivity` on the project overview, as one title + detail. */
function describeShift(row: ShiftRow): { title: string; detail: string } | null {
  const name = row.action?.name ?? row.toValue ?? row.fromValue;
  if (!name) return null;
  switch (row.type) {
    case "STATUS_CHANGED":
      return {
        title: name,
        detail: row.fromValue && row.toValue ? `moved ${row.fromValue} → ${row.toValue}` : `moved to ${row.toValue ?? "?"}`,
      };
    case "DUE_DATE_CHANGED": {
      const from = row.fromValue ? fmt(new Date(row.fromValue)) : "no date";
      const to = row.toValue ? fmt(new Date(row.toValue)) : "no date";
      return { title: name, detail: `rescheduled ${from} → ${to}` };
    }
    case "ACTION_CREATED":
      return { title: name, detail: "created" };
    case "ACTION_DELETED":
      return { title: name, detail: "deleted" };
    default:
      return null;
  }
}

export const projectStateSection: SectionModule = {
  type: "project_state",
  async run(ctx, section) {
    const projectId = ctx.ceremony.projectId;
    if (!projectId) return [];

    const since = ctx.previousOccurrence?.scheduledStart ?? new Date(ctx.now.getTime() - DEFAULT_LOOKBACK_MS);
    // "Before the next occurrence": a following planned occurrence when one
    // exists, else the same window forward as we looked back.
    const nextOccurrence = await ctx.db.ceremonyOccurrence.findFirst({
      where: { ceremonyId: ctx.ceremony.id, scheduledStart: { gt: ctx.occurrence.scheduledStart } },
      orderBy: { scheduledStart: "asc" },
      select: { scheduledStart: true },
    });
    const until = nextOccurrence?.scheduledStart ?? new Date(ctx.occurrence.scheduledStart.getTime() + (ctx.occurrence.scheduledStart.getTime() - since.getTime()));

    const project = await ctx.db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        priority: true,
        progress: true,
        endDate: true,
        reviewDate: true,
        nextActionDate: true,
        goals: { select: { id: true, title: true, health: true, healthOverride: true } },
      },
    });
    if (!project) return [];

    const [completed, overdue, activity] = await Promise.all([
      ctx.db.action.findMany({
        where: { projectId, status: "COMPLETED", completedAt: { gte: since, lte: ctx.now } },
        select: { id: true, name: true, completedAt: true },
        orderBy: { completedAt: "desc" },
        take: 10,
      }),
      ctx.db.action.findMany({
        where: { projectId, status: "ACTIVE", dueDate: { gte: since, lt: ctx.now } },
        select: { id: true, name: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      // The same log the overview's "What shifted this week" reads, over the
      // ceremony's own window. Newest first so the first row per action wins.
      ctx.db.projectActivity.findMany({
        where: {
          projectId,
          changedAt: { gte: since, lte: ctx.now },
          type: { in: [...SHIFT_TYPES] },
        },
        select: {
          id: true,
          actionId: true,
          type: true,
          fromValue: true,
          toValue: true,
          action: { select: { name: true } },
          changedBy: { select: { name: true } },
        },
        orderBy: { changedAt: "desc" },
        take: 50,
      }),
    ]);

    const items: AgendaItem[] = [];
    const projectHref = `${ctx.workspacePath}/projects/${project.slug}-${project.id}`;
    const push = (partial: Omit<AgendaItem, "sectionKey" | "order">) =>
      items.push({ ...partial, sectionKey: section.key, order: items.length });

    // 1. Status line.
    const statusBits = [
      STATUS_LABEL[project.status] ?? project.status,
      project.priority !== "NONE" ? `${project.priority.toLowerCase()} priority` : null,
      `${Math.round(project.progress)}% complete`,
      project.endDate ? `due ${fmt(project.endDate)}` : null,
    ].filter((b): b is string => Boolean(b));
    push({
      id: `${section.key}:text:project-${project.id}`,
      title: project.name,
      refType: "text",
      refId: `project-${project.id}`,
      detail: statusBits.join(" · "),
      href: projectHref,
    });

    // 2. Movement since the previous occurrence.
    const sinceLabel = `since ${fmt(since)}`;
    if (completed.length > 0) {
      push({
        id: `${section.key}:text:completed`,
        title: `${completed.length} action${completed.length === 1 ? "" : "s"} completed ${sinceLabel}`,
        refType: "text",
        refId: "completed",
        detail: completed.map((a) => a.name).join(", "),
      });
    }
    for (const a of overdue) {
      push({
        id: `${section.key}:action:${a.id}`,
        title: a.name,
        refType: "action",
        refId: a.id,
        detail: `fell overdue · due ${fmt(a.dueDate!)}`,
        href: `${ctx.workspacePath}/actions/${a.id}`,
      });
    }
    // What else shifted: one line per action, its most recent change. Actions
    // already raised above (completed, fell overdue) are not raised again.
    const alreadyRaised = new Set([...completed.map((a) => a.id), ...overdue.map((a) => a.id)]);
    const seen = new Set<string>();
    let shifts = 0;
    for (const row of activity) {
      const key = row.actionId ?? row.id;
      if (seen.has(key) || (row.actionId && alreadyRaised.has(row.actionId))) continue;
      seen.add(key);
      if (shifts >= MAX_SHIFTS) break;
      const described = describeShift(row);
      if (!described) continue;
      shifts += 1;
      push({
        id: `${section.key}:shift:${key}`,
        title: described.title,
        refType: row.actionId ? "action" : "text",
        refId: row.actionId ?? key,
        detail: [described.detail, row.changedBy?.name].filter(Boolean).join(" · "),
        href: row.actionId ? `${ctx.workspacePath}/actions/${row.actionId}` : null,
      });
    }

    for (const g of project.goals) {
      const health = g.healthOverride ?? g.health;
      if (!health || health === "on-track") continue;
      push({
        id: `${section.key}:goal:${g.id}`,
        title: g.title,
        refType: "goal",
        refId: String(g.id),
        goalId: g.id,
        goalTitle: g.title,
        detail: `objective ${HEALTH_LABEL[health] ?? health}`,
        href: `${ctx.workspacePath}/goals/${g.id}`,
      });
    }

    // 3. Dates landing before the next occurrence.
    const upcoming: Array<[string, Date | null]> = [
      ["Review date", project.reviewDate],
      ["Next action date", project.nextActionDate],
    ];
    for (const [label, date] of upcoming) {
      if (!date || date < since || date > until) continue;
      push({
        id: `${section.key}:text:${label.toLowerCase().replace(/\s+/g, "-")}`,
        title: `${label} ${date < ctx.now ? "passed" : "lands"} ${fmt(date)}`,
        refType: "text",
        refId: label,
        href: projectHref,
      });
    }

    return items;
  },
};
