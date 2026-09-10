/**
 * `okr_review`: key results under in-scope objectives that have had no
 * check-in for `config.days` (default 7) days, or whose status override
 * changed since the previous occurrence. Scope: the ceremony's project's
 * objectives when it has one, otherwise every active objective in the
 * workspace, narrowed to the product's projects when only a product is set.
 */
import type { AgendaItem, SectionModule } from "../types";

const DEFAULT_DAYS = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

export const okrReviewSection: SectionModule = {
  type: "okr_review",
  async run(ctx, section) {
    const days = typeof section.config?.days === "number" ? section.config.days : DEFAULT_DAYS;
    const since = new Date(ctx.now.getTime() - days * 86_400_000);
    const previousStart = ctx.previousOccurrence?.scheduledStart ?? null;

    const goalScope = ctx.ceremony.projectId
      ? { projects: { some: { id: ctx.ceremony.projectId } } }
      : ctx.ceremony.productId
        ? { projects: { some: { productId: ctx.ceremony.productId } } }
        : {};

    const keyResults = await ctx.db.keyResult.findMany({
      where: {
        goal: { workspaceId: ctx.workspaceId, status: "active", ...goalScope },
      },
      select: {
        id: true,
        title: true,
        status: true,
        statusOverride: true,
        statusOverrideAt: true,
        currentValue: true,
        targetValue: true,
        unit: true,
        goalId: true,
        goal: { select: { id: true, title: true } },
        checkIns: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: { title: "asc" },
      take: 100,
    });

    const items: AgendaItem[] = [];
    for (const kr of keyResults) {
      const last = kr.checkIns[0]?.createdAt ?? null;
      const stale = !last || last < since;
      const statusChanged = Boolean(previousStart && kr.statusOverrideAt && kr.statusOverrideAt > previousStart);
      if (!stale && !statusChanged) continue;
      const effective = kr.statusOverride ?? kr.status;
      const reasons: string[] = [];
      if (stale) reasons.push(last ? `no check-in for ${daysBetween(ctx.now, last)} days` : "never checked in");
      if (statusChanged) reasons.push(`status set to ${effective}`);
      items.push({
        id: `${section.key}:key_result:${kr.id}`,
        sectionKey: section.key,
        title: kr.title,
        refType: "key_result",
        refId: kr.id,
        goalId: kr.goalId,
        keyResultId: kr.id,
        goalTitle: kr.goal.title,
        keyResultTitle: kr.title,
        order: items.length,
        detail: `${kr.goal.title} · ${reasons.join(", ")} · ${kr.currentValue}/${kr.targetValue} ${kr.unit}`,
        href: `${ctx.workspacePath}/goals?tab=okrs`,
      });
    }
    return items;
  },
};
