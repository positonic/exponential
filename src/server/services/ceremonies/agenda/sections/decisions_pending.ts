/**
 * `decisions_pending`: OPEN and PROPOSED Decisions (ADR-0060) in scope —
 * the ceremony's project, else its product, else the whole workspace —
 * oldest first, confirmed rows only. An OPEN decision is an open question;
 * "carried N times" is derived from how many occurrences it has sat on.
 */
import type { AgendaItem, SectionModule } from "../types";
import { readAgendaSnapshot } from "../types";

export const decisionsPendingSection: SectionModule = {
  type: "decisions_pending",
  async run(ctx, section) {
    const decisions = await ctx.db.decision.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        reviewState: "CONFIRMED",
        status: { in: ["OPEN", "PROPOSED"] },
        ...(ctx.ceremony.projectId
          ? { projectId: ctx.ceremony.projectId }
          : ctx.ceremony.productId
            ? { OR: [{ productId: ctx.ceremony.productId }, { productId: null }] }
            : {}),
      },
      select: { id: true, number: true, statement: true, status: true, createdAt: true, owner: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    // Carry count: how many times the same decision already appeared on this ceremony's previous agenda.
    const previous = ctx.previousOccurrence ? readAgendaSnapshot(ctx.previousOccurrence.agenda) : null;
    const carried = new Map<string, number>();
    for (const s of previous?.sections ?? []) {
      for (const i of s.items) {
        if (i.refType !== "decision") continue;
        const n = Number(/carried (\d+)/.exec(i.detail ?? "")?.[1] ?? 0) + 1;
        carried.set(i.refId, n);
      }
    }
    return decisions.map<AgendaItem>((d, index) => {
      const label = `D-${String(d.number).padStart(4, "0")}`;
      const times = carried.get(d.id) ?? 0;
      const parts = [label, d.status === "OPEN" ? "open question" : "proposed", d.owner?.name ? `owner ${d.owner.name}` : null, times > 0 ? `carried ${times} time${times === 1 ? "" : "s"}` : null];
      return {
        id: `${section.key}:decision:${d.id}`,
        sectionKey: section.key,
        title: d.statement,
        refType: "decision",
        refId: d.id,
        order: index,
        detail: parts.filter(Boolean).join(" · "),
        href: `${ctx.workspacePath}/decisions/d/${d.id}`,
      };
    });
  },
};
