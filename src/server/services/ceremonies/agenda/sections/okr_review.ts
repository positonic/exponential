/**
 * `okr_review`: key results under in-scope objectives that have had no
 * check-in for `config.days` (default 7) days, or whose status override
 * changed since the previous occurrence. Scope: the ceremony's project's
 * objectives when it has one, otherwise every active objective in the
 * workspace, narrowed to the product's projects when only a product is set.
 */
import type { AgendaItem, SectionModule } from "../types";

const DEFAULT_DAYS = 7;
/** Applied to the *answer* now that the predicate is in the query, not to the input. */
const MAX_ITEMS = 50;

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

    // The staleness predicate lives in the query, so `take` bounds what the
    // section reports rather than what it considers. Filtering after a
    // `take: 100` ordered by title silently hid every at-risk key result
    // whose title sorted late — deterministically, in exactly the workspaces
    // big enough to need the review.
    const keyResults = await ctx.db.keyResult.findMany({
      where: {
        goal: { workspaceId: ctx.workspaceId, status: "active", ...goalScope },
        OR: [
          { checkIns: { none: { createdAt: { gte: since } } } },
          ...(previousStart ? [{ statusOverrideAt: { gt: previousStart } }] : []),
        ],
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
      take: MAX_ITEMS + 1,
    });
    const overflow = keyResults.length > MAX_ITEMS;
    const inScope = overflow ? keyResults.slice(0, MAX_ITEMS) : keyResults;

    const items: AgendaItem[] = [];
    for (const kr of inScope) {
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
    // Never under-report silently: say so when the cap was reached.
    if (overflow) {
      items.push({
        id: `${section.key}:text:overflow`,
        sectionKey: section.key,
        title: `More key results need attention than fit this agenda (showing ${MAX_ITEMS})`,
        refType: "text",
        refId: `${section.key}:text:overflow`,
        order: items.length,
        detail: "Review the rest on the OKR dashboard",
        href: `${ctx.workspacePath}/goals?tab=okrs`,
      });
    }
    return items;
  },
};
