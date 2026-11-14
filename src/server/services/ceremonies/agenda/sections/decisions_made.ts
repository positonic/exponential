/**
 * `decisions_made` (V10): confirmed Decisions accepted since the previous
 * occurrence started, in the same scope as `decisions_pending` (the
 * ceremony's projects, else its product plus product-less decisions, else
 * the workspace). Read from the Decision Log, so "Decisions made since last
 * week" is a list of records, not prose about them. `decidedAt` dates the
 * acceptance; rows without one fall back to `updatedAt`. Only Decisions the
 * whole workspace may read are listed (`buildWorkspaceAudienceDecisionWhere`):
 * one behind a restricted project or a private recording stays off the
 * shared agenda.
 */
import type { AgendaItem, SectionModule } from "../types";
import { formatDecisionLabel } from "~/lib/decision-label";
import { buildWorkspaceAudienceDecisionWhere } from "~/server/services/access/resolvers/decisionResolver";

export const decisionsMadeSection: SectionModule = {
  type: "decisions_made",
  emptyReason: "No decisions accepted since the last occurrence.",
  async run(ctx, section) {
    const previous = ctx.previousOccurrence;
    if (!previous) return [];
    const since = previous.scheduledStart;
    const decisions = await ctx.db.decision.findMany({
      where: {
        status: "ACCEPTED",
        AND: [
          // The statement is copied into a snapshot every workspace member
          // sees, so only Decisions every member may read.
          buildWorkspaceAudienceDecisionWhere(ctx.workspaceId),
          {
            OR: [
              { decidedAt: { gte: since, lte: ctx.now } },
              { decidedAt: null, updatedAt: { gte: since, lte: ctx.now } },
            ],
          },
          ctx.projectIds.length
            ? { projectId: { in: ctx.projectIds } }
            : ctx.ceremony.productId
              ? { OR: [{ productId: ctx.ceremony.productId }, { productId: null }] }
              : {},
        ],
      },
      select: {
        id: true,
        number: true,
        statement: true,
        decidedAt: true,
        owner: { select: { name: true } },
        goal: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true, goalId: true, goal: { select: { title: true } } } },
      },
      orderBy: [{ decidedAt: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      take: 50,
    });
    return decisions.map<AgendaItem>((d, index) => ({
      id: `${section.key}:decision:${d.id}`,
      sectionKey: section.key,
      title: d.statement,
      refType: "decision",
      refId: d.id,
      goalId: d.keyResult?.goalId ?? d.goal?.id ?? null,
      goalTitle: d.keyResult?.goal.title ?? d.goal?.title ?? null,
      keyResultId: d.keyResult?.id ?? null,
      keyResultTitle: d.keyResult?.title ?? null,
      order: index,
      detail: [formatDecisionLabel(d.number), "accepted", d.owner?.name ? `owner ${d.owner.name}` : null].filter(Boolean).join(" · "),
      href: `${ctx.workspacePath}/decisions/d/${d.id}`,
    }));
  },
};
