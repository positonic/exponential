/**
 * `carried_over`: every unresolved item from the previous occurrence's
 * agenda, copied with `carriedFromOccurrenceId` so a reader sees how long
 * a topic has been parked. Items already re-derived by their own section
 * this time (same record id) are left to that section.
 */
import { readAgendaSnapshot, type AgendaItem, type SectionModule } from "../types";

export const carriedOverSection: SectionModule = {
  type: "carried_over",
  run(ctx, section) {
    const previous = ctx.previousOccurrence ? readAgendaSnapshot(ctx.previousOccurrence.agenda) : null;
    if (!previous) return Promise.resolve([]);
    // One record can be unresolved in two of the previous agenda's sections
    // (its own section plus the previous `carried_over`). The id is derived
    // from refType/refId alone, so without this guard the same id lands twice
    // in one section, colliding in buildAgenda's id map and in React keys.
    // On a collision the copy with the higher carry count wins, so the age of
    // a long-parked topic is never reset by a fresher copy of the same record.
    const byId = new Map<string, AgendaItem>();
    for (const prevSection of previous.sections) {
      for (const item of prevSection.items) {
        if (item.resolvedAt) continue;
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
    }
    const items = [...byId.values()].map((item, index) => ({ ...item, order: index }));
    return Promise.resolve(items);
  },
};
