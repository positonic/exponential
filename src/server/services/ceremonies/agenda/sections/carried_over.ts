/**
 * `carried_over`: every still-open item from the previous occurrence's
 * agenda, copied with `carriedFromOccurrenceId` so a reader sees how long
 * a topic has been parked. Items already re-derived by their own section
 * this time (same record id) are left to that section: the runner calls this
 * module last with `producedRefIds`, so D-0150 shows once under "Decisions
 * pending" rather than twice with two different carry counts.
 */
import { agendaRefKey, readAgendaSnapshot, type AgendaItem, type SectionModule } from "../types";
import { filterUnsettledItems } from "../live";

export const carriedOverSection: SectionModule = {
  type: "carried_over",
  async run(ctx, section) {
    const previous = ctx.previousOccurrence ? readAgendaSnapshot(ctx.previousOccurrence.agenda) : null;
    if (!previous) return [];
    const open = previous.sections.flatMap((prevSection) =>
      prevSection.items
        .filter((item) => !ctx.producedRefIds?.has(agendaRefKey(item)))
        .map((item) => ({ prevSection, item, refType: item.refType, refId: item.refId, resolvedAt: item.resolvedAt })),
    );
    // An Action completed elsewhere is settled though its line was never
    // ticked, and one reopened elsewhere is open again (filterUnsettledItems).
    const unsettled = await filterUnsettledItems(ctx.db, open);
    // One record can be unresolved in two of the previous agenda's sections
    // (its own section plus the previous `carried_over`). The id is derived
    // from refType/refId alone, so without this guard the same id lands twice
    // in one section, colliding in buildAgenda's id map and in React keys.
    // On a collision the copy with the higher carry count wins, so the age of
    // a long-parked topic is never reset by a fresher copy of the same record.
    const byId = new Map<string, AgendaItem>();
    for (const { prevSection, item } of unsettled) {
      const id = `${section.key}:carried:${item.refType}:${item.refId}`;
      const candidate: AgendaItem = {
        ...item,
        id,
        sectionKey: section.key,
        carriedFromOccurrenceId: ctx.previousOccurrence!.id,
        carryCount: (item.carryCount ?? 0) + 1,
        resolvedAt: null,
        order: 0,
        detail: [item.detail, prevSection.key === section.key ? "carried again" : `from ${prevSection.title}`].filter(Boolean).join(" · "),
      };
      const existing = byId.get(id);
      if (!existing || (candidate.carryCount ?? 0) > (existing.carryCount ?? 0)) byId.set(id, candidate);
    }
    return [...byId.values()].map((item, index) => ({ ...item, order: index }));
  },
};
