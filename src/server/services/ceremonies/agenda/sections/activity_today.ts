/**
 * `activity_today`: what each participant did on the occurrence's local day
 * beyond finishing Actions — comments, status changes, decisions, check-ins —
 * from `WorkspaceActivityEvent` rows they authored, across the workspaces the
 * brief may read. Repeats of the same verb on the same record collapse to
 * one line with a count. Completed Actions (their own section), time entries
 * (the time section) and ceremony bookkeeping are left out.
 */
import { describeEntityRef } from "~/server/services/activity/feedRenderHints";
import { summaryWindow } from "~/server/services/notifications/emit/dailySummary/calendar";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, briefWorkspaceIds, personPrefix } from "./dailyBrief";

const EVENT_LIMIT = 200;
const ITEM_LIMIT = 30;
const SKIPPED_ENTITIES = new Set(["time_entry", "ceremony_occurrence", "channel_summary", "ticket_sync_run"]);

const VERBS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Moved",
  completed: "Completed",
  commented: "Commented on",
  checked_in: "Checked in on",
  deleted: "Deleted",
  accepted: "Accepted",
  superseded: "Superseded",
  deprecated: "Deprecated",
  confirmed: "Confirmed",
  reverted: "Reverted",
  captured: "Captured",
};

const NOUNS: Record<string, string> = {
  action: "action",
  action_comment: "action",
  ticket: "ticket",
  ticket_comment: "ticket",
  feature: "feature",
  feature_scope: "scope",
  insight: "insight",
  insight_comment: "insight",
  project: "project",
  goal: "goal",
  goal_update: "goal",
  goal_comment: "goal",
  key_result: "key result",
  key_result_comment: "key result",
  okr_checkin: "key result",
  weekly_review: "weekly review",
  workspace_member: "member",
  deal: "deal",
  meeting: "meeting",
  decision: "decision",
};

export const activityTodaySection: SectionModule = {
  type: "activity_today",
  async run(ctx, section) {
    const window = summaryWindow(ctx.occurrence.scheduledStart, ctx.ceremony.timezone);
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const workspaceIds = await briefWorkspaceIds(ctx, person.id);
      const rows = await ctx.db.workspaceActivityEvent.findMany({
        where: {
          userId: person.id,
          workspaceId: { in: workspaceIds },
          createdAt: { gte: window.todayStart, lt: window.tomorrowStart },
        },
        select: { entityType: true, entityId: true, action: true, metadata: true, workspace: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: EVENT_LIMIT,
      });

      const grouped = new Map<string, { title: string; workspace: string | null; count: number }>();
      for (const e of rows ?? []) {
        if (SKIPPED_ENTITIES.has(e.entityType)) continue;
        if (e.entityType === "action" && e.action === "completed") continue;
        const noun = NOUNS[e.entityType] ?? e.entityType.replace(/_/g, " ");
        const verb = VERBS[e.action] ?? e.action.replace(/_/g, " ");
        const key = `${e.entityType}:${e.entityId}:${e.action}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        grouped.set(key, {
          title: `${verb} ${noun}: ${describeEntityRef(e.entityId, e.metadata)}`,
          workspace: e.workspace?.name ?? null,
          count: 1,
        });
      }

      const manyWorkspaces = new Set([...grouped.values()].map((g) => g.workspace)).size > 1;
      let shown = 0;
      for (const [key, g] of grouped) {
        if (shown === ITEM_LIMIT) break;
        const id = `${section.key}:text:${person.id}:${key}`;
        items.push({
          id,
          sectionKey: section.key,
          title: `${prefix}${g.title}`,
          refType: "text",
          refId: id,
          order: items.length,
          detail: [manyWorkspaces ? g.workspace : null, g.count > 1 ? `×${g.count}` : null].filter(Boolean).join(" · ") || null,
        });
        shown += 1;
      }
      const hidden = grouped.size - shown;
      if (hidden > 0) {
        const id = `${section.key}:text:${person.id}:more`;
        items.push({ id, sectionKey: section.key, title: `${prefix}${hidden} more`, refType: "text", refId: id, order: items.length });
      }
    }
    return items;
  },
};
