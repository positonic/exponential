/**
 * `cycle_progress`: the active cycle of the ceremony's product (or, without
 * a product, the workspace's active cycles), its latest SprintSnapshot, and
 * the tickets that moved since the previous occurrence (`updatedAt` after
 * its start — the ticket table keeps no status-change log).
 */
import type { AgendaItem, SectionModule } from "../types";

export const cycleProgressSection: SectionModule = {
  type: "cycle_progress",
  async run(ctx, section) {
    const cycles = await ctx.db.list.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        listType: "SPRINT",
        status: "ACTIVE",
        ...(ctx.ceremony.productId ? { productId: ctx.ceremony.productId } : {}),
        OR: [{ endDate: null }, { endDate: { gte: ctx.now } }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        endDate: true,
        product: { select: { slug: true } },
        snapshots: { orderBy: { snapshotDate: "desc" }, take: 1 },
        _count: { select: { tickets: true } },
      },
      orderBy: { startDate: "desc" },
      take: 3,
    });
    const since = ctx.previousOccurrence?.scheduledStart ?? null;
    const items: AgendaItem[] = [];
    for (const cycle of cycles) {
      const snap = cycle.snapshots[0];
      const moved = since
        ? await ctx.db.ticket.count({ where: { cycleId: cycle.id, updatedAt: { gt: since } } })
        : null;
      const parts: string[] = [];
      if (snap) {
        const total = snap.backlogCount + snap.todoCount + snap.inProgressCount + snap.inReviewCount + snap.doneCount;
        parts.push(`${snap.doneCount}/${total} done, ${snap.inProgressCount} in progress`);
        if (snap.addedEffort > 0) parts.push(`+${snap.addedEffort} effort added mid-cycle`);
      } else {
        parts.push(`${cycle._count.tickets} tickets, no snapshot yet`);
      }
      if (moved !== null) parts.push(`${moved} ticket${moved === 1 ? "" : "s"} moved since last time`);
      if (cycle.endDate) parts.push(`ends ${cycle.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
      items.push({
        id: `${section.key}:cycle:${cycle.id}`,
        sectionKey: section.key,
        title: cycle.name,
        refType: "cycle",
        refId: cycle.id,
        order: items.length,
        detail: parts.join(" · "),
        href: cycle.product ? `${ctx.workspacePath}/products/${cycle.product.slug}/cycles` : null,
      });
    }
    return items;
  },
};
