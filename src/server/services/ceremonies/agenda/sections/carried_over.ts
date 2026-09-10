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
    const items: AgendaItem[] = [];
    for (const prevSection of previous.sections) {
      for (const item of prevSection.items) {
        if (item.resolvedAt) continue;
        items.push({
          ...item,
          id: `${section.key}:carried:${item.refType}:${item.refId}`,
          sectionKey: section.key,
          carriedFromOccurrenceId: ctx.previousOccurrence!.id,
          resolvedAt: null,
          order: items.length,
          detail: [item.detail, prevSection.key === section.key ? "carried again" : `from ${prevSection.title}`].filter(Boolean).join(" · "),
        });
      }
    }
    return Promise.resolve(items);
  },
};
